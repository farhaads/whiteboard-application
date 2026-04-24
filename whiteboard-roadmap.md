# Collaborative Whiteboard — Project Plan

Self-hosted Miro-style whiteboard. Solo build, vibe-coded with Cursor.

## Stack (locked)

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Canvas:** Konva + react-konva (shapes, transform, drag, multi-layer rendering)
- **Freehand:** perfect-freehand (Konva has no built-in freehand tool)
- **CRDT / sync engine:** Yjs
- **Sync server:** self-hosted `y-websocket` Node service
- **UI:** Tailwind CSS + shadcn/ui (Lucide icons)
- **DB:** PostgreSQL (board metadata, password hashes, Yjs state blobs)
- **Image storage:** local filesystem, mounted as a Docker volume on the web container (no object storage service for v1)
- **Auth:** Per-board password → short-lived JWT cookie (no user accounts)
- **Deploy:** Single VPS, docker-compose (web, sync, db, caddy)

## What you're actually building

Konva gives you canvas primitives — shapes, events, drag, transform handles, layers. It does **not** give you:

- An infinite canvas abstraction (you build pan/zoom on a Stage)
- A toolbar or tool state machine
- Freehand drawing (use perfect-freehand to generate stroke paths, render as Konva Line or Path)
- Connectors that snap to shapes (you wire this yourself)
- Live cursors / presence (Yjs Awareness handles this, but you render it)
- Persistence (you write it)
- Undo/redo (Yjs's `UndoManager` gives you this scoped to a user)

That's the honest scope. None of it is hard individually; the work is wiring them together.

## Data model

Everything on the board lives in **one Y.Doc per board**, structured as:

- `shapes: Y.Map<shapeId, Y.Map<field, value>>` — rectangles, ellipses, text, sticky notes, freehand strokes, images, arrows. Each shape is a Y.Map of its props (`x`, `y`, `type`, `fill`, `points`, `imageKey`, etc.).
- `order: Y.Array<shapeId>` — z-order. "Bring to front" = move id to end. "Send to back" = move to start.
- `meta: Y.Map` — board title, background color, etc.

Images are **not** stored in the Y.Doc. The doc holds `{ type: "image", imageKey: "abc123.png", x, y, w, h }`. The bytes live on a mounted filesystem volume, served as static files; the client fetches them by URL.

Presence (cursors, selections, current tool) goes through **Yjs Awareness**, not the doc. Awareness is ephemeral — it evaporates when you disconnect, which is what you want.

## Storage surfaces

Three distinct things to persist, don't conflate them:

1. **Board metadata** — Postgres row per board: `id`, `password_hash`, `title`, `created_at`, `updated_at`.
2. **Board state (Yjs doc)** — binary blob, `bytea` column on the same row OR a separate `board_states` table. Written by the sync server on a debounced interval and on last-client-disconnect. Hydrated into a fresh Y.Doc when the first client joins an empty room.
3. **Image assets** — uploaded via a Next.js API route that writes to a mounted filesystem directory. Client POSTs the file, the route stores it at `/uploads/<boardId>/<uuid>.<ext>` and returns the public URL. The Y.Doc stores the URL + key; the image shape references it.

## Phases

Ordered so you see pixels on day one and infra last.

### Phase 1 — Canvas on screen (local only, no sync)
- Bootstrap Next.js 14 + TS + Tailwind + shadcn
- Install `konva`, `react-konva`, `perfect-freehand`
- `/board/[boardId]` renders a full-viewport Konva Stage with pan (space+drag or middle-mouse) and zoom (wheel)
- Toolbar with: select, rectangle, ellipse, text, sticky note, freehand, arrow
- Local React state holds the shape list; drawing each tool works end to end
- Undo/redo via a simple command stack for now (will swap to Yjs UndoManager in Phase 3)
- **Done when:** you can draw everything listed above, pan, zoom, undo. State is lost on refresh and that's fine.

### Phase 2 — Yjs as the source of truth (still local)
- Introduce a Y.Doc with the `shapes` / `order` / `meta` structure above
- Replace React state with Yjs observers: components subscribe to the Y.Doc and re-render on change
- All mutations go through Yjs transactions (not direct React state)
- Add `y-indexeddb` so the doc persists in the browser across refreshes
- Swap undo/redo to Yjs `UndoManager` scoped to the local client
- **Done when:** drawing, refresh, content is still there (from IndexedDB). Same data layer this phase establishes applies server-side in phase 3.

### Phase 3 — Multiplayer sync via y-websocket
- Add a `sync` service to docker-compose running a `y-websocket` server
- Connect the client with `y-websocket` provider, room name = `boardId`
- Wire Yjs Awareness: broadcast cursor position, selected shape IDs, and a per-user color derived from the Yjs client ID
- Render remote cursors and selection highlights on the Stage
- Leave persistence for phase 4 — for now the doc only lives in the y-websocket server's memory + each client's IndexedDB
- **Done when:** two browser tabs on the same board show each other's cursors and edits live. Killing all tabs loses state (fixed next phase).

### Phase 4 — Postgres persistence for Yjs state
- Add Postgres to docker-compose
- `boards` table: `id text primary key`, `password_hash text`, `title text`, `y_state bytea`, `created_at`, `updated_at`
- Modify the y-websocket server: on doc update, debounce 2s, encode the doc with `Y.encodeStateAsUpdate`, upsert the `bytea` into Postgres. Also flush on last-client-disconnect.
- On first client joining an empty room, load the blob from Postgres and apply it to the new Y.Doc with `Y.applyUpdate`.
- **Done when:** close all tabs, wait a minute, come back, state is intact. Confirm by inspecting the Postgres row.

### Phase 5 — Image uploads (local filesystem)
- Mount a named Docker volume at `/app/uploads` in the web container
- Next.js API route `POST /api/board/[boardId]/upload` accepts a multipart file, validates MIME type (`image/*`) and size (≤10MB), writes it to `/app/uploads/<boardId>/<uuid>.<ext>`, returns `{ imageKey, url }`
- A second route (or Next.js `rewrites` config) serves files from `/app/uploads` under the public path `/assets/`
- Client flow: paste/drop image → POST to upload route as FormData → insert `{ type: "image", imageKey, url, x, y, w, h }` into the Y.Doc
- Render images on the canvas via Konva's Image node with `useImage` (from `use-image`)
- **Done when:** paste an image, it appears on everyone's screen within a second, survives refresh, and loads from `/assets/...` via a stable URL.

### Phase 6 — Password gate
- Add bcrypt
- Landing page (`/`): "Create board" (pick password) and "Open board" (ID + password)
- `POST /api/board` creates a row with a generated short ID + bcrypt hash
- `POST /api/board/[boardId]/unlock` verifies and sets an HTTP-only JWT cookie `{ boardId, exp }` with 12h TTL
- Next.js middleware on `/board/[boardId]` requires the cookie (redirect to an unlock page if missing/invalid)
- **Gate the WS upgrade:** y-websocket's default server accepts anyone. Replace it with a small custom wrapper that verifies the JWT on the `upgrade` event and rejects mismatched `boardId`s. The token can ride in a query param set by the client provider.
- Also gate the upload route behind the same cookie
- **Done when:** wrong password blocks the page, the WS, AND the upload endpoint. Right password works everywhere.

### Phase 7 — Deploy
- Finalize `docker-compose.yml` with `web`, `sync`, `db`, `caddy`
- Caddyfile routes: `/` → web, `/sync` (WS upgrade) → sync. `/assets/*` is served by Next.js itself from the mounted uploads volume, so no extra Caddy config needed.
- `.env.production.example` with every required variable
- Next.js in standalone output mode, production Dockerfile
- Daily `pg_dump` to a host-mounted directory; the uploads volume is also host-mounted so it's trivially backed up via `rsync` or any standard file backup tool
- **Done when:** `docker compose up -d` on a fresh VPS brings the whole stack online behind HTTPS with a shareable link.

## Explicitly out of scope (for v1)

- User accounts, orgs, roles, invitations, board dashboard UI
- Board version history / time travel
- Kubernetes, horizontal scaling of the sync server
- Custom shapes beyond the toolbar list
- Comments, chat, voice
- Mobile-specific UX

## Risks to watch

- **y-websocket persistence hooks:** the default y-websocket server is minimal. You will likely write a thin custom server using the `y-websocket` utility functions directly — plan for this, don't assume a config flag exists.
- **Image size:** unbounded uploads kill disk and bandwidth. Cap at ~10MB per image and reject non-image MIME types in the upload route.
- **Uploads volume is single-node:** everything lives on one VPS's disk. Backups are simple (`rsync` or `tar` the volume) but migrating to a second machine means copying the whole tree. Fine for v1 — migrating to object storage later means rewriting one route and re-pointing URLs.
- **Disk pressure:** nothing auto-cleans orphaned images (shape deleted from Y.Doc but file still on disk). For v1 this is acceptable; revisit with a cleanup cron once the app has real use.
- **Y.Doc growth:** Yjs state grows with history. Periodically (e.g. nightly) load each doc, re-encode with `encodeStateAsUpdate` (which garbage-collects), and write it back. Not urgent but worth knowing.
- **Sync server as SPOF:** single y-websocket process handles all boards. Fine for solo use. If you ever need scale, sharding by boardId across instances is the path — out of scope here.

# whiteboard-application

Next.js whiteboard app with collaborative sync (Yjs WebSocket server) and Docker Compose for local full-stack dev.

## Prerequisites

- Node.js 20+
- For Docker: Docker Desktop (or Docker Engine + Compose)

## Run with Docker Compose

From the repo root:

```bash
docker compose up
```

Then open [http://localhost:3000](http://localhost:3000). The `web` service installs dependencies on first start; `sync` serves the Yjs WebSocket endpoint.

Set strong `JWT_SECRET` values in production; the compose file uses development placeholders.

## Run Next.js only (local)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will need the sync server and matching env (for example `NEXT_PUBLIC_SYNC_URL`) if you use real-time collaboration.

## Local data

SQLite registry and uploads are ignored by Git (see `.gitignore`). Copy or recreate `.env.local` on each machine; do not commit secrets.

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
- [Yjs](https://yjs.dev/)

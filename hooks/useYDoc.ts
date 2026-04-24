"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";

type YDocBundle = { ydoc: Y.Doc; awareness: Awareness };

export function useYDoc(boardId: string) {
  const [bundle, setBundle] = useState<YDocBundle | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    let cancelled = false;
    let provider: WebsocketProvider | null = null;

    doc.transact(() => {
      const meta = doc.getMap("meta");
      if (meta.get("background") === undefined) {
        meta.set("background", "#fafafa");
      }
      if (meta.get("title") === undefined) {
        meta.set("title", "");
      }
    });

    const persistence = new IndexeddbPersistence(boardId, doc);
    void persistence.whenSynced;

    void (async () => {
      const res = await fetch(
        `/api/board/${encodeURIComponent(boardId)}/ws-token`,
        { credentials: "include" }
      );
      if (cancelled) return;
      if (!res.ok) {
        window.location.href = `/board/${encodeURIComponent(boardId)}/unlock`;
        return;
      }
      const data = (await res.json()) as {
        token: string;
        syncUrl?: string;
      };
      if (cancelled) return;
      const base = (
        data.syncUrl ??
        process.env.NEXT_PUBLIC_SYNC_URL ??
        "ws://localhost:1234"
      ).replace(/\/$/, "");

      provider = new WebsocketProvider(base, boardId, doc, {
        params: { token: data.token },
      });
      if (cancelled) {
        provider.destroy();
        provider = null;
        return;
      }
      setBundle({ ydoc: doc, awareness: provider.awareness });
    })();

    return () => {
      cancelled = true;
      provider?.destroy();
      void persistence.destroy();
      doc.destroy();
      setBundle(null);
    };
  }, [boardId]);

  return { ydoc: bundle?.ydoc ?? null, awareness: bundle?.awareness ?? null };
}

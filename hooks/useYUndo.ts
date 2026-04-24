"use client";

import * as Y from "yjs";
import { useCallback, useEffect, useRef } from "react";

export function useYUndo(ydoc: Y.Doc | null) {
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  useEffect(() => {
    if (!ydoc) return;
    const um = new Y.UndoManager([ydoc.getMap("shapes"), ydoc.getArray("order")]);
    undoManagerRef.current = um;
    return () => {
      um.destroy();
      undoManagerRef.current = null;
    };
  }, [ydoc]);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  return { undo, redo, undoManagerRef };
}

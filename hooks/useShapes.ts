"use client";

import * as Y from "yjs";
import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Shape } from "@/lib/shapes";
import { orderedShapesFromDoc, shapeIntoYMap } from "@/lib/yShapeCodec";

export function useShapes(ydoc: Y.Doc | null) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!ydoc) return;
    const shapesMap = ydoc.getMap("shapes");
    const order = ydoc.getArray("order");
    const onChange = () => bump();
    shapesMap.observeDeep(onChange);
    order.observe(onChange);
    return () => {
      shapesMap.unobserveDeep(onChange);
      order.unobserve(onChange);
    };
  }, [ydoc]);

  const shapes = useMemo(() => {
    if (!ydoc) return [];
    return orderedShapesFromDoc(ydoc);
  }, [ydoc, tick]);

  const addShape = useCallback(
    (shape: Shape) => {
      if (!ydoc) return;
      ydoc.transact(() => {
        const shapesMap = ydoc.getMap("shapes");
        const order = ydoc.getArray("order");
        const inner = new Y.Map<unknown>();
        shapeIntoYMap(shape, inner);
        shapesMap.set(shape.id, inner);
        order.push([shape.id]);
      });
    },
    [ydoc]
  );

  const removeShape = useCallback(
    (id: string) => {
      if (!ydoc) return;
      ydoc.transact(() => {
        const shapesMap = ydoc.getMap("shapes");
        const order = ydoc.getArray("order");
        shapesMap.delete(id);
        const idx = order.toArray().indexOf(id);
        if (idx >= 0) order.delete(idx, 1);
      });
    },
    [ydoc]
  );

  const replaceShape = useCallback(
    (shape: Shape) => {
      if (!ydoc) return;
      ydoc.transact(() => {
        const shapesMap = ydoc.getMap("shapes");
        let inner = shapesMap.get(shape.id) as Y.Map<unknown> | undefined;
        if (!inner) {
          inner = new Y.Map<unknown>();
          shapesMap.set(shape.id, inner);
        }
        shapeIntoYMap(shape, inner);
      });
    },
    [ydoc]
  );

  const bringToFront = useCallback(
    (id: string) => {
      if (!ydoc) return;
      ydoc.transact(() => {
        const order = ydoc.getArray("order");
        const arr = order.toArray();
        const idx = arr.indexOf(id);
        if (idx < 0) return;
        order.delete(idx, 1);
        order.push([id]);
      });
    },
    [ydoc]
  );

  const sendToBack = useCallback(
    (id: string) => {
      if (!ydoc) return;
      ydoc.transact(() => {
        const order = ydoc.getArray("order");
        const arr = order.toArray();
        const idx = arr.indexOf(id);
        if (idx < 0) return;
        order.delete(idx, 1);
        order.insert(0, [id]);
      });
    },
    [ydoc]
  );

  return {
    shapes,
    addShape,
    removeShape,
    replaceShape,
    bringToFront,
    sendToBack,
  };
}

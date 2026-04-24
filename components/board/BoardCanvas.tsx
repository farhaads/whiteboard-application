"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Stage,
  Layer,
  Rect,
  Ellipse,
  Text,
  Group,
  Line,
  Transformer,
  Path,
  Arrow,
  Circle as KonvaCircle,
} from "react-konva";
import type Konva from "konva";
import { getStroke } from "perfect-freehand";
import {
  MousePointer2,
  Square,
  Circle,
  Type,
  StickyNote,
  Pencil,
  MoveUpRight,
  Eraser,
  BringToFront,
  SendToBack,
  Image as ImageIcon,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type Shape,
  type Tool,
  type TextShape,
  type StickyShape,
  newId,
  contrastingTextColor,
  outlineToPathData,
  shapeWorldBounds,
} from "@/lib/shapes";
import { useYDoc } from "@/hooks/useYDoc";
import { useShapes } from "@/hooks/useShapes";
import { useYUndo } from "@/hooks/useYUndo";
import { BoardImageShape } from "@/components/board/BoardImageShape";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const DEFAULT_FILL = "#fde68a";
const DEFAULT_STROKE = "#1e293b";

function toolbarButtonVariant(active: boolean): "default" | "secondary" {
  return active ? "default" : "secondary";
}

function colorFromClientId(clientId: number): string {
  const golden = 0.618033988749895;
  const hue = (((clientId >>> 0) * golden) % 1) * 360;
  return `hsl(${Math.round(hue)} 72% 44%)`;
}

type RemotePeerState = {
  clientId: number;
  cursor?: { x: number; y: number } | null;
  selection?: string[];
  user?: { color: string; clientId: number };
};

function normalizeRect(x0: number, y0: number, x1: number, y1: number) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function useViewportSize() {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const ro = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight });
    ro();
    window.addEventListener("resize", ro);
    return () => window.removeEventListener("resize", ro);
  }, []);
  return size;
}

type Draft =
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "ellipse"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "arrow"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "freehand"; points: [number, number][] };

type TextEditState = {
  id: string;
  value: string;
  /** sticky uses multiline + smaller font */
  variant: "text" | "sticky";
  /** fixed positioning near double-click */
  anchorLeft: number;
  anchorTop: number;
};

export function BoardCanvas({ boardId }: { boardId: string }) {
  const router = useRouter();
  const { w, h } = useViewportSize();
  const { ydoc, awareness } = useYDoc(boardId);
  const { shapes, addShape, removeShape, replaceShape, bringToFront, sendToBack } =
    useShapes(ydoc);
  const { undo, redo } = useYUndo(ydoc);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const textEditRef = useRef<TextEditState | null>(null);
  textEditRef.current = textEdit;
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const textEditorOpenedForId = useRef<string | null>(null);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const spaceDown = useRef(false);
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const shapeRefs = useRef<Map<string, Konva.Group>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const lastPointerStageRef = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCursorAwareRef = useRef(0);
  const [presenceEpoch, bumpPresence] = useReducer((n: number) => n + 1, 0);

  const pointerInStage = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getPointerPosition();
    if (!p) return null;
    return stage.getRelativePointerPosition() ?? null;
  }, []);

  const clientToStageContent = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const rect = stage.container().getBoundingClientRect();
      const ax = clientX - rect.left;
      const ay = clientY - rect.top;
      return {
        x: (ax - stagePos.x) / stageScale,
        y: (ay - stagePos.y) / stageScale,
      };
    },
    [stagePos.x, stagePos.y, stageScale]
  );

  const getImageDropPoint = useCallback((): { x: number; y: number } => {
    const p = lastPointerStageRef.current;
    if (p) return p;
    return {
      x: (w / 2 - stagePos.x) / stageScale,
      y: (h / 2 - stagePos.y) / stageScale,
    };
  }, [h, w, stagePos.x, stagePos.y, stageScale]);

  const insertImageFromFile = useCallback(
    async (file: File, center: { x: number; y: number }) => {
      if (!file.type.startsWith("image/")) return;
      const blobUrl = URL.createObjectURL(file);
      let nw = 0;
      let nh = 0;
      try {
        await new Promise<void>((resolve, reject) => {
          const im = new window.Image();
          im.onload = () => {
            nw = im.naturalWidth;
            nh = im.naturalHeight;
            resolve();
          };
          im.onerror = () => reject(new Error("decode"));
          im.src = blobUrl;
        });
      } catch {
        URL.revokeObjectURL(blobUrl);
        return;
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      if (nw <= 0 || nh <= 0) return;

      const maxW = 400;
      let width = nw;
      let height = nh;
      if (width > maxW) {
        height = (nh / nw) * maxW;
        width = maxW;
      }

      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/board/${encodeURIComponent(boardId)}/upload`,
        { method: "POST", body: form, credentials: "include" }
      );
      if (!res.ok) {
        console.warn("Image upload failed", await res.text());
        return;
      }
      const data = (await res.json()) as { imageKey: string; url: string };
      const x = center.x - width / 2;
      const y = center.y - height / 2;
      const id = newId();
      addShape({
        id,
        type: "image",
        x,
        y,
        width,
        height,
        imageKey: data.imageKey,
        url: data.url,
        rotation: 0,
      });
      setSelectedId(id);
      setTool("select");
    },
    [addShape, boardId]
  );

  const onLogout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {
      /* still navigate away */
    }
    router.push("/");
  }, [router]);

  const attachTransformer = useCallback(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const node = selectedId ? shapeRefs.current.get(selectedId) ?? null : null;
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId]);

  useEffect(() => {
    if (tool !== "select") {
      transformerRef.current?.nodes([]);
      return;
    }
    attachTransformer();
  }, [attachTransformer, shapes, tool]);

  useEffect(() => {
    if (!awareness) return;
    awareness.setLocalStateField("user", {
      color: colorFromClientId(awareness.clientID),
      clientId: awareness.clientID,
    });
  }, [awareness]);

  useEffect(() => {
    if (!awareness) return;
    awareness.setLocalStateField("selection", selectedId ? [selectedId] : []);
  }, [awareness, selectedId]);

  useEffect(() => {
    if (!awareness) return;
    const onChange = () => bumpPresence();
    awareness.on("change", onChange);
    return () => {
      awareness.off("change", onChange);
    };
  }, [awareness]);

  const remotePeers = useMemo((): RemotePeerState[] => {
    void presenceEpoch;
    if (!awareness) return [];
    const me = awareness.clientID;
    const out: RemotePeerState[] = [];
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === me || state == null) return;
      out.push({
        clientId,
        cursor: state.cursor as RemotePeerState["cursor"],
        selection: state.selection as string[] | undefined,
        user: state.user as RemotePeerState["user"],
      });
    });
    return out;
  }, [awareness, presenceEpoch]);

  // Focus/select only when the editor opens for a shape, not when `value` updates.
  useEffect(() => {
    if (!textEdit) {
      textEditorOpenedForId.current = null;
      return;
    }
    if (textEditorOpenedForId.current === textEdit.id) return;
    textEditorOpenedForId.current = textEdit.id;
    textAreaRef.current?.focus();
    textAreaRef.current?.select();
  }, [textEdit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        spaceDown.current = true;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [redo, undo]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if ([...(e.dataTransfer?.types ?? [])].includes("Files")) {
        e.preventDefault();
      }
    };

    const onDrop = (e: DragEvent) => {
      if (textEditRef.current) return;
      const dt = e.dataTransfer;
      if (!dt?.files?.length) return;
      const pos =
        clientToStageContent(e.clientX, e.clientY) ?? getImageDropPoint();
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files.item(i);
        if (f?.type.startsWith("image/")) {
          e.preventDefault();
          void insertImageFromFile(f, pos);
          return;
        }
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [clientToStageContent, getImageDropPoint, insertImageFromFile]);

  useEffect(() => {
    if (!ydoc) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    const tid = window.setTimeout(() => {
      if (cancelled) return;
      const stage = stageRef.current;
      if (!stage) return;
      const el = stage.container();
      const onPaste = (ce: ClipboardEvent) => {
        if (textEditRef.current) return;
        const dt = ce.clipboardData;
        if (!dt) return;
        const files = dt.files;
        if (files?.length) {
          for (let i = 0; i < files.length; i++) {
            const f = files.item(i);
            if (f?.type.startsWith("image/")) {
              ce.preventDefault();
              void insertImageFromFile(f, getImageDropPoint());
              return;
            }
          }
        }
        const items = dt.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const f = item.getAsFile();
              if (f) {
                ce.preventDefault();
                void insertImageFromFile(f, getImageDropPoint());
                return;
              }
            }
          }
        }
      };
      el.addEventListener("paste", onPaste);
      detach = () => el.removeEventListener("paste", onPaste);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
      detach?.();
    };
  }, [ydoc, getImageDropPoint, insertImageFromFile]);

  const bakeTransform = useCallback(
    (id: string, node: Konva.Group) => {
      const shape = shapes.find((s) => s.id === id);
      if (!shape) return;

      const sx = node.scaleX();
      const sy = node.scaleY();
      const rot = node.rotation();
      const nx = node.x();
      const ny = node.y();

      if (shape.type === "rectangle") {
        const rect = node.findOne("Rect") as Konva.Rect;
        const w = Math.max(8, rect.width() * sx);
        const h = Math.max(8, rect.height() * sy);
        rect.width(w);
        rect.height(h);
        node.scaleX(1);
        node.scaleY(1);
        replaceShape({
          ...shape,
          x: nx,
          y: ny,
          width: w,
          height: h,
          rotation: rot,
        });
        return;
      }

      if (shape.type === "ellipse") {
        const ell = node.findOne("Ellipse") as Konva.Ellipse;
        const rx = Math.max(4, ell.radiusX() * sx);
        const ry = Math.max(4, ell.radiusY() * sy);
        ell.radiusX(rx);
        ell.radiusY(ry);
        node.scaleX(1);
        node.scaleY(1);
        const topX = nx - rx;
        const topY = ny - ry;
        replaceShape({
          ...shape,
          x: topX,
          y: topY,
          radiusX: rx,
          radiusY: ry,
          rotation: rot,
        });
        return;
      }

      if (shape.type === "text") {
        const text = node.findOne("Text") as Konva.Text;
        const fs = Math.max(10, text.fontSize() * sy);
        text.fontSize(fs);
        node.scaleX(1);
        node.scaleY(1);
        replaceShape({ ...shape, x: nx, y: ny, fontSize: fs, rotation: rot });
        return;
      }

      if (shape.type === "sticky") {
        const r = node.findOne("Rect") as Konva.Rect;
        const tw = Math.max(48, r.width() * sx);
        const th = Math.max(48, r.height() * sy);
        r.width(tw);
        r.height(th);
        const t = node.findOne("Text") as Konva.Text;
        t.width(tw - 12);
        node.scaleX(1);
        node.scaleY(1);
        replaceShape({
          ...shape,
          x: nx,
          y: ny,
          width: tw,
          height: th,
          rotation: rot,
        });
        return;
      }

      if (shape.type === "freehand") {
        const path = node.findOne("Path") as Konva.Path;
        const outline = shape.outline.slice();
        for (let i = 0; i < outline.length; i += 2) {
          outline[i] *= sx;
          outline[i + 1] *= sy;
        }
        path.scaleX(1);
        path.scaleY(1);
        path.data(outlineToPathData(outline));
        node.scaleX(1);
        node.scaleY(1);
        replaceShape({
          ...shape,
          x: nx,
          y: ny,
          outline,
          rotation: rot,
        });
        return;
      }

      if (shape.type === "arrow") {
        const arr = node.findOne("Arrow") as Konva.Arrow;
        const pts = arr.points().slice();
        for (let i = 0; i < pts.length; i += 2) {
          pts[i] *= sx;
          pts[i + 1] *= sy;
        }
        arr.points(pts);
        node.scaleX(1);
        node.scaleY(1);
        const x1 = nx;
        const y1 = ny;
        const x2 = nx + pts[2];
        const y2 = ny + pts[3];
        replaceShape({
          ...shape,
          x: x1,
          y: y1,
          points: [x1, y1, x2, y2],
          rotation: rot,
        });
        return;
      }

      if (shape.type === "image") {
        const ki = node.findOne("Image") as Konva.Image | null;
        if (!ki) return;
        const iw = Math.max(8, ki.width() * sx);
        const ih = Math.max(8, ki.height() * sy);
        ki.width(iw);
        ki.height(ih);
        node.scaleX(1);
        node.scaleY(1);
        replaceShape({
          ...shape,
          x: nx,
          y: ny,
          width: iw,
          height: ih,
          rotation: rot,
        });
      }
    },
    [replaceShape, shapes]
  );

  const onTransformEnd = useCallback(
    (id: string, e: Konva.KonvaEventObject<Event>) => {
      bakeTransform(id, e.target as Konva.Group);
    },
    [bakeTransform]
  );

  const syncDrag = useCallback(
    (id: string, node: Konva.Group) => {
      const shape = shapes.find((s) => s.id === id);
      if (!shape) return;
      const nx = node.x();
      const ny = node.y();
      if (shape.type === "arrow") {
        const arr = node.findOne("Arrow") as Konva.Arrow;
        const p = arr.points();
        const [dx0, dy0, dx1, dy1] = p;
        replaceShape({
          ...shape,
          x: nx,
          y: ny,
          points: [nx + dx0, ny + dy0, nx + dx1, ny + dy1],
        });
        return;
      }
      replaceShape({ ...shape, x: nx, y: ny });
    },
    [replaceShape, shapes]
  );

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stageScale;
      const scaleBy = 1.05;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale =
        direction > 0
          ? Math.min(MAX_ZOOM, oldScale * scaleBy)
          : Math.max(MIN_ZOOM, oldScale / scaleBy);
      if (newScale === oldScale) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };
      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [stagePos.x, stagePos.y, stageScale]
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (textEdit) return;
      const clickedOnEmpty =
        e.target === e.target.getStage() || e.target.getClassName() === "Layer";
      const btn = e.evt.button;
      if (btn === 1 || (spaceDown.current && btn === 0)) {
        e.evt.preventDefault();
        panning.current = true;
        panStart.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
          sx: stagePos.x,
          sy: stagePos.y,
        };
        return;
      }
      if (btn !== 0) return;

      const pos = pointerInStage();
      if (!pos || !clickedOnEmpty) return;

      if (tool === "select") {
        setSelectedId(null);
        return;
      }

      if (tool === "eraser") {
        setSelectedId(null);
        return;
      }

      if (tool === "rectangle") {
        setDraft({ kind: "rect", x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        return;
      }
      if (tool === "ellipse") {
        setDraft({
          kind: "ellipse",
          x0: pos.x,
          y0: pos.y,
          x1: pos.x,
          y1: pos.y,
        });
        return;
      }
      if (tool === "arrow") {
        setDraft({ kind: "arrow", x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
        return;
      }
      if (tool === "freehand") {
        setDraft({ kind: "freehand", points: [[pos.x, pos.y]] });
        return;
      }

      if (tool === "text") {
        const id = newId();
        addShape({
          id,
          type: "text",
          x: pos.x,
          y: pos.y,
          text: "Text",
          fontSize: 22,
          fill: DEFAULT_STROKE,
          rotation: 0,
        });
        setSelectedId(id);
        setTool("select");
        return;
      }

      if (tool === "sticky") {
        const id = newId();
        const fill = DEFAULT_FILL;
        addShape({
          id,
          type: "sticky",
          x: pos.x,
          y: pos.y,
          width: 160,
          height: 120,
          fill,
          text: "Note",
          textFill: contrastingTextColor(fill),
          rotation: 0,
        });
        setSelectedId(id);
        setTool("select");
      }
    },
    [addShape, pointerInStage, stagePos.x, stagePos.y, textEdit, tool]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (textEdit) return;
      if (panning.current) {
        const dx = e.evt.clientX - panStart.current.x;
        const dy = e.evt.clientY - panStart.current.y;
        setStagePos({ x: panStart.current.sx + dx, y: panStart.current.sy + dy });
        return;
      }
      const pos = pointerInStage();
      if (pos) {
        lastPointerStageRef.current = pos;
        if (awareness) {
          const now = Date.now();
          if (now - lastCursorAwareRef.current >= 50) {
            lastCursorAwareRef.current = now;
            awareness.setLocalStateField("cursor", { x: pos.x, y: pos.y });
          }
        }
      }
      if (!pos || !draft) return;
      if (draft.kind === "rect" || draft.kind === "ellipse" || draft.kind === "arrow") {
        setDraft({ ...draft, x1: pos.x, y1: pos.y });
        return;
      }
      if (draft.kind === "freehand") {
        setDraft({
          kind: "freehand",
          points: [...draft.points, [pos.x, pos.y]],
        });
      }
    },
    [awareness, draft, pointerInStage, textEdit]
  );

  const handleStageMouseUp = useCallback(() => {
    if (textEdit) return;
    if (panning.current) {
      panning.current = false;
      return;
    }
    if (!draft) return;

    if (draft.kind === "rect") {
      const { x, y, width, height } = normalizeRect(
        draft.x0,
        draft.y0,
        draft.x1,
        draft.y1
      );
      if (width > 4 && height > 4) {
        addShape({
          id: newId(),
          type: "rectangle",
          x,
          y,
          width,
          height,
          fill: "#bfdbfe",
          stroke: DEFAULT_STROKE,
          strokeWidth: 2,
          rotation: 0,
        });
      }
      setDraft(null);
      return;
    }

    if (draft.kind === "ellipse") {
      const { x, y, width, height } = normalizeRect(
        draft.x0,
        draft.y0,
        draft.x1,
        draft.y1
      );
      const rx = width / 2;
      const ry = height / 2;
      if (rx > 4 && ry > 4) {
        addShape({
          id: newId(),
          type: "ellipse",
          x: x,
          y: y,
          radiusX: rx,
          radiusY: ry,
          fill: "#ddd6fe",
          stroke: DEFAULT_STROKE,
          strokeWidth: 2,
          rotation: 0,
        });
      }
      setDraft(null);
      return;
    }

    if (draft.kind === "arrow") {
      const dx = draft.x1 - draft.x0;
      const dy = draft.y1 - draft.y0;
      if (Math.hypot(dx, dy) > 8) {
        addShape({
          id: newId(),
          type: "arrow",
          x: draft.x0,
          y: draft.y0,
          points: [draft.x0, draft.y0, draft.x1, draft.y1],
          stroke: DEFAULT_STROKE,
          strokeWidth: 2,
          fill: DEFAULT_STROKE,
          rotation: 0,
        });
      }
      setDraft(null);
      return;
    }

    if (draft.kind === "freehand") {
      if (draft.points.length > 1) {
        const stroke = getStroke(draft.points, {
          size: 8,
          thinning: 0.6,
          smoothing: 0.5,
          streamline: 0.5,
          last: true,
        });
        const flat = stroke.flatMap(([px, py]) => [px, py]);
        let minX = Infinity,
          minY = Infinity;
        for (let i = 0; i < flat.length; i += 2) {
          minX = Math.min(minX, flat[i]);
          minY = Math.min(minY, flat[i + 1]);
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
          setDraft(null);
          return;
        }
        const rel = flat.map((v, i) =>
          i % 2 === 0 ? v - minX : v - minY
        );
        addShape({
          id: newId(),
          type: "freehand",
          x: minX,
          y: minY,
          outline: rel,
          fill: DEFAULT_STROKE,
          rotation: 0,
        });
      }
      setDraft(null);
    }
  }, [addShape, draft, textEdit]);

  const eraseShape = useCallback(
    (id: string) => {
      if (selectedId === id) setSelectedId(null);
      removeShape(id);
    },
    [removeShape, selectedId]
  );

  const onShapeMouseDown = useCallback(
    (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
      if (tool === "eraser") {
        e.cancelBubble = true;
        eraseShape(id);
        return;
      }
      if (tool !== "select") return;
      e.cancelBubble = true;
      setSelectedId(id);
    },
    [eraseShape, tool]
  );

  const openTextEditor = useCallback(
    (shape: TextShape | StickyShape, clientX: number, clientY: number) => {
      const pad = 8;
      const maxW = 320;
      const left = Math.min(
        clientX - pad,
        typeof window !== "undefined" ? window.innerWidth - maxW - pad : clientX
      );
      const top = Math.min(
        clientY - pad,
        typeof window !== "undefined" ? window.innerHeight - 160 : clientY
      );
      setTextEdit({
        id: shape.id,
        value: shape.text,
        variant: shape.type === "sticky" ? "sticky" : "text",
        anchorLeft: Math.max(pad, left),
        anchorTop: Math.max(pad, top),
      });
    },
    []
  );

  const saveTextEdit = useCallback(() => {
    const cur = textEditRef.current;
    if (!cur) return;
    const { id, value, variant } = cur;
    setTextEdit(null);
    const list = shapesRef.current;
    const shape = list.find((s) => s.id === id);
    if (!shape || (shape.type !== "text" && shape.type !== "sticky")) return;
    if (variant === "sticky" && shape.type === "sticky") {
      replaceShape({
        ...shape,
        text: value,
        textFill: contrastingTextColor(shape.fill),
      });
      return;
    }
    if (shape.type === "text") {
      replaceShape({ ...shape, text: value });
    }
  }, [replaceShape]);

  const cancelTextEdit = useCallback(() => {
    setTextEdit(null);
  }, []);

  const onTextDblClick = useCallback(
    (shape: TextShape | StickyShape, e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      openTextEditor(shape, e.evt.clientX, e.evt.clientY);
    },
    [openTextEditor]
  );

  const draftPreview = useMemo(() => {
    if (!draft) return null;
    if (draft.kind === "rect") {
      const r = normalizeRect(draft.x0, draft.y0, draft.x1, draft.y1);
      return (
        <Rect
          {...r}
          fill="#93c5fd55"
          stroke={DEFAULT_STROKE}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    if (draft.kind === "ellipse") {
      const { x, y, width, height } = normalizeRect(
        draft.x0,
        draft.y0,
        draft.x1,
        draft.y1
      );
      const rx = width / 2;
      const ry = height / 2;
      return (
        <Ellipse
          x={x + rx}
          y={y + ry}
          radiusX={rx}
          radiusY={ry}
          fill="#c4b5fd55"
          stroke={DEFAULT_STROKE}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    if (draft.kind === "arrow") {
      return (
        <Line
          points={[draft.x0, draft.y0, draft.x1, draft.y1]}
          stroke={DEFAULT_STROKE}
          strokeWidth={2}
          listening={false}
        />
      );
    }
    if (draft.kind === "freehand") {
      const flat = draft.points.flat();
      return (
        <Line
          points={flat}
          stroke={DEFAULT_STROKE}
          strokeWidth={2}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    }
    return null;
  }, [draft]);

  const renderShape = (shape: Shape) => {
    const selected = selectedId === shape.id;
    const common = {
      listening: tool === "select" || tool === "eraser",
      ref: (node: Konva.Group | null) => {
        if (node) shapeRefs.current.set(shape.id, node);
        else shapeRefs.current.delete(shape.id);
      },
      draggable: tool === "select" && selected,
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) =>
        onShapeMouseDown(shape.id, e),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
        syncDrag(shape.id, e.target as Konva.Group),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) =>
        onTransformEnd(shape.id, e),
    };

    if (shape.type === "rectangle") {
      return (
        <Group
          key={shape.id}
          x={shape.x}
          y={shape.y}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
          />
        </Group>
      );
    }
    if (shape.type === "ellipse") {
      return (
        <Group
          key={shape.id}
          x={shape.x + shape.radiusX}
          y={shape.y + shape.radiusY}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Ellipse
            radiusX={shape.radiusX}
            radiusY={shape.radiusY}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
          />
        </Group>
      );
    }
    if (shape.type === "text") {
      return (
        <Group
          key={shape.id}
          x={shape.x}
          y={shape.y}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Text
            text={shape.text}
            fontSize={shape.fontSize}
            fill={shape.fill}
            onDblClick={(e) => {
              if (tool === "select") onTextDblClick(shape, e);
            }}
          />
        </Group>
      );
    }
    if (shape.type === "sticky") {
      return (
        <Group
          key={shape.id}
          x={shape.x}
          y={shape.y}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            stroke={DEFAULT_STROKE}
            strokeWidth={1}
            cornerRadius={4}
          />
          <Text
            x={6}
            y={6}
            width={shape.width - 12}
            height={shape.height - 12}
            text={shape.text}
            fontSize={16}
            fill={shape.textFill}
            wrap="word"
            onDblClick={(e) => {
              if (tool === "select") onTextDblClick(shape, e);
            }}
          />
        </Group>
      );
    }
    if (shape.type === "freehand") {
      return (
        <Group
          key={shape.id}
          x={shape.x}
          y={shape.y}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Path
            data={outlineToPathData(shape.outline)}
            fill={shape.fill}
            listening
          />
        </Group>
      );
    }
    if (shape.type === "arrow") {
      const [x1, y1, x2, y2] = shape.points;
      return (
        <Group
          key={shape.id}
          x={x1}
          y={y1}
          rotation={shape.rotation ?? 0}
          {...common}
        >
          <Arrow
            points={[0, 0, x2 - x1, y2 - y1]}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            fill={shape.fill}
            pointerLength={12}
            pointerWidth={12}
          />
        </Group>
      );
    }
    if (shape.type === "image") {
      return (
        <BoardImageShape
          key={shape.id}
          shape={shape}
          common={common}
        />
      );
    }
    return null;
  };

  const remotePresenceNodes = useMemo(() => {
    const selectionRects: ReactNode[] = [];
    for (const peer of remotePeers) {
      const color = peer.user?.color ?? colorFromClientId(peer.clientId);
      for (const id of peer.selection ?? []) {
        const shape = shapes.find((s) => s.id === id);
        if (!shape) continue;
        const b = shapeWorldBounds(shape);
        selectionRects.push(
          <Rect
            key={`rp-sel-${peer.clientId}-${id}`}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            stroke={color}
            strokeWidth={2}
            dash={[8, 5]}
            listening={false}
          />
        );
      }
    }
    const cursors = remotePeers.map((peer) => {
      const c = peer.cursor;
      if (!c || typeof c.x !== "number" || typeof c.y !== "number") {
        return null;
      }
      const color = peer.user?.color ?? colorFromClientId(peer.clientId);
      return (
        <Group key={`rp-cursor-${peer.clientId}`} x={c.x} y={c.y} listening={false}>
          <Line
            points={[0, 0, -2, 16]}
            stroke={color}
            strokeWidth={2.5}
            lineCap="round"
          />
          <KonvaCircle
            x={0}
            y={0}
            radius={4.5}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <Text
            x={10}
            y={-6}
            text={`${peer.clientId}`}
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            fill={color}
          />
        </Group>
      );
    });
    return { selectionRects, cursors };
  }, [remotePeers, shapes]);

  if (!ydoc) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-muted/30 text-muted-foreground">
        Loading board…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden bg-muted/30 outline-none",
        tool === "eraser" && "cursor-crosshair"
      )}
      tabIndex={0}
      onWheel={(e) => e.preventDefault()}
    >
      {textEdit ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default bg-black/20"
            aria-label="Close text editor"
            onClick={saveTextEdit}
          />
          <div
            className="fixed z-30 flex max-h-[min(40vh,360px)] w-[min(320px,calc(100vw-24px))] flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
            style={{ left: textEdit.anchorLeft, top: textEdit.anchorTop }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              ref={textAreaRef}
              value={textEdit.value}
              onChange={(e) =>
                setTextEdit((t) => (t ? { ...t, value: e.target.value } : t))
              }
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelTextEdit();
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  saveTextEdit();
                }
              }}
              className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground shadow-sm"
              rows={textEdit.variant === "sticky" ? 5 : 2}
              style={{
                fontSize: textEdit.variant === "text" ? 18 : 14,
                lineHeight: 1.35,
              }}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelTextEdit}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveTextEdit}
              >
                Done
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ctrl/Cmd+Enter saves · Escape cancels · Backdrop click saves
            </p>
          </div>
        </>
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(calc(100vw-1.5rem),720px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur pointer-events-auto">
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "select")}
          aria-label="Select"
          onClick={() => setTool("select")}
        >
          <MousePointer2 />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "eraser")}
          aria-label="Eraser"
          onClick={() => {
            setTool("eraser");
            setSelectedId(null);
          }}
        >
          <Eraser />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Bring to front"
          disabled={!selectedId}
          onClick={() => {
            if (selectedId) bringToFront(selectedId);
          }}
        >
          <BringToFront />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Send to back"
          disabled={!selectedId}
          onClick={() => {
            if (selectedId) sendToBack(selectedId);
          }}
        >
          <SendToBack />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "rectangle")}
          aria-label="Rectangle"
          onClick={() => {
            setTool("rectangle");
            setSelectedId(null);
          }}
        >
          <Square />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "ellipse")}
          aria-label="Ellipse"
          onClick={() => {
            setTool("ellipse");
            setSelectedId(null);
          }}
        >
          <Circle />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "text")}
          aria-label="Text"
          onClick={() => {
            setTool("text");
            setSelectedId(null);
          }}
        >
          <Type />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "sticky")}
          aria-label="Sticky note"
          onClick={() => {
            setTool("sticky");
            setSelectedId(null);
          }}
        >
          <StickyNote />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "freehand")}
          aria-label="Freehand"
          onClick={() => {
            setTool("freehand");
            setSelectedId(null);
          }}
        >
          <Pencil />
        </Button>
        <Button
          size="icon-sm"
          variant={toolbarButtonVariant(tool === "arrow")}
          aria-label="Arrow"
          onClick={() => {
            setTool("arrow");
            setSelectedId(null);
          }}
        >
          <MoveUpRight />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f?.type.startsWith("image/")) {
              void insertImageFromFile(f, getImageDropPoint());
            }
          }}
        />
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label="Insert image"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon />
        </Button>
        <span
          className="mx-0.5 inline-block h-6 w-px shrink-0 self-center bg-border"
          aria-hidden
        />
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Log out and return home"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void onLogout()}
        >
          <LogOut />
        </Button>
      </div>

      <Stage
        ref={stageRef}
        tabIndex={0}
        width={w}
        height={h}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={() => {
          if (awareness) {
            awareness.setLocalStateField("cursor", null);
          }
          handleStageMouseUp();
        }}
      >
        <Layer>
          {shapes.map(renderShape)}
          {draftPreview}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            borderStroke="#2563eb"
            anchorStroke="#2563eb"
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 8 || newBox.height < 8) return oldBox;
              return newBox;
            }}
          />
        </Layer>
        <Layer listening={false}>
          {remotePresenceNodes.selectionRects}
          {remotePresenceNodes.cursors}
        </Layer>
      </Stage>
    </div>
  );
}

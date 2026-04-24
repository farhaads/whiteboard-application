import * as Y from "yjs";
import type { Shape } from "@/lib/shapes";

function num(m: Y.Map<unknown>, k: string): number {
  const v = m.get(k);
  return typeof v === "number" ? v : Number(v);
}

function str(m: Y.Map<unknown>, k: string): string {
  const v = m.get(k);
  return typeof v === "string" ? v : String(v ?? "");
}

export function shapeIntoYMap(shape: Shape, m: Y.Map<unknown>): void {
  m.clear();
  m.set("id", shape.id);
  m.set("type", shape.type);
  if (shape.rotation != null && shape.rotation !== 0) {
    m.set("rotation", shape.rotation);
  }
  switch (shape.type) {
    case "rectangle":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("width", shape.width);
      m.set("height", shape.height);
      m.set("fill", shape.fill);
      m.set("stroke", shape.stroke);
      m.set("strokeWidth", shape.strokeWidth);
      break;
    case "ellipse":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("radiusX", shape.radiusX);
      m.set("radiusY", shape.radiusY);
      m.set("fill", shape.fill);
      m.set("stroke", shape.stroke);
      m.set("strokeWidth", shape.strokeWidth);
      break;
    case "text":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("text", shape.text);
      m.set("fontSize", shape.fontSize);
      m.set("fill", shape.fill);
      break;
    case "sticky":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("width", shape.width);
      m.set("height", shape.height);
      m.set("fill", shape.fill);
      m.set("text", shape.text);
      m.set("textFill", shape.textFill);
      break;
    case "freehand":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("outline", JSON.stringify(shape.outline));
      m.set("fill", shape.fill);
      break;
    case "arrow":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("points", JSON.stringify(shape.points));
      m.set("stroke", shape.stroke);
      m.set("strokeWidth", shape.strokeWidth);
      m.set("fill", shape.fill);
      break;
    case "image":
      m.set("x", shape.x);
      m.set("y", shape.y);
      m.set("width", shape.width);
      m.set("height", shape.height);
      m.set("imageKey", shape.imageKey);
      m.set("url", shape.url);
      break;
  }
}

export function yMapToShape(m: Y.Map<unknown>): Shape | null {
  const type = m.get("type");
  const id = m.get("id");
  if (typeof type !== "string" || typeof id !== "string") return null;
  const rotRaw = m.get("rotation");
  const rotation =
    typeof rotRaw === "number" ? rotRaw : rotRaw != null ? Number(rotRaw) : 0;

  switch (type) {
    case "rectangle":
      return {
        id,
        type: "rectangle",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        width: num(m, "width"),
        height: num(m, "height"),
        fill: str(m, "fill"),
        stroke: str(m, "stroke"),
        strokeWidth: num(m, "strokeWidth"),
      };
    case "ellipse":
      return {
        id,
        type: "ellipse",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        radiusX: num(m, "radiusX"),
        radiusY: num(m, "radiusY"),
        fill: str(m, "fill"),
        stroke: str(m, "stroke"),
        strokeWidth: num(m, "strokeWidth"),
      };
    case "text":
      return {
        id,
        type: "text",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        text: str(m, "text"),
        fontSize: num(m, "fontSize"),
        fill: str(m, "fill"),
      };
    case "sticky":
      return {
        id,
        type: "sticky",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        width: num(m, "width"),
        height: num(m, "height"),
        fill: str(m, "fill"),
        text: str(m, "text"),
        textFill: str(m, "textFill"),
      };
    case "freehand": {
      let outline: number[] = [];
      try {
        const raw = m.get("outline");
        if (typeof raw === "string") outline = JSON.parse(raw) as number[];
      } catch {
        return null;
      }
      return {
        id,
        type: "freehand",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        outline,
        fill: str(m, "fill"),
      };
    }
    case "arrow": {
      let points: [number, number, number, number] = [0, 0, 0, 0];
      try {
        const raw = m.get("points");
        if (typeof raw === "string") {
          const p = JSON.parse(raw) as number[];
          if (p.length === 4) points = p as [number, number, number, number];
        }
      } catch {
        return null;
      }
      return {
        id,
        type: "arrow",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        points,
        stroke: str(m, "stroke"),
        strokeWidth: num(m, "strokeWidth"),
        fill: str(m, "fill"),
      };
    }
    case "image":
      return {
        id,
        type: "image",
        rotation,
        x: num(m, "x"),
        y: num(m, "y"),
        width: num(m, "width"),
        height: num(m, "height"),
        imageKey: str(m, "imageKey"),
        url: str(m, "url"),
      };
    default:
      return null;
  }
}

export function orderedShapesFromDoc(ydoc: Y.Doc): Shape[] {
  const order = ydoc.getArray<string>("order");
  const shapesMap = ydoc.getMap("shapes");
  const out: Shape[] = [];
  order.forEach((id) => {
    const inner = shapesMap.get(id) as Y.Map<unknown> | undefined;
    if (!inner) return;
    const s = yMapToShape(inner);
    if (s) out.push(s);
  });
  return out;
}

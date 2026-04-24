import { v4 as uuidv4 } from "uuid";

export type Tool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "text"
  | "sticky"
  | "freehand"
  | "arrow"
  | "eraser";

export type BaseShape = {
  id: string;
  rotation?: number;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type EllipseShape = BaseShape & {
  type: "ellipse";
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type TextShape = BaseShape & {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
};

export type StickyShape = BaseShape & {
  type: "sticky";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  text: string;
  textFill: string;
};

/** Outline polygon (flat [x,y,...]) in shape-local coords; position is bbox top-left */
export type FreehandShape = BaseShape & {
  type: "freehand";
  x: number;
  y: number;
  outline: number[];
  fill: string;
};

export type ArrowShape = BaseShape & {
  type: "arrow";
  x: number;
  y: number;
  points: [number, number, number, number];
  stroke: string;
  strokeWidth: number;
  fill: string;
};

export type ImageShape = BaseShape & {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  imageKey: string;
  url: string;
};

export type Shape =
  | RectangleShape
  | EllipseShape
  | TextShape
  | StickyShape
  | FreehandShape
  | ArrowShape
  | ImageShape;

export function cloneShapes(shapes: Shape[]): Shape[] {
  return JSON.parse(JSON.stringify(shapes)) as Shape[];
}

export function newId(): string {
  return uuidv4();
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

/** WCAG relative luminance; returns ~0–1 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const lin = [rgb.r, rgb.g, rgb.b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastingTextColor(fillHex: string): string {
  return relativeLuminance(fillHex) > 0.45 ? "#0f172a" : "#f8fafc";
}

export function outlineToPathData(outline: number[]): string {
  if (outline.length < 4) return "";
  let d = `M ${outline[0]} ${outline[1]}`;
  for (let i = 2; i < outline.length; i += 2) {
    d += ` L ${outline[i]} ${outline[i + 1]}`;
  }
  d += " Z";
  return d;
}

function rotatePoint(
  x: number,
  y: number,
  rad: number
): { x: number; y: number } {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function aabbFromCorners(
  ox: number,
  oy: number,
  corners: { x: number; y: number }[]
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    const wx = ox + p.x;
    const wy = oy + p.y;
    minX = Math.min(minX, wx);
    minY = Math.min(minY, wy);
    maxX = Math.max(maxX, wx);
    maxY = Math.max(maxY, wy);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Axis-aligned world bounds for presence / selection outlines (approximate for text). */
export function shapeWorldBounds(shape: Shape): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const rad = ((shape.rotation ?? 0) * Math.PI) / 180;

  switch (shape.type) {
    case "rectangle": {
      const w = shape.width;
      const h = shape.height;
      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ].map((p) => rotatePoint(p.x, p.y, rad));
      return aabbFromCorners(shape.x, shape.y, corners);
    }
    case "ellipse": {
      const cx = shape.x + shape.radiusX;
      const cy = shape.y + shape.radiusY;
      const rx = shape.radiusX;
      const ry = shape.radiusY;
      const corners = [
        { x: -rx, y: -ry },
        { x: rx, y: -ry },
        { x: rx, y: ry },
        { x: -rx, y: ry },
      ].map((p) => rotatePoint(p.x, p.y, rad));
      return aabbFromCorners(cx, cy, corners);
    }
    case "text": {
      const lines = shape.text.split("\n");
      const maxLen = Math.max(1, ...lines.map((l) => l.length));
      const w = Math.max(8, maxLen * shape.fontSize * 0.55);
      const h = Math.max(shape.fontSize * 1.25, lines.length * shape.fontSize * 1.25);
      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ].map((p) => rotatePoint(p.x, p.y, rad));
      return aabbFromCorners(shape.x, shape.y, corners);
    }
    case "sticky": {
      const w = shape.width;
      const h = shape.height;
      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ].map((p) => rotatePoint(p.x, p.y, rad));
      return aabbFromCorners(shape.x, shape.y, corners);
    }
    case "freehand": {
      const o = shape.outline;
      if (o.length < 2) {
        return { x: shape.x, y: shape.y, width: 1, height: 1 };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < o.length; i += 2) {
        const p = rotatePoint(o[i], o[i + 1], rad);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = 4;
      return {
        x: shape.x + minX - pad,
        y: shape.y + minY - pad,
        width: Math.max(1, maxX - minX + pad * 2),
        height: Math.max(1, maxY - minY + pad * 2),
      };
    }
    case "arrow": {
      const [x1, y1, x2, y2] = shape.points;
      const pad = shape.strokeWidth + 14;
      const r0 = rotatePoint(0, 0, rad);
      const r1 = rotatePoint(x2 - x1, y2 - y1, rad);
      const minXL = Math.min(r0.x, r1.x) - pad;
      const minYL = Math.min(r0.y, r1.y) - pad;
      const maxXL = Math.max(r0.x, r1.x) + pad;
      const maxYL = Math.max(r0.y, r1.y) + pad;
      return {
        x: x1 + minXL,
        y: y1 + minYL,
        width: Math.max(1, maxXL - minXL),
        height: Math.max(1, maxYL - minYL),
      };
    }
    case "image": {
      const w = shape.width;
      const h = shape.height;
      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ].map((p) => rotatePoint(p.x, p.y, rad));
      return aabbFromCorners(shape.x, shape.y, corners);
    }
  }
}

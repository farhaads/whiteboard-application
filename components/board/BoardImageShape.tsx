"use client";

import { Group, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { ImageShape } from "@/lib/shapes";

type Common = {
  listening?: boolean;
  ref?: (node: Konva.Group | null) => void;
  draggable?: boolean;
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (e: Konva.KonvaEventObject<Event>) => void;
};

export function BoardImageShape({
  shape,
  common,
}: {
  shape: ImageShape;
  common: Common;
}) {
  const [img] = useImage(shape.url, "anonymous");

  return (
    <Group
      x={shape.x}
      y={shape.y}
      rotation={shape.rotation ?? 0}
      {...common}
    >
      {!img ? (
        <Rect
          width={shape.width}
          height={shape.height}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth={1}
          dash={[6, 4]}
        />
      ) : (
        <KonvaImage
          image={img}
          width={shape.width}
          height={shape.height}
        />
      )}
    </Group>
  );
}

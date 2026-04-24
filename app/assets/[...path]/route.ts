import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getUploadDir } from "@/lib/serverUploadDir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MIME[ext] ?? "application/octet-stream";
}

function isSafeRelativeSegments(segments: string[]): boolean {
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
    if (seg.includes("/") || seg.includes("\\")) return false;
  }
  return segments.length > 0;
}

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const segments = params.path;
  if (!isSafeRelativeSegments(segments)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const root = path.resolve(getUploadDir());
  const rel = path.join(...segments);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = createReadStream(abs);
  const web = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new NextResponse(web, {
    status: 200,
    headers: {
      "Content-Type": contentTypeForFile(abs),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

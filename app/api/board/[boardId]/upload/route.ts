import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BOARD_COOKIE, verifyBoardJwt } from "@/lib/boardJwt";
import { getUploadDir } from "@/lib/serverUploadDir";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/avif": "avif",
  };
  if (map[mime]) return map[mime];
  const sub = mime.slice("image/".length).replace(/\+xml$/, "");
  return sub.replace(/[^a-z0-9]/gi, "") || "img";
}

function isSafeBoardId(boardId: string): boolean {
  if (!boardId || boardId.length > 200) return false;
  if (boardId.includes("..") || boardId.includes("/") || boardId.includes("\\"))
    return false;
  return true;
}

export async function POST(
  req: Request,
  { params }: { params: { boardId: string } }
) {
  const boardId = params.boardId;
  if (!isSafeBoardId(boardId)) {
    return NextResponse.json({ error: "Invalid board id" }, { status: 400 });
  }

  const token = cookies().get(BOARD_COOKIE)?.value;
  const session = await verifyBoardJwt(token);
  if (!session || session.boardId !== boardId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    return NextResponse.json(
      { error: "Expected multipart field \"file\" with a file" },
      { status: 400 }
    );
  }

  const mime = entry.type || "application/octet-stream";
  if (!mime.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (entry.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 }
    );
  }

  const ext = extFromMime(mime);
  const id = randomUUID();
  const imageKey = `${boardId}/${id}.${ext}`;
  const root = path.resolve(getUploadDir());
  const dir = path.resolve(root, boardId);
  if (!dir.startsWith(root + path.sep) && dir !== root) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  await mkdir(dir, { recursive: true });

  const dest = path.join(dir, `${id}.${ext}`);
  const resolvedDest = path.resolve(dest);
  if (!resolvedDest.startsWith(dir + path.sep) && resolvedDest !== dir) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const nodeReadable = Readable.fromWeb(
    entry.stream() as import("stream/web").ReadableStream
  );
  await pipeline(nodeReadable, createWriteStream(resolvedDest));

  const url = `/assets/${imageKey}`;
  return NextResponse.json({ imageKey, url });
}

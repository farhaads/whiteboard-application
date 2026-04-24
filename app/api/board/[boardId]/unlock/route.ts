import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { BOARD_COOKIE, BOARD_JWT_MAX_AGE_SEC, signBoardJwt } from "@/lib/boardJwt";
import { getBoardPasswordHash } from "@/lib/boardDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSafeBoardId(boardId: string): boolean {
  if (!boardId || boardId.length > 64) return false;
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password: unknown }).password
      : undefined;
  if (typeof password !== "string" || password.length < 1) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 }
    );
  }

  const stored = getBoardPasswordHash(boardId);
  if (!stored) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  const ok = bcrypt.compareSync(password, stored);
  if (!ok) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await signBoardJwt(boardId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(BOARD_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: BOARD_JWT_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

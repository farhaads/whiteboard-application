import { NextResponse } from "next/server";
import { BOARD_COOKIE, boardCookieName } from "@/lib/boardJwt";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let boardId: string | undefined;
  try {
    const body = (await req.json()) as { boardId?: unknown };
    if (typeof body?.boardId === "string") boardId = body.boardId;
  } catch {
    /* no body: only clear the legacy cookie */
  }

  const res = NextResponse.json({ ok: true });
  const clear = (name: string) =>
    res.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    });

  // Clear this board's session cookie plus the legacy single-session cookie.
  const perBoard = boardId ? boardCookieName(boardId) : null;
  if (perBoard) clear(perBoard);
  clear(BOARD_COOKIE);
  return res;
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BOARD_COOKIE, verifyBoardJwt } from "@/lib/boardJwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const unlockMatch = pathname.match(/^\/board\/([^/]+)\/unlock\/?$/);
  if (unlockMatch) {
    return NextResponse.next();
  }

  const boardMatch = pathname.match(/^\/board\/([^/]+)\/?$/);
  if (!boardMatch) {
    return NextResponse.next();
  }

  const boardId = boardMatch[1];
  const token = request.cookies.get(BOARD_COOKIE)?.value;
  const session = await verifyBoardJwt(token);

  if (!session || session.boardId !== boardId) {
    const res = NextResponse.redirect(
      new URL(`/board/${encodeURIComponent(boardId)}/unlock`, request.url)
    );
    if (token) {
      res.cookies.set(BOARD_COOKIE, "", {
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/board/:path*"],
};

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BOARD_COOKIE, verifyBoardJwt } from "@/lib/boardJwt";
import { getSyncWebsocketBaseUrl } from "@/lib/syncUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSafeBoardId(boardId: string): boolean {
  if (!boardId || boardId.length > 64) return false;
  if (boardId.includes("..") || boardId.includes("/") || boardId.includes("\\"))
    return false;
  return true;
}

export async function GET(
  _req: Request,
  { params }: { params: { boardId: string } }
) {
  const boardId = params.boardId;
  if (!isSafeBoardId(boardId)) {
    return NextResponse.json({ error: "Invalid board id" }, { status: 400 });
  }

  const jar = cookies();
  const token = jar.get(BOARD_COOKIE)?.value;
  const session = await verifyBoardJwt(token);
  if (!session || session.boardId !== boardId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    token,
    syncUrl: getSyncWebsocketBaseUrl(),
  });
}

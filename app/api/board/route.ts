import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { insertBoard } from "@/lib/boardDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const boardIdAlphabet = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  10
);

function isSqliteUniqueConstraint(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: string }).code;
  return (
    code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

export async function POST(req: Request) {
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
  if (password.length > 2000) {
    return NextResponse.json({ error: "Password too long" }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password, 10);

  for (let attempt = 0; attempt < 12; attempt++) {
    const boardId = boardIdAlphabet();
    try {
      insertBoard(boardId, hash);
      return NextResponse.json({ boardId });
    } catch (e) {
      if (isSqliteUniqueConstraint(e)) {
        continue;
      }
      throw e;
    }
  }

  return NextResponse.json({ error: "Could not allocate id" }, { status: 500 });
}

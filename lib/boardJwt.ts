import { SignJWT, jwtVerify } from "jose";

export const BOARD_COOKIE = "board_token";
export const BOARD_JWT_MAX_AGE_SEC = 12 * 60 * 60;

function getSecretKey(): Uint8Array | null {
  const s = process.env.JWT_SECRET;
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export async function signBoardJwt(boardId: string): Promise<string> {
  const key = getSecretKey();
  if (!key) {
    throw new Error("JWT_SECRET is not set");
  }
  return new SignJWT({ boardId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${BOARD_JWT_MAX_AGE_SEC}s`)
    .sign(key);
}

/** Returns null if missing, invalid, or expired. */
export async function verifyBoardJwt(
  token: string | undefined
): Promise<{ boardId: string } | null> {
  const key = getSecretKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const boardId = payload.boardId;
    if (typeof boardId !== "string" || boardId.length === 0) return null;
    return { boardId };
  } catch {
    return null;
  }
}

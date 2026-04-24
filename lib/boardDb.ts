import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type SqliteDatabase = import("better-sqlite3").Database;

let db: SqliteDatabase | undefined;

export function getBoardDb(): SqliteDatabase {
  if (db) return db;
  // Defer native binding until first DB use (not when this module is imported at build time).
  const Database = require("better-sqlite3") as new (path: string) => SqliteDatabase;
  const dataDir = process.env.BOARD_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, "boards.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function insertBoard(id: string, passwordHash: string): void {
  getBoardDb()
    .prepare(
      "INSERT INTO boards (id, password_hash, created_at) VALUES (@id, @hash, @t)"
    )
    .run({ id, hash: passwordHash, t: Date.now() });
}

export function getBoardPasswordHash(id: string): string | undefined {
  const row = getBoardDb()
    .prepare("SELECT password_hash AS h FROM boards WHERE id = @id")
    .get({ id }) as { h: string } | undefined;
  return row?.h;
}

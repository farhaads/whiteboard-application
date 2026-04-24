import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

let db: Database.Database | undefined;

export function getBoardDb(): Database.Database {
  if (db) return db;
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

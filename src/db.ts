import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

let db: Database.Database;

function getDataDir(): string {
  return process.env.CLAUDE_KANBAN_DATA_DIR || path.join(os.homedir(), '.claude-kanban');
}

export function initDatabase(): void {
  const dataDir = getDataDir();

  for (const sub of ['', 'logs', 'hooks']) {
    const p = path.join(dataDir, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'claude-kanban.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      working_dir TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','deciding','reviewing','done','stopped')),
      session_id TEXT,
      summary TEXT,
      checkpoint_commit TEXT,
      initial_commit TEXT,
      use_worktree INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      answer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_decisions_task ON decisions(task_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_unresolved ON decisions(task_id) WHERE answer IS NULL;

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('user_message','ai_execution','ai_decision','ai_review','system')),
      content TEXT NOT NULL DEFAULT '',
      quote_message_id TEXT,
      decision_json TEXT,
      round INTEGER NOT NULL DEFAULT 0,
      checkpoint_commit TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
  `);

  // Migrations for existing databases
  try { db.exec(`ALTER TABLE tasks ADD COLUMN checkpoint_commit TEXT`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE tasks ADD COLUMN initial_commit TEXT`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE chat_messages ADD COLUMN checkpoint_commit TEXT`); } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE tasks ADD COLUMN use_worktree INTEGER NOT NULL DEFAULT 1`); } catch { /* column exists */ }
}

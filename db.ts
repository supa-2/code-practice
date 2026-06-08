import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Store in project directory — user will configure Seafile to exclude .db
const DB_PATH = path.join(__dirname, "codemaster.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS problems (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'Medium',
    category TEXT NOT NULL DEFAULT '',
    module TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    starter_code TEXT NOT NULL DEFAULT '',
    tests TEXT NOT NULL DEFAULT '',
    answer TEXT,
    testcases TEXT NOT NULL DEFAULT '[]',
    learn TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    exercise TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'run',
    code TEXT,
    output TEXT,
    passed INTEGER NOT NULL DEFAULT 0,
    analysis TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sub_time ON submissions(time);
  CREATE INDEX IF NOT EXISTS idx_sub_exercise ON submissions(exercise);

  CREATE TABLE IF NOT EXISTS progress (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT NOT NULL,
    exercise TEXT,
    role TEXT NOT NULL,
    content TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chat_time ON chat_messages(time);
  CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id TEXT PRIMARY KEY,
    first_message TEXT,
    model TEXT,
    effort TEXT,
    exercise TEXT,
    created TEXT NOT NULL,
    updated TEXT
  );
`);

// Init defaults
const existing = db.prepare("SELECT value FROM progress WHERE key='created'").get();
if (!existing) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO progress VALUES ('current_module', '10-NLP')").run();
  db.prepare("INSERT INTO progress VALUES ('created', ?)").run(now);
}

// ── Seed problems from filesystem if DB is empty ──

function seedFromFilesystem() {
  const count = (db.prepare("SELECT COUNT(*) as c FROM problems").get() as any).c;
  if (count > 0) return;

  const problemsDir = path.join(__dirname, "problems");
  if (!fs.existsSync(problemsDir)) return;

  const dirs = fs.readdirSync(problemsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."));

  const stmt = db.prepare(`
    INSERT INTO problems (id, title, difficulty, category, module, description, starter_code, tests, answer, testcases, learn, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let order = 0;
  for (const dir of dirs) {
    const p = path.join(problemsDir, dir.name);
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(p, "meta.json"), "utf-8"));
      const description = fs.readFileSync(path.join(p, "problem.md"), "utf-8");
      const starterCode = fs.readFileSync(path.join(p, "starter.py"), "utf-8");
      const tests = fs.readFileSync(path.join(p, "tests.py"), "utf-8");
      let answer: string | null = null;
      try { answer = fs.readFileSync(path.join(p, "answer.py"), "utf-8"); } catch {}
      let testcases = "[]";
      try { testcases = fs.readFileSync(path.join(p, "testcases.json"), "utf-8"); } catch {}
      let learn: string | null = null;
      try { learn = fs.readFileSync(path.join(p, "learn.md"), "utf-8"); } catch {}

      stmt.run(
        meta.id || dir.name, meta.title || dir.name,
        meta.difficulty || "Medium", meta.category || "", meta.module || "",
        description, starterCode, tests, answer, testcases, learn, order++
      );
    } catch { /* skip invalid */ }
  }
  console.log(`  Seeded ${order} problems from filesystem`);
}
seedFromFilesystem();

// ── Helpers ──

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM progress WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO progress (key, value) VALUES (?, ?)").run(key, value);
}

export function saveSubmission(exercise: string, type: string, code: string, output: string, passed: boolean): number {
  const now = new Date().toISOString();
  const info = db.prepare(
    "INSERT INTO submissions (time, exercise, type, code, output, passed) VALUES (?,?,?,?,?,?)"
  ).run(now, exercise, type, code.slice(0, 2000), (output || "").slice(0, 1000), passed ? 1 : 0);
  return info.lastInsertRowid as number;
}

export function getLatestCode(exercise: string): { code: string; time: string; passed: boolean } | null {
  const row = db.prepare(
    "SELECT code, time, passed FROM submissions WHERE exercise=? ORDER BY time DESC LIMIT 1"
  ).get(exercise) as { code: string; time: string; passed: number } | undefined;
  if (!row) return null;
  return { code: row.code, time: row.time, passed: !!row.passed };
}

export function getStats() {
  const total = (db.prepare("SELECT COUNT(*) as c FROM submissions").get() as any).c;
  const today = (db.prepare("SELECT COUNT(*) as c FROM submissions WHERE date(time)=date('now')").get() as any).c;
  const passRate = (db.prepare(
    "SELECT ROUND(AVG(passed)*100,1) as r FROM submissions WHERE type='test'"
  ).get() as any).r || 0;
  const exercises = db.prepare(`
    SELECT exercise,
           COUNT(*) as attempts,
           SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed_count,
           ROUND(AVG(CASE WHEN type='test' THEN passed ELSE NULL END)*100,1) as test_pass_rate
    FROM submissions GROUP BY exercise ORDER BY MAX(time) DESC
  `).all();
  return { total, today, pass_rate: passRate, exercises };
}

export function saveChatMessage(exercise: string, role: string, content: string): void {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO chat_messages (time, exercise, role, content) VALUES (?,?,?,?)"
  ).run(now, exercise || "free", role, content.slice(0, 4000));
}

export function saveChatSession(sessionId: string, firstMessage: string, exercise: string): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT session_id FROM chat_sessions WHERE session_id=?").get(sessionId);
  if (!existing) {
    db.prepare(
      "INSERT INTO chat_sessions (session_id, first_message, exercise, created, updated) VALUES (?,?,?,?,?)"
    ).run(sessionId, firstMessage.slice(0, 200), exercise || "free", now, now);
  } else {
    db.prepare("UPDATE chat_sessions SET updated=? WHERE session_id=?").run(now, sessionId);
  }
}

export function saveAnalysis(submissionId: number, analysis: string): void {
  db.prepare("UPDATE submissions SET analysis=? WHERE id=?").run(analysis, submissionId);
}

export function getSubmissions(exercise?: string, limit = 50) {
  if (exercise) {
    return db.prepare(
      "SELECT * FROM submissions WHERE exercise=? ORDER BY time DESC LIMIT ?"
    ).all(exercise, limit);
  }
  return db.prepare("SELECT * FROM submissions ORDER BY time DESC LIMIT ?").all(limit);
}

// ── Problem CRUD ──

export function getProblemList() {
  return db.prepare(
    "SELECT id, title, difficulty, category, module, sort_order FROM problems ORDER BY sort_order"
  ).all();
}

export function getProblem(id: string) {
  const row = db.prepare(
    "SELECT * FROM problems WHERE id=?"
  ).get(id) as any;
  if (!row) return null;
  return {
    ...row,
    testcases: JSON.parse(row.testcases || "[]"),
    discuss: JSON.parse(row.discuss || "[]"),
  };
}

export function getProblemAnswer(id: string): string | null {
  const row = db.prepare("SELECT answer FROM problems WHERE id=?").get(id) as { answer: string | null } | undefined;
  return row?.answer ?? null;
}

export function getProblemLearn(id: string): string | null {
  const row = db.prepare("SELECT learn FROM problems WHERE id=?").get(id) as { learn: string | null } | undefined;
  return row?.learn ?? null;
}

export function upsertProblem(p: {
  id: string; title: string; difficulty?: string; category?: string; module?: string;
  description?: string; starter_code?: string; tests?: string; answer?: string;
  testcases?: string; learn?: string;
}) {
  const existing = db.prepare("SELECT id FROM problems WHERE id=?").get(p.id);
  if (existing) {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(p)) {
      if (k !== "id" && v !== undefined) { fields.push(`${k}=?`); values.push(v); }
    }
    if (fields.length === 0) return;
    values.push(p.id);
    db.prepare(`UPDATE problems SET ${fields.join(", ")} WHERE id=?`).run(...values);
  } else {
    const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 as o FROM problems").get() as any).o;
    db.prepare(`
      INSERT INTO problems (id, title, difficulty, category, module, description, starter_code, tests, answer, testcases, learn, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.id, p.title, p.difficulty || "Medium", p.category || "", p.module || "",
      p.description || "", p.starter_code || "", p.tests || "", p.answer || null,
      p.testcases || "[]", p.learn || null, maxOrder
    );
  }
}

export function deleteProblem(id: string) {
  db.prepare("DELETE FROM problems WHERE id=?").run(id);
}

export { db };

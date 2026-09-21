import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

// db.js runs its migration + seed logic as a side effect of being imported,
// keyed off DB_PATH — so this exercises it the same way the real app would
// on first boot against an existing database, by spawning a fresh Node
// process pointed at a fixture file. (A same-process import wouldn't work:
// ES module imports are cached, so a second import of db.js can't re-run
// against a different DB_PATH.)

const FIXTURE_PATH = path.resolve("./data/migration-test.db");

function buildOldShapeFixture() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      fs.unlinkSync(FIXTURE_PATH + suffix);
    } catch {
      /* fine if it doesn't exist yet */
    }
  }
  const db = new Database(FIXTURE_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE courses (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, level TEXT, duration TEXT, icon TEXT, lessons_count INTEGER);
    CREATE TABLE lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id), chapter INTEGER NOT NULL, title TEXT NOT NULL, icon TEXT NOT NULL, content TEXT NOT NULL, command TEXT, sort_order INTEGER NOT NULL);
    CREATE TABLE enrollments (user_id INTEGER NOT NULL REFERENCES users(id), course_id INTEGER NOT NULL REFERENCES courses(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, course_id));
    CREATE TABLE progress (user_id INTEGER NOT NULL REFERENCES users(id), course_id INTEGER NOT NULL REFERENCES courses(id), lesson_id INTEGER NOT NULL REFERENCES lessons(id), completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, course_id, lesson_id));
  `);
  const courseId = db
    .prepare("INSERT INTO courses (code,title,slug,description,level,duration,icon,lessons_count) VALUES (?,?,?,?,?,?,?,?)")
    .run("LX-100", "Linux Foundations", "linux-foundations", "desc", "Beginner", "12 hrs", "terminal", 12).lastInsertRowid;
  const lessonId = db
    .prepare("INSERT INTO lessons (course_id,chapter,title,icon,content,command,sort_order) VALUES (?,?,?,?,?,?,?)")
    .run(courseId, 1, "The Linux Mindset", "terminal", "content", "pwd", 1).lastInsertRowid;
  const userId = db
    .prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)")
    .run("Old User", "old-shape-user@example.com", "$2a$10$fakehashfakehashfakehashfa").lastInsertRowid;
  db.prepare("INSERT INTO enrollments (user_id,course_id) VALUES (?,?)").run(userId, courseId);
  db.prepare("INSERT INTO progress (user_id,course_id,lesson_id) VALUES (?,?,?)").run(userId, courseId, lessonId);
  db.close();
  return { courseId, lessonId, userId };
}

test("migrating a pre-Phase-2 database preserves accounts and enrollments, and builds the new schema", () => {
  const fixture = buildOldShapeFixture();

  execFileSync(
    process.execPath,
    ["-e", "import('./server/db.js').then(() => process.exit(0))"],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        JWT_SECRET: "migration-test-secret",
        DB_PATH: FIXTURE_PATH,
        BCRYPT_ROUNDS: "4"
      },
      stdio: "pipe"
    }
  );

  const db = new Database(FIXTURE_PATH, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
    assert.ok(!tables.includes("progress"), "old flat progress table should be dropped");
    assert.ok(tables.includes("lesson_progress"));
    assert.ok(tables.includes("chapters"));
    assert.ok(tables.includes("quizzes"));
    assert.ok(tables.includes("certificates"));

    const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(fixture.userId);
    assert.equal(user?.email, "old-shape-user@example.com");

    const enrollment = db
      .prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?")
      .get(fixture.userId, fixture.courseId);
    assert.ok(enrollment, "the pre-existing enrollment should survive the migration");

    const oldLessonProgressCount = db.prepare("SELECT COUNT(*) c FROM lesson_progress").get().c;
    assert.equal(oldLessonProgressCount, 0, "old lesson-level progress does not carry forward (documented trade-off)");

    const courseCount = db.prepare("SELECT COUNT(*) c FROM courses").get().c;
    assert.equal(courseCount, 6, "all 6 seeded courses should be present, not just the pre-existing one");

    const chaptersForOldCourse = db.prepare("SELECT COUNT(*) c FROM chapters WHERE course_id = ?").get(fixture.courseId);
    assert.ok(chaptersForOldCourse.c > 0, "the pre-existing course should have gained chapters");

    const totalChapters = db.prepare("SELECT COUNT(*) c FROM chapters").get().c;
    assert.equal(totalChapters, 18, "every course, not just the migrated one, should have its chapters seeded");
  } finally {
    db.close();
  }
});

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { LUCIDE_ICON_NAMES } from "./utils/icons.js";
import { COURSES } from "./seedData.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);

// WAL improves concurrent read/write behavior; foreign_keys must be turned on
// per-connection in SQLite (it's off by default); busy_timeout avoids
// "database is locked" errors under brief write contention.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// ---------------------------------------------------------------------------
// Migrations
//
// A small hand-rolled runner rather than a framework — this project only
// needs "run these in order, once, tracked in a table," and that's easy
// enough to own directly. Each migration's `up(db)` runs inside a
// transaction; if it throws, nothing from that migration is recorded or
// persisted.
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  {
    id: 1,
    name: "baseline",
    // Users, courses, and enrollments are unchanged across every schema
    // version this app has had — this just guarantees they exist. On a
    // database that already has them (any prior version), this is a no-op.
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          level TEXT,
          duration TEXT,
          icon TEXT
        );

        CREATE TABLE IF NOT EXISTS enrollments (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, course_id)
        );
        CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
      `);
    }
  },
  {
    id: 2,
    name: "chapters_quizzes_certificates",
    // Introduces first-class chapters (each with an ordered set of lessons
    // and its own quiz), quiz attempts, and certificates.
    //
    // If a pre-Phase-2 database is present (a `lessons` table with a
    // `course_id` column — the old flat course→lessons shape), that table
    // and the old flat `progress` table are dropped in favor of the new
    // structure below. Accounts and course enrollments carry forward;
    // per-lesson completion checkmarks do not, because the lesson structure
    // itself changed (lessons now live under chapters, not courses
    // directly) — there's no meaningful old lesson id to map them onto.
    up(db) {
      const oldShape = db
        .prepare(`SELECT 1 FROM pragma_table_info('lessons') WHERE name = 'course_id'`)
        .get();

      if (oldShape) {
        db.exec(`DROP TABLE IF EXISTS progress;`);
        db.exec(`DROP TABLE IF EXISTS lessons;`);
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS chapters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          sort_order INTEGER NOT NULL,
          is_required INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_course_order ON chapters(course_id, sort_order);

        CREATE TABLE IF NOT EXISTS lessons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          icon TEXT NOT NULL,
          content TEXT NOT NULL,
          command TEXT,
          sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON lessons(chapter_id);

        CREATE TABLE IF NOT EXISTS lesson_progress (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
          completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, lesson_id)
        );
        CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);

        CREATE TABLE IF NOT EXISTS quizzes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chapter_id INTEGER UNIQUE NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
          pass_threshold_pct INTEGER NOT NULL DEFAULT 80
        );

        CREATE TABLE IF NOT EXISTS quiz_questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
          prompt TEXT NOT NULL,
          sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);

        CREATE TABLE IF NOT EXISTS quiz_options (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          is_correct INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options(question_id);

        CREATE TABLE IF NOT EXISTS quiz_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
          score_pct INTEGER NOT NULL,
          passed INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz ON quiz_attempts(user_id, quiz_id);

        CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
          attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
          question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
          option_id INTEGER NOT NULL REFERENCES quiz_options(id) ON DELETE CASCADE,
          is_correct INTEGER NOT NULL,
          PRIMARY KEY (attempt_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS certificates (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_id, course_id)
        );
        CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
      `);
    }
  }
];

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const applied = new Set(db.prepare("SELECT id FROM migrations").all().map((r) => r.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO migrations (id, name) VALUES (?, ?)").run(migration.id, migration.name);
    })();
  }
}

runMigrations();

// ---------------------------------------------------------------------------
// Seed data validation + insertion
// ---------------------------------------------------------------------------

// Fail loudly at boot if any icon name or quiz shape we authored ourselves
// is wrong — better to catch it here than have it silently misbehave for a
// user. (Separate from safeIcon() in utils/icons.js, which defends API
// responses against a hand-edited DB row rather than catching our own typos.)
function assertValidSeedData() {
  const problems = [];
  for (const { course, chapters } of COURSES) {
    const [code, , , , , , icon] = course;
    if (!LUCIDE_ICON_NAMES.has(icon)) problems.push(`course ${code}: unknown icon "${icon}"`);
    for (const chapter of chapters) {
      for (const [title, lessonIcon] of chapter.lessons) {
        if (!LUCIDE_ICON_NAMES.has(lessonIcon)) {
          problems.push(`${code} / ${chapter.title} / "${title}": unknown icon "${lessonIcon}"`);
        }
      }
      for (const [prompt, options, correctIndex] of chapter.quiz) {
        if (!Array.isArray(options) || options.length < 2) {
          problems.push(`${code} / ${chapter.title}: quiz question needs at least 2 options: "${prompt}"`);
        } else if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
          problems.push(`${code} / ${chapter.title}: quiz question has an out-of-range correct answer: "${prompt}"`);
        }
      }
    }
  }
  if (problems.length) {
    throw new Error(`Invalid seed data:\n  ${problems.join("\n  ")}`);
  }
}
assertValidSeedData();

function seed() {
  // INSERT OR IGNORE per course (keyed by the unique slug) rather than a
  // single "table empty?" gate — a database migrated from before Phase 2
  // may already have some of these course rows (with the old 8-column
  // shape, minus lessons_count usage) from before chapters existed, and a
  // blanket empty-table check would skip inserting the rest.
  const insertCourse = db.prepare(
    "INSERT OR IGNORE INTO courses (code, title, slug, description, level, duration, icon) VALUES (?,?,?,?,?,?,?)"
  );
  const insertChapter = db.prepare(
    "INSERT INTO chapters (course_id, title, description, sort_order, is_required) VALUES (?,?,?,?,?)"
  );
  const insertLesson = db.prepare(
    "INSERT INTO lessons (chapter_id, title, icon, content, command, sort_order) VALUES (?,?,?,?,?,?)"
  );
  const insertQuiz = db.prepare("INSERT INTO quizzes (chapter_id, pass_threshold_pct) VALUES (?, 80)");
  const insertQuestion = db.prepare("INSERT INTO quiz_questions (quiz_id, prompt, sort_order) VALUES (?,?,?)");
  const insertOption = db.prepare(
    "INSERT INTO quiz_options (question_id, label, is_correct, sort_order) VALUES (?,?,?,?)"
  );
  const findCourseIdBySlug = db.prepare("SELECT id FROM courses WHERE slug = ?");
  const courseHasChapters = db.prepare("SELECT 1 FROM chapters WHERE course_id = ?");

  db.transaction(() => {
    for (const { course, chapters } of COURSES) {
      insertCourse.run(...course);
      const courseId = findCourseIdBySlug.get(course[2]).id;
      if (courseHasChapters.get(courseId)) continue; // this course is already fully seeded

      chapters.forEach((chapter, chapterIndex) => {
        const chapterId = insertChapter.run(
          courseId,
          chapter.title,
          chapter.description,
          chapterIndex + 1,
          chapter.required ? 1 : 0
        ).lastInsertRowid;

        chapter.lessons.forEach((lesson, lessonIndex) => {
          const [title, icon, content, command] = lesson;
          insertLesson.run(chapterId, title, icon, content, command, lessonIndex + 1);
        });

        const quizId = insertQuiz.run(chapterId).lastInsertRowid;
        chapter.quiz.forEach((question, questionIndex) => {
          const [prompt, options, correctIndex] = question;
          const questionId = insertQuestion.run(quizId, prompt, questionIndex + 1).lastInsertRowid;
          options.forEach((label, optionIndex) => {
            insertOption.run(questionId, label, optionIndex === correctIndex ? 1 : 0, optionIndex + 1);
          });
        });
      });
    }
  })();
}

seed();

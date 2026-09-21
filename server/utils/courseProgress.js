import crypto from "node:crypto";
import { db } from "../db.js";

export function hasPassedQuiz(userId, quizId) {
  return !!db.prepare("SELECT 1 FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND passed = 1").get(userId, quizId);
}

/**
 * Chapters for a course, in order, each annotated with this user's state:
 * whether it's unlocked (chapter 1 always is; chapter N needs chapter N-1
 * passed) and whether it's been passed (its quiz passed at least once).
 */
export function getChapterStates(userId, courseId) {
  const chapters = db
    .prepare(
      `SELECT ch.id, ch.title, ch.description, ch.sort_order, ch.is_required, q.id AS quiz_id
       FROM chapters ch JOIN quizzes q ON q.chapter_id = ch.id
       WHERE ch.course_id = ? ORDER BY ch.sort_order`
    )
    .all(courseId);

  let previousPassed = true; // chapter 1 is always unlocked
  return chapters.map((ch) => {
    const passed = hasPassedQuiz(userId, ch.quiz_id);
    const unlocked = previousPassed;
    previousPassed = passed;
    return { ...ch, passed, unlocked };
  });
}

export function isCourseComplete(userId, courseId) {
  const states = getChapterStates(userId, courseId);
  return states.filter((c) => c.is_required).every((c) => c.passed);
}

/**
 * Issues a certificate the first time a course becomes complete, and is a
 * no-op (returns the existing one) on every call after that — safe to call
 * from any code path that might complete a course, without double-issuing.
 */
export function ensureCertificate(userId, courseId) {
  const existing = db.prepare("SELECT * FROM certificates WHERE user_id = ? AND course_id = ?").get(userId, courseId);
  if (existing) return existing;
  if (!isCourseComplete(userId, courseId)) return null;

  const id = crypto.randomUUID();
  db.prepare("INSERT INTO certificates (id, user_id, course_id) VALUES (?, ?, ?)").run(id, userId, courseId);
  return db.prepare("SELECT * FROM certificates WHERE id = ?").get(id);
}

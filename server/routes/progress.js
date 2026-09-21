import { Router } from "express";
import { db } from "../db.js";
import { authRequired } from "../middleware/auth.js";
import { toPositiveInt } from "../utils/validate.js";
import { getChapterStates, isCourseComplete, ensureCertificate } from "../utils/courseProgress.js";

export const progressRouter = Router();

function isEnrolled(userId, courseId) {
  return !!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?").get(userId, courseId);
}

progressRouter.get("/courses/:courseId/progress", authRequired, (req, res) => {
  const courseId = toPositiveInt(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: "Invalid course id" });
  if (!isEnrolled(req.user.id, courseId)) {
    return res.status(403).json({ error: "Enroll in this course first" });
  }

  const chapters = getChapterStates(req.user.id, courseId);
  const completedLessonIds = db
    .prepare(
      `SELECT lp.lesson_id FROM lesson_progress lp
       JOIN lessons l ON l.id = lp.lesson_id
       JOIN chapters c ON c.id = l.chapter_id
       WHERE lp.user_id = ? AND c.course_id = ?`
    )
    .all(req.user.id, courseId)
    .map((r) => r.lesson_id);

  const certificate = db
    .prepare("SELECT id, issued_at FROM certificates WHERE user_id = ? AND course_id = ?")
    .get(req.user.id, courseId);

  res.json({
    chapters: chapters.map((c) => ({
      id: c.id,
      title: c.title,
      sortOrder: c.sort_order,
      isRequired: !!c.is_required,
      unlocked: c.unlocked,
      passed: c.passed
    })),
    completedLessonIds,
    courseComplete: isCourseComplete(req.user.id, courseId),
    certificate: certificate ? { id: certificate.id, issuedAt: certificate.issued_at } : null
  });
});

progressRouter.post("/lessons/:lessonId/complete", authRequired, (req, res) => {
  const lessonId = toPositiveInt(req.params.lessonId);
  if (!lessonId) return res.status(400).json({ error: "Invalid lesson id" });

  const lesson = db
    .prepare(
      `SELECT l.id, c.id AS chapter_id, c.course_id, c.sort_order AS chapter_sort_order
       FROM lessons l JOIN chapters c ON c.id = l.chapter_id
       WHERE l.id = ?`
    )
    .get(lessonId);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  if (!isEnrolled(req.user.id, lesson.course_id)) {
    return res.status(403).json({ error: "Enroll in this course first" });
  }

  const [chapterState] = getChapterStates(req.user.id, lesson.course_id).filter(
    (c) => c.id === lesson.chapter_id
  );
  if (!chapterState?.unlocked) {
    return res.status(403).json({ error: "This chapter isn't unlocked yet" });
  }

  db.prepare(
    "INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, CURRENT_TIMESTAMP)"
  ).run(req.user.id, lessonId);
  res.json({ ok: true });
});

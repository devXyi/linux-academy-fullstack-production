import { Router } from "express";
import { db } from "../db.js";
import { safeIcon } from "../utils/icons.js";

export const coursesRouter = Router();

coursesRouter.get("/courses", (req, res) => {
  const courses = db
    .prepare("SELECT id, code, title, slug, description, level, duration, icon FROM courses ORDER BY id")
    .all();
  res.json(courses.map((c) => ({ ...c, icon: safeIcon(c.icon) })));
});

coursesRouter.get("/courses/:slug", (req, res) => {
  const course = db
    .prepare("SELECT id, code, title, slug, description, level, duration, icon FROM courses WHERE slug = ?")
    .get(req.params.slug);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const chapters = db
    .prepare("SELECT id, title, description, sort_order, is_required FROM chapters WHERE course_id = ? ORDER BY sort_order")
    .all(course.id);

  const lessonsByChapter = db
    .prepare("SELECT id, chapter_id, title, icon, content, command, sort_order FROM lessons WHERE chapter_id IN (SELECT id FROM chapters WHERE course_id = ?) ORDER BY sort_order")
    .all(course.id);

  const quizMetaByChapter = new Map(
    db
      .prepare(
        `SELECT q.chapter_id, q.pass_threshold_pct, COUNT(qq.id) AS question_count
         FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
         WHERE q.chapter_id IN (SELECT id FROM chapters WHERE course_id = ?)
         GROUP BY q.id`
      )
      .all(course.id)
      .map((q) => [q.chapter_id, { passThresholdPct: q.pass_threshold_pct, questionCount: q.question_count }])
  );

  course.icon = safeIcon(course.icon);
  course.chapters = chapters.map((ch) => ({
    ...ch,
    isRequired: !!ch.is_required,
    is_required: undefined,
    lessons: lessonsByChapter
      .filter((l) => l.chapter_id === ch.id)
      .map((l) => ({ ...l, icon: safeIcon(l.icon), chapter_id: undefined })),
    quiz: quizMetaByChapter.get(ch.id) || null
  }));
  res.json(course);
});

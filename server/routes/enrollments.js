import { Router } from "express";
import { db } from "../db.js";
import { authRequired } from "../middleware/auth.js";
import { toPositiveInt } from "../utils/validate.js";

export const enrollmentsRouter = Router();

enrollmentsRouter.post("/enrollments/:courseId", authRequired, (req, res) => {
  const courseId = toPositiveInt(req.params.courseId);
  if (!courseId) return res.status(400).json({ error: "Invalid course id" });

  const course = db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId);
  if (!course) return res.status(404).json({ error: "Course not found" });

  db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)").run(req.user.id, course.id);
  res.json({ ok: true });
});

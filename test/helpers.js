import request from "supertest";
import { db } from "../server/db.js";

let counter = 0;

export function uniqueEmail() {
  counter += 1;
  return `test-user-${Date.now()}-${counter}@example.com`;
}

export async function registerUser(app, overrides = {}) {
  const body = {
    name: "Test User",
    email: uniqueEmail(),
    password: "correct-horse",
    ...overrides
  };
  const res = await request(app).post("/api/auth/register").send(body);
  return { res, body };
}

/**
 * Submits a quiz attempt using the real correct answers, read directly from
 * the DB (bypassing the shuffle the GET endpoint applies) — this is test
 * setup, not something the app itself does.
 */
export async function passChapterQuiz(app, token, chapterId) {
  const quiz = db.prepare("SELECT id FROM quizzes WHERE chapter_id = ?").get(chapterId);
  const questions = db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);
  const answers = questions.map((q) => {
    const option = db.prepare("SELECT id FROM quiz_options WHERE question_id = ? AND is_correct = 1").get(q.id);
    return { questionId: q.id, optionId: option.id };
  });
  return request(app)
    .post(`/api/chapters/${chapterId}/quiz/attempt`)
    .set("Authorization", `Bearer ${token}`)
    .send({ answers });
}

/** Registers, fetches a course, and enrolls in it. */
export async function registerEnrolledIn(app, slug) {
  const { res, body } = await registerUser(app);
  const token = res.body.token;
  const course = await request(app).get(`/api/courses/${slug}`);
  await request(app).post(`/api/enrollments/${course.body.id}`).set("Authorization", `Bearer ${token}`);
  return { token, course: course.body, email: body.email };
}

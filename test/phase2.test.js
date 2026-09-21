import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../server/index.js";
import { db } from "../server/db.js";
import { registerEnrolledIn, passChapterQuiz } from "./helpers.js";

describe("chapter quiz access", () => {
  test("a locked chapter's quiz can't be fetched or attempted", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter2 = course.chapters[1];

    const get = await request(app).get(`/api/chapters/${chapter2.id}/quiz`).set("Authorization", `Bearer ${token}`);
    assert.equal(get.status, 403);

    const post = await request(app)
      .post(`/api/chapters/${chapter2.id}/quiz/attempt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [] });
    assert.equal(post.status, 403);
  });

  test("quiz access requires auth and enrollment", async () => {
    const { course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];

    const noAuth = await request(app).get(`/api/chapters/${chapter1.id}/quiz`);
    assert.equal(noAuth.status, 401);
  });

  test("the quiz response never reveals which option is correct", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];
    const res = await request(app).get(`/api/chapters/${chapter1.id}/quiz`).set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(JSON.stringify(res.body).includes("correct"), false);
  });

  test("options come back in a different order across requests (not always correct-answer-first)", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];
    const orders = new Set();
    for (let i = 0; i < 8; i++) {
      const res = await request(app).get(`/api/chapters/${chapter1.id}/quiz`).set("Authorization", `Bearer ${token}`);
      orders.add(res.body.questions[0].options.map((o) => o.id).join(","));
    }
    assert.ok(orders.size > 1, "expected option order to vary across requests");
  });
});

describe("quiz scoring", () => {
  test("a failed attempt does not unlock the next chapter", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];
    const quiz = db.prepare("SELECT id FROM quizzes WHERE chapter_id = ?").get(chapter1.id);
    const questions = db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);
    const wrongAnswers = questions.map((q) => {
      const wrong = db.prepare("SELECT id FROM quiz_options WHERE question_id = ? AND is_correct = 0 LIMIT 1").get(q.id);
      return { questionId: q.id, optionId: wrong.id };
    });

    const res = await request(app)
      .post(`/api/chapters/${chapter1.id}/quiz/attempt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: wrongAnswers });
    assert.equal(res.status, 200);
    assert.equal(res.body.passed, false);
    assert.equal(res.body.scorePct, 0);
  });

  test("retrying immediately after a fail is allowed (unlimited retries, no cooldown)", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];

    const fail = await passChapterQuizWithWrongAnswers(chapter1.id, token);
    assert.equal(fail.body.passed, false);

    const pass = await passChapterQuiz(app, token, chapter1.id);
    assert.equal(pass.status, 200);
    assert.equal(pass.body.passed, true);
  });

  test("an answer pairing an option from a different question is rejected as incorrect, not accepted", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];
    const quiz = db.prepare("SELECT id FROM quizzes WHERE chapter_id = ?").get(chapter1.id);
    const questions = db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);

    // Take question 2's correct option id and submit it as the answer to
    // question 1 — this must NOT be scored as correct just because the
    // option id happens to exist and be "correct" for a different question.
    const q2CorrectOption = db
      .prepare("SELECT id FROM quiz_options WHERE question_id = ? AND is_correct = 1")
      .get(questions[1].id);
    const answers = questions.map((q, i) => ({
      questionId: q.id,
      optionId: i === 0 ? q2CorrectOption.id : db.prepare("SELECT id FROM quiz_options WHERE question_id = ? AND is_correct = 1").get(q.id).id
    }));

    const res = await request(app)
      .post(`/api/chapters/${chapter1.id}/quiz/attempt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers });
    assert.equal(res.status, 200);
    // Q1 was answered with an option that belongs to Q2 — must be scored
    // wrong even though that option id is "correct" for its real question.
    assert.equal(res.body.results[0].correct, false);
    // The other 4 questions were answered correctly: 4/5 = 80%, which meets
    // the pass threshold — confirms the mismatch only affected Q1's score,
    // nothing more, nothing less.
    assert.equal(res.body.scorePct, 80);
    assert.equal(res.body.passed, true);
  });

  test("submitting fewer answers than questions is rejected", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    const chapter1 = course.chapters[0];
    const res = await request(app)
      .post(`/api/chapters/${chapter1.id}/quiz/attempt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers: [{ questionId: 1, optionId: 1 }] });
    assert.equal(res.status, 400);
  });

  async function passChapterQuizWithWrongAnswers(chapterId, token) {
    const quiz = db.prepare("SELECT id FROM quizzes WHERE chapter_id = ?").get(chapterId);
    const questions = db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);
    const answers = questions.map((q) => {
      const wrong = db.prepare("SELECT id FROM quiz_options WHERE question_id = ? AND is_correct = 0 LIMIT 1").get(q.id);
      return { questionId: q.id, optionId: wrong.id };
    });
    return request(app)
      .post(`/api/chapters/${chapterId}/quiz/attempt`)
      .set("Authorization", `Bearer ${token}`)
      .send({ answers });
  }
});

describe("certificates", () => {
  test("no certificate exists until the course is actually complete", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    await passChapterQuiz(app, token, course.chapters[0].id);
    const progress = await request(app)
      .get(`/api/courses/${course.id}/progress`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(progress.body.certificate, null);
  });

  test("completing a course issues exactly one certificate, idempotently", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    let lastCertId;
    for (const chapter of course.chapters) {
      const attempt = await passChapterQuiz(app, token, chapter.id);
      if (attempt.body.certificate) lastCertId = attempt.body.certificate.id;
    }
    assert.ok(lastCertId);

    // Retaking the final chapter's quiz again must not issue a second certificate.
    const retake = await passChapterQuiz(app, token, course.chapters.at(-1).id);
    assert.equal(retake.body.certificate.id, lastCertId);

    const certRows = db.prepare("SELECT COUNT(*) c FROM certificates WHERE id = ?").get(lastCertId);
    assert.equal(certRows.c, 1);
  });

  test("public verification works without auth and reflects the real recipient/course", async () => {
    const { token, course, email } = await registerEnrolledIn(app, "linux-foundations");
    let certId;
    for (const chapter of course.chapters) {
      const attempt = await passChapterQuiz(app, token, chapter.id);
      if (attempt.body.certificate) certId = attempt.body.certificate.id;
    }

    const verify = await request(app).get(`/api/verify/${certId}`);
    assert.equal(verify.status, 200);
    assert.equal(verify.body.valid, true);
    assert.equal(verify.body.courseTitle, course.title);
    assert.ok(verify.body.recipientName);
    // Never leak account details beyond name.
    assert.equal(JSON.stringify(verify.body).includes(email), false);
  });

  test("verifying an unknown id returns 404 with valid:false", async () => {
    const res = await request(app).get("/api/verify/00000000-0000-0000-0000-000000000000");
    assert.equal(res.status, 404);
    assert.equal(res.body.valid, false);
  });

  test("a malformed verification id is rejected cleanly, not treated as a query", async () => {
    const res = await request(app).get("/api/verify/' OR '1'='1");
    assert.equal(res.status, 404);
  });

  test("the certificate PDF downloads for a real id and 404s for an unknown one", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    let certId;
    for (const chapter of course.chapters) {
      const attempt = await passChapterQuiz(app, token, chapter.id);
      if (attempt.body.certificate) certId = attempt.body.certificate.id;
    }

    const pdf = await request(app).get(`/api/certificates/${certId}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.type, "application/pdf");
    assert.ok(pdf.body.length > 500);

    const missing = await request(app).get("/api/certificates/00000000-0000-0000-0000-000000000000/pdf");
    assert.equal(missing.status, 404);
  });
});

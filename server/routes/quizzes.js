import { Router } from "express";
import { db } from "../db.js";
import { authRequired } from "../middleware/auth.js";
import { toPositiveInt } from "../utils/validate.js";
import { getChapterStates, isCourseComplete, ensureCertificate } from "../utils/courseProgress.js";

export const quizzesRouter = Router();

function loadChapterForQuizAccess(userId, chapterId) {
  const chapter = db
    .prepare("SELECT id, course_id FROM chapters WHERE id = ?")
    .get(chapterId);
  if (!chapter) return { error: [404, "Chapter not found"] };

  const enrolled = db
    .prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?")
    .get(userId, chapter.course_id);
  if (!enrolled) return { error: [403, "Enroll in this course first"] };

  const [state] = getChapterStates(userId, chapter.course_id).filter((c) => c.id === chapterId);
  if (!state?.unlocked) return { error: [403, "This chapter isn't unlocked yet"] };

  const quiz = db.prepare("SELECT id, pass_threshold_pct FROM quizzes WHERE chapter_id = ?").get(chapterId);
  if (!quiz) return { error: [404, "This chapter has no quiz"] };

  return { chapter, quiz };
}

quizzesRouter.get("/chapters/:chapterId/quiz", authRequired, (req, res) => {
  const chapterId = toPositiveInt(req.params.chapterId);
  if (!chapterId) return res.status(400).json({ error: "Invalid chapter id" });

  const { error, quiz } = loadChapterForQuizAccess(req.user.id, chapterId);
  if (error) return res.status(error[0]).json({ error: error[1] });

  const questions = db
    .prepare("SELECT id, prompt FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order")
    .all(quiz.id);
  const options = db
    .prepare(
      `SELECT id, question_id, label FROM quiz_options
       WHERE question_id IN (SELECT id FROM quiz_questions WHERE quiz_id = ?)
       ORDER BY sort_order`
    )
    .all(quiz.id);

  const latestAttempt = db
    .prepare(
      "SELECT score_pct, passed, created_at FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(req.user.id, quiz.id);

  // Seed data always lists the correct option first (for readability while
  // authoring content) — shuffling here, per response, is what keeps the
  // correct answer from being positionally guessable.
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

  res.json({
    quizId: quiz.id,
    passThresholdPct: quiz.pass_threshold_pct,
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: shuffle(options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label })))
    })),
    latestAttempt: latestAttempt || null
  });
});

quizzesRouter.post("/chapters/:chapterId/quiz/attempt", authRequired, (req, res) => {
  const chapterId = toPositiveInt(req.params.chapterId);
  if (!chapterId) return res.status(400).json({ error: "Invalid chapter id" });

  const { error, chapter, quiz } = loadChapterForQuizAccess(req.user.id, chapterId);
  if (error) return res.status(error[0]).json({ error: error[1] });

  const submitted = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!submitted) return res.status(400).json({ error: "answers must be an array of { questionId, optionId }" });

  const questions = db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);
  const answerByQuestion = new Map();
  for (const a of submitted) {
    const questionId = toPositiveInt(a?.questionId);
    const optionId = toPositiveInt(a?.optionId);
    if (questionId && optionId) answerByQuestion.set(questionId, optionId);
  }
  const missing = questions.filter((q) => !answerByQuestion.has(q.id));
  if (missing.length) {
    return res.status(400).json({ error: `Missing an answer for ${missing.length} question(s)` });
  }

  const results = questions.map((q) => {
    const optionId = answerByQuestion.get(q.id);
    // The option must actually belong to this question — otherwise a
    // client could pair a valid-looking option id from a different
    // question (possibly a different quiz entirely) with this one.
    const option = db
      .prepare("SELECT is_correct FROM quiz_options WHERE id = ? AND question_id = ?")
      .get(optionId, q.id);
    return { questionId: q.id, optionId, correct: !!option?.is_correct };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const scorePct = Math.round((correctCount / questions.length) * 100);
  const passed = scorePct >= quiz.pass_threshold_pct;

  const attemptId = db.transaction(() => {
    const id = db
      .prepare("INSERT INTO quiz_attempts (user_id, quiz_id, score_pct, passed) VALUES (?, ?, ?, ?)")
      .run(req.user.id, quiz.id, scorePct, passed ? 1 : 0).lastInsertRowid;
    const insertAnswer = db.prepare(
      "INSERT INTO quiz_attempt_answers (attempt_id, question_id, option_id, is_correct) VALUES (?,?,?,?)"
    );
    results.forEach((r) => insertAnswer.run(id, r.questionId, r.optionId, r.correct ? 1 : 0));
    return id;
  })();

  const certificate = passed ? ensureCertificate(req.user.id, chapter.course_id) : null;

  res.json({
    attemptId,
    scorePct,
    passed,
    passThresholdPct: quiz.pass_threshold_pct,
    results: results.map(({ questionId, correct }) => ({ questionId, correct })),
    courseComplete: isCourseComplete(req.user.id, chapter.course_id),
    certificate: certificate ? { id: certificate.id, issuedAt: certificate.issued_at } : null
  });
});

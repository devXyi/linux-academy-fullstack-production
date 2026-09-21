import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../server/index.js";
import { LUCIDE_ICON_NAMES } from "../server/utils/icons.js";
import { registerUser, uniqueEmail, registerEnrolledIn, passChapterQuiz } from "./helpers.js";

describe("health", () => {
  test("GET /healthz reports ok", async () => {
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
  });
});

describe("courses", () => {
  test("GET /api/courses returns the seeded catalog", async () => {
    const res = await request(app).get("/api/courses");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 6);
    assert.ok(res.body[0].slug);
  });

  test("GET /api/courses/:slug returns chapters, each with lessons and quiz metadata (no answers)", async () => {
    const list = await request(app).get("/api/courses");
    const slug = list.body[0].slug;
    const res = await request(app).get(`/api/courses/${slug}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.chapters));
    assert.ok(res.body.chapters.length > 0);
    const ch = res.body.chapters[0];
    assert.ok(Array.isArray(ch.lessons) && ch.lessons.length > 0);
    assert.ok(ch.quiz.questionCount > 0);
    assert.equal(ch.quiz.passThresholdPct, 80);
    // The course-detail endpoint must never leak which option is correct.
    assert.equal(JSON.stringify(res.body).includes("is_correct"), false);
  });

  test("GET /api/courses/:slug 404s for an unknown course", async () => {
    const res = await request(app).get("/api/courses/does-not-exist");
    assert.equal(res.status, 404);
  });

  test("every course and lesson icon is a real lucide icon name", async () => {
    const res = await request(app).get("/api/courses");
    for (const c of res.body) {
      assert.ok(LUCIDE_ICON_NAMES.has(c.icon), `course ${c.code} has unknown icon "${c.icon}"`);
      const full = await request(app).get(`/api/courses/${c.slug}`);
      for (const ch of full.body.chapters) {
        for (const l of ch.lessons) {
          assert.ok(LUCIDE_ICON_NAMES.has(l.icon), `${c.slug} / ${ch.title} / "${l.title}" has unknown icon "${l.icon}"`);
        }
      }
    }
  });
});

describe("auth", () => {
  test("register rejects an invalid email", async () => {
    const { res } = await registerUser(app, { email: "not-an-email" });
    assert.equal(res.status, 400);
  });

  test("register rejects a short password", async () => {
    const { res } = await registerUser(app, { password: "abc" });
    assert.equal(res.status, 400);
  });

  test("register then login succeeds and returns a usable token", async () => {
    const email = uniqueEmail();
    const password = "correct-horse";
    const reg = await request(app).post("/api/auth/register").send({ name: "Ada", email, password });
    assert.equal(reg.status, 200);
    assert.ok(reg.body.token);

    const login = await request(app).post("/api/auth/login").send({ email, password });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${login.body.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  test("duplicate registration is rejected with 409", async () => {
    const { body } = await registerUser(app);
    const dupe = await request(app).post("/api/auth/register").send(body);
    assert.equal(dupe.status, 409);
  });

  test("login fails with the wrong password", async () => {
    const { body } = await registerUser(app);
    const res = await request(app).post("/api/auth/login").send({ email: body.email, password: "wrong-password" });
    assert.equal(res.status, 401);
  });

  test("login fails for an email that was never registered", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: uniqueEmail(), password: "whatever123" });
    assert.equal(res.status, 401);
  });

  test("/api/me requires a token", async () => {
    const res = await request(app).get("/api/me");
    assert.equal(res.status, 401);
  });

  test("/api/me rejects a garbage token", async () => {
    const res = await request(app).get("/api/me").set("Authorization", "Bearer not-a-real-token");
    assert.equal(res.status, 401);
  });
});

describe("enrollments and progress", () => {
  async function setup() {
    const { res: reg, body } = await registerUser(app);
    const token = reg.body.token;
    const courses = await request(app).get("/api/courses");
    const course = await request(app).get(`/api/courses/${courses.body[0].slug}`);
    return { token, course: course.body, email: body.email };
  }

  test("enrolling adds the course to /api/me", async () => {
    const { token, course } = await setup();
    const enroll = await request(app).post(`/api/enrollments/${course.id}`).set("Authorization", `Bearer ${token}`);
    assert.equal(enroll.status, 200);

    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    assert.ok(me.body.enrolled.some((c) => c.id === course.id));
  });

  test("enrollment requires auth", async () => {
    const { course } = await setup();
    const res = await request(app).post(`/api/enrollments/${course.id}`);
    assert.equal(res.status, 401);
  });

  test("progress and lesson-completion are gated behind enrollment", async () => {
    const { token, course } = await setup();
    const lessonId = course.chapters[0].lessons[0].id;

    const complete = await request(app)
      .post(`/api/lessons/${lessonId}/complete`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(complete.status, 403);

    const progress = await request(app)
      .get(`/api/courses/${course.id}/progress`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(progress.status, 403);
  });

  test("marking a lesson complete is reflected in progress; only chapter 1 starts unlocked", async () => {
    const { token, course } = await setup();
    await request(app).post(`/api/enrollments/${course.id}`).set("Authorization", `Bearer ${token}`);
    const lessonId = course.chapters[0].lessons[0].id;

    const mark = await request(app)
      .post(`/api/lessons/${lessonId}/complete`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(mark.status, 200);

    const progress = await request(app)
      .get(`/api/courses/${course.id}/progress`)
      .set("Authorization", `Bearer ${token}`);
    assert.ok(progress.body.completedLessonIds.includes(lessonId));
    assert.equal(progress.body.chapters[0].unlocked, true);
    assert.equal(progress.body.chapters[1].unlocked, false);
    assert.equal(progress.body.courseComplete, false);
  });

  test("passing every required chapter's quiz completes the course and issues a certificate", async () => {
    const { token, course } = await registerEnrolledIn(app, "linux-foundations");
    for (const chapter of course.chapters) {
      const attempt = await passChapterQuiz(app, token, chapter.id);
      assert.equal(attempt.status, 200);
      assert.equal(attempt.body.passed, true);
    }
    const progress = await request(app)
      .get(`/api/courses/${course.id}/progress`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(progress.body.courseComplete, true);
    assert.ok(progress.body.certificate?.id);
    assert.ok(progress.body.chapters.every((c) => c.passed && c.unlocked));
  });
});

describe("lab simulator (authenticated)", () => {
  test("an allowlisted command returns its canned output", async () => {
    const { res } = await registerUser(app);
    const out = await request(app)
      .post("/api/lab/execute")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({ command: "whoami" });
    assert.equal(out.status, 200);
    assert.equal(out.body.output, "student");
  });

  test("a disallowed command returns the simulator message, not an error", async () => {
    const { res } = await registerUser(app);
    const out = await request(app)
      .post("/api/lab/execute")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({ command: "rm -rf /" });
    assert.equal(out.status, 200);
    assert.match(out.body.output, /safe academy simulator/);
  });

  test("an empty command is handled without error", async () => {
    const { res } = await registerUser(app);
    const out = await request(app)
      .post("/api/lab/execute")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({ command: "" });
    assert.equal(out.status, 200);
    assert.equal(out.body.output, "");
  });

  test("requires auth", async () => {
    const res = await request(app).post("/api/lab/execute").send({ command: "whoami" });
    assert.equal(res.status, 401);
  });
});

describe("routing fallback", () => {
  test("an unmatched /api route returns JSON 404, not the SPA page", async () => {
    const res = await request(app).get("/api/totally-made-up-route");
    assert.equal(res.status, 404);
    assert.equal(res.type, "application/json");
  });

  test("an unmatched non-API route serves the SPA shell", async () => {
    const res = await request(app).get("/some/deep/client/route");
    assert.equal(res.status, 200);
    assert.match(res.type, /html/);
  });
});

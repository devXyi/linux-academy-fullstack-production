import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../server/index.js";
import { registerUser, uniqueEmail } from "./helpers.js";

describe("lab demo endpoint (public, small allowlist)", () => {
  test("works without auth, enforces a smaller allowlist than /lab/execute, and rate-limits", async () => {
    const ok = await request(app).post("/api/lab/demo").send({ command: "whoami" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.output, "student");

    // "ls -la" is valid on the authenticated endpoint but not on the public
    // demo — confirms the demo allowlist is genuinely smaller, not just
    // auth-gated the same list.
    const notInDemo = await request(app).post("/api/lab/demo").send({ command: "ls -la" });
    assert.equal(notInDemo.status, 200);
    assert.match(notInDemo.body.output, /safe academy simulator/);

    // Two requests already spent above; LAB_DEMO_RATE_LIMIT_MAX is 5 in
    // tests (see test/env.js), so three more should still succeed and the
    // next one after that should be rejected. Kept in one test so the
    // shared IP-keyed limiter's budget isn't split across test ordering.
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/lab/demo").send({ command: "date" });
      assert.equal(res.status, 200);
    }
    const limited = await request(app).post("/api/lab/demo").send({ command: "date" });
    assert.equal(limited.status, 429);
  });
});

describe("lab execute rate limit (authenticated)", () => {
  test("a single account gets cut off after LAB_RATE_LIMIT_MAX requests", async () => {
    const { res } = await registerUser(app);
    const token = res.body.token;
    const max = Number(process.env.LAB_RATE_LIMIT_MAX); // 8 in tests

    for (let i = 0; i < max; i++) {
      const r = await request(app).post("/api/lab/execute").set("Authorization", `Bearer ${token}`).send({ command: "whoami" });
      assert.equal(r.status, 200, `request ${i + 1} should still be within budget`);
    }
    const limited = await request(app).post("/api/lab/execute").set("Authorization", `Bearer ${token}`).send({ command: "whoami" });
    assert.equal(limited.status, 429);
  });

  test("the limit follows the account, not the request volume of other accounts", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    // Exhaust account A's budget.
    const max = Number(process.env.LAB_RATE_LIMIT_MAX);
    for (let i = 0; i < max; i++) {
      await request(app).post("/api/lab/execute").set("Authorization", `Bearer ${a.res.body.token}`).send({ command: "whoami" });
    }
    const aLimited = await request(app).post("/api/lab/execute").set("Authorization", `Bearer ${a.res.body.token}`).send({ command: "whoami" });
    assert.equal(aLimited.status, 429);

    // Account B is untouched.
    const bStillOk = await request(app).post("/api/lab/execute").set("Authorization", `Bearer ${b.res.body.token}`).send({ command: "whoami" });
    assert.equal(bStillOk.status, 200);
  });
});

describe("account-based login throttling", () => {
  test("repeated failed logins against one email get throttled independent of IP-level auth limiter", async () => {
    const { body } = await registerUser(app);
    const max = Number(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX); // 5 in tests

    for (let i = 0; i < max; i++) {
      const r = await request(app).post("/api/auth/login").send({ email: body.email, password: "wrong-password" });
      assert.equal(r.status, 401, `attempt ${i + 1} should still be a normal auth failure`);
    }
    const throttled = await request(app).post("/api/auth/login").send({ email: body.email, password: "wrong-password" });
    assert.equal(throttled.status, 429);
  });

  test("throttling on one account doesn't block login attempts against a different account", async () => {
    const target = await registerUser(app);
    const bystander = await registerUser(app);
    const max = Number(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX);

    for (let i = 0; i <= max; i++) {
      await request(app).post("/api/auth/login").send({ email: target.body.email, password: "wrong-password" });
    }
    const bystanderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: bystander.body.email, password: bystander.body.password });
    assert.equal(bystanderLogin.status, 200);
  });
});

describe("malformed and oversized requests", () => {
  test("malformed JSON returns a clean 400, not a raw parser error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Malformed JSON in request body");
  });

  test("a body over the size limit is rejected with 413", async () => {
    const hugeName = "x".repeat(200_000); // limit is 100kb
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: hugeName, email: uniqueEmail(), password: "correct-horse" });
    assert.equal(res.status, 413);
  });

  test("a missing Content-Type with a JSON-looking body doesn't crash the server", async () => {
    const res = await request(app).post("/api/auth/login").type("text").send("email=a@b.com&password=x");
    // express.json() only parses application/json — req.body stays {} here,
    // so this should fail normal validation, not throw.
    assert.equal(res.status, 401);
  });
});

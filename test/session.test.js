import { test, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../server/index.js";
import { uniqueEmail } from "./helpers.js";

describe("persistent device sessions", () => {
  test("register sets an HttpOnly refresh cookie and refresh returns a short-lived access token", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    const reg = await agent.post("/api/auth/register").send({ name: "Session User", email, password: "correct-horse" });
    assert.equal(reg.status, 200);
    assert.ok(reg.body.token);
    assert.ok(reg.headers["set-cookie"]?.some((c) => /la_refresh=/.test(c) && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));

    const refresh = await agent.post("/api/auth/refresh");
    assert.equal(refresh.status, 200);
    assert.ok(refresh.body.token);
    assert.equal(refresh.body.user.email, email);

    const me = await agent.get("/api/me").set("Authorization", `Bearer ${refresh.body.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  test("logout revokes the device session and clears the cookie", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    const reg = await agent.post("/api/auth/register").send({ name: "Logout User", email, password: "correct-horse" });
    assert.equal(reg.status, 200);

    const logout = await agent.post("/api/auth/logout");
    assert.equal(logout.status, 204);
    assert.ok(logout.headers["set-cookie"]?.some((c) => /la_refresh=/.test(c) && /Max-Age=0/.test(c)));

    const refresh = await agent.post("/api/auth/refresh");
    assert.equal(refresh.status, 401);
  });

  test("refresh rotates the device token instead of accepting the old token twice", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send({ name: "Rotate User", email: uniqueEmail(), password: "correct-horse" });
    assert.equal(reg.status, 200);

    const firstCookie = reg.headers["set-cookie"]?.find((c) => c.startsWith("la_refresh="));
    assert.ok(firstCookie);
    const firstToken = decodeURIComponent(firstCookie.split(";")[0].slice("la_refresh=".length));

    const refresh = await agent.post("/api/auth/refresh");
    assert.equal(refresh.status, 200);
    const secondCookie = refresh.headers["set-cookie"]?.find((c) => c.startsWith("la_refresh="));
    assert.ok(secondCookie);
    const secondToken = decodeURIComponent(secondCookie.split(";")[0].slice("la_refresh=".length));
    assert.notEqual(firstToken, secondToken);

    const oldTokenAttempt = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `la_refresh=${encodeURIComponent(firstToken)}`);
    assert.equal(oldTokenAttempt.status, 401);
  });
});

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

let courses = [];
let user = null;
let token = localStorage.getItem("la_token");
let authMode = "login";

function icons() {
  if (window.lucide) window.lucide.createIcons();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

async function api(url, opt = {}) {
  opt.headers = { ...(opt.headers || {}), ...(token ? { Authorization: "Bearer " + token } : {}) };
  if (opt.body && typeof opt.body !== "string") {
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(opt.body);
  }
  const r = await fetch(url, opt);
  let d = {};
  try {
    d = await r.json();
  } catch {
    /* empty response body */
  }
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

async function loadCourses() {
  courses = await api("/api/courses");
  renderCourses();
}

function courseCardHTML(c, { compact = false } = {}) {
  const slug = escapeHtml(c.slug);
  const code = escapeHtml(c.code);
  const title = escapeHtml(c.title);
  const desc = escapeHtml(c.description);
  if (compact) {
    return `<article class="course" data-slug="${slug}"><div class="code">${code}</div><div><h3>${title}</h3><p class="muted">${desc}</p></div><button class="btn ghost" data-open-course>Open</button></article>`;
  }
  return `<article class="course" data-slug="${slug}"><div><span class="code">${code}</span><div class="iconbox"><i data-lucide="${escapeHtml(c.icon)}"></i></div></div><div><h3>${title}</h3><p class="muted">${desc}</p></div><div class="meta">${escapeHtml(c.level)}<br>${escapeHtml(c.duration)}</div><button class="btn ghost" data-open-course>Open <i data-lucide="arrow-up-right"></i></button></article>`;
}

function renderCourses(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = q
    ? courses.filter((c) => [c.title, c.code, c.description].some((v) => (v || "").toLowerCase().includes(q)))
    : courses;

  $("#tracks").innerHTML = courses
    .map(
      (c) =>
        `<button class="track" data-slug="${escapeHtml(c.slug)}" data-open-course><i data-lucide="${escapeHtml(c.icon)}"></i><small>${escapeHtml(c.code)}</small><b>${escapeHtml(c.title)}</b></button>`
    )
    .join("");

  $("#courseList").innerHTML = list.length
    ? list.map((c) => courseCardHTML(c)).join("")
    : `<p class="muted" style="padding:20px 0">No courses match "${escapeHtml(filter)}".</p>`;
  icons();
}

// Every dynamically-rendered "open course" button carries data-open-course +
// data-slug instead of an inline onclick="" attribute — this is what lets
// the server run a strict script-src CSP with no 'unsafe-inline'.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-open-course]");
  if (!btn) return;
  const holder = btn.closest("[data-slug]");
  if (holder) openCourse(holder.dataset.slug);
});

async function openCourse(slug) {
  const c = await api("/api/courses/" + encodeURIComponent(slug));
  if (!user) {
    toast("Log in to save chapter progress.");
    openAuth("login");
    return;
  }
  try {
    await api(`/api/enrollments/${c.id}`, { method: "POST" });
  } catch {
    /* non-fatal: worst case the course just won't show under "enrolled" yet */
  }
  $("#homePage").style.display = "none";
  $("#appPage").classList.add("open");
  renderCourse(c);
}

function certificateBannerHTML(courseComplete, certificate) {
  if (!courseComplete || !certificate) return "";
  return `
    <div class="card" style="margin-top:16px;border-color:var(--teal)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap">
        <div><div class="eyebrow" style="color:var(--teal)">Course complete</div><h3 style="margin:4px 0 0">Your certificate is ready</h3></div>
        <div style="display:flex;gap:10px">
          <a class="btn ghost" href="/verify/${encodeURIComponent(certificate.id)}" target="_blank" rel="noopener">View verification page</a>
          <a class="btn primary" href="/api/certificates/${encodeURIComponent(certificate.id)}/pdf" target="_blank" rel="noopener">Download PDF</a>
        </div>
      </div>
    </div>`;
}

async function renderCourse(c) {
  let progress = await api(`/api/courses/${c.id}/progress`);
  let chapterIndex = c.chapters.findIndex((ch) => progress.chapters.find((p) => p.id === ch.id)?.unlocked && !progress.chapters.find((p) => p.id === ch.id)?.passed);
  if (chapterIndex === -1) chapterIndex = 0;
  let lessonIndex = 0;
  let mode = "lesson"; // "lesson" | "quiz"

  const chapterState = (chapterId) => progress.chapters.find((p) => p.id === chapterId);

  const refreshProgress = async () => {
    progress = await api(`/api/courses/${c.id}/progress`);
  };

  const draw = () => {
    const chapter = c.chapters[chapterIndex];
    const state = chapterState(chapter.id);
    $("#appContent").innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:15px;align-items:start">
          <div><div class="eyebrow">${escapeHtml(c.code)}</div><h2>${escapeHtml(c.title)}</h2><p class="muted">${escapeHtml(c.description)}</p></div>
          <button class="btn ghost" id="backHome">← Catalog</button>
        </div>
        <div class="course-detail" style="margin-top:22px">
          <div class="chapter-list">${c.chapters
            .map((ch, i) => {
              const st = chapterState(ch.id);
              const icon = st.passed ? "circle-check" : st.unlocked ? "book-open" : "lock";
              return `<button class="chapter ${i === chapterIndex ? "active" : ""} ${st.passed ? "done" : ""}" data-i="${i}" ${st.unlocked ? "" : 'data-locked="1"'}>
                <i data-lucide="${icon}"></i>
                <span><b>${i + 1}. ${escapeHtml(ch.title)}</b><small style="display:block;color:var(--faint)">${ch.lessons.length} lessons · ${ch.quiz.questionCount}-question quiz</small></span>
              </button>`;
            })
            .join("")}</div>
          <article class="lesson" id="lesson"></article>
        </div>
        ${certificateBannerHTML(progress.courseComplete, progress.certificate)}
      </div>`;
    icons();

    $$("#appContent .chapter").forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.locked) {
            toast("Pass the previous chapter's quiz to unlock this one.");
            return;
          }
          chapterIndex = +b.dataset.i;
          lessonIndex = 0;
          mode = "lesson";
          draw();
        })
    );
    $("#backHome").onclick = () => showApp("catalog");

    if (mode === "quiz") {
      drawQuiz(chapter);
    } else {
      drawLesson(chapter, state);
    }
  };

  const drawLesson = (chapter, state) => {
    const l = chapter.lessons[lessonIndex];
    const doneLessonIds = progress.completedLessonIds;
    $("#lesson").innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
        ${chapter.lessons
          .map(
            (cl, i) =>
              `<button class="btn ${i === lessonIndex ? "primary" : "ghost"}" data-li="${i}" style="padding:6px 12px;font-size:.8rem">${i + 1}${doneLessonIds.includes(cl.id) ? " ✓" : ""}</button>`
          )
          .join("")}
      </div>
      <div class="lesson-head"><div class="bigicon"><i data-lucide="${escapeHtml(l.icon)}"></i></div><div><div class="eyebrow">${escapeHtml(chapter.title)}</div><h2 style="font-size:1.8rem">${escapeHtml(l.title)}</h2></div></div>
      <p style="margin-top:24px">${escapeHtml(l.content)}</p>
      <div class="codebox">$ ${escapeHtml(l.command)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primary" id="completeBtn">${doneLessonIds.includes(l.id) ? "Completed ✓" : "Mark lesson complete"}</button>
        <button class="btn ghost" id="labBtn">Open lab</button>
        <button class="btn ghost" id="quizBtn">Take the chapter quiz${state.passed ? " (retake)" : ""}</button>
      </div>`;
    icons();
    $$("#lesson [data-li]").forEach((b) => (b.onclick = () => { lessonIndex = +b.dataset.li; drawLesson(chapter, state); }));
    $("#completeBtn").onclick = async () => {
      try {
        await api(`/api/lessons/${l.id}/complete`, { method: "POST" });
        await refreshProgress();
        toast("Lesson marked complete");
        drawLesson(chapter, chapterState(chapter.id));
      } catch (err) {
        toast(err.message);
      }
    };
    $("#labBtn").onclick = () => showLab(l.command);
    $("#quizBtn").onclick = () => { mode = "quiz"; draw(); };
  };

  const drawQuiz = async (chapter) => {
    $("#lesson").innerHTML = `<p class="muted">Loading quiz…</p>`;
    let quiz;
    try {
      quiz = await api(`/api/chapters/${chapter.id}/quiz`);
    } catch (err) {
      $("#lesson").innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      return;
    }
    $("#lesson").innerHTML = `
      <div class="eyebrow">${escapeHtml(chapter.title)}</div>
      <h2>Chapter quiz</h2>
      <p class="muted">${quiz.questions.length} questions · pass with ${quiz.passThresholdPct}% or higher · retake as many times as you like.</p>
      <form id="quizForm" style="margin-top:20px;display:grid;gap:22px">
        ${quiz.questions
          .map(
            (q, qi) => `
          <fieldset style="border:1px solid var(--line);border-radius:10px;padding:16px">
            <legend style="padding:0 6px;color:var(--ink)">${qi + 1}. ${escapeHtml(q.prompt)}</legend>
            <div style="display:grid;gap:8px;margin-top:8px">
              ${q.options
                .map(
                  (o) => `<label style="display:flex;gap:10px;align-items:center;cursor:pointer">
                    <input type="radio" name="q${q.id}" value="${o.id}" required>
                    <span>${escapeHtml(o.label)}</span>
                  </label>`
                )
                .join("")}
            </div>
          </fieldset>`
          )
          .join("")}
        <div style="display:flex;gap:10px">
          <button type="submit" class="btn primary">Submit quiz</button>
          <button type="button" class="btn ghost" id="backToLesson">← Back to lessons</button>
        </div>
      </form>`;
    $("#backToLesson").onclick = () => { mode = "lesson"; draw(); };
    $("#quizForm").onsubmit = async (e) => {
      e.preventDefault();
      const answers = quiz.questions.map((q) => ({
        questionId: q.id,
        optionId: Number(new FormData(e.target).get(`q${q.id}`))
      }));
      try {
        const result = await api(`/api/chapters/${chapter.id}/quiz/attempt`, { method: "POST", body: { answers } });
        await refreshProgress();
        drawQuizResult(chapter, result);
      } catch (err) {
        toast(err.message);
      }
    };
  };

  const drawQuizResult = (chapter, result) => {
    $("#lesson").innerHTML = `
      <div class="eyebrow">${escapeHtml(chapter.title)}</div>
      <h2>${result.passed ? "Chapter passed 🎉" : "Not quite yet"}</h2>
      <p style="font-size:1.3rem;margin-top:10px">Score: <b>${result.scorePct}%</b> <span class="muted">(need ${result.passThresholdPct}%)</span></p>
      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <button class="btn primary" id="retakeBtn">${result.passed ? "Retake for practice" : "Retry quiz"}</button>
        <button class="btn ghost" id="continueBtn">${result.passed ? "Continue" : "Back to lessons"}</button>
      </div>`;
    icons();
    $("#retakeBtn").onclick = () => { mode = "quiz"; draw(); };
    $("#continueBtn").onclick = () => {
      mode = "lesson";
      lessonIndex = 0;
      if (result.passed && chapterIndex < c.chapters.length - 1) chapterIndex += 1;
      draw();
    };
  };

  draw();
}

function showLab(command = "whoami") {
  $("#appContent").innerHTML = `
    <div class="card">
      <button class="btn ghost" id="backDash">← Dashboard</button>
      <div class="eyebrow" style="margin-top:25px">Safe lab simulator</div>
      <h2>Browser terminal</h2>
      <p class="muted">Try Linux commands. The starter backend only permits a safe allowlist.</p>
      <div class="terminal" style="margin-top:25px">
        <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><label>student@academy: ~/lab</label></div>
        <div class="termout" id="labOut"><span class="prompt">$ </span>Ready.</div>
        <form class="term-input" id="labForm"><span class="prompt">$&nbsp;</span><input id="labInput" autocomplete="off" value="${escapeHtml(command)}" aria-label="Lab terminal command input"></form>
      </div>
    </div>`;
  $("#backDash").onclick = () => showApp("dashboard");
  $("#labForm").onsubmit = async (e) => {
    e.preventDefault();
    const cmd = $("#labInput").value;
    try {
      const d = await api("/api/lab/execute", { method: "POST", body: { command: cmd } });
      $("#labOut").textContent += `\n$ ${cmd}\n${d.output}`;
      $("#labInput").value = "";
    } catch (err) {
      toast(err.message);
    }
  };
}

function dashboardHTML() {
  return `<div class="card"><div class="eyebrow">Welcome back</div><h2>${escapeHtml(user.name)}</h2><p class="muted">Your Linux journey lives here.</p><div id="enrolled" style="display:grid;gap:12px;margin-top:25px"></div></div>
    <div class="card" style="margin-top:16px"><div class="eyebrow">Certificates</div><h3 style="margin:4px 0 16px">Your completed courses</h3><div id="dashCertificates" style="display:grid;gap:10px"></div></div>`;
}

async function showApp(page) {
  $("#homePage").style.display = "none";
  $("#appPage").classList.add("open");

  if (page === "labs") {
    showLab();
    return;
  }

  if (page === "catalog") {
    $("#appContent").innerHTML = `<div class="card"><div class="eyebrow">Library</div><h2>Course catalog</h2><div class="courses" id="dashCourses" style="margin-top:25px"></div></div>`;
    $("#dashCourses").innerHTML = courses.map((c) => courseCardHTML(c, { compact: true })).join("");
    icons();
    return;
  }

  if (page === "profile") {
    $("#appContent").innerHTML = `<div class="card"><div class="eyebrow">Profile</div><h2>${escapeHtml(user.name)}</h2><p class="muted">${escapeHtml(user.email)}</p><p>Account created: ${escapeHtml(user.created_at || "today")}</p></div>`;
    return;
  }

  $("#appContent").innerHTML = dashboardHTML();
  const m = await api("/api/me");
  $("#enrolled").innerHTML = m.enrolled.length
    ? m.enrolled
        .map(
          (c) =>
            `<button class="card" style="text-align:left" data-slug="${escapeHtml(c.slug)}" data-open-course><b>${escapeHtml(c.code)} · ${escapeHtml(c.title)}</b><div class="muted">${escapeHtml(c.description)}</div></button>`
        )
        .join("")
    : `<p class="muted">No courses enrolled yet. Open the catalog and choose your first track.</p>`;
  $("#dashCertificates").innerHTML = m.certificates.length
    ? m.certificates
        .map(
          (cert) =>
            `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <b>${escapeHtml(cert.courseTitle)}</b>
              <span style="display:flex;gap:8px">
                <a class="btn ghost" href="/verify/${encodeURIComponent(cert.id)}" target="_blank" rel="noopener">Verify</a>
                <a class="btn primary" href="/api/certificates/${encodeURIComponent(cert.id)}/pdf" target="_blank" rel="noopener">PDF</a>
              </span>
            </div>`
        )
        .join("")
    : `<p class="muted">Complete every chapter quiz in a course to earn its certificate.</p>`;
}

$$("[data-app]").forEach((b) => (b.onclick = () => showApp(b.dataset.app)));
$$("[data-scroll]").forEach(
  (b) =>
    (b.onclick = () => {
      if ($("#homePage").style.display === "none") {
        $("#appPage").classList.remove("open");
        $("#homePage").style.display = "block";
      }
      setTimeout(() => document.getElementById(b.dataset.scroll)?.scrollIntoView({ behavior: "smooth" }), 50);
    })
);

function openAuth(mode) {
  authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "Log in" : "Create your account";
  $("#nameField").style.display = mode === "login" ? "none" : "block";
  $("#authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  $("#authSwitch").innerHTML =
    mode === "login"
      ? `New here? <button type="button" id="switchAuth">Create an account</button>`
      : `Already have an account? <button type="button" id="switchAuth">Log in</button>`;
  $("#authModal").classList.add("open");
  $("#switchAuth").onclick = () => openAuth(mode === "login" ? "signup" : "login");
  const focusTarget = mode === "login" ? $("#emailField") : $("#nameField");
  setTimeout(() => focusTarget?.focus(), 0);
}
$("#loginBtn").onclick = () => openAuth("login");
$("#signupBtn").onclick = () => openAuth("signup");
$("#closeModal").onclick = () => $("#authModal").classList.remove("open");
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("#authModal").classList.contains("open")) {
    $("#authModal").classList.remove("open");
  }
});

$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const body = { email: $("#emailField").value, password: $("#passwordField").value };
    if (authMode === "signup") body.name = $("#nameField").value;
    const d = await api("/api/auth/" + (authMode === "login" ? "login" : "register"), { method: "POST", body });
    token = d.token;
    user = d.user;
    localStorage.setItem("la_token", token);
    $("#authModal").classList.remove("open");
    toast("Welcome to Linux Academy");
    $("#loginBtn").textContent = user.name.split(" ")[0];
    showApp("dashboard");
  } catch (err) {
    toast(err.message);
  }
};

$("#logoutBtn").onclick = () => {
  token = null;
  user = null;
  localStorage.removeItem("la_token");
  $("#appPage").classList.remove("open");
  $("#homePage").style.display = "block";
  $("#loginBtn").textContent = "Log in";
  toast("Logged out");
};

$$(".faqitem").forEach((x) => (x.querySelector(".faqq").onclick = () => x.classList.toggle("open")));

$("#freeBtn").onclick = () => $("#signupBtn").click();
$("#proBtn").onclick = () => $("#signupBtn").click();
$("#teamBtn").onclick = () => toast("Team sales flow can be connected here.");

$("#termForm").onsubmit = async (e) => {
  e.preventDefault();
  const cmd = $("#termInput").value.trim();
  if (!cmd) return;
  try {
    const d = await api("/api/lab/demo", { method: "POST", body: { command: cmd } });
    $("#termout").textContent += `\n$ ${cmd}\n${d.output}\n`;
    $("#termInput").value = "";
  } catch (err) {
    $("#termout").textContent += `\n$ ${cmd}\n${err.message}\n`;
  }
};

const searchInput = $("#courseSearch");
if (searchInput) {
  searchInput.addEventListener("input", () => renderCourses(searchInput.value));
}

function verifyResultHTML(result) {
  if (!result.valid) {
    return `<div class="card" style="text-align:center;padding:50px 30px">
      <div class="bigicon" style="margin:0 auto 20px;color:var(--red)"><i data-lucide="shield-x"></i></div>
      <h2>Certificate not found</h2>
      <p class="muted">This verification link doesn't match an issued certificate.</p>
    </div>`;
  }
  const dateStr = new Date(result.issuedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `<div class="card" style="text-align:center;padding:50px 30px">
    <div class="bigicon" style="margin:0 auto 20px;color:var(--teal)"><i data-lucide="shield-check"></i></div>
    <div class="eyebrow" style="color:var(--teal)">Verified certificate</div>
    <h2 style="margin-top:6px">${escapeHtml(result.recipientName)}</h2>
    <p style="font-size:1.1rem;margin-top:10px">completed <b>${escapeHtml(result.courseTitle)}</b></p>
    <p class="muted" style="margin-top:6px">Issued ${escapeHtml(dateStr)}</p>
    <a class="btn primary" style="margin-top:20px" href="/api/certificates/${encodeURIComponent(result.id)}/pdf" target="_blank" rel="noopener">Download PDF</a>
  </div>`;
}

async function renderVerifyPage(id) {
  $("#homePage").style.display = "none";
  $("#appPage").classList.add("open");
  $("#appContent").innerHTML = `<p class="muted">Checking…</p>`;
  let result;
  try {
    result = await api(`/api/verify/${encodeURIComponent(id)}`);
  } catch {
    result = { valid: false };
  }
  $("#appContent").innerHTML = verifyResultHTML(result);
  icons();
}

async function init() {
  const verifyMatch = location.pathname.match(/^\/verify\/([^/]+)/);
  if (verifyMatch) {
    await renderVerifyPage(verifyMatch[1]);
    return;
  }

  try {
    if (token) {
      const d = await api("/api/me");
      user = d.user;
      $("#loginBtn").textContent = user.name.split(" ")[0];
    }
  } catch {
    token = null;
    user = null;
    localStorage.removeItem("la_token");
  }
  await loadCourses();
  if (user) showApp("dashboard");
}

const introLines = ["whoami", "student", "./academy start --track linux", "Booting safe lab…", "Access granted. Let's build something."];
(async () => {
  const typing = $("#typing");
  for (const line of introLines) {
    for (const ch of line) {
      typing.textContent += ch;
      await new Promise((r) => setTimeout(r, 28));
    }
    typing.textContent += "\n";
    await new Promise((r) => setTimeout(r, 350));
  }
})();

init();

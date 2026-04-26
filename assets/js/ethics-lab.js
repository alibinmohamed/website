/* =============================================================================
 * ethics-lab.js — Cybersecurity Ethics & Laws per-chapter quizzes + scoring.
 * -----------------------------------------------------------------------------
 *  * Finds every <div class="chapter-quiz" data-chapter="N"> mount point.
 *  * Fetches the public quiz catalogue from
 *      GET /api/progress/ethics/catalogue
 *    The server intentionally strips the correct-answer index from this
 *    response, so a curious student can't read page source to cheat.
 *  * For each question, renders 4 buttons. When a button is clicked, the
 *    front-end POSTs to /api/progress/ethics/answer and the server replies
 *    with { correct, correctIndex, xp, explanation, source, totalXP, ... }.
 *    The button is then painted green/red, the correct answer highlighted,
 *    and the explanation + citation revealed under the question.
 *  * No xterm, no WebSocket, no Docker container — this course is
 *    knowledge-only.
 *
 * IMPORTANT: every top-level identifier is prefixed `Eth` / `ETHICS_LAB_`
 * to avoid colliding with existing globals in app.js (e.g. ETHICS_TOTAL_XP).
 * Repeating the WEB_TOTAL_XP collision bug would silently kill this whole
 * file in the browser.
 * =========================================================================== */
console.log("[ethics-lab.js] loaded");

const ETHICS_API_CATALOGUE = "/progress/ethics/catalogue";
const ETHICS_API_ANSWER    = "/progress/ethics/answer";
const ETHICS_API_PROGRESS  = "/progress/ethics";

/* ---------------------------------------------------------------------------
 * Progress state for the page (in-memory + sessionStorage for guests).
 * ------------------------------------------------------------------------- */
const ETHICS_GUEST_KEY = "eth_guest_progress";
const ethicsProgress = {
  completed: new Set(),  // question IDs answered correctly
  totalXP: 0,
  totalPossibleXP: 0,    // populated from catalogue
  catalogue: [],         // [{ chapter, questions: [...] }]
};

function ethAuthHeaders() {
  return (typeof authHeaders === "function")
    ? authHeaders(getToken())
    : { "Content-Type": "application/json" };
}

async function ethLoadCatalogue() {
  // Public endpoint — no auth needed. Server returns questions WITHOUT the
  // correct-answer index, so the catalogue is safe to render directly.
  const res = await apiFetch(ETHICS_API_CATALOGUE, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok || !res.data || !Array.isArray(res.data.chapters)) {
    console.warn("[ethics-lab] catalogue load failed; offline-ish fallback empty");
    ethicsProgress.catalogue = [];
    ethicsProgress.totalPossibleXP = 0;
    return;
  }
  ethicsProgress.catalogue = res.data.chapters;
  ethicsProgress.totalPossibleXP = Number(res.data.totalPossibleXP || 0);
}

async function ethLoadProgress() {
  // Discard any old global localStorage so cross-account state never leaks.
  localStorage.removeItem("eth.progress");

  const token = getToken();
  if (token) {
    const res = await apiFetch(ETHICS_API_PROGRESS, { headers: ethAuthHeaders() });
    if (res.ok) {
      ethicsProgress.completed = new Set(res.data.completedTasks || []);
      ethicsProgress.totalXP   = Number(res.data.totalXP || 0);
      sessionStorage.removeItem(ETHICS_GUEST_KEY);
      return;
    }
    ethicsProgress.completed = new Set();
    ethicsProgress.totalXP   = 0;
    return;
  }

  try {
    const raw = JSON.parse(sessionStorage.getItem(ETHICS_GUEST_KEY) || "{}");
    ethicsProgress.completed = new Set(raw.completed || []);
    ethicsProgress.totalXP   = Number(raw.totalXP || 0);
  } catch (e) {
    ethicsProgress.completed = new Set();
    ethicsProgress.totalXP   = 0;
  }
}

function ethSaveGuestProgress() {
  if (getToken()) return;
  sessionStorage.setItem(ETHICS_GUEST_KEY, JSON.stringify({
    completed: [...ethicsProgress.completed],
    totalXP:   ethicsProgress.totalXP,
  }));
}

/* ---------------------------------------------------------------------------
 * Course-wide XP bar at the top of the page.
 * ------------------------------------------------------------------------- */
function ethRefreshCourseXP() {
  const val  = document.getElementById("courseXpValue");
  const fill = document.getElementById("courseXpFill");
  const done = document.getElementById("chaptersDone");
  const total = ethicsProgress.totalPossibleXP || 1;
  if (val)  val.textContent  = `${ethicsProgress.totalXP} / ${ethicsProgress.totalPossibleXP}`;
  if (fill) fill.style.width = `${Math.min(100, (ethicsProgress.totalXP / total) * 100)}%`;
  if (done) {
    let finished = 0;
    for (const ch of ethicsProgress.catalogue) {
      const qs = ch.questions || [];
      if (qs.length && qs.every(q => ethicsProgress.completed.has(q.id))) finished++;
    }
    done.textContent = String(finished);
  }
}

/* ---------------------------------------------------------------------------
 * Per-question XP counter shown in the chapter panel header.
 * ------------------------------------------------------------------------- */
function ethRefreshChapterXP(chapter) {
  const panel = document.querySelector(
    `.chapter-quiz[data-chapter="${chapter}"] .quiz-xp`
  );
  if (!panel) return;
  const ch = ethicsProgress.catalogue.find(c => c.chapter === chapter);
  if (!ch) return;
  const earned = (ch.questions || [])
    .filter(q => ethicsProgress.completed.has(q.id))
    .reduce((s, q) => s + (q.xp || 0), 0);
  const totalXp = (ch.questions || []).reduce((s, q) => s + (q.xp || 0), 0);
  panel.textContent = `${earned} / ${totalXp} XP`;
}

/* ---------------------------------------------------------------------------
 * Chapter locks — finish every question in chapter N to unlock N+1.
 * ------------------------------------------------------------------------- */
function ethIsChapterComplete(chapter) {
  const ch = ethicsProgress.catalogue.find(c => c.chapter === chapter);
  if (!ch || !ch.questions || !ch.questions.length) return false;
  return ch.questions.every(q => ethicsProgress.completed.has(q.id));
}

function ethRefreshChapterLocks() {
  for (let n = 1; n <= 9; n++) {
    const article = document.getElementById("m" + n);
    if (!article) continue;
    const unlocked = (n === 1) || ethIsChapterComplete(n - 1);
    if (unlocked) {
      article.classList.remove("chapter-locked");
      const overlay = article.querySelector(".chapter-lock-overlay");
      if (overlay) overlay.remove();
    } else {
      article.classList.add("chapter-locked");
      let overlay = article.querySelector(".chapter-lock-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "chapter-lock-overlay";
        overlay.innerHTML = `
          <div class="chapter-lock-card">
            <div class="icon">🔒</div>
            <h4>Chapter ${n} is locked</h4>
            <p>Answer every question in <strong>Chapter ${n - 1}</strong> correctly first
               to unlock this chapter.</p>
          </div>
        `;
        article.appendChild(overlay);
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * Persistent XP toast notifications, identical visual style to the other
 * courses. Stays visible long enough for the student to read what they've
 * just learned.
 * ------------------------------------------------------------------------- */
function ethToastHost() {
  let host = document.getElementById("xpToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "xpToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function ethShowToast(headline, body, ok) {
  const host = ethToastHost();
  const toast = document.createElement("div");
  toast.className = "xp-toast" + (ok ? "" : " err");
  const safe = (s) => String(s || "").replace(/[<>&]/g,
    c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
  toast.innerHTML = `
    <div class="head">
      <span>${safe(headline)}</span>
      <button type="button" class="close" aria-label="Dismiss">✕</button>
    </div>
    <div class="body">${safe(body)}</div>
  `;
  host.appendChild(toast);
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add("fading");
    setTimeout(() => toast.remove(), 600);
  };
  toast.querySelector(".close").addEventListener("click", dismiss);
  setTimeout(dismiss, 7000);
}

/* ---------------------------------------------------------------------------
 * DOM scaffolding per chapter — render the question list inside each
 * <div class="chapter-quiz" data-chapter="N">.
 * ------------------------------------------------------------------------- */
function ethRenderChapter(container) {
  const chapter = Number(container.getAttribute("data-chapter"));
  const ch = ethicsProgress.catalogue.find(c => c.chapter === chapter);
  if (!ch) {
    container.innerHTML = `<div class="quiz-empty">
      Chapter ${chapter} questions could not be loaded.
      Make sure the backend is running and reachable.
    </div>`;
    return;
  }
  const questions = ch.questions || [];
  const totalXp = questions.reduce((s, q) => s + (q.xp || 0), 0);

  container.innerHTML = `
    <div class="quiz-head">
      <span>Chapter ${chapter} quiz · ${questions.length} questions</span>
      <span class="quiz-xp">0 / ${totalXp} XP</span>
    </div>
    <ol class="quiz-list" data-quiz-list></ol>
  `;
  const list = container.querySelector("[data-quiz-list]");

  questions.forEach((q, idx) => {
    const li = document.createElement("li");
    li.className = "quiz-item";
    li.dataset.questionId = String(q.id);
    if (ethicsProgress.completed.has(q.id)) li.classList.add("answered", "correct");

    const safeText = (s) => String(s || "").replace(/[<>&]/g,
      c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");

    li.innerHTML = `
      <div class="quiz-prompt">
        <span class="num">Q${idx + 1}.</span>
        <span class="text">${safeText(q.question)}</span>
        <span class="reward" title="XP awarded for a correct answer">+${q.xp} XP</span>
      </div>
      <div class="quiz-choices">
        ${q.choices.map((choice, i) => `
          <button type="button" class="quiz-choice" data-choice="${i}">
            <span class="letter">${String.fromCharCode(65 + i)}.</span>
            <span class="label">${safeText(choice)}</span>
          </button>
        `).join("")}
      </div>
      <div class="quiz-feedback" hidden></div>
    `;
    list.appendChild(li);

    li.querySelectorAll(".quiz-choice").forEach(btn => {
      btn.addEventListener("click", () => ethSubmitAnswer(li, q, Number(btn.dataset.choice)));
    });

    // If we already answered this correctly previously, lock the card.
    if (ethicsProgress.completed.has(q.id)) {
      li.querySelectorAll(".quiz-choice").forEach(b => b.disabled = true);
    }
  });

  ethRefreshChapterXP(chapter);
}

/* ---------------------------------------------------------------------------
 * Submit an answer to the server, paint feedback, award XP if correct.
 * ------------------------------------------------------------------------- */
async function ethSubmitAnswer(li, question, choiceIndex) {
  // If this question is already done, ignore additional clicks.
  if (li.classList.contains("answered")) return;

  // Disable buttons immediately so the user can't double-click.
  const buttons = li.querySelectorAll(".quiz-choice");
  buttons.forEach(b => b.disabled = true);

  let feedback;
  try {
    const res = await apiFetch(ETHICS_API_ANSWER, {
      method: "POST",
      headers: ethAuthHeaders(),
      body: JSON.stringify({ questionId: question.id, choiceIndex }),
    });
    if (!res.ok || !res.data || res.data.known === false) {
      throw new Error("Backend rejected answer");
    }
    feedback = res.data;
  } catch (e) {
    // Backend unreachable: re-enable the buttons and show a soft error so
    // the student understands it isn't graded yet.
    buttons.forEach(b => b.disabled = false);
    ethShowToast("⚠️ Cannot reach grader",
      "The backend isn't reachable right now. Start the Flask server and try again.",
      false);
    return;
  }

  li.classList.add("answered", feedback.correct ? "correct" : "wrong");

  // Highlight the correct + chosen options.
  buttons.forEach(b => {
    const i = Number(b.dataset.choice);
    if (i === feedback.correctIndex) b.classList.add("is-correct");
    if (i === choiceIndex && i !== feedback.correctIndex) b.classList.add("is-wrong");
  });

  const fb = li.querySelector(".quiz-feedback");
  fb.hidden = false;
  fb.innerHTML = `
    <div class="fb-head ${feedback.correct ? "ok" : "err"}">
      ${feedback.correct ? "✅ Correct" : "❌ Not quite"}
      ${feedback.correct
        ? `<span class="xp-pill">+${feedback.xp} XP</span>`
        : ""}
    </div>
    <p class="fb-explanation">${ethEscape(feedback.explanation)}</p>
    ${feedback.source ? `<p class="fb-source">Source: ${ethEscape(feedback.source)}</p>` : ""}
  `;

  if (feedback.correct) {
    ethicsProgress.completed.add(question.id);
    if (typeof feedback.totalXP === "number") {
      ethicsProgress.totalXP = feedback.totalXP;
    } else {
      // Recompute locally for guest mode.
      ethicsProgress.totalXP += feedback.xp || 0;
    }
    ethSaveGuestProgress();
    ethShowToast(`+${feedback.xp} XP · Chapter ${feedback.chapter || "?"}`,
      "You answered correctly.", true);
    ethRefreshChapterXP(feedback.chapter || ethChapterFromQuestion(question.id));
    ethRefreshCourseXP();
    ethRefreshChapterLocks();
  } else {
    ethShowToast("Wrong answer", "Read the explanation below to learn why.", false);
  }
}

function ethEscape(s) {
  return String(s || "").replace(/[<>&]/g,
    c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

function ethChapterFromQuestion(qid) {
  for (const ch of ethicsProgress.catalogue) {
    if ((ch.questions || []).some(q => q.id === qid)) return ch.chapter;
  }
  return 0;
}

/* ---------------------------------------------------------------------------
 * Boot — pull catalogue + progress in parallel, then paint every chapter.
 * ------------------------------------------------------------------------- */
async function ethBoot() {
  try {
    await Promise.all([ethLoadCatalogue(), ethLoadProgress()]);
  } catch (e) {
    console.warn("[ethics-lab] boot pre-fetch failed:", e);
  }

  try { ethRefreshCourseXP(); } catch (e) { /* non-fatal */ }
  try { ethRefreshChapterLocks(); } catch (e) { /* non-fatal */ }

  document.querySelectorAll(".chapter-quiz[data-chapter]").forEach(mount => {
    try {
      ethRenderChapter(mount);
    } catch (e) {
      console.error("[ethics-lab] failed to render chapter",
        mount.getAttribute("data-chapter"), e);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ethBoot);
} else {
  ethBoot();
}

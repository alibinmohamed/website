/* =============================================================================
 * web-lab.js — Web & Application Fundamentals per-chapter terminals + scoring.
 * -----------------------------------------------------------------------------
 *  * Finds every <div class="chapter-lab" data-chapter="N"> mount point.
 *  * Builds a task checklist + an xterm terminal inside it.
 *  * Opens a WebSocket to ws://localhost:5001/api/web-terminal per chapter
 *    (authed with the JWT in localStorage). Falls back to a client-side
 *    simulator that produces realistic output AND scores against the same
 *    task catalogue, so offline users still see XP appear.
 *  * Listens for {type:"task-complete"} messages from the backend to tick
 *    checklist items and animate +XP toasts.
 *  * Persists guest progress in sessionStorage under "wf_guest_progress" so
 *    Ali signing in later never inherits another user's progress, and logged-in
 *    progress is the server's responsibility (read on boot, written by the
 *    WebSocket handler — but we still PUT on every local award so the topology-
 *    style UI hooks could be added later without losing XP).
 *
 * This file is a deliberate parallel of network-lab.js and shares the same
 * UX primitives. Where the two diverge is the WS URL, the catalogue, and the
 * simulator's fake output (web-flavoured curl/dig/openssl).
 * =========================================================================== */
console.log("[web-lab.js] loaded");

const WEB_WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//localhost:5001/api/web-terminal`;
})();

/* ---------------------------------------------------------------------------
 * Task catalogue — MIRROR of backend/web_tasks.py. Keep these two in sync
 * when the regex or XP values change. The simulator uses these regexes to
 * score commands when the backend is unreachable.
 * ------------------------------------------------------------------------- */
const WEB_TASKS = {
  1: [ // Introduction
    { id: 1101, xp: 10,
      title: "Read the welcome file — try: cat README.txt",
      match: /^(cat|less|more)\s+README(\.txt)?\b/i },
    { id: 1102, xp: 10,
      title: "Make your first web request — try: curl http://example.com",
      match: /^curl(\s+--?\w+)*\s+http:\/\/\S+/i },
    { id: 1103, xp: 15,
      title: "Look up a website's IP address — try: host example.com",
      match: /^(host|getent\s+hosts)\s+\S+/i },
    { id: 1104, xp: 10,
      title: "See which browser/agent your tool reports — try: curl -A 'Mozilla/5.0' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-A|--user-agent)\s+\S+.*\s+https?:\/\/\S+/i },
  ],
  2: [ // Clients & Servers
    { id: 1201, xp: 15,
      title: "Watch the full request and response — try: curl -v http://example.com",
      match: /^curl(\s+--?\w+)*\s+-v(\s+|$)/i },
    { id: 1202, xp: 15,
      title: "Send a POST request like a form would — try: curl -X POST http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+-X\s+POST(\s+|$)/i },
    { id: 1203, xp: 10,
      title: "Talk to a web server with raw TCP — try: nc example.com 80",
      match: /^(nc|ncat)(\s+-\w+)*\s+\S+\s+\d+/i },
    { id: 1204, xp: 15,
      title: "Run your own tiny web server — try: python3 -m http.server 8000",
      match: /^python3?\s+-m\s+http\.server(\s+\d+)?(\s+|$)/i },
  ],
  3: [ // HTTP vs HTTPS
    { id: 1301, xp: 10,
      title: "Open a plain HTTP page — try: curl http://example.com",
      match: /^curl(\s+--?\w+)*\s+http:\/\/\S+/i },
    { id: 1302, xp: 15,
      title: "Open the same page over HTTPS — try: curl https://example.com",
      match: /^curl(\s+--?\w+)*\s+https:\/\/\S+/i },
    { id: 1303, xp: 15,
      title: "Peek inside a TLS handshake — try: openssl s_client -connect example.com:443",
      match: /^openssl\s+s_client(\s+-\w+(\s+\S+)?)*\s+-connect\s+\S+:\d+/i },
    { id: 1304, xp: 10,
      title: "Ask the server only for its headers — try: curl -I https://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-I|--head)(\s+|$).*https?:\/\/\S+/i },
  ],
  4: [ // DNS, Domains & Subdomains
    { id: 1401, xp: 15,
      title: "Look up a domain's IP (A record) — try: dig example.com",
      match: /^dig(\s+[+-]\w+(=\S+)?)*\s+(?!.*\bMX\b)(?!.*\bNS\b)(?!.*\bTXT\b)\S+/i },
    { id: 1402, xp: 15,
      title: "Find a domain's mail servers (MX) — try: dig -t MX example.com",
      match: /^(dig\s+(-t\s+)?MX\s+\S+|nslookup\s+-type=MX\s+\S+|host\s+-t\s+MX\s+\S+)/i },
    { id: 1403, xp: 15,
      title: "Find a domain's nameservers (NS) — try: dig -t NS example.com",
      match: /^(dig\s+(-t\s+)?NS\s+\S+|nslookup\s+-type=NS\s+\S+|host\s+-t\s+NS\s+\S+)/i },
    { id: 1404, xp: 10,
      title: "Look up who registered a domain — try: whois example.com",
      match: /^whois\s+\S+/i },
  ],
  5: [ // URLs & Parameters
    { id: 1501, xp: 15,
      title: "Send query-string parameters — try: curl 'http://example.com/?q=hello&lang=en'",
      match: /^curl(\s+--?\w+)*\s+['"]?https?:\/\/[^\s'"]*\?\S*=\S+/i },
    { id: 1502, xp: 15,
      title: "Submit form data with POST — try: curl --data 'name=ali&role=student' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(--data|-d)\s+\S+.*https?:\/\/\S+/i },
    { id: 1503, xp: 10,
      title: "URL-encode a value safely — try: curl --data-urlencode 'q=hello world' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+--data-urlencode\s+\S+/i },
    { id: 1504, xp: 10,
      title: "Hit a non-default port — try: curl http://example.com:8080/",
      match: /^curl(\s+--?\w+)*\s+https?:\/\/[^\s/]+:\d+\b/i },
  ],
  6: [ // Headers, Cookies & Sessions
    { id: 1601, xp: 15,
      title: "List the response headers a server returns — try: curl -I https://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-I|--head)(\s+|$)/i },
    { id: 1602, xp: 15,
      title: "Send a custom header — try: curl -H 'X-Demo: 1' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+\S+.*https?:\/\/\S+/i },
    { id: 1603, xp: 15,
      title: "Send a cookie with your request — try: curl -b 'session=abc123' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-b|--cookie)\s+\S+.*https?:\/\/\S+/i },
    { id: 1604, xp: 10,
      title: "Save the cookies a server sets — try: curl -c cookies.txt http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-c|--cookie-jar)\s+\S+.*https?:\/\/\S+/i },
  ],
  7: [ // Proxies & Caching
    { id: 1701, xp: 15,
      title: "Send your traffic through a proxy — try: curl -x http://127.0.0.1:8080 http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-x|--proxy)\s+\S+.*https?:\/\/\S+/i },
    { id: 1702, xp: 10,
      title: "Bypass cached answers — try: curl -H 'Cache-Control: no-cache' http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+['"]?[Cc]ache-[Cc]ontrol:.*https?:\/\/\S+/i },
    { id: 1703, xp: 15,
      title: "Follow redirects automatically — try: curl -L http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-L|--location)(\s+|$).*https?:\/\/\S+/i },
    { id: 1704, xp: 10,
      title: "Run a tiny local web server to test your own proxy — try: python3 -m http.server 8080",
      match: /^python3?\s+-m\s+http\.server\s+8080(\s+|$)/i },
  ],
  8: [ // Web Application Architecture
    { id: 1801, xp: 15,
      title: "Talk to a real REST API — try: curl https://api.github.com/users/octocat",
      match: /^curl(\s+--?\w+)*\s+https?:\/\/api\.[^\s]+/i },
    { id: 1802, xp: 15,
      title: "Ask for JSON specifically — try: curl -H 'Accept: application/json' https://api.github.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+-H\s+['"]?[Aa]ccept:\s*application\/json.*https?:\/\/\S+/i },
    { id: 1803, xp: 10,
      title: "Pretty-print a JSON response — try: curl https://api.github.com | jq .",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+https?:\/\/\S+.*\|\s*jq\b/i },
    { id: 1804, xp: 15,
      title: "Send a PUT request like an API client — try: curl -X PUT http://example.com/item/1",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+-X\s+PUT(\s+|$)/i },
  ],
  9: [ // The Developer Toolbox
    { id: 1901, xp: 15,
      title: "Watch every step of a request happen — try: curl -v https://example.com",
      match: /^curl(\s+--?\w+)*\s+-v(\s+|$)/i },
    { id: 1902, xp: 10,
      title: "Save a page to a file — try: curl -o page.html http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-o|--output)\s+\S+.*https?:\/\/\S+/i },
    { id: 1903, xp: 10,
      title: "Show only the bits you care about — try: curl -s http://example.com | head",
      match: /^curl(\s+--?\w+)*\s+-s\b.*\|\s*(head|tail|grep|wc|less)\b/i },
    { id: 1904, xp: 15,
      title: "Time how slow a request is — try: curl -w '%{time_total}\\n' -o /dev/null -s http://example.com",
      match: /^curl(\s+--?\w+(\s+\S+)?)*\s+(-w|--write-out)\s+\S+.*https?:\/\/\S+/i },
  ],
};

// Renamed from WEB_TOTAL_XP to avoid colliding with the same name already
// declared in assets/js/app.js (loaded just before this file). When two
// classic <script> tags both declare the same top-level const/var, the
// browser throws a SyntaxError on the second one and silently kills this
// whole file — which is what was wiping out the chapter labs and locks.
const WEB_LAB_TOTAL_XP = Object.values(WEB_TASKS)
  .flat()
  .reduce((s, t) => s + t.xp, 0);

function webScoreLine(chapter, line) {
  const tasks = WEB_TASKS[chapter] || [];
  const s = (line || "").trim();
  if (!s) return null;
  for (const t of tasks) if (t.match.test(s)) return t;
  return null;
}

/* ---------------------------------------------------------------------------
 * Progress persistence — same pattern as the Network course:
 *   * If the user is logged in (JWT token in localStorage) the *server* is
 *     the source of truth. We fetch /api/progress/web on boot and PUT
 *     it every time a task is awarded locally.
 *   * If they are not logged in we keep a per-tab `sessionStorage` record
 *     so that Ali signing in later never inherits another user's progress.
 *   * We also purge any older global localStorage key on boot so stale
 *     values from a previous session never leak into a new login.
 * ------------------------------------------------------------------------- */
const WEB_GUEST_PROGRESS_KEY = "wf_guest_progress";

// `getToken()` and `apiFetch()` are defined in assets/js/app.js which is
// loaded *before* this file. We re-use those instead of redeclaring them.
function wfAuthHeaders() {
  return (typeof authHeaders === "function")
    ? authHeaders(getToken())
    : { "Content-Type": "application/json" };
}

const webProgress = { completed: new Set(), totalXP: 0 };

async function loadWebProgressFromServerOrSession() {
  // Discard any stale global localStorage so cross-account progress can't leak.
  localStorage.removeItem("wf.progress");

  const token = getToken();
  if (token) {
    const res = await apiFetch("/progress/web", { headers: wfAuthHeaders() });
    if (res.ok) {
      webProgress.completed = new Set(res.data.completedTasks || []);
      webProgress.totalXP = Number(res.data.totalXP || 0);
      sessionStorage.removeItem(WEB_GUEST_PROGRESS_KEY);
      return;
    }
    webProgress.completed = new Set();
    webProgress.totalXP = 0;
    return;
  }

  try {
    const raw = JSON.parse(sessionStorage.getItem(WEB_GUEST_PROGRESS_KEY) || "{}");
    webProgress.completed = new Set(raw.completed || []);
    webProgress.totalXP = Number(raw.totalXP || 0);
  } catch (e) {
    webProgress.completed = new Set();
    webProgress.totalXP = 0;
  }
}

async function saveWebProgress() {
  const token = getToken();
  if (token) {
    await apiFetch("/progress/web", {
      method: "PUT",
      headers: wfAuthHeaders(),
      body: JSON.stringify({ completedTasks: [...webProgress.completed] }),
    });
  } else {
    sessionStorage.setItem(WEB_GUEST_PROGRESS_KEY, JSON.stringify({
      completed: [...webProgress.completed],
      totalXP: webProgress.totalXP,
    }));
  }
}

function markWebTaskDone(task, opts) {
  opts = opts || {};
  const alreadyDone = webProgress.completed.has(task.id);
  webProgress.completed.add(task.id);
  webProgress.totalXP = Object.values(WEB_TASKS).flat()
    .filter(t => webProgress.completed.has(t.id))
    .reduce((s, t) => s + t.xp, 0);
  saveWebProgress();

  const chapter = chapterOfWebTask(task.id);
  const li = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-list li[data-task-id="${task.id}"]`
  );
  if (li && !li.classList.contains("done")) {
    li.classList.add("done", "just-awarded");
    setTimeout(() => li.classList.remove("just-awarded"), 600);
    if (!opts.silent) floatWebXP(li, task.xp);
  }
  refreshWebChapterXP(chapter);
  refreshWebCourseXP();
  if (!opts.silent && !alreadyDone) showWebXpToast(task, chapter);
  refreshWebChapterLocks();
  return !alreadyDone;
}

/* --------------------------------------------------------------------------
 * Persistent XP toast notifications — readable, manually-dismissable, auto-fade
 * after 6s. Identical visual treatment to the network course.
 * ------------------------------------------------------------------------ */
function webXpToastHost() {
  let host = document.getElementById("xpToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "xpToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function showWebXpToast(task, chapter) {
  const host = webXpToastHost();
  const toast = document.createElement("div");
  toast.className = "xp-toast";
  const safeTitle = (task.title || "Task complete").replace(/[<>&]/g, c => (
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  ));
  toast.innerHTML = `
    <div class="head">
      <span>+${task.xp || 0} XP · Chapter ${chapter || "?"}</span>
      <button type="button" class="close" aria-label="Dismiss">✕</button>
    </div>
    <div class="body">${safeTitle}</div>
  `;
  host.appendChild(toast);

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add("fading");
    setTimeout(() => toast.remove(), 600);
  };
  toast.querySelector(".close").addEventListener("click", dismiss);
  setTimeout(dismiss, 6000);
}

/* --------------------------------------------------------------------------
 * Chapter locking — finish every visible task in chapter N to unlock N+1.
 * ------------------------------------------------------------------------ */
function visibleWebTasksFor(chapter) {
  return (WEB_TASKS[chapter] || []).filter(t => !t.hidden);
}

function isWebChapterComplete(chapter) {
  const tasks = visibleWebTasksFor(chapter);
  if (!tasks.length) return false;
  return tasks.every(t => webProgress.completed.has(t.id));
}

function refreshWebChapterLocks() {
  for (let n = 1; n <= 9; n++) {
    const article = document.getElementById("m" + n);
    if (!article) continue;
    const unlocked = (n === 1) || isWebChapterComplete(n - 1);
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
            <p>Finish every objective in <strong>Chapter ${n - 1}</strong> first.
               Run the suggested commands in that chapter's sandbox terminal
               to unlock this one.</p>
          </div>
        `;
        article.appendChild(overlay);
      }
    }
  }
}

function chapterOfWebTask(taskId) {
  for (const [ch, tasks] of Object.entries(WEB_TASKS)) {
    if (tasks.some(t => t.id === taskId)) return Number(ch);
  }
  return 0;
}

function floatWebXP(anchor, xp) {
  const rect = anchor.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "xp-floater";
  f.textContent = `${xp} XP`;
  f.style.left = `${rect.right - 60}px`;
  f.style.top = `${rect.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function refreshWebChapterXP(chapter) {
  const panel = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-xp`
  );
  if (!panel) return;
  const tasks = (WEB_TASKS[chapter] || []).filter(t => !t.hidden);
  const earned = tasks
    .filter(t => webProgress.completed.has(t.id))
    .reduce((s, t) => s + t.xp, 0);
  const total = tasks.reduce((s, t) => s + t.xp, 0);
  panel.textContent = `${earned} / ${total} XP`;
}

// Expose so other scripts (e.g. potential future widgets) can award tasks too.
window.markWebTaskDone = markWebTaskDone;
window.WEB_TASKS = WEB_TASKS;

function refreshWebCourseXP() {
  const val = document.getElementById("courseXpValue");
  const fill = document.getElementById("courseXpFill");
  const done = document.getElementById("chaptersDone");
  if (val) val.textContent = `${webProgress.totalXP} / ${WEB_LAB_TOTAL_XP}`;
  if (fill) fill.style.width = `${Math.min(100, (webProgress.totalXP / WEB_LAB_TOTAL_XP) * 100)}%`;
  if (done) {
    let finished = 0;
    for (const tasks of Object.values(WEB_TASKS)) {
      const visible = tasks.filter(t => !t.hidden);
      if (visible.length && visible.every(t => webProgress.completed.has(t.id))) {
        finished += 1;
      }
    }
    done.textContent = String(finished);
  }
}

/* ---------------------------------------------------------------------------
 * DOM scaffolding per chapter.
 * ------------------------------------------------------------------------- */
function renderWebChapterLab(container) {
  const chapter = Number(container.getAttribute("data-chapter"));
  const tasks = (WEB_TASKS[chapter] || []).filter(t => !t.hidden);
  const existing = Array.from(container.children);

  const grid = document.createElement("div");
  grid.className = "chapter-grid";

  const panel = document.createElement("div");
  panel.className = "task-panel";
  const totalXp = tasks.reduce((s, t) => s + t.xp, 0);
  panel.innerHTML = `
    <div class="task-panel-head">
      <span>Chapter ${chapter} objectives</span>
      <span class="task-xp">0 / ${totalXp} XP</span>
    </div>
    <ul class="task-list"></ul>
  `;
  const list = panel.querySelector(".task-list");
  tasks.forEach(t => {
    const li = document.createElement("li");
    li.dataset.taskId = String(t.id);
    li.innerHTML = `
      <span class="dot" aria-hidden="true"></span>
      <span class="title">${t.title}</span>
      <span class="xp">${t.xp}</span>
    `;
    if (webProgress.completed.has(t.id)) li.classList.add("done");
    list.appendChild(li);
  });

  const termWrap = document.createElement("div");
  termWrap.className = "chapter-term-wrap";
  termWrap.innerHTML = `
    <div class="chapter-term-head">
      <div class="terminal-dot red"></div>
      <div class="terminal-dot yellow"></div>
      <div class="terminal-dot green"></div>
      <span class="terminal-title">Chapter ${chapter} · Docker web sandbox</span>
      <span class="terminal-status offline" data-status>idle</span>
    </div>
    <div class="chapter-terminal" data-xterm>
      <button type="button" class="chapter-term-start" data-start-terminal
              style="display:flex; flex-direction:column; align-items:center;
                     justify-content:center; gap:6px; width:100%; height:100%;
                     min-height:260px; background:transparent; border:1px dashed #2a2f3a;
                     border-radius:8px; color:#b9c2cf; cursor:pointer;
                     font-family:'Menlo','Courier New',monospace; font-size:13px;">
        <span style="font-size:24px; line-height:1;">▶</span>
        <span>Start the Chapter ${chapter} sandbox terminal</span>
        <span style="color:#7c8595; font-size:11px;">opens a fresh shell in the cyber-web container</span>
      </button>
    </div>
  `;

  grid.appendChild(panel);
  grid.appendChild(termWrap);
  container.appendChild(grid);
  existing.forEach(el => container.insertBefore(el, grid));

  refreshWebChapterXP(chapter);
  return { chapter, termWrap };
}

/* ---------------------------------------------------------------------------
 * Per-chapter terminal — xterm + WS backend with simulator fallback.
 * ------------------------------------------------------------------------- */
function WebChapterTerminal(chapter, host, statusEl) {
  const self = this;
  this.chapter = chapter;
  this.host = host;
  this.statusEl = statusEl;
  this.term = null;
  this.fit = null;
  this.ws = null;
  this.wsReady = false;
  this.buffer = "";
  this.prompt = `\x1b[1;35mstudent@web-lab\x1b[0m:\x1b[1;34m~/chapter${chapter}\x1b[0m$ `;

  this.setStatus = function (text, ok) {
    if (!self.statusEl) return;
    self.statusEl.textContent = text;
    self.statusEl.classList.toggle("offline", !ok);
  };

  this.init = function () {
    if (typeof Terminal === "undefined") return;
    self.term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      fontFamily: "'Menlo', 'Courier New', 'Lucida Console', monospace",
      theme: {
        background: "#0a0a0d",
        foreground: "#e8e8e8",
        cursor: "#b29cff",
        cursorAccent: "#0a0a0d",
        selection: "rgba(178,156,255,0.25)",
        green: "#27c93f",
        yellow: "#ffbd2e",
        red: "#ff5f56",
      },
      scrollback: 3000,
      convertEol: false,
    });
    if (typeof FitAddon !== "undefined") {
      self.fit = new FitAddon.FitAddon();
      self.term.loadAddon(self.fit);
    }
    self.term.open(self.host);
    if (self.fit) { try { self.fit.fit(); } catch (e) { /* ignore */ } }
    self.term.onData(self.onData);
    window.addEventListener("resize", () => {
      if (self.fit) { try { self.fit.fit(); } catch (e) { /* ignore */ } }
      if (self.wsReady) self.sendResize();
    });

    self.connect();
  };

  this.onData = function (data) {
    if (self.wsReady && self.ws) {
      self.ws.send(JSON.stringify({ type: "input", data }));
      return;
    }
    self.simInput(data);
  };

  this.connect = function () {
    self.setStatus("connecting…", false);
    let opened = false;
    try {
      self.ws = new WebSocket(WEB_WS_URL);
    } catch (e) {
      self.startSimulator();
      return;
    }

    self.ws.onopen = function () {
      opened = true;
      self.wsReady = true;
      self.setStatus("connected · docker", true);
      const token = localStorage.getItem("token") || "";
      self.ws.send(JSON.stringify({
        type: "auth",
        token,
        chapter: self.chapter,
        guestSessionId: webGuestId(),
      }));
      self.sendResize();
      self.term.writeln(`Connected to the Chapter ${self.chapter} sandbox.`);
    };

    self.ws.onmessage = function (evt) {
      const raw = evt.data;
      if (typeof raw === "string" && raw.length > 0 && raw.charCodeAt(0) === 123) {
        try {
          const msg = JSON.parse(raw);
          if (msg && msg.type === "task-complete") {
            self.handleTaskComplete(msg);
            return;
          }
          if (msg && msg.type === "ready") return;
        } catch (e) { /* fall through to write */ }
      }
      self.term.write(raw);
    };

    self.ws.onerror = function () {
      if (!opened) {
        self.wsReady = false;
        self.ws = null;
        self.startSimulator();
      }
    };

    self.ws.onclose = function () {
      if (self.wsReady) {
        self.term.writeln("\r\n\x1b[33m[!] Sandbox session ended.\x1b[0m");
        self.setStatus("disconnected", false);
      } else if (!opened) {
        self.startSimulator();
      }
      self.wsReady = false;
    };

    setTimeout(() => {
      if (!opened) {
        try { self.ws && self.ws.close(); } catch (e) { /* ignore */ }
        self.ws = null;
        if (!self.wsReady) self.startSimulator();
      }
    }, 1500);
  };

  this.sendResize = function () {
    if (self.wsReady && self.ws && self.term) {
      self.ws.send(JSON.stringify({
        type: "resize", rows: self.term.rows, cols: self.term.cols,
      }));
    }
  };

  this.handleTaskComplete = function (msg) {
    const tasks = WEB_TASKS[msg.chapter] || [];
    const task = tasks.find(t => t.id === msg.id)
              || { id: msg.id, xp: msg.xp, title: msg.title };
    const awarded = markWebTaskDone(task);
    if (awarded) {
      self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
    }
  };

  // ------------------- simulator (offline fallback) -------------------
  this.startSimulator = function () {
    self.setStatus("simulator", false);
    self.term.writeln("Running in practice mode (no server needed).");
    self.term.writeln("\x1b[90m  You can type commands here and earn XP just like in the real sandbox.\x1b[0m");
    self.term.writeln("\x1b[90m  Type `help` to see the commands you can try.\x1b[0m\r\n");
    self.term.write(self.prompt);
  };

  this.simInput = function (data) {
    const code = data.charCodeAt(0);
    if (data.indexOf("\x1b[200~") !== -1) {
      const inner = data.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
      const firstLine = inner.split(/[\r\n]/).find(l => l.trim()) || "";
      if (firstLine) {
        self.buffer = firstLine;
        self.term.write(firstLine);
      }
      if (/[\r\n]/.test(inner) && self.buffer.trim()) self.simRun();
      return;
    }
    if (code === 13) { self.simRun(); return; }
    if (code === 127) {
      if (self.buffer.length > 0) {
        self.buffer = self.buffer.slice(0, -1);
        self.term.write("\b \b");
      }
      return;
    }
    if (data === "\x03") {
      self.buffer = "";
      self.term.write("^C\r\n" + self.prompt);
      return;
    }
    if (code >= 32 && code <= 126) {
      self.buffer += data;
      self.term.write(data);
    }
  };

  this.simRun = function () {
    self.term.writeln("");
    const cmd = self.buffer.trim();
    self.buffer = "";
    if (cmd) {
      const out = simExecWeb(cmd);
      if (out === "__CLEAR__") self.term.clear();
      else if (out) self.term.writeln(out);
      const task = webScoreLine(self.chapter, cmd);
      if (task) {
        const awarded = markWebTaskDone(task);
        if (awarded) self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
      }
    }
    self.term.write(self.prompt);
  };
}

function webGuestId() {
  let id = localStorage.getItem("wf_guest_id");
  if (!id) {
    id = "wf-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("wf_guest_id", id);
  }
  return id;
}

/* ---------------------------------------------------------------------------
 * Client-side web simulator. Realistic mock output for when the backend
 * isn't running. Covers curl, dig, host, whois, openssl s_client, nc, jq,
 * and python -m http.server.
 * ------------------------------------------------------------------------- */
const FAKE_WEB_DNS = {
  "example.com":      { a: "93.184.216.34", mx: "mail.example.com", ns: "a.iana-servers.net" },
  "api.github.com":   { a: "140.82.114.6",  mx: null,               ns: "ns-1707.awsdns-21.co.uk" },
  "api.example.com":  { a: "93.184.216.40", mx: null,               ns: "a.iana-servers.net" },
  "google.com":       { a: "142.250.190.14", mx: "smtp.google.com", ns: "ns1.google.com" },
  "utb.edu.bh":       { a: "185.220.101.4", mx: "mail.utb.edu.bh",  ns: "ns1.utb.edu.bh" },
  "127.0.0.1":        { a: "127.0.0.1",     mx: null,               ns: null },
};

function fakeResolveWeb(host) {
  if (!host) return "93.184.216.34";
  if (FAKE_WEB_DNS[host]) return FAKE_WEB_DNS[host].a;
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0xffff;
  return `203.0.${(h >> 8) & 0xff}.${h & 0xff}`;
}

function simExecWeb(raw) {
  const parts = raw.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const firstHost = args.find(a => !a.startsWith("-")) || "example.com";

  switch (cmd) {
    case "help":
      return [
        "\x1b[1;35mWeb-Fundamentals practice commands\x1b[0m",
        " \x1b[36mcurl\x1b[0m url, \x1b[36mcurl -v\x1b[0m url, \x1b[36mcurl -I\x1b[0m url",
        " \x1b[36mcurl -H\x1b[0m 'X: y' url, \x1b[36mcurl -b\x1b[0m 'k=v' url, \x1b[36mcurl -c\x1b[0m jar url",
        " \x1b[36mcurl -X POST/PUT\x1b[0m url, \x1b[36mcurl --data\x1b[0m k=v url, \x1b[36mcurl -L\x1b[0m url",
        " \x1b[36mcurl -x\x1b[0m proxy url, \x1b[36mcurl -o\x1b[0m file url, \x1b[36mcurl -s\x1b[0m url | head",
        " \x1b[36mcurl -A\x1b[0m 'Mozilla/5.0' url, \x1b[36mcurl -w\x1b[0m '%{time_total}\\n' -o /dev/null url",
        " \x1b[36mdig\x1b[0m host, \x1b[36mdig -t MX/NS\x1b[0m host, \x1b[36mhost\x1b[0m host, \x1b[36mwhois\x1b[0m host",
        " \x1b[36mopenssl s_client -connect\x1b[0m host:443, \x1b[36mnc\x1b[0m host port",
        " \x1b[36mpython3 -m http.server\x1b[0m [port], \x1b[36mclear\x1b[0m, \x1b[36mcat README.txt\x1b[0m",
      ].join("\r\n");
    case "clear":  return "__CLEAR__";
    case "date":   return new Date().toUTCString();
    case "whoami": return "webstudent";
    case "pwd":    return "/home/webstudent";
    case "ls":     return "Documents README.txt captures notes sites";
    case "cat":
    case "less":
    case "more":
      if (/README(\.txt)?/.test(args[0] || ""))
        return "Welcome to the Web & Application Fundamentals sandbox.\r\nThis container is separate from the Linux and Network courses.\r\nType `help-web` for a cheat sheet.";
      return `${args[0] || ""}: No such file`;
    case "curl":
    case "wget":   return simWebCurl(raw, args);
    case "nc":
    case "ncat":   return simWebNc(args);
    case "openssl":return simWebOpenssl(args);
    case "host":
    case "getent": return simWebHost(firstHost);
    case "dig":    return simWebDig(args, firstHost);
    case "nslookup":return simWebHost(firstHost);
    case "whois":  return simWebWhois(firstHost);
    case "python":
    case "python3":return simWebHttpServer(args);
    default:
      return `\x1b[31m${cmd}: command not found\x1b[0m \x1b[90m(type 'help')\x1b[0m`;
  }
}

function simWebCurl(raw, args) {
  const url = args.find(a => /^https?:\/\//.test(a) || /^https?:\/\//.test(stripQuotes(a))) || "http://example.com";
  const cleanUrl = stripQuotes(url);
  const verbose = args.includes("-v");
  const headOnly = args.includes("-I") || args.includes("--head");
  const followRedirects = args.includes("-L") || args.includes("--location");
  const writeOut = args.includes("-w") || args.includes("--write-out");
  const useProxy = args.includes("-x") || args.includes("--proxy");
  const piped = /\|\s*(jq|head|tail|grep|wc|less)\b/.test(raw);
  const isHttps = cleanUrl.startsWith("https://");
  const host = cleanUrl.replace(/^https?:\/\//, "").split(/[\/:?#]/)[0];
  const ip = fakeResolveWeb(host);
  const lines = [];
  if (useProxy) {
    lines.push("* Establishing connection through proxy server");
  }
  if (verbose) {
    lines.push(`* Trying ${ip}:${isHttps ? 443 : 80}...`);
    lines.push(`* Connected to ${host} (${ip})`);
    if (isHttps) {
      lines.push("* TLSv1.3 (OUT), TLS handshake, Client hello");
      lines.push("* TLSv1.3 (IN), TLS handshake, Server hello");
      lines.push("* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384");
      lines.push(`* Server certificate:`);
      lines.push(`*  subject: CN=${host}`);
      lines.push(`*  issuer: C=US; O=Let's Encrypt; CN=R3`);
    }
    const method = (() => {
      const xIdx = args.indexOf("-X");
      if (xIdx !== -1 && args[xIdx + 1]) return args[xIdx + 1].toUpperCase();
      if (args.includes("-d") || args.includes("--data") || args.includes("--data-urlencode")) return "POST";
      if (headOnly) return "HEAD";
      return "GET";
    })();
    lines.push(`> ${method} / HTTP/1.1`);
    lines.push(`> Host: ${host}`);
    if (args.includes("-H")) {
      const idx = args.indexOf("-H");
      if (args[idx + 1]) lines.push(`> ${stripQuotes(args[idx + 1])}`);
    }
    if (args.includes("-A") || args.includes("--user-agent")) {
      lines.push(`> User-Agent: ${stripQuotes(args[args.findIndex(a => a === "-A" || a === "--user-agent") + 1] || "Mozilla/5.0")}`);
    } else {
      lines.push("> User-Agent: curl/8.5.0");
    }
    if (args.includes("-b") || args.includes("--cookie")) {
      const idx = Math.max(args.indexOf("-b"), args.indexOf("--cookie"));
      if (args[idx + 1]) lines.push(`> Cookie: ${stripQuotes(args[idx + 1])}`);
    }
    lines.push(">");
  }
  if (followRedirects && !cleanUrl.includes("/redirect")) {
    lines.push("< HTTP/1.1 301 Moved Permanently");
    lines.push(`< Location: ${isHttps ? cleanUrl : cleanUrl.replace(/^http:\/\//, "https://")}`);
    lines.push("<");
    lines.push("* Issue another request to this URL");
  }
  lines.push("< HTTP/1.1 200 OK");
  lines.push(`< Server: ${isHttps ? "cloudflare" : "nginx/1.25.3"}`);
  lines.push("< Content-Type: text/html");
  lines.push("< Set-Cookie: session=abc123def; Path=/; HttpOnly");
  lines.push("< Cache-Control: max-age=3600");
  lines.push("< Content-Length: 1270");
  lines.push("<");
  if (!headOnly) {
    if (piped) {
      lines.push("<!doctype html>");
      lines.push("<html><body><h1>It works!</h1></body></html>");
    } else {
      lines.push("<!doctype html><html><head><title>Example</title></head>");
      lines.push("<body><h1>It works!</h1>");
      lines.push("<p>Try: <code>curl -I</code> <code>curl -v</code> <code>curl -L</code></p>");
      lines.push("</body></html>");
    }
  }
  if (writeOut) {
    lines.push("\x1b[90m" + (Math.random() * 0.5 + 0.05).toFixed(3) + "\x1b[0m");
  }
  return lines.join("\r\n");
}

function stripQuotes(s) {
  if (!s) return s;
  return s.replace(/^['"]/, "").replace(/['"]$/, "");
}

function simWebNc(args) {
  const host = args.find(a => !a.startsWith("-")) || "example.com";
  const port = args[args.length - 1];
  return [
    `Connection to ${host} ${port} port [tcp/${port === "80" ? "http" : "*"}] succeeded!`,
    "GET / HTTP/1.0",
    "",
    "HTTP/1.0 200 OK",
    "Server: nginx",
    "",
    "<html><body><h1>It works!</h1></body></html>",
  ].join("\r\n");
}

function simWebOpenssl(args) {
  if (args[0] !== "s_client") return "usage: openssl s_client -connect host:port";
  const c = args.indexOf("-connect");
  const target = (c !== -1 && args[c + 1]) || "example.com:443";
  const host = target.split(":")[0];
  return [
    "CONNECTED(00000005)",
    "depth=2 C = US, O = DigiCert Inc, CN = DigiCert Global Root CA",
    "verify return:1",
    `subject=CN = ${host}`,
    "issuer=C = US, O = Let's Encrypt, CN = R3",
    "---",
    "Cipher    : TLS_AES_256_GCM_SHA384",
    "Server certificate (compressed):",
    "  Validity: notBefore=Jan  1 00:00:00 2026 GMT, notAfter=Apr 1 00:00:00 2026 GMT",
    "SSL-Session:",
    "    Protocol  : TLSv1.3",
    "    Cipher    : TLS_AES_256_GCM_SHA384",
    "    Session-ID: 0123456789ABCDEF…",
    "---",
  ].join("\r\n");
}

function simWebHost(host) {
  const ip = fakeResolveWeb(host);
  return [
    `${host} has address ${ip}`,
    `${host} mail is handled by 10 ${(FAKE_WEB_DNS[host] && FAKE_WEB_DNS[host].mx) || `mail.${host}`}.`,
  ].join("\r\n");
}

function simWebDig(args, host) {
  const wants = (() => {
    const t = args.indexOf("-t");
    if (t !== -1 && args[t + 1]) return args[t + 1].toUpperCase();
    const explicit = args.find(a => /^(MX|NS|TXT|AAAA|SOA|CNAME|A)$/i.test(a));
    return explicit ? explicit.toUpperCase() : "A";
  })();
  const ip = fakeResolveWeb(host);
  const mx = (FAKE_WEB_DNS[host] && FAKE_WEB_DNS[host].mx) || `mail.${host}`;
  const ns = (FAKE_WEB_DNS[host] && FAKE_WEB_DNS[host].ns) || `a.iana-servers.net`;
  let answer;
  switch (wants) {
    case "MX":  answer = `${host}.\t300\tIN\tMX\t10 ${mx}.`; break;
    case "NS":  answer = `${host}.\t172800\tIN\tNS\t${ns}.`; break;
    case "TXT": answer = `${host}.\t300\tIN\tTXT\t"v=spf1 -all"`; break;
    default:    answer = `${host}.\t300\tIN\tA\t${ip}`;
  }
  return [
    `; <<>> DiG 9.18 <<>> ${args.join(" ")}`,
    ";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345",
    "",
    ";; QUESTION SECTION:",
    `;${host}.\t\tIN\t${wants}`,
    "",
    ";; ANSWER SECTION:",
    answer,
    "",
    ";; Query time: 11 msec",
    ";; SERVER: 1.1.1.1#53(1.1.1.1) (UDP)",
  ].join("\r\n");
}

function simWebWhois(host) {
  return [
    `Domain Name: ${host.toUpperCase()}`,
    "Registry Domain ID: 12345_DOMAIN_COM-VRSN",
    "Registrar: Example Registrar, Inc.",
    "Creation Date: 2004-04-01T00:00:00Z",
    "Registry Expiry Date: 2027-04-01T00:00:00Z",
    "Registrar URL: https://example-registrar.com",
    "Name Server: a.iana-servers.net",
    "Name Server: b.iana-servers.net",
    "DNSSEC: signedDelegation",
  ].join("\r\n");
}

function simWebHttpServer(args) {
  const port = (args.find(a => /^\d+$/.test(a))) || "8000";
  return `Serving HTTP on 0.0.0.0 port ${port} (http://0.0.0.0:${port}/) ...`;
}

/* ---------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------- */
async function bootWebLab() {
  // 1. Load the student's real progress (server when logged in, tab-scoped
  //    session when a guest). Never let one user's progress bleed into
  //    another's session.
  try {
    await loadWebProgressFromServerOrSession();
  } catch (e) {
    console.warn("[web-lab] progress load failed, continuing:", e);
    webProgress.completed = new Set();
    webProgress.totalXP = 0;
  }

  // 2. Paint the sticky course XP bar with the real numbers.
  try { refreshWebCourseXP(); } catch (e) { /* non-fatal */ }
  // 2b. Apply chapter locks based on what the student has finished so far.
  try { refreshWebChapterLocks(); } catch (e) { /* non-fatal */ }

  // 3. Build every chapter's task list + terminal mount point. Each chapter
  //    is rendered independently so one bad mount can't break the others.
  //    The terminal is created lazily — only when the student clicks Start
  //    — so we don't open 9 PTYs at once and exhaust the container PID limit.
  const liveTerminals = [];
  document.querySelectorAll(".chapter-lab[data-chapter]").forEach(mount => {
    try {
      const info = renderWebChapterLab(mount);
      const xtermHost = info.termWrap.querySelector("[data-xterm]");
      const statusEl  = info.termWrap.querySelector("[data-status]");
      const startBtn  = info.termWrap.querySelector("[data-start-terminal]");
      const terminal  = new WebChapterTerminal(info.chapter, xtermHost, statusEl);
      liveTerminals.push(terminal);
      if (startBtn) {
        startBtn.addEventListener("click", () => {
          startBtn.remove();
          terminal.init();
        }, { once: true });
      }
    } catch (e) {
      console.error("[web-lab] failed to render chapter",
        mount.getAttribute("data-chapter"), e);
    }
  });

  function shutdownAll() {
    for (const t of liveTerminals) {
      try { if (t.ws) t.ws.close(); } catch (e) { /* ignore */ }
      t.wsReady = false;
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") shutdownAll();
  });
  window.addEventListener("pagehide", shutdownAll);
  window.addEventListener("beforeunload", shutdownAll);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootWebLab);
} else {
  bootWebLab();
}

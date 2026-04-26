/* =============================================================================
 * network-lab.js — Network Fundamentals per-chapter terminals + scoring.
 * -----------------------------------------------------------------------------
 * * Finds every <div class="chapter-lab" data-chapter="N"> mount point.
 * * Builds a task checklist + an xterm terminal inside it.
 * * Opens a WebSocket to ws://localhost:5001/api/network-terminal per chapter
 * (authed with the JWT in localStorage). Falls back to a client-side
 * simulator that produces realistic output AND scores against the same
 * task catalogue, so offline users still see XP appear.
 * * Listens for {type:"task-complete"} messages from the backend to tick
 * checklist items and animate +XP floaters.
 * * Persists guest progress in localStorage under "nf.progress".
 * =========================================================================== */
console.log("[network-lab.js] loaded");

const WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//localhost:5001/api/network-terminal`;
})();

/* ---------------------------------------------------------------------------
 * Task catalogue — MIRROR of backend/network_tasks.py. Keep these two in sync
 * when the regex or XP values change. The simulator uses these regexes to
 * score commands when the backend is unreachable.
 * ------------------------------------------------------------------------- */
// Every title is written for an absolute beginner. It says WHAT they are
// doing in plain English, then suggests the exact command they can try.
// The regex stays flexible so small variations still award the task.
const NETWORK_TASKS = {
  1: [
    { id: 101, xp: 10,
      title: "Check if the Internet is reachable — try: ping 1.1.1.1",
      match: /^ping(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+(1\.1\.1\.1|8\.8\.8\.8|9\.9\.9\.9)\b/i },
    { id: 102, xp: 10,
      title: "Check a website by name — try: ping example.com",
      match: /^ping(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+[a-z0-9][a-z0-9.-]*\.(com|bh|net|org|edu)\b/i },
    { id: 103, xp: 10,
      title: "Find your own IP address — try: ip a",
      match: /^(ifconfig(\s+-a)?|ip\s+(-\w+\s+)?a(ddr)?\b)/i },
    { id: 104, xp: 10,
      title: "Read the welcome file — try: cat README.txt",
      match: /^(cat|less|more)\s+README(\.txt)?\b/i },
  ],
  2: [
    { id: 201, xp: 15,
      title: "Watch a web request happen step by step — try: curl -v http://example.com",
      match: /^curl(\s+--?\w+)*\s+-v(\s+|$)/i },
    { id: 202, xp: 15,
      title: "See every hop your traffic passes through — try: traceroute example.com",
      match: /^(traceroute|tracepath|mtr)(\s+-\w+)*\s+\S+/i },
    { id: 203, xp: 10,
      title: "Peek at raw network packets — try: tcpdump",
      match: /^(sudo\s+)?tcpdump(\s+-[a-zA-Z0-9]+)*(\s+\S+)*$/i },
    { id: 204, xp: 10,
      title: "See the hardware addresses of nearby devices — try: arp -a",
      match: /^(arp\s+-a\b|ip\s+neigh(bour)?\b)/i },
  ],
  3: [
    { id: 301, xp: 10,
      title: "Find your IPv4 address — try: ip a",
      match: /^ip\s+(-4\s+)?a(ddr)?\b/i },
    { id: 302, xp: 10,
      title: "Find your IPv6 address — try: ip -6 a",
      match: /^ip\s+-6\s+a(ddr)?\b/i },
    { id: 303, xp: 15,
      title: "Calculate a subnet range — try: ipcalc 192.168.1.0/24",
      match: /^ipcalc\s+\S+\/\d+\b|^ipcalc\s+\S+\s+\S+/i },
    { id: 304, xp: 10,
      title: "Ping your own computer (loopback test) — try: ping 127.0.0.1",
      match: /^ping6?(\s+-[a-zA-Z0-9]+(\s+\S+)?)*\s+(127\.0\.0\.1|::1)\b/i },
  ],
  4: [
    { id: 401, xp: 15,
      title: "See which ports are open on your machine — try: ss -tulpn",
      match: /^(ss\s+-[a-zA-Z]*[lt][a-zA-Z]*|netstat\s+-[a-zA-Z]*l[a-zA-Z]*)/i },
    { id: 402, xp: 15,
      title: "Check if a port on a server is open — try: nc -zv example.com 80",
      match: /^(nc|ncat)\s+-\w*z\w*\w*\s+\S+\s+\d+/i },
    { id: 403, xp: 10,
      title: "Ask a web server for just its headers — try: curl -I example.com",
      match: /^curl(\s+--?\w+)*\s+(-I|--head)(\s+|$)/i },
    { id: 404, xp: 10,
      title: "Open an encrypted (TLS) connection — try: openssl s_client -connect example.com:443",
      match: /^openssl\s+s_client(\s+-\w+(\s+\S+)?)*\s+-connect\s+\S+:\d+/i },
  ],
  5: [
    { id: 501, xp: 15,
      title: "Look up a domain name (DNS uses UDP) — try: dig example.com",
      match: /^dig(\s+[+-]\w+(=\S+)?)*\s+\S+/i },
    { id: 502, xp: 15,
      title: "Download a web page (HTTP uses TCP) — try: curl https://example.com",
      match: /^curl(\s+--?\w+)*\s+https?:\/\/\S+/i },
    { id: 503, xp: 10,
      title: "See your computer's routing table — try: ip route",
      match: /^ip\s+(-\w+\s+)?r(oute)?\b/i },
    { id: 504, xp: 10,
      title: "See nearby devices (ARP cache) — try: arp -a",
      match: /^(arp\s+-a\b|ip\s+neigh(bour)?\b)/i },
  ],
  6: [
    { id: 601, xp: 15,
      title: "See the path to a public server — try: traceroute 1.1.1.1",
      match: /^(traceroute|tracepath)(\s+-\w+)*\s+\S+/i },
    { id: 602, xp: 10,
      title: "Show your routing table — try: ip route",
      match: /^ip\s+(-\w+\s+)?r(oute)?\b/i },
    { id: 603, xp: 10,
      title: "Find a nearby device's hardware (MAC) address — try: arp -a",
      match: /^(arp\s+-a\b|ip\s+neigh(bour)?\b)/i },
    { id: 604, xp: 15,
      title: "Run a live network path report — try: mtr example.com",
      match: /^mtr(\s+-\w+)*\s+\S+/i },
    // --- Topology-widget objectives ---------------------------------------
    // Awarded by the in-browser star-network builder, NOT by terminal
    // commands. Their regex is `/a^/` which can never match (anchor after
    // `a`), so they never fire from the simulator/PTY scorer; topology-lab.js
    // calls window.markTaskDone() with these IDs directly. They carry
    // `hidden: true` so the chapter-6 task panel skips them — they live
    // exclusively in the topology widget at the top of the lab to avoid
    // showing the same objective twice on the page.
    { id: 605, xp: 5,  hidden: true,
      title: "Topology: inspect any device to read its role",
      match: /a^/ },
    { id: 606, xp: 10, hidden: true,
      title: "Topology: send a successful LAN ping (PC1 → PC2)",
      match: /a^/ },
    { id: 607, xp: 10, hidden: true,
      title: "Topology: send a successful Internet ping (PC1 → Internet)",
      match: /a^/ },
    { id: 608, xp: 10, hidden: true,
      title: "Topology: observe a ping fail when a cable is broken",
      match: /a^/ },
    { id: 609, xp: 5,  hidden: true,
      title: "Topology: restore the cables and recover connectivity",
      match: /a^/ },
    { id: 610, xp: 10, hidden: true,
      title: "Topology: identify the number of broadcast domains",
      match: /a^/ },
  ],
  7: [
    { id: 701, xp: 10,
      title: "Visit a plain HTTP website — try: curl http://example.com",
      match: /^curl(\s+--?\w+)*\s+http:\/\/\S+/i },
    { id: 702, xp: 15,
      title: "Visit a secure HTTPS website — try: curl https://example.com",
      match: /^curl(\s+--?\w+)*\s+https:\/\/\S+/i },
    { id: 703, xp: 15,
      title: "Find a domain's mail servers — try: dig -t MX example.com",
      match: /^(dig\s+(-t\s+)?MX\s+\S+|nslookup\s+-type=MX\s+\S+|host\s+-t\s+MX\s+\S+)/i },
    { id: 704, xp: 10,
      title: "Look up who owns a domain — try: whois example.com",
      match: /^whois\s+\S+/i },
  ],
  8: [
    { id: 801, xp: 10,
      title: "Show your IP address — try: ip a",
      match: /^ip\s+(-\w+\s+)?a(ddr)?\b/i },
    { id: 802, xp: 10,
      title: "Show how your traffic is routed — try: ip route",
      match: /^ip\s+(-\w+\s+)?r(oute)?\b/i },
    { id: 803, xp: 10,
      title: "List listening ports on your machine — try: ss -tulpn",
      match: /^ss\s+-[a-zA-Z]*[lt][a-zA-Z]*/i },
    { id: 804, xp: 10,
      title: "Look up a domain name — try: nslookup example.com",
      match: /^(nslookup|dig|host)\s+\S+/i },
    { id: 805, xp: 10,
      title: "Ask a web server for just headers — try: curl -I example.com",
      match: /^curl(\s+--?\w+)*\s+(-I|--head)(\s+|$)/i },
  ],
  9: [
    { id: 901, xp: 10,
      title: "Show the current date and time — try: date",
      match: /^date(\s+.*)?$/i },
    { id: 902, xp: 15,
      title: "See which time servers your machine uses — try: ntpq -p",
      match: /^ntpq\s+-p\b/i },
    { id: 903, xp: 15,
      title: "Ask a public time server what time it is — try: ntpdate -q pool.ntp.org",
      match: /^(ntpdate\s+-q\s+\S+|sntp\s+(-\w+\s+)*\S+)/i },
    { id: 904, xp: 10,
      title: "Watch a secure connection be set up — try: curl -v https://example.com",
      match: /^curl(\s+--?\w+)*\s+-v(\s+|$)/i },
  ],
};

const TOTAL_XP = Object.values(NETWORK_TASKS)
  .flat()
  .reduce((s, t) => s + t.xp, 0);

function scoreLine(chapter, line) {
  const tasks = NETWORK_TASKS[chapter] || [];
  const s = (line || "").trim();
  if (!s) return null;
  for (const t of tasks) if (t.match.test(s)) return t;
  return null;
}

/* ---------------------------------------------------------------------------
 * Progress persistence — same pattern as the Linux course:
 *   * If the user is logged in (JWT token in localStorage) the *server* is
 *     the source of truth. We fetch /api/progress/network on boot and PUT
 *     it every time a task is awarded locally.
 *   * If they are not logged in we keep a per-tab `sessionStorage` record
 *     so that Ali signing in later never inherits another user's progress.
 *   * We also purge the older global `nf.progress` localStorage key on boot
 *     so stale values from a previous session never leak into a new login.
 * ------------------------------------------------------------------------- */
const GUEST_PROGRESS_KEY = "nf_guest_progress";

// NOTE: `getToken()` and `apiFetch()` are already defined in assets/js/app.js
// which is loaded *before* this file. We re-use those instead of redeclaring
// them — redeclaring a `const`/`function` in a second classic <script> throws
// a SyntaxError that would prevent this whole file from running.

// We still need the auth headers helper with the right shape. app.js exposes
// `authHeaders(token)` so we wrap it here for convenience.
function nfAuthHeaders() {
  return (typeof authHeaders === "function")
    ? authHeaders(getToken())
    : { "Content-Type": "application/json" };
}

// Live in-memory state. Populated in loadProgressFromServerOrSession() at boot.
const progress = { completed: new Set(), totalXP: 0 };

async function loadProgressFromServerOrSession() {
  // Always discard the stale global localStorage from the first version so
  // that "whoever opened the browser last" can't carry progress into a new
  // login. It stays in localStorage only for the duration of this migration.
  localStorage.removeItem("nf.progress");

  const token = getToken();
  if (token) {
    // Logged in — server is the single source of truth.
    const res = await apiFetch("/progress/network", { headers: nfAuthHeaders() });
    if (res.ok) {
      progress.completed = new Set(res.data.completedTasks || []);
      progress.totalXP = Number(res.data.totalXP || 0);
      // Clean the guest session value so logging out and back in as
      // another user starts clean.
      sessionStorage.removeItem(GUEST_PROGRESS_KEY);
      return;
    }
    // If the server is unreachable, fall through to the empty defaults
    // instead of reading someone else's cached data.
    progress.completed = new Set();
    progress.totalXP = 0;
    return;
  }

  // Guest — per-tab session storage only.
  try {
    const raw = JSON.parse(sessionStorage.getItem(GUEST_PROGRESS_KEY) || "{}");
    progress.completed = new Set(raw.completed || []);
    progress.totalXP = Number(raw.totalXP || 0);
  } catch (e) {
    progress.completed = new Set();
    progress.totalXP = 0;
  }
}

async function saveProgress() {
  const token = getToken();
  if (token) {
    // Persist to the server. The WebSocket scorer also persists on its own,
    // but the topology-lab widget calls markTaskDone() directly without any
    // WebSocket, so we need this PUT to keep the server in sync too.
    await apiFetch("/progress/network", {
      method: "PUT",
      headers: nfAuthHeaders(),
      body: JSON.stringify({ completedTasks: [...progress.completed] }),
    });
  } else {
    sessionStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify({
      completed: [...progress.completed],
      totalXP: progress.totalXP,
    }));
  }
}

function markTaskDone(task, opts) {
  opts = opts || {};
  const alreadyDone = progress.completed.has(task.id);
  progress.completed.add(task.id);
  progress.totalXP = Object.values(NETWORK_TASKS).flat()
    .filter(t => progress.completed.has(t.id))
    .reduce((s, t) => s + t.xp, 0);
  // Fire-and-forget save. It's a PUT to /api/progress/network when logged
  // in, or a sessionStorage write when a guest.
  saveProgress();

  const chapter = chapterOf(task.id);
  const li = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-list li[data-task-id="${task.id}"]`
  );
  if (li && !li.classList.contains("done")) {
    li.classList.add("done", "just-awarded");
    setTimeout(() => li.classList.remove("just-awarded"), 600);
    if (!opts.silent) floatXP(li, task.xp);
  }
  refreshChapterXP(chapter);
  refreshCourseXP();
  // Persistent XP notification — stays in the bottom-right corner long
  // enough for the student to actually read it, instead of the 1.4s
  // floater that flew off the screen.
  if (!opts.silent && !alreadyDone) showXpToast(task, chapter);
  // Re-evaluate chapter locks: finishing the last visible task in
  // chapter N might have just unlocked chapter N+1.
  refreshChapterLocks();
  return !alreadyDone;
}

/* --------------------------------------------------------------------------
 * Persistent XP toast notifications.
 * The student asked for the “XP notification to keep showing if the command
 * completes” — the old floater faded in 1.4s and was easy to miss. We now
 * stack readable toasts in a fixed corner that auto-dismiss after ~6 s and
 * can be closed manually.
 * ------------------------------------------------------------------------ */
function xpToastHost() {
  let host = document.getElementById("xpToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "xpToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function showXpToast(task, chapter) {
  const host = xpToastHost();
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
  // Auto-dismiss after 6s. Long enough to read, short enough that 4 awards
  // in a row don't bury the toast stack off-screen.
  setTimeout(dismiss, 6000);
}

/* --------------------------------------------------------------------------
 * Chapter locking.
 * Chapter N+1 stays disabled until every visible task in chapter N is
 * complete. Hidden tasks (e.g. the chapter-6 topology objectives) don't
 * count toward unlock so a student who refuses the topology widget can
 * still progress to chapter 7 by finishing the four chapter-6 commands.
 * ------------------------------------------------------------------------ */
function visibleTasksFor(chapter) {
  return (NETWORK_TASKS[chapter] || []).filter(t => !t.hidden);
}

function isChapterComplete(chapter) {
  const tasks = visibleTasksFor(chapter);
  if (!tasks.length) return false;
  return tasks.every(t => progress.completed.has(t.id));
}

function refreshChapterLocks() {
  // Chapter N is unlocked if N === 1 OR chapter N-1 is complete.
  for (let n = 1; n <= 9; n++) {
    const article = document.getElementById("m" + n);
    if (!article) continue;
    const unlocked = (n === 1) || isChapterComplete(n - 1);
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

function chapterOf(taskId) {
  for (const [ch, tasks] of Object.entries(NETWORK_TASKS)) {
    if (tasks.some(t => t.id === taskId)) return Number(ch);
  }
  return 0;
}

function floatXP(anchor, xp) {
  const rect = anchor.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "xp-floater";
  f.textContent = `${xp} XP`;
  f.style.left = `${rect.right - 60}px`;
  f.style.top = `${rect.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function refreshChapterXP(chapter) {
  const panel = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-xp`
  );
  if (!panel) return;
  // Only count tasks that the chapter panel actually shows. Hidden tasks
  // (e.g. the chapter-6 topology objectives) have their own dedicated
  // widget at the top of the lab and would otherwise be double-counted.
  const tasks = (NETWORK_TASKS[chapter] || []).filter(t => !t.hidden);
  const earned = tasks
    .filter(t => progress.completed.has(t.id))
    .reduce((s, t) => s + t.xp, 0);
  const total = tasks.reduce((s, t) => s + t.xp, 0);
  panel.textContent = `${earned} / ${total} XP`;
}

// Expose so other scripts (e.g. topology-lab.js) can award tasks too.
window.markTaskDone = markTaskDone;
window.NETWORK_TASKS = NETWORK_TASKS;

function refreshCourseXP() {
  const val = document.getElementById("courseXpValue");
  const fill = document.getElementById("courseXpFill");
  const done = document.getElementById("chaptersDone");
  if (val) val.textContent = `${progress.totalXP} / ${TOTAL_XP}`;
  if (fill) fill.style.width = `${Math.min(100, (progress.totalXP / TOTAL_XP) * 100)}%`;
  if (done) {
    let finished = 0;
    for (const tasks of Object.values(NETWORK_TASKS)) {
      // A chapter is "complete" when every visible task is done. Hidden
      // tasks (topology objectives) participate in the course XP total
      // but not in the chapters-complete tally, otherwise a chapter
      // would never tick complete unless the topology widget was used.
      const visible = tasks.filter(t => !t.hidden);
      if (visible.length && visible.every(t => progress.completed.has(t.id))) {
        finished += 1;
      }
    }
    done.textContent = String(finished);
  }
}

/* ---------------------------------------------------------------------------
 * DOM scaffolding per chapter.
 * ------------------------------------------------------------------------- */
function renderChapterLab(container) {
  const chapter = Number(container.getAttribute("data-chapter"));
  // Tasks marked `hidden` are awarded through a dedicated UI widget (e.g.
  // the chapter-6 topology builder) so we do NOT list them again in the
  // chapter checklist — that's exactly what was producing the duplicated
  // "same tasks repeat up and down" rows on the lab page.
  const tasks = (NETWORK_TASKS[chapter] || []).filter(t => !t.hidden);
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
    if (progress.completed.has(t.id)) li.classList.add("done");
    list.appendChild(li);
  });

  const termWrap = document.createElement("div");
  termWrap.className = "chapter-term-wrap";
  // The actual xterm + WebSocket are NOT created up-front. Doing so for all
  // 9 chapters at once means 9 simultaneous `docker exec -it /bin/bash -l`
  // PTYs in the same container, which blew past the container's
  // `--pids-limit` and produced the
  //   bash: fork: retry: Resource temporarily unavailable
  // error in the open chapter the student was trying to use. We render a
  // small "start" placeholder instead and only spin the terminal up when
  // the student clicks it.
  termWrap.innerHTML = `
    <div class="chapter-term-head">
      <div class="terminal-dot red"></div>
      <div class="terminal-dot yellow"></div>
      <div class="terminal-dot green"></div>
      <span class="terminal-title">Chapter ${chapter} · Docker networking sandbox</span>
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
        <span style="color:#7c8595; font-size:11px;">opens a fresh shell in the cyber-network container</span>
      </button>
    </div>
  `;

  grid.appendChild(panel);
  grid.appendChild(termWrap);
  container.appendChild(grid);
  existing.forEach(el => container.insertBefore(el, grid));

  refreshChapterXP(chapter);
  return { chapter, termWrap };
}

/* ---------------------------------------------------------------------------
 * Per-chapter terminal — xterm + WS backend with simulator fallback.
 * ------------------------------------------------------------------------- */
function ChapterTerminal(chapter, host, statusEl) {
  const self = this;
  this.chapter = chapter;
  this.host = host;
  this.statusEl = statusEl;
  this.term = null;
  this.fit = null;
  this.ws = null;
  this.wsReady = false;
  this.buffer = "";
  this.prompt = `\x1b[1;36mstudent@network-lab\x1b[0m:\x1b[1;34m~/chapter${chapter}\x1b[0m$ `;

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
        cursor: "#3caaff",
        cursorAccent: "#0a0a0d",
        selection: "rgba(60,170,255,0.25)",
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
      self.ws = new WebSocket(WS_URL);
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
        guestSessionId: guestId(),
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
    const tasks = NETWORK_TASKS[msg.chapter] || [];
    const task = tasks.find(t => t.id === msg.id)
              || { id: msg.id, xp: msg.xp, title: msg.title };
    const awarded = markTaskDone(task);
    if (awarded) {
      self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
    }
  };

  // ------------------- simulator (offline fallback) -------------------
  this.startSimulator = function () {
    // If the backend isn't running (for example the student opened the page
    // without starting the Flask server) we still want the chapter to work.
    // Below is a tiny fake shell: the commands give realistic output and
    // they still trigger the same XP as the real container would.
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
      const out = simExec(cmd);
      if (out === "__CLEAR__") self.term.clear();
      else if (out) self.term.writeln(out);
      const task = scoreLine(self.chapter, cmd);
      if (task) {
        const awarded = markTaskDone(task);
        if (awarded) self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
      }
    }
    self.term.write(self.prompt);
  };
}

function guestId() {
  let id = localStorage.getItem("nf_guest_id");
  if (!id) {
    id = "nf-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("nf_guest_id", id);
  }
  return id;
}

/* ---------------------------------------------------------------------------
 * Client-side networking simulator. Realistic mock output for when the
 * backend isn't running.
 * ------------------------------------------------------------------------- */
const FAKE_DNS = {
  "example.com": { a: "93.184.216.34", mx: null },
  // testphp.vulnweb.com is Acunetix's public, intentionally-vulnerable test
  // site. Safe to ping/curl/traceroute against from a learning context.
  "testphp.vulnweb.com": { a: "44.228.249.3", mx: null },
  "google.com": { a: "142.250.190.14", mx: "smtp.google.com" },
  "cloudflare.com": { a: "104.16.132.229", mx: null },
  "1.1.1.1": { a: "1.1.1.1", mx: null },
  "8.8.8.8": { a: "8.8.8.8", mx: null },
};

function fakeResolve(host) {
  if (!host) return "93.184.216.34";
  if (FAKE_DNS[host]) return FAKE_DNS[host].a;
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) & 0xffff;
  return `203.0.${(h >> 8) & 0xff}.${h & 0xff}`;
}

function simExec(raw) {
  const parts = raw.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const firstHost = args.find(a => !a.startsWith("-")) || "example.com";

  switch (cmd) {
    case "help":
      return [
        "\x1b[1;33mCommands in the local simulator\x1b[0m",
        " \x1b[36mping\x1b[0m host \x1b[36mtraceroute\x1b[0m host",
        " \x1b[36mip\x1b[0m {a|route} \x1b[36mss\x1b[0m -tulpn",
        " \x1b[36marp\x1b[0m -a \x1b[36mipcalc\x1b[0m net/mask",
        " \x1b[36mnslookup\x1b[0m host \x1b[36mdig\x1b[0m [-t T] host",
        " \x1b[36mcurl\x1b[0m -v/-I url \x1b[36mnc\x1b[0m -zv host port",
        " \x1b[36mopenssl s_client\x1b[0m -connect host:443",
        " \x1b[36mntpq\x1b[0m -p \x1b[36mntpdate\x1b[0m -q host",
        " \x1b[36mdate\x1b[0m, \x1b[36mclear\x1b[0m, \x1b[36mwhoami\x1b[0m, \x1b[36mcat README.txt\x1b[0m",
      ].join("\r\n");
    case "clear": return "__CLEAR__";
    case "date": return new Date().toUTCString();
    case "whoami": return "netstudent";
    case "pwd": return "/home/netstudent";
    case "ls": return "Documents README.txt captures notes topologies";
    case "cat":
    case "less":
    case "more":
      if (/README(\.txt)?/.test(args[0] || ""))
        return "Welcome to the Network Fundamentals sandbox.\r\nThis container is separate from the Linux course.\r\nType `help-net` for a cheat sheet.";
      return `${args[0] || ""}: No such file`;
    case "ping": return simPing(firstHost);
    case "ping6": return simPing(firstHost, true);
    case "traceroute":
    case "tracert":
    case "tracepath":
    case "mtr": return simTrace(firstHost);
    case "ifconfig":
    case "ipconfig":
      return simIfconfig();
    case "ip": return simIp(args);
    case "route": return simIp(["route"]);
    case "ss":
    case "netstat": return simNetstat();
    case "arp": return simArp();
    case "ipcalc": return simIpcalc(args);
    case "nslookup":return simNslookup(args, firstHost);
    case "dig": return simDig(args, firstHost);
    case "host": return simNslookup(args, firstHost);
    case "whois": return `Domain Name: ${firstHost.toUpperCase()}\r\nRegistrar: Example Registrar, Inc.\r\nCreation Date: 2004-04-01`;
    case "curl":
    case "wget": return simCurl(args);
    case "nc":
    case "ncat": return simNc(args);
    case "openssl": return simOpenssl(args);
    case "ntpq": return simNtpq();
    case "ntpdate": return simNtpdate(args);
    case "sntp": return simSntp(args);
    default:
      return `\x1b[31m${cmd}: command not found\x1b[0m \x1b[90m(type 'help')\x1b[0m`;
  }
}

function simPing(host, v6) {
  const ip = v6 && host === "::1" ? "::1" : fakeResolve(host);
  const out = [`PING ${host} (${ip}): 56 data bytes`];
  const times = [];
  for (let i = 0; i < 4; i++) {
    const t = (10 + Math.random() * 20).toFixed(3);
    times.push(+t);
    out.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=56 time=${t} ms`);
  }
  const min = Math.min.apply(null, times).toFixed(3);
  const max = Math.max.apply(null, times).toFixed(3);
  const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
  out.push("", `--- ${host} ping statistics ---`,
    `4 packets transmitted, 4 received, 0% packet loss`,
    `rtt min/avg/max = ${min}/${avg}/${max} ms`);
  return out.join("\r\n");
}

function simTrace(host) {
  const hops = [
    ["_gateway", "192.168.1.1"],
    ["isp-edge.bh", "10.50.0.1"],
    ["batelco-core.bh", "80.65.144.1"],
    ["ae-3.r01.jed01.sa.bb", "195.22.194.17"],
    [host, fakeResolve(host)],
  ];
  const out = [`traceroute to ${host} (${fakeResolve(host)}), 30 hops max`];
  hops.forEach((h, i) => {
    const t = (5 + i * 12 + Math.random() * 5).toFixed(2);
    out.push(` ${i + 1} ${h[0]} (${h[1]}) ${t} ms ${t} ms ${t} ms`);
  });
  return out.join("\r\n");
}

function simIfconfig() {
  return [
    "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST> mtu 1500",
    " inet 192.168.1.42 netmask 255.255.255.0 broadcast 192.168.1.255",
    " inet6 fe80::1c1b:5aff:fe0e:2a78 prefixlen 64 scopeid 0x20<link>",
    " ether 1c:1b:5a:0e:2a:78 txqueuelen 1000 (Ethernet)",
    "",
    "lo: flags=73<UP,LOOPBACK,RUNNING> mtu 65536",
    " inet 127.0.0.1 netmask 255.0.0.0",
    " inet6 ::1 prefixlen 128 scopeid 0x10<host>",
  ].join("\r\n");
}

function simIp(args) {
  const sub = (args[0] || "a");
  if (sub === "-6" || sub === "-4") return simIfconfig();
  if (sub.startsWith("a")) return simIfconfig();
  if (sub.startsWith("r")) return [
    "default via 192.168.1.1 dev eth0 proto dhcp metric 100",
    "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.42 metric 100"
  ].join("\r\n");
  if (sub === "neigh" || sub === "neighbour")
    return "192.168.1.1 dev eth0 lladdr 84:16:f9:2a:11:c4 REACHABLE";
  return "Usage: ip {a|route|neigh}";
}

function simNetstat() {
  return [
    "Proto Recv-Q Send-Q Local Address Foreign Address State",
    "tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN",
    "tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN",
    "tcp 0 0 0.0.0.0:443 0.0.0.0:* LISTEN",
    "udp 0 0 0.0.0.0:68 0.0.0.0:*",
    "udp 0 0 0.0.0.0:123 0.0.0.0:*",
  ].join("\r\n");
}

function simArp() {
  return [
    "Address HWtype HWaddress Iface",
    "192.168.1.1 ether 84:16:f9:2a:11:c4 eth0",
    "192.168.1.23 ether a4:83:e7:90:72:18 eth0",
  ].join("\r\n");
}

function simIpcalc(args) {
  const target = args[0] || "192.168.1.0/24";
  const [net, cidr] = target.split("/");
  const bits = Math.max(0, Math.min(32, Number(cidr || 24)));
  const hosts = bits >= 31 ? 0 : Math.pow(2, 32 - bits) - 2;
  return [
    `Address: ${net}`,
    `Netmask: 255.255.255.0 = ${bits}`,
    `Network: ${net}/${bits}`,
    `HostMin: ${net.replace(/\d+$/, "1")}`,
    `Hosts/Net: ${hosts}`,
  ].join("\r\n");
}

function simNslookup(args, host) {
  let type = "A";
  const typeArg = args.find(a => a.startsWith("-type=") || a === "-t");
  if (typeArg === "-t") {
    const idx = args.indexOf("-t");
    if (idx !== -1 && args[idx + 1]) type = args[idx + 1].toUpperCase();
  } else if (typeArg) {
    type = typeArg.split("=")[1].toUpperCase();
  }
  const ip = fakeResolve(host);
  const mx = (FAKE_DNS[host] && FAKE_DNS[host].mx) || `mail.${host}`;
  if (type === "MX") return `Server:\t\t192.168.1.1\r\nAddress:\t192.168.1.1#53\r\n\r\nNon-authoritative answer:\r\n${host}\tmail exchanger = 10 ${mx}.`;
  return `Server:\t\t192.168.1.1\r\nAddress:\t192.168.1.1#53\r\n\r\nNon-authoritative answer:\r\nName:\t${host}\r\nAddress: ${ip}`;
}

function simDig(args, host) {
  let type = "A";
  const t = args.indexOf("-t");
  if (t !== -1 && args[t + 1]) type = args[t + 1].toUpperCase();
  const ip = fakeResolve(host);
  const mx = (FAKE_DNS[host] && FAKE_DNS[host].mx) || `mail.${host}`;
  const answer = type === "MX"
    ? `${host}.\t300\tIN\tMX\t10 ${mx}.`
    : `${host}.\t300\tIN\tA\t${ip}`;
  return [
    `; <<>> DiG 9.18 <<>> ${args.join(" ")}`,
    ";; QUESTION SECTION:",
    `;${host}.\t\tIN\t${type}`,
    "",
    ";; ANSWER SECTION:",
    answer,
    "",
    ";; Query time: 12 msec",
    ";; SERVER: 192.168.1.1#53",
  ].join("\r\n");
}

function simCurl(args) {
  const url = args.find(a => /^https?:\/\//.test(a)) || "http://example.com";
  const verbose = args.includes("-v");
  const headOnly = args.includes("-I") || args.includes("--head");
  const isHttps = url.startsWith("https://");
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  const ip = fakeResolve(host);
  const lines = [];
  if (verbose) {
    lines.push(`* Trying ${ip}:${isHttps ? 443 : 80}...`);
    lines.push(`* Connected to ${host} (${ip})`);
    if (isHttps) {
      lines.push("* TLSv1.3 (OUT), TLS handshake, Client hello");
      lines.push("* TLSv1.3 (IN), TLS handshake, Server hello");
      lines.push(`* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384`);
    }
    lines.push(`> ${headOnly ? "HEAD" : "GET"} / HTTP/1.1`);
    lines.push(`> Host: ${host}`);
    lines.push(">");
  }
  lines.push("< HTTP/1.1 200 OK");
  lines.push(`< Server: ${isHttps ? "cloudflare" : "nginx/1.25.3"}`);
  lines.push("< Content-Type: text/html");
  lines.push("< Content-Length: 1270");
  lines.push("<");
  if (!headOnly) lines.push("<!doctype html><html><body><h1>It works!</h1></body></html>");
  return lines.join("\r\n");
}

function simNc(args) {
  const host = args.find(a => !a.startsWith("-")) || "example.com";
  const port = args[args.length - 1];
  return `Connection to ${host} ${port} port [tcp/*] succeeded!`;
}

function simOpenssl(args) {
  if (args[0] !== "s_client") return "usage: openssl s_client -connect host:port";
  const c = args.indexOf("-connect");
  const target = (c !== -1 && args[c + 1]) || "example.com:443";
  return [
    "CONNECTED(00000005)",
    "depth=2 C = US, O = DigiCert Inc, CN = DigiCert Global Root CA",
    `subject=CN = ${target.split(":")[0]}`,
    "issuer=C = US, O = Let's Encrypt, CN = R3",
    "Cipher : TLS_AES_256_GCM_SHA384",
    "SSL-Session: Protocol: TLSv1.3",
  ].join("\r\n");
}

function simNtpq() {
  return [
    " remote refid st t when poll reach delay offset jitter",
    "==============================================================================",
    "*time.cloudflare 10.10.0.1 2 u 34 64 377 2.341 -0.712 0.184",
    "+time.google.com .GOOG. 1 u 28 64 377 8.124 +0.203 0.412",
    "-pool.ntp.org 198.55.111.50 2 u 45 64 377 14.908 +1.887 1.023",
  ].join("\r\n");
}

function simNtpdate(args) {
  const host = args[args.length - 1] || "pool.ntp.org";
  return `server ${host}, stratum 2, offset -0.124, delay 0.02641\r\nadjust time server ${fakeResolve(host)} offset -0.124 sec`;
}

function simSntp(args) {
  const host = args[args.length - 1] || "time.apple.com";
  const offset = (Math.random() * 0.2 - 0.1).toFixed(3);
  return `${offset} +/- 0.012 ${host} (stratum 2)`;
}

/* ---------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------- */
async function bootNetworkLab() {
  // 1. Load the student's real progress (server when logged in, tab-scoped
  //    session when a guest). This makes sure Ali logging in sees Ali's
  //    progress, not the progress of whoever last used this browser.
  //
  //    We wrap this in try/catch because ABSOLUTELY NOTHING should be
  //    allowed to block the chapter terminals from rendering. Even if the
  //    server is down or returns garbage, the page must still show the
  //    terminal + task checklist under every chapter.
  try {
    await loadProgressFromServerOrSession();
  } catch (e) {
    console.warn("[network-lab] progress load failed, continuing:", e);
    progress.completed = new Set();
    progress.totalXP = 0;
  }

  // 2. Paint the sticky course XP bar with the real numbers.
  try { refreshCourseXP(); } catch (e) { /* non-fatal */ }
  // 2b. Apply chapter locks based on what the student has finished so far.
  //     Re-runs every time markTaskDone() awards a new task.
  try { refreshChapterLocks(); } catch (e) { /* non-fatal */ }

  // 3. Build every chapter's task list + terminal mount point. Each chapter
  //    is rendered independently so one bad mount can't break the others.
  //    The terminal is created lazily — see ChapterTerminal.startOnDemand
  //    — so we don't open 9 PTYs at once and exhaust the container PID limit.
  const liveTerminals = [];
  document.querySelectorAll(".chapter-lab[data-chapter]").forEach(mount => {
    try {
      const info = renderChapterLab(mount);
      const xtermHost = info.termWrap.querySelector("[data-xterm]");
      const statusEl  = info.termWrap.querySelector("[data-status]");
      const startBtn  = info.termWrap.querySelector("[data-start-terminal]");
      const terminal  = new ChapterTerminal(info.chapter, xtermHost, statusEl);
      liveTerminals.push(terminal);
      if (startBtn) {
        startBtn.addEventListener("click", () => {
          startBtn.remove();
          terminal.init();
        }, { once: true });
      }
    } catch (e) {
      console.error("[network-lab] failed to render chapter",
        mount.getAttribute("data-chapter"), e);
    }
  });

  // When the tab goes into the background (or the user navigates away)
  // close every live WebSocket so the backend can free its PTY + docker
  // exec processes. Without this, opening + abandoning multiple chapters
  // piles up `docker exec` processes in the cyber-network container until
  // bash inside the active chapter starts failing with
  //   bash: fork: retry: Resource temporarily unavailable
  // The user gets the terminal back instantly when they return to the tab
  // — they just have to click “Start” again on the chapter they want.
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
  document.addEventListener("DOMContentLoaded", bootNetworkLab);
} else {
  bootNetworkLab();
}

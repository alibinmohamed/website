/* =============================================================================
 * crypto-lab.js \u2014 Cryptography per-chapter terminals + scoring.
 * -----------------------------------------------------------------------------
 * Same pattern as network-lab.js / web-lab.js but pointed at the
 * /api/crypto-terminal WebSocket and the cyber-crypto Docker image.
 *
 * IMPORTANT: every top-level identifier is suffixed `_LAB_` or prefixed
 * `cry`/`CRY_` so it can never collide with the CRYPTO_TOTAL_* constants
 * declared by app.js (we hit exactly that bug in the Web course earlier:
 * a duplicate `const` killed the whole file in the browser).
 * =========================================================================== */
console.log("[crypto-lab.js] loaded");

const CRYPTO_LAB_WS_URL = (() => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//localhost:5001/api/crypto-terminal`;
})();

/* Mirror of backend/crypto_tasks.py. Keep these in sync.
 * The simulator uses these regexes to score commands offline. */
const CRYPTO_LAB_TASKS = {
  1: [
    { id: 3101, xp: 10, title: "Read the welcome file \u2014 try: cat README.txt",
      match: /^(cat|less|more)\s+README(\.txt)?\b/i },
    { id: 3102, xp: 10, title: "Check your toolkit \u2014 try: openssl version",
      match: /^openssl\s+version\b/i },
    { id: 3103, xp: 10, title: "Encode a string with base64 \u2014 try: echo 'secret' | openssl base64",
      match: /\|\s*(openssl\s+base64|base64)(\s+|$)/i },
    { id: 3104, xp: 10, title: "Decode the base64 \u2014 try: echo 'c2VjcmV0' | openssl base64 -d",
      match: /\|\s*(openssl\s+base64|base64)\s+-d\b/i },
  ],
  2: [
    { id: 3201, xp: 12, title: "ROT13 \u2014 try: echo HELLO | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
      match: /\btr\s+['"]?[A-Za-z\-]+['"]?\s+['"]?N-ZA-M/i },
    { id: 3202, xp: 12, title: "Caesar shift 3 \u2014 try: echo HELLO | tr 'A-Za-z' 'D-ZA-Cd-za-c'",
      match: /\btr\s+['"]?[A-Za-z\-]+['"]?\s+['"]?D-ZA-C/i },
    { id: 3203, xp: 12, title: "Atbash \u2014 try: echo HELLO | tr 'A-Za-z' 'Z-Az-a'",
      match: /\btr\s+['"]?[Aa]-[Zz][A-Za-z\-]*['"]?\s+['"]?Z-A/i },
    { id: 3204, xp: 12, title: "Frequency-count the letters \u2014 try: cat ciphertext.txt | grep -o . | sort | uniq -c | sort -rn",
      match: /\bsort\b.*\buniq\s+-c\b|\buniq\s+-c\b.*\bsort\b/i },
  ],
  3: [
    { id: 3301, xp: 10, title: "Read the Vigen\u00e8re notes \u2014 try: cat vigenere.md",
      match: /^(cat|less|more)\s+\S*vigenere(\.md|\.txt)?\b/i },
    { id: 3302, xp: 15, title: "Encrypt with Vigen\u00e8re \u2014 try: vig encrypt KEY HELLOWORLD",
      match: /\bvig\s+encrypt\s+\S+\s+\S+/i },
    { id: 3303, xp: 15, title: "Decrypt with Vigen\u00e8re \u2014 try: vig decrypt KEY RIJVSUYVJN",
      match: /\bvig\s+decrypt\s+\S+\s+\S+/i },
    { id: 3304, xp: 10, title: "Try a wrong key \u2014 try: vig decrypt WRONG RIJVSUYVJN",
      match: /\bvig\s+(encrypt|decrypt)\s+\S+\s+\S+/i },
  ],
  4: [
    { id: 3401, xp: 15, title: "Encrypt with AES-256 \u2014 try: openssl enc -aes-256-cbc -pbkdf2 -in plaintext.txt -out cipher.bin -k secret",
      match: /\bopenssl\s+enc\b.*-aes-(128|192|256)/i },
    { id: 3402, xp: 15, title: "Decrypt your file \u2014 try: openssl enc -aes-256-cbc -d -pbkdf2 -in cipher.bin -out recovered.txt -k secret",
      match: /\bopenssl\s+enc\b(?=.*-d\b)(?=.*-aes-(128|192|256))/i },
    { id: 3403, xp: 10, title: "View ciphertext as hex \u2014 try: xxd cipher.bin | head",
      match: /\bxxd\b/i },
    { id: 3404, xp: 10, title: "Try the legacy DES \u2014 try: openssl enc -des-cbc -pbkdf2 -in plaintext.txt -out des.bin -k secret",
      match: /\bopenssl\s+enc\b.*-des(-cbc|-ecb)?\b/i },
  ],
  5: [
    { id: 3501, xp: 15, title: "BAD ECB mode (to see why) \u2014 try: openssl enc -aes-256-ecb -pbkdf2 -in plaintext.txt -out ecb.bin -k secret",
      match: /\bopenssl\s+enc\b.*-aes-(128|192|256)-ecb/i },
    { id: 3502, xp: 15, title: "Same file with CBC \u2014 try: openssl enc -aes-256-cbc -pbkdf2 -in plaintext.txt -out cbc.bin -k secret",
      match: /\bopenssl\s+enc\b.*-aes-(128|192|256)-cbc/i },
    { id: 3503, xp: 10, title: "Compare the two outputs \u2014 try: cmp ecb.bin cbc.bin || echo different",
      match: /\b(cmp|diff)\s+\S+\s+\S+/i },
    { id: 3504, xp: 10, title: "Read about modes \u2014 try: cat modes.md",
      match: /^(cat|less|more)\s+\S*modes(\.md|\.txt)?\b/i },
  ],
  6: [
    { id: 3601, xp: 10, title: "MD5 (broken!) \u2014 try: echo -n hello | openssl dgst -md5",
      match: /\bdgst\s+(-\w+\s+)*-md5\b|-md5\b.*\bdgst\b/i },
    { id: 3602, xp: 15, title: "Modern SHA-256 \u2014 try: echo -n hello | openssl dgst -sha256",
      match: /\bdgst\s+(-\w+\s+)*-sha(256|384|512|3-256)\b|\b(sha256sum|shasum\s+-a\s+256)\b/i },
    { id: 3603, xp: 10, title: "Hash a whole file \u2014 try: openssl dgst -sha256 plaintext.txt",
      match: /\bopenssl\s+dgst\s+(-\w+\s+)*-sha(256|384|512)\s+\S+/i },
    { id: 3604, xp: 15, title: "HMAC \u2014 try: echo -n data | openssl dgst -sha256 -hmac mysecretkey",
      match: /\bopenssl\s+dgst\b.*-hmac\s+\S+/i },
  ],
  7: [
    { id: 3701, xp: 15, title: "Generate RSA key \u2014 try: openssl genrsa -out private.pem 2048",
      match: /\bopenssl\s+genrsa\b/i },
    { id: 3702, xp: 15, title: "Extract public key \u2014 try: openssl rsa -in private.pem -pubout -out public.pem",
      match: /\bopenssl\s+rsa\b.*-pubout\b/i },
    { id: 3703, xp: 15, title: "Encrypt with public key \u2014 try: openssl pkeyutl -encrypt -pubin -inkey public.pem -in plaintext.txt -out enc.bin",
      match: /\bopenssl\s+pkeyutl\b.*-encrypt\b/i },
    { id: 3704, xp: 15, title: "Decrypt with private key \u2014 try: openssl pkeyutl -decrypt -inkey private.pem -in enc.bin -out decrypted.txt",
      match: /\bopenssl\s+pkeyutl\b.*-decrypt\b/i },
  ],
  8: [
    { id: 3801, xp: 15, title: "Sign a file \u2014 try: openssl dgst -sha256 -sign private.pem -out sig.bin plaintext.txt",
      match: /\bopenssl\s+dgst\b.*-sign\b/i },
    { id: 3802, xp: 15, title: "Verify the signature \u2014 try: openssl dgst -sha256 -verify public.pem -signature sig.bin plaintext.txt",
      match: /\bopenssl\s+dgst\b.*-verify\b/i },
    { id: 3803, xp: 15, title: "Self-signed cert \u2014 try: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 30 -nodes -subj /CN=test",
      match: /\bopenssl\s+req\b.*-x509\b/i },
    { id: 3804, xp: 10, title: "Inspect the cert \u2014 try: openssl x509 -in cert.pem -text -noout",
      match: /\bopenssl\s+x509\b.*-(text|subject|issuer|fingerprint)/i },
  ],
  9: [
    { id: 3901, xp: 10, title: "Inspect a real TLS cert \u2014 try: openssl s_client -connect example.com:443",
      match: /\bopenssl\s+s_client\b.*-connect\s+\S+:\d+/i },
    { id: 3902, xp: 10, title: "Verify a checksum \u2014 try: sha256sum plaintext.txt",
      match: /\b(sha256sum|sha1sum|md5sum|shasum)\s+\S+/i },
    { id: 3903, xp: 10, title: "Check gpg \u2014 try: gpg --version",
      match: /^gpg\s+(--version|--list-keys|--help)\b/i },
    { id: 3904, xp: 10, title: "Generate random bytes \u2014 try: openssl rand -hex 16",
      match: /\bopenssl\s+rand\b/i },
  ],
};

const CRYPTO_LAB_TOTAL = Object.values(CRYPTO_LAB_TASKS).flat()
  .reduce((s, t) => s + t.xp, 0);

function cryScoreLine(chapter, line) {
  const tasks = CRYPTO_LAB_TASKS[chapter] || [];
  const s = (line || "").trim();
  if (!s) return null;
  for (const t of tasks) if (t.match.test(s)) return t;
  return null;
}

/* ---------------------------------------------------------------------------
 * Progress: server is the source of truth when logged in; sessionStorage
 * for guests, scoped to the tab so cross-account bleed never happens.
 * ------------------------------------------------------------------------- */
const CRY_GUEST_KEY = "crypto_guest_progress";

function cryAuthHeaders() {
  return (typeof authHeaders === "function")
    ? authHeaders(getToken())
    : { "Content-Type": "application/json" };
}

const cryProgress = { completed: new Set(), totalXP: 0 };

async function cryLoadProgress() {
  localStorage.removeItem("crypto.progress");
  const token = getToken();
  if (token) {
    const res = await apiFetch("/progress/crypto", { headers: cryAuthHeaders() });
    if (res.ok) {
      cryProgress.completed = new Set(res.data.completedTasks || []);
      cryProgress.totalXP = Number(res.data.totalXP || 0);
      sessionStorage.removeItem(CRY_GUEST_KEY);
      return;
    }
    cryProgress.completed = new Set();
    cryProgress.totalXP = 0;
    return;
  }
  try {
    const raw = JSON.parse(sessionStorage.getItem(CRY_GUEST_KEY) || "{}");
    cryProgress.completed = new Set(raw.completed || []);
    cryProgress.totalXP = Number(raw.totalXP || 0);
  } catch (e) {
    cryProgress.completed = new Set();
    cryProgress.totalXP = 0;
  }
}

async function crySaveProgress() {
  const token = getToken();
  if (token) {
    await apiFetch("/progress/crypto", {
      method: "PUT",
      headers: cryAuthHeaders(),
      body: JSON.stringify({ completedTasks: [...cryProgress.completed] }),
    });
  } else {
    sessionStorage.setItem(CRY_GUEST_KEY, JSON.stringify({
      completed: [...cryProgress.completed],
      totalXP: cryProgress.totalXP,
    }));
  }
}

function cryMarkDone(task, opts) {
  opts = opts || {};
  const already = cryProgress.completed.has(task.id);
  cryProgress.completed.add(task.id);
  cryProgress.totalXP = Object.values(CRYPTO_LAB_TASKS).flat()
    .filter(t => cryProgress.completed.has(t.id))
    .reduce((s, t) => s + t.xp, 0);
  crySaveProgress();

  const chapter = cryChapterOf(task.id);
  const li = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-list li[data-task-id="${task.id}"]`
  );
  if (li && !li.classList.contains("done")) {
    li.classList.add("done", "just-awarded");
    setTimeout(() => li.classList.remove("just-awarded"), 600);
    if (!opts.silent) cryFloat(li, task.xp);
  }
  cryRefreshChapter(chapter);
  cryRefreshCourse();
  if (!opts.silent && !already) cryToast(task, chapter);
  cryRefreshLocks();
  return !already;
}

function cryToastHost() {
  let host = document.getElementById("xpToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "xpToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function cryToast(task, chapter) {
  const host = cryToastHost();
  const t = document.createElement("div");
  t.className = "xp-toast";
  const safe = (s) => String(s || "").replace(/[<>&]/g,
    c => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
  t.innerHTML = `
    <div class="head">
      <span>+${task.xp} XP \u00b7 Chapter ${chapter || "?"}</span>
      <button type="button" class="close" aria-label="Dismiss">\u2715</button>
    </div>
    <div class="body">${safe(task.title)}</div>
  `;
  host.appendChild(t);
  const dismiss = () => { if (!t.isConnected) return; t.classList.add("fading"); setTimeout(() => t.remove(), 600); };
  t.querySelector(".close").addEventListener("click", dismiss);
  setTimeout(dismiss, 6000);
}

function cryFloat(anchor, xp) {
  const r = anchor.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "xp-floater";
  f.textContent = `${xp} XP`;
  f.style.left = `${r.right - 60}px`;
  f.style.top = `${r.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function cryChapterOf(taskId) {
  for (const [ch, tasks] of Object.entries(CRYPTO_LAB_TASKS)) {
    if (tasks.some(t => t.id === taskId)) return Number(ch);
  }
  return 0;
}

function cryIsChapterComplete(chapter) {
  const tasks = CRYPTO_LAB_TASKS[chapter] || [];
  if (!tasks.length) return false;
  return tasks.every(t => cryProgress.completed.has(t.id));
}

function cryRefreshLocks() {
  for (let n = 1; n <= 9; n++) {
    const article = document.getElementById("m" + n);
    if (!article) continue;
    const unlocked = (n === 1) || cryIsChapterComplete(n - 1);
    if (unlocked) {
      article.classList.remove("chapter-locked");
      const o = article.querySelector(".chapter-lock-overlay");
      if (o) o.remove();
    } else {
      article.classList.add("chapter-locked");
      let o = article.querySelector(".chapter-lock-overlay");
      if (!o) {
        o = document.createElement("div");
        o.className = "chapter-lock-overlay";
        o.innerHTML = `
          <div class="chapter-lock-card">
            <div class="icon">\ud83d\udd12</div>
            <h4>Chapter ${n} is locked</h4>
            <p>Finish every objective in <strong>Chapter ${n - 1}</strong> first.</p>
          </div>`;
        article.appendChild(o);
      }
    }
  }
}

function cryRefreshChapter(chapter) {
  const panel = document.querySelector(
    `.chapter-lab[data-chapter="${chapter}"] .task-xp`
  );
  if (!panel) return;
  const tasks = CRYPTO_LAB_TASKS[chapter] || [];
  const earned = tasks.filter(t => cryProgress.completed.has(t.id))
                      .reduce((s, t) => s + t.xp, 0);
  const total = tasks.reduce((s, t) => s + t.xp, 0);
  panel.textContent = `${earned} / ${total} XP`;
}

function cryRefreshCourse() {
  const val = document.getElementById("courseXpValue");
  const fill = document.getElementById("courseXpFill");
  const done = document.getElementById("chaptersDone");
  if (val) val.textContent = `${cryProgress.totalXP} / ${CRYPTO_LAB_TOTAL}`;
  if (fill) fill.style.width = `${Math.min(100, (cryProgress.totalXP / CRYPTO_LAB_TOTAL) * 100)}%`;
  if (done) {
    let finished = 0;
    for (const tasks of Object.values(CRYPTO_LAB_TASKS)) {
      if (tasks.every(t => cryProgress.completed.has(t.id))) finished++;
    }
    done.textContent = String(finished);
  }
}

window.cryMarkDone = cryMarkDone;
window.CRYPTO_LAB_TASKS = CRYPTO_LAB_TASKS;

/* ---------------------------------------------------------------------------
 * Per-chapter terminal scaffolding
 * ------------------------------------------------------------------------- */
function cryRenderChapter(container) {
  const chapter = Number(container.getAttribute("data-chapter"));
  const tasks = CRYPTO_LAB_TASKS[chapter] || [];
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
    if (cryProgress.completed.has(t.id)) li.classList.add("done");
    list.appendChild(li);
  });

  const termWrap = document.createElement("div");
  termWrap.className = "chapter-term-wrap";
  termWrap.innerHTML = `
    <div class="chapter-term-head">
      <div class="terminal-dot red"></div>
      <div class="terminal-dot yellow"></div>
      <div class="terminal-dot green"></div>
      <span class="terminal-title">Chapter ${chapter} \u00b7 Docker crypto sandbox</span>
      <span class="terminal-status offline" data-status>idle</span>
    </div>
    <div class="chapter-terminal" data-xterm>
      <button type="button" class="chapter-term-start" data-start-terminal
              style="display:flex; flex-direction:column; align-items:center;
                     justify-content:center; gap:6px; width:100%; height:100%;
                     min-height:260px; background:transparent; border:1px dashed #2a2f3a;
                     border-radius:8px; color:#b9c2cf; cursor:pointer;
                     font-family:'Menlo','Courier New',monospace; font-size:13px;">
        <span style="font-size:24px; line-height:1;">\u25b6</span>
        <span>Start the Chapter ${chapter} sandbox terminal</span>
        <span style="color:#7c8595; font-size:11px;">opens a fresh shell in the cyber-crypto container</span>
      </button>
    </div>
  `;
  grid.appendChild(panel);
  grid.appendChild(termWrap);
  container.appendChild(grid);

  cryRefreshChapter(chapter);
  return { chapter, termWrap };
}

/* ---------------------------------------------------------------------------
 * Per-chapter terminal driver
 * ------------------------------------------------------------------------- */
function CryTerminal(chapter, host, statusEl) {
  const self = this;
  this.chapter = chapter;
  this.host = host;
  this.statusEl = statusEl;
  this.term = null; this.fit = null;
  this.ws = null; this.wsReady = false;
  this.buffer = "";
  this.prompt = `\x1b[1;33mstudent@crypto-lab\x1b[0m:\x1b[1;34m~/chapter${chapter}\x1b[0m$ `;

  this.setStatus = function (text, ok) {
    if (!self.statusEl) return;
    self.statusEl.textContent = text;
    self.statusEl.classList.toggle("offline", !ok);
  };

  this.init = function () {
    if (typeof Terminal === "undefined") return;
    self.term = new Terminal({
      cursorBlink: true, fontSize: 12.5,
      fontFamily: "'Menlo', 'Courier New', 'Lucida Console', monospace",
      theme: {
        background: "#0a0a0d", foreground: "#e8e8e8",
        cursor: "#ffbd2e", cursorAccent: "#0a0a0d",
        selection: "rgba(255,189,46,0.25)",
        green: "#27c93f", yellow: "#ffbd2e", red: "#ff5f56",
      },
      scrollback: 3000, convertEol: false,
    });
    if (typeof FitAddon !== "undefined") {
      self.fit = new FitAddon.FitAddon();
      self.term.loadAddon(self.fit);
    }
    self.term.open(self.host);
    if (self.fit) { try { self.fit.fit(); } catch (e) {} }
    self.term.onData(self.onData);
    window.addEventListener("resize", () => {
      if (self.fit) { try { self.fit.fit(); } catch (e) {} }
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
    self.setStatus("connecting\u2026", false);
    let opened = false;
    try { self.ws = new WebSocket(CRYPTO_LAB_WS_URL); }
    catch (e) { self.startSimulator(); return; }

    self.ws.onopen = function () {
      opened = true; self.wsReady = true;
      self.setStatus("connected \u00b7 docker", true);
      const token = localStorage.getItem("token") || "";
      self.ws.send(JSON.stringify({
        type: "auth", token, chapter: self.chapter,
        guestSessionId: cryGuestId(),
      }));
      self.sendResize();
      self.term.writeln(`Connected to the Chapter ${self.chapter} sandbox.`);
    };

    self.ws.onmessage = function (evt) {
      const raw = evt.data;
      if (typeof raw === "string" && raw.length > 0 && raw.charCodeAt(0) === 123) {
        try {
          const msg = JSON.parse(raw);
          if (msg && msg.type === "task-complete") { self.handleTaskComplete(msg); return; }
          if (msg && msg.type === "ready") return;
        } catch (e) {}
      }
      self.term.write(raw);
    };

    self.ws.onerror = function () {
      if (!opened) { self.wsReady = false; self.ws = null; self.startSimulator(); }
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
        try { self.ws && self.ws.close(); } catch (e) {}
        self.ws = null;
        if (!self.wsReady) self.startSimulator();
      }
    }, 1500);
  };

  this.sendResize = function () {
    if (self.wsReady && self.ws && self.term) {
      self.ws.send(JSON.stringify({ type: "resize", rows: self.term.rows, cols: self.term.cols }));
    }
  };

  this.handleTaskComplete = function (msg) {
    const tasks = CRYPTO_LAB_TASKS[msg.chapter] || [];
    const task = tasks.find(t => t.id === msg.id) || { id: msg.id, xp: msg.xp, title: msg.title };
    const awarded = cryMarkDone(task);
    if (awarded) self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
  };

  this.startSimulator = function () {
    self.setStatus("simulator", false);
    self.term.writeln("Running in practice mode (no server needed).");
    self.term.writeln("\x1b[90m  You can type commands here and earn XP just like in the real sandbox.\x1b[0m");
    self.term.writeln("\x1b[90m  Type `help` to see what's available.\x1b[0m\r\n");
    self.term.write(self.prompt);
  };

  this.simInput = function (data) {
    const code = data.charCodeAt(0);
    if (code === 13) { self.simRun(); return; }
    if (code === 127) {
      if (self.buffer.length > 0) { self.buffer = self.buffer.slice(0, -1); self.term.write("\b \b"); }
      return;
    }
    if (data === "\x03") { self.buffer = ""; self.term.write("^C\r\n" + self.prompt); return; }
    if (code >= 32 && code <= 126) { self.buffer += data; self.term.write(data); }
  };

  this.simRun = function () {
    self.term.writeln("");
    const cmd = self.buffer.trim();
    self.buffer = "";
    if (cmd) {
      const out = crySimExec(cmd);
      if (out === "__CLEAR__") self.term.clear();
      else if (out) self.term.writeln(out);
      const task = cryScoreLine(self.chapter, cmd);
      if (task) {
        const awarded = cryMarkDone(task);
        if (awarded) self.term.writeln(`\x1b[32m[+] Task complete: ${task.title} (${task.xp} XP)\x1b[0m`);
      }
    }
    self.term.write(self.prompt);
  };
}

function cryGuestId() {
  let id = localStorage.getItem("crypto_guest_id");
  if (!id) {
    id = "cry-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("crypto_guest_id", id);
  }
  return id;
}

/* ---------------------------------------------------------------------------
 * Tiny offline simulator. Just enough to make every lab command produce
 * believable output so the student can practise without the backend.
 * ------------------------------------------------------------------------- */
function crySimExec(raw) {
  const parts = raw.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  switch (cmd) {
    case "help":
      return "Try: cat README.txt, openssl version, openssl rand -hex 16, vig encrypt KEY HELLO";
    case "clear":  return "__CLEAR__";
    case "whoami": return "cryptostudent";
    case "pwd":    return "/home/cryptostudent";
    case "ls":     return "Documents README.txt ciphers ciphertext.txt modes.md notes plaintext.txt vigenere.md";
    case "cat":
    case "less":
    case "more": {
      const f = args[0] || "";
      if (/README/.test(f))    return "Welcome to the Cryptography sandbox. Type help-crypto for a cheat sheet.";
      if (/vigenere/.test(f))  return "# Vigenere cipher\nKEY repeats; each letter shifts by its keyword position.";
      if (/modes/.test(f))     return "# Modes\n* ECB \u2014 patterns leak\n* CBC \u2014 chained\n* GCM \u2014 authenticated";
      if (/plaintext/.test(f)) return "The quick brown fox jumps over the lazy dog.";
      if (/ciphertext/.test(f))return "Wkh txlfn eurzq ira mxpsv ryhu wkh odcb grj.";
      return `${f}: No such file`;
    }
    case "echo":   return args.join(" ").replace(/^['"]|['"]$/g, "");
    case "tr":     return "(simulated tr output \u2014 in the real container the bytes are translated)";
    case "openssl": {
      const sub = args[0];
      if (sub === "version") return "OpenSSL 3.0.13  (simulated)";
      if (sub === "base64")  return args.includes("-d") ? "secret" : "c2VjcmV0";
      if (sub === "rand")    return "a3f1c8e5 7d2b4f6e a9c0d1e2 3b4c5d6e";
      if (sub === "dgst")    return "(stdin)= 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
      if (sub === "enc")     return "(simulated AES output \u2014 in the real container a binary file would be written)";
      if (sub === "genrsa")  return "Generating RSA private key, 2048 bit long modulus.\nwriting new private key";
      if (sub === "rsa")     return "writing RSA key";
      if (sub === "pkeyutl") return "(simulated RSA pkeyutl output)";
      if (sub === "req")     return "writing new certificate to cert.pem";
      if (sub === "x509")    return "subject=CN = test\nissuer=CN = test\nSerial Number: 12:34:56:78";
      if (sub === "s_client")return "CONNECTED(00000005)\nsubject=CN=example.com\nissuer=CN=DigiCert";
      return `(simulated openssl ${args.join(" ")})`;
    }
    case "vig": {
      if (args[0] === "encrypt") return cryVig(args[2] || "", args[1] || "KEY", true);
      if (args[0] === "decrypt") return cryVig(args[2] || "", args[1] || "KEY", false);
      return "usage: vig encrypt|decrypt KEY TEXT";
    }
    case "xxd":      return "00000000: 5468 6520 7175 6963 6b20 6272 6f77 6e20  The quick brown ";
    case "cmp":      return "ecb.bin cbc.bin differ: byte 1, line 1";
    case "diff":     return "Binary files differ";
    case "sha256sum":
    case "sha1sum":
    case "md5sum":   return "(simulated) 2cf24dba5fb0a30e26e83b2ac5b9e29e  -";
    case "gpg":      return args.includes("--version") ? "gpg (GnuPG) 2.2.27 (simulated)" : "(gpg)";
    case "date":     return new Date().toUTCString();
    default:         return `\x1b[31m${cmd}: command not found\x1b[0m \x1b[90m(type 'help')\x1b[0m`;
  }
}

function cryVig(text, key, encrypt) {
  const shifts = [];
  for (const k of key) {
    if (/[A-Za-z]/.test(k)) shifts.push((k.toUpperCase().charCodeAt(0) - 65));
  }
  if (!shifts.length) return text;
  let j = 0; let out = "";
  for (const c of text) {
    if (/[A-Za-z]/.test(c)) {
      const base = c >= "a" ? 97 : 65;
      let shift = shifts[j % shifts.length];
      if (!encrypt) shift = -shift;
      out += String.fromCharCode((c.charCodeAt(0) - base + shift + 26) % 26 + base);
      j++;
    } else {
      out += c;
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------- */
async function cryBoot() {
  try { await cryLoadProgress(); }
  catch (e) {
    console.warn("[crypto-lab] progress load failed:", e);
    cryProgress.completed = new Set();
    cryProgress.totalXP = 0;
  }
  try { cryRefreshCourse(); } catch (e) {}
  try { cryRefreshLocks(); } catch (e) {}

  const live = [];
  document.querySelectorAll(".chapter-lab[data-chapter]").forEach(mount => {
    try {
      const info = cryRenderChapter(mount);
      const xtermHost = info.termWrap.querySelector("[data-xterm]");
      const statusEl  = info.termWrap.querySelector("[data-status]");
      const startBtn  = info.termWrap.querySelector("[data-start-terminal]");
      const term = new CryTerminal(info.chapter, xtermHost, statusEl);
      live.push(term);
      if (startBtn) {
        startBtn.addEventListener("click", () => {
          startBtn.remove();
          term.init();
        }, { once: true });
      }
    } catch (e) {
      console.error("[crypto-lab] failed to render chapter",
        mount.getAttribute("data-chapter"), e);
    }
  });

  function shutdownAll() {
    for (const t of live) {
      try { if (t.ws) t.ws.close(); } catch (e) {}
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
  document.addEventListener("DOMContentLoaded", cryBoot);
} else {
  cryBoot();
}

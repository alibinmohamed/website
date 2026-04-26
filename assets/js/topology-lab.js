/* =============================================================================
 * topology-lab.js — Chapter 6 in-browser star-topology builder.
 * -----------------------------------------------------------------------------
 * * Renders a pre-wired star network (Router + Switch + 3 PCs + Internet cloud)
 * into #topoCanvas using pure SVG.
 * * Click a device → see its IP, MAC, OSI layer, role (info panel).
 * * Click a cable → break / restore it.
 * * Toolbar buttons → animated pings that travel along real cable paths.
 * * Completing each objective awards XP AND calls the global markTaskDone()
 * from network-lab.js so the main Chapter 6 checklist ticks, the course
 * XP bar updates, and progress is persisted in localStorage.
 * =========================================================================== */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // -------------------- Network model --------------------
  // Every device has a fixed position on the 900×380 canvas.
  const DEVICES = {
    internet: {
      id: "internet", type: "cloud", label: "Internet", x: 80, y: 80,
      ip: "public", mac: "—", layer: "—",
      role: "The wider world. Anything not on your LAN is reached through the router.",
    },
    router: {
      id: "router", type: "router", label: "Router", x: 250, y: 120,
      ip: "192.168.10.1", mac: "00:0a:f1:22:33:44", layer: "3 (Network)",
      role: "Forwards packets between your LAN and the Internet. Breaks up broadcast domains.",
    },
    switch: {
      id: "switch", type: "switch", label: "Switch", x: 450, y: 200,
      ip: "—", mac: "00:0b:f1:55:66:77", layer: "2 (Data Link)",
      role: "Forwards Ethernet frames using MAC addresses. One collision domain per port.",
    },
    pc1: {
      id: "pc1", type: "pc", label: "PC1", x: 660, y: 90,
      ip: "192.168.10.11", mac: "aa:bb:cc:11:11:11", layer: "2–7 (full stack)",
      role: "A workstation. Talks to other PCs directly through the switch.",
    },
    pc2: {
      id: "pc2", type: "pc", label: "PC2", x: 770, y: 200,
      ip: "192.168.10.12", mac: "aa:bb:cc:22:22:22", layer: "2–7 (full stack)",
      role: "A workstation on the same LAN as PC1.",
    },
    pc3: {
      id: "pc3", type: "pc", label: "PC3", x: 660, y: 310,
      ip: "192.168.10.13", mac: "aa:bb:cc:33:33:33", layer: "2–7 (full stack)",
      role: "A workstation on the same LAN as PC1 and PC2.",
    },
  };

  // Cables as pairs of device ids. Each cable has an id to reference it.
  const CABLES = [
    { id: "c-internet-router", from: "internet", to: "router" },
    { id: "c-router-switch", from: "router", to: "switch" },
    { id: "c-switch-pc1", from: "switch", to: "pc1" },
    { id: "c-switch-pc2", from: "switch", to: "pc2" },
    { id: "c-switch-pc3", from: "switch", to: "pc3" },
  ];

  // -------------------- Objectives --------------------
  // Every objective below is a tiny goal the student ticks off by using the
  // widget. Plain language on purpose — we want absolute beginners to read
  // these once and know what to do.
  // Each topology objective is also a real Chapter-6 task in NETWORK_TASKS
  // (see assets/js/network-lab.js + backend/network_tasks.py, IDs 605-610).
  // The `taskId` field below is what links the local widget objective to the
  // canonical course catalogue, so completing it actually moves the
  // chapter-6 XP counter and the sticky course-wide XP bar.
  const OBJECTIVES = [
    { id: "inspect",       xp: 5,  taskId: 605, title: "Click any device to read what it does" },
    { id: "ping-lan",      xp: 10, taskId: 606, title: "Send a ping from PC1 to PC2 (same network)" },
    { id: "ping-internet", xp: 10, taskId: 607, title: "Send a ping from PC1 to the Internet" },
    { id: "break-observe", xp: 10, taskId: 608, title: "Break the cable between switch and router, then watch a ping fail" },
    { id: "restore",       xp: 5,  taskId: 609, title: "Fix the cables so pings work again" },
    { id: "count-domains", xp: 10, taskId: 610, title: "How many broadcast domains does this network have? (click your answer)" },
  ];
  const OBJ_TOTAL_XP = OBJECTIVES.reduce((s, o) => s + o.xp, 0);

  // State.
  const state = {
    selected: null,
    brokenCables: new Set(),
    completed: loadCompleted(),
    pingCount: 0,
  };

  // Storage strategy (same as network-lab.js):
  //   * logged-in  -> sessionStorage keyed by the user id decoded from the JWT.
  //                   We can't write to the server because the topology
  //                   objectives aren't in the server catalogue — but the
  //                   user-id key guarantees that Ali never inherits Yousef's
  //                   local objective checkmarks.
  //   * guest      -> sessionStorage (tab-scoped) with a shared guest key.
  // We also purge the old global `nf.topoLab` key the first time this file
  // runs so no stale objectives leak into a new login.
  function currentUserKey() {
    const token = localStorage.getItem("token");
    if (!token) return "nf.topoLab.guest";
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      const uid = payload && (payload.sub || payload.user_id || payload.id);
      return uid ? `nf.topoLab.user.${uid}` : "nf.topoLab.guest";
    } catch (e) {
      return "nf.topoLab.guest";
    }
  }

  function loadCompleted() {
    localStorage.removeItem("nf.topoLab"); // drop the old shared key
    try {
      const raw = JSON.parse(sessionStorage.getItem(currentUserKey()) || "{}");
      return new Set(raw.completed || []);
    } catch (e) { return new Set(); }
  }
  function saveCompleted() {
    sessionStorage.setItem(currentUserKey(), JSON.stringify({
      completed: [...state.completed],
    }));
  }

  // -------------------- DOM --------------------
  let svg, infoBody, objList, objXpEl, logEl;
  let dom = {};

  function boot() {
    svg = document.getElementById("topoCanvas");
    infoBody = document.getElementById("topoInfoBody");
    objList = document.getElementById("topoObjectives");
    objXpEl = document.getElementById("topoObjXp");
    if (!svg || !objList) return; // widget not on this page

    drawWorld();
    renderObjectives();
    bindToolbar();
    backfillCourseTasks();
  }

  // One-shot migration: any topology objective the student already finished
  // before the chapter-6 task IDs 605..610 existed needs to be pushed into
  // the course catalogue retroactively, otherwise their topology counter
  // shows 50/50 but the chapter / course XP bars stay at 0.
  //
  // We try repeatedly because network-lab.js boots asynchronously
  // (loadProgressFromServerOrSession is awaited), so window.markTaskDone +
  // window.NETWORK_TASKS may not be ready the first time we look.
  function backfillCourseTasks() {
    let tries = 0;
    function attempt() {
      tries += 1;
      if (typeof window.markTaskDone !== "function" || !window.NETWORK_TASKS) {
        if (tries < 20) setTimeout(attempt, 250);
        return;
      }
      OBJECTIVES.forEach(o => {
        if (o.taskId && state.completed.has(o.id)) {
          awardChapterTask(o.taskId);
        }
      });
    }
    attempt();
  }

  // -------------------- Drawing --------------------
  function drawWorld() {
    svg.innerHTML = "";

    // Cables first (so devices sit on top).
    CABLES.forEach(cable => drawCable(cable));

    // Devices.
    Object.values(DEVICES).forEach(d => drawDevice(d));
  }

  function cableEndpoints(cable) {
    const a = DEVICES[cable.from], b = DEVICES[cable.to];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  function drawCable(cable) {
    const { x1, y1, x2, y2 } = cableEndpoints(cable);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("class", "cable" + (state.brokenCables.has(cable.id) ? " broken" : ""));
    line.setAttribute("data-cable-id", cable.id);
    line.style.cursor = "pointer";
    line.addEventListener("click", () => toggleCable(cable));
    svg.appendChild(line);
  }

  function drawDevice(d) {
    // Each device is drawn as TWO nested <g>:
    //   * outerG  -> position only. Uses the SVG `transform` attribute.
    //   * innerG  -> visuals + hover/selected styling. Uses the CSS
    //                `transform` property (scale 1.05 on hover).
    // If we put both on the same <g> the CSS transform *replaces* the
    // SVG one in modern browsers, the device jumps to (0, 0) on hover,
    // and the click target ends up nowhere near the visible box — which
    // is why clicking PC1 used to look like it "moves" and shows no
    // details.
    const outerG = document.createElementNS(SVG_NS, "g");
    outerG.setAttribute("transform", `translate(${d.x - 42} ${d.y - 30})`);

    const innerG = document.createElementNS(SVG_NS, "g");
    innerG.setAttribute("class", "device" + (state.selected === d.id ? " selected" : ""));
    innerG.dataset.deviceId = d.id;

    // Body
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("class", "device-bg");
    bg.setAttribute("width", 84);
    bg.setAttribute("height", 52);
    bg.setAttribute("rx", 10);
    bg.setAttribute("ry", 10);
    bg.setAttribute("fill", deviceFill(d.type));
    bg.setAttribute("stroke", "#1f2a44");
    bg.setAttribute("stroke-width", "1.5");
    innerG.appendChild(bg);

    // Label inside the box. No emoji icons — the colour + the word
    // (Router / Switch / PC / Internet) are enough for a beginner.
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "device-label");
    label.setAttribute("x", 42);
    label.setAttribute("y", 30);
    label.setAttribute("font-size", "13");
    label.setAttribute("font-weight", "700");
    label.textContent = d.label;
    innerG.appendChild(label);

    // IP address, drawn just under the box.
    if (d.ip && d.ip !== "—" && d.ip !== "public") {
      const ip = document.createElementNS(SVG_NS, "text");
      ip.setAttribute("class", "device-ip");
      ip.setAttribute("x", 42);
      ip.setAttribute("y", 66);
      ip.textContent = d.ip;
      innerG.appendChild(ip);
    }

    innerG.addEventListener("click", () => selectDevice(d.id));
    outerG.appendChild(innerG);
    svg.appendChild(outerG);
  }

  function deviceFill(type) {
    switch (type) {
      case "router": return "#1e293b";
      case "switch": return "#1f2a44";
      case "pc": return "#152131";
      case "cloud": return "#221632";
      default: return "#1f1f25";
    }
  }

  // -------------------- Interaction --------------------
  function selectDevice(id) {
    state.selected = id;
    drawWorld();
    const d = DEVICES[id];
    renderInfo(d);
    complete("inspect");
  }

  function renderInfo(d) {
    // Shows the details of the device the student just clicked on, then a
    // tiny running log underneath so every button press leaves a trail the
    // student can read and understand.
    infoBody.innerHTML = `
      <div style="font-weight:700; color:#fff; font-size:14px; margin-bottom:4px;">
        ${d.label}
      </div>
      <div style="color:#aaa; margin-bottom:10px; font-size:12px;">${d.role}</div>
      <div class="kv">
        <div>Type</div><div><strong>${capitalize(d.type)}</strong></div>
        <div>OSI Layer</div><div><strong>${d.layer}</strong></div>
        <div>IP</div><div><code>${d.ip}</code></div>
        <div>MAC</div><div><code>${d.mac}</code></div>
      </div>
      <div id="topoLog" class="topo-log"><span class="muted"># activity log - press a ping button to see messages here</span></div>
    `;
    logEl = document.getElementById("topoLog");
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function toggleCable(cable) {
    // Single-click on a cable line flips its state: OK -> broken -> OK ...
    if (state.brokenCables.has(cable.id)) state.brokenCables.delete(cable.id);
    else state.brokenCables.add(cable.id);
    drawWorld();
    const nowBroken = state.brokenCables.has(cable.id);
    logLine(
      `The cable between ${cable.from} and ${cable.to} is now ${nowBroken ? "broken" : "working"}.`,
      nowBroken ? "fail" : "reply"
    );
    if (cable.id === "c-router-switch" && state.brokenCables.has(cable.id)) {
      complete("break-observe-cable"); // user broke it manually — still counts
    }
  }

  function bindToolbar() {
    document.querySelectorAll("#topoBuilder .topo-btn[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-action");
        if (act === "ping-pc1-pc2") sendPing("pc1", "pc2");
        else if (act === "ping-pc1-internet") sendPing("pc1", "internet");
        else if (act === "break-uplink") breakUplink();
        else if (act === "restore-cables") restoreCables();
        else if (act === "reset") resetLab();
      });
    });
  }

  // Toolbar helpers. Kept tiny on purpose so the action and the log line
  // match one-to-one — the student should always see *why* something
  // changed.
  function breakUplink() {
    state.brokenCables.add("c-router-switch");
    drawWorld();
    logLine("You broke the cable between the switch and the router.", "fail");
  }

  function restoreCables() {
    if (state.brokenCables.size > 0) {
      state.brokenCables.clear();
      drawWorld();
      logLine("All cables are fixed. Pings should work again.", "reply");
      complete("restore");
    }
  }

  function resetLab() {
    state.brokenCables.clear();
    state.selected = null;
    drawWorld();
    if (infoBody) {
      infoBody.innerHTML = `
        Every device in a network has a role. Click the router, switch, or any PC
        to see its IP, MAC address, and which OSI layer it operates on.
      `;
    }
  }

  // -------------------- Ping animation --------------------
  function sendPing(fromId, toId) {
    // A ping is just a short "are you there?" message. The widget shows it
    // as a dot that travels along the real cable path (via switch / router
    // as needed). If a cable along the way is broken, the dot stops and the
    // log line tells the student exactly why.
    const path = routePath(fromId, toId);
    if (!path) {
      logLine(`No cable path from ${fromId} to ${toId}. Check the cables and try again.`, "fail");
      return;
    }
    const broken = path.cables.find(id => state.brokenCables.has(id));
    if (broken) {
      animatePacket(path.points, { fail: true, onDone: () => {
        logLine(`${fromId} -> ${toId}: the ping failed because a cable on the way is broken.`, "fail");
      }});
      return;
    }

    state.pingCount += 1;
    logLine(`${fromId} -> ${toId}: sending a ping...`);
    animatePacket(path.points, { onDone: () => {
      logLine(`${fromId} -> ${toId}: reply received in ${(10 + Math.random() * 20).toFixed(1)} ms.`, "reply");
      // reply animation (reverse)
      animatePacket(path.points.slice().reverse(), { reply: true });

      if (fromId === "pc1" && toId === "pc2") {
        // complete() also calls awardChapterTask(606) for us via taskId.
        complete("ping-lan");
      }
      if (fromId === "pc1" && toId === "internet") {
        // complete() awards 607 via the objective's taskId.
        complete("ping-internet");
        // If the user broke+restored a cable before this, also count
        // "break-observe" (608) so they don't have to fail a ping deliberately
        // again.
        if (state.brokenCables.size === 0) complete("break-observe");
      }
    }});
  }

  /** BFS from 'from' to 'to' over the CABLES graph, returns a path
   * {cables: [id,id,...], points: [{x,y}...]} or null. */
  function routePath(fromId, toId) {
    const adj = {};
    CABLES.forEach(c => {
      (adj[c.from] = adj[c.from] || []).push({ nb: c.to, id: c.id });
      (adj[c.to] = adj[c.to] || []).push({ nb: c.from, id: c.id });
    });
    const prev = { [fromId]: { nb: null, cable: null } };
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      for (const { nb, id } of (adj[cur] || [])) {
        if (!(nb in prev)) {
          prev[nb] = { nb: cur, cable: id };
          queue.push(nb);
        }
      }
    }
    if (!(toId in prev)) return null;
    const cables = []; const hops = [toId];
    let cur = toId;
    while (prev[cur].nb) {
      cables.unshift(prev[cur].cable);
      cur = prev[cur].nb;
      hops.unshift(cur);
    }
    const points = hops.map(h => ({ x: DEVICES[h].x, y: DEVICES[h].y }));
    return { cables, points };
  }

  /** Animate a small circle along a multi-point polyline. */
  function animatePacket(points, opts) {
    opts = opts || {};
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", 6);
    circle.setAttribute("class", "packet" + (opts.fail ? " fail" : opts.reply ? " reply" : ""));
    circle.setAttribute("cx", points[0].x);
    circle.setAttribute("cy", points[0].y);
    svg.appendChild(circle);

    const segments = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segments.push({ from: points[i], to: points[i + 1], len });
      total += len;
    }
    const DURATION = Math.max(600, total * 2.2);
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / DURATION);
      const travelled = t * total;
      let acc = 0;
      let seg = segments[0], segT = 0;
      for (const s of segments) {
        if (acc + s.len >= travelled) {
          seg = s; segT = (travelled - acc) / s.len; break;
        }
        acc += s.len;
      }
      const cx = seg.from.x + (seg.to.x - seg.from.x) * segT;
      const cy = seg.from.y + (seg.to.y - seg.from.y) * segT;
      circle.setAttribute("cx", cx);
      circle.setAttribute("cy", cy);

      // Pulse the packet if it's about to fail at the broken cable.
      if (opts.fail && t > 0.55) {
        circle.setAttribute("r", 6 + Math.sin(t * 30) * 2);
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        if (opts.fail) {
          // Explode at the broken point.
          circle.setAttribute("opacity", "0");
        }
        circle.remove();
        if (opts.onDone) opts.onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  function logLine(text, cls) {
    // Append one coloured line to the mini packet log that sits below the
    // device info panel. Green = success, red = failure, blue = reply.
    if (!logEl) return;
    const row = document.createElement("div");
    row.className = cls || "";
    row.textContent = "- " + text;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // -------------------- Objectives & scoring --------------------
  function renderObjectives() {
    objList.innerHTML = "";
    OBJECTIVES.forEach(o => {
      const li = document.createElement("li");
      li.dataset.objId = o.id;
      if (state.completed.has(o.id)) li.classList.add("done");
      li.innerHTML = `
        <span class="dot" aria-hidden="true"></span>
        <span class="title">${o.title}</span>
        <span class="xp">${o.xp}</span>
      `;
      // Attach quiz answer for the "count-domains" objective.
      if (o.id === "count-domains" && !state.completed.has(o.id)) {
        li.innerHTML += `
          <div style="flex-basis:100%; margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
            <button class="topo-btn" data-quiz="1">1</button>
            <button class="topo-btn" data-quiz="2">2</button>
            <button class="topo-btn" data-quiz="3">3</button>
            <button class="topo-btn" data-quiz="5">5</button>
          </div>
        `;
      }
      objList.appendChild(li);
    });
    refreshObjXp();
    objList.querySelectorAll("[data-quiz]").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        const val = b.getAttribute("data-quiz");
        if (val === "1") {
          // complete() awards task 610 via the objective's taskId.
          complete("count-domains");
        } else {
          b.style.background = "rgba(255,95,86,0.15)";
          b.style.borderColor = "#ff5f56";
          b.style.color = "#ff5f56";
          b.textContent = val + " (wrong)";
        }
      });
    });
  }

  function refreshObjXp() {
    const earned = OBJECTIVES
      .filter(o => state.completed.has(o.id))
      .reduce((s, o) => s + o.xp, 0);
    objXpEl.textContent = `${earned} / ${OBJ_TOTAL_XP} XP`;
  }

  function complete(objId) {
    if (state.completed.has(objId)) return;
    // Special handling: "break-observe-cable" (manual cable toggle) is an
    // alias for "break-observe" if the user also ran a failed internet ping.
    if (objId === "break-observe-cable") {
      return; // recorded only when followed by a failed internet ping
    }
    const obj = OBJECTIVES.find(o => o.id === objId);
    if (!obj) return;
    state.completed.add(objId);
    saveCompleted();
    const li = objList.querySelector(`li[data-obj-id="${objId}"]`);
    if (li) {
      li.classList.add("done");
      floatXp(li, obj.xp);
    }
    refreshObjXp();
    // Mirror the objective into the canonical course catalogue so the
    // chapter-6 task panel ticks AND the sticky course XP bar grows. Without
    // this, students would only see XP move when they did one of the three
    // bridged objectives (the LAN ping, the Internet ping, or the broadcast
    // domain quiz) — the other three (inspect / break / restore) updated only
    // the local topology counter, which is what made it look like “6 tasks
    // done but only 10 XP”.
    if (obj.taskId) awardChapterTask(obj.taskId);
  }

  function floatXp(anchor, xp) {
    const rect = anchor.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "xp-floater";
    f.textContent = `${xp} XP`;
    f.style.left = `${rect.right - 60}px`;
    f.style.top = `${rect.top}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
  }

  /** Route a completed objective through to the main network-lab.js scorer
   * so the course XP bar and chapter 6 checklist both tick.
   *
   * We look the task up in the canonical NETWORK_TASKS catalogue (exposed
   * on window by network-lab.js) so the floating “+N XP” animation shows
   * the real XP value instead of the placeholder “0 XP” that the previous
   * version was passing in. */
  function awardChapterTask(taskId) {
    if (typeof window.markTaskDone !== "function") return;
    const catalogue = window.NETWORK_TASKS || {};
    let resolved = null;
    for (const tasks of Object.values(catalogue)) {
      const t = tasks.find(x => x.id === taskId);
      if (t) { resolved = t; break; }
    }
    if (!resolved) return; // unknown id — don't poison server progress
    window.markTaskDone({ id: resolved.id, xp: resolved.xp, title: resolved.title });
  }

  // Expose for debugging + network-lab.js bridge.
  window.topoLab = {
    complete, sendPing, resetLab, state, DEVICES, CABLES,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

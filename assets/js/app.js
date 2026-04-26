// ============================================
// API CONFIGURATION
// ============================================
const API_BASE = "http://localhost:5001/api";

// ── Token helpers ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("token"); }
function setToken(t) { localStorage.setItem("token", t); }
function getAdminToken() { return localStorage.getItem("adminToken"); }
function setAdminToken(t) { localStorage.setItem("adminToken", t); }
function clearToken() { localStorage.removeItem("token"); }
function clearAdminToken() { localStorage.removeItem("adminToken"); }
function isLoggedIn() { return !!getToken(); }
function isAdminLoggedIn() { return !!getAdminToken(); }

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": "Bearer " + token } : {})
  };
}

/** Decode JWT payload for display (no verification). */
function decodeJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); }
  catch (e) { return {}; }
}

/** Fetch wrapper — always returns { ok, status, data }. */
async function apiFetch(path, options) {
  options = options || {};
  try {
    const res = await fetch(API_BASE + path, options);
    const json = await res.json().catch(function () { return {}; });
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) {
    return { ok: false, status: 0, data: { error: "Cannot reach server. Is the backend running?" } };
  }
}

// ============================================
// MENU
// ============================================
function initMenu() {
  var menuToggle = document.querySelector(".menu-toggle");
  var navLinks = document.querySelector(".nav-links");
  var body = document.body;
  if (!menuToggle || !navLinks) return;

  menuToggle.innerHTML = '<div class="hamburger"><span></span><span></span><span></span></div>';

  menuToggle.addEventListener("click", function (e) {
    e.stopPropagation();
    navLinks.classList.toggle("open");
    menuToggle.classList.toggle("active");
    body.classList.toggle("menu-open");
  });

  document.querySelectorAll(".nav-links a").forEach(function (link) {
    link.addEventListener("click", function () {
      navLinks.classList.remove("open");
      menuToggle.classList.remove("active");
      body.classList.remove("menu-open");
    });
  });

  document.addEventListener("click", function (e) {
    if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
      navLinks.classList.remove("open");
      menuToggle.classList.remove("active");
      body.classList.remove("menu-open");
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      navLinks.classList.remove("open");
      menuToggle.classList.remove("active");
      body.classList.remove("menu-open");
    }
  });
}

function setActiveNav() {
  var currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(function (link) {
    if (link.getAttribute("href") === currentPage) link.classList.add("active");
  });
}

// ============================================
// HEADER AUTH CONTROLS (Login / Profile / Logout)
// ============================================
function getInitials(name) {
  if (!name) return "U";
  var parts = String(name).trim().split(/\s+/);
  var first = parts[0] ? parts[0][0] : "";
  var last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "U";
}

function handleHeaderLogout() {
  clearToken();
  // Jump home so protected pages don't stay visible with stale state.
  window.location.href = "index.html";
}

async function renderAuthControls() {
  var slot = document.querySelector("[data-auth-controls]");
  if (!slot) return;

  // Hide the "Login" entry in the dropdown when the user is logged in,
  // since the header already exposes Logout.
  var dropdownLogin = document.querySelector('.nav-links a[href="login.html"]');

  var guestMarkup =
    '<a class="btn-compact" href="login.html">Login</a>' +
    '<a class="btn-compact primary" href="join.html">Apply Now</a>';

  if (!isLoggedIn()) {
    slot.innerHTML = guestMarkup;
    if (dropdownLogin) dropdownLogin.style.display = "";
    return;
  }

  // Logged in — try to fetch the user's display name.
  var name = "Member";
  var email = "";
  var meResult = await apiFetch("/auth/me", { headers: authHeaders(getToken()) });
  if (meResult.ok && meResult.data) {
    name = meResult.data.name || name;
    email = meResult.data.email || "";
  } else if (meResult.status === 401 || meResult.status === 403) {
    // Token is no longer valid — fall back to logged-out state.
    clearToken();
    slot.innerHTML = guestMarkup;
    if (dropdownLogin) dropdownLogin.style.display = "";
    return;
  }

  var initials = getInitials(name);
  // Clicking the name pill takes you to your profile page now that we
  // have one. The bell sits *to the left* of the profile pill, inside
  // a `.notif-wrap` so its absolute-positioned dropdown anchors right
  // beneath it.
  slot.innerHTML =
    '<div class="notif-wrap" data-notif-wrap>' +
      '<button type="button" class="notif-bell" data-notif-toggle ' +
              'aria-label="Notifications" aria-haspopup="true" aria-expanded="false">' +
        _NOTIF_BELL_SVG +
        // Default to a visible muted "0" so the bell looks identical on
        // every page even before /api/notifications/summary responds.
        // renderNotificationBell() will swap it to red as soon as it has
        // the real count.
        '<span class="notif-badge is-zero" data-notif-badge>0</span>' +
      '</button>' +
      '<div class="notif-panel" data-notif-panel hidden></div>' +
    '</div>' +
    '<a class="auth-profile" href="profile.html" title="' + (email || name) + '">' +
    '<span class="auth-avatar">' + initials + '</span>' +
    '<span class="auth-name">' + name + '</span>' +
    '</a>' +
    '<button type="button" class="btn-compact" data-header-logout>Logout</button>';

  var logoutBtn = slot.querySelector("[data-header-logout]");
  if (logoutBtn) logoutBtn.addEventListener("click", handleHeaderLogout);

  if (dropdownLogin) dropdownLogin.style.display = "none";

  initNotificationBell();
}

// ============================================
// HEADER NOTIFICATION BELL (members only)
// ============================================
// Lives inside the auth-controls slot, immediately to the left of the
// profile pill. Clicking drops a panel DOWN below the bell with each
// notification rendered as its own card-block, grouped by category.
// On the first paint after login we also fire lab-style "welcome"
// toasts at the bottom-right so the member sees what's new even before
// they open the dropdown. All chrome is rendered with inline SVG.

var _notifPollTimer    = null;
var _notifFirstPaint   = true;
var _notifGlobalBound  = false;

// Inline-SVG bell. No emoji — a hand-drawn path so the icon adopts
// `currentColor` and matches the rest of the header.
var _NOTIF_BELL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
       'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z"></path>' +
    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>' +
  '</svg>';

function _notifGetLastSeen() {
  var v = localStorage.getItem("notif_last_seen");
  if (!v) return 0;
  var t = Date.parse(v);
  return isFinite(t) ? t : 0;
}

function _notifSetLastSeen(iso) {
  localStorage.setItem("notif_last_seen", iso || new Date().toISOString());
}

function _notifEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _notifFormatTime(iso) {
  if (!iso) return "";
  // Reuse the friends-list helper so "updated 5 min ago" math is the
  // same everywhere on the site.
  if (typeof formatLastSeen === "function") return formatLastSeen(iso);
  try { return new Date(iso).toLocaleString(); } catch (e) { return ""; }
}

async function loadNotifications() {
  if (!isLoggedIn()) return null;
  var r = await apiFetch("/notifications/summary", {
    headers: authHeaders(getToken()),
  });
  if (!r.ok) return null;
  return r.data || null;
}

/** Group the backend payload into three labeled sections. The order
 *  here is the order the panel renders top-to-bottom. */
function _notifBuildSections(data) {
  data = data || {};
  var friendRows = (data.friendRequests || []).map(function (fr) {
    return {
      title:     (fr.fromName || ("Member #" + fr.fromId)) + " sent you a friend request",
      sub:       "Open your profile to accept or reject.",
      link:      "profile.html#incomingRequestsSection",
      createdAt: fr.createdAt || null,
    };
  });

  var eventRows = [];
  if (data.latestEvent) {
    var ev = data.latestEvent;
    var when = ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "";
    eventRows.push({
      title:     ev.title || "New event",
      sub:       (ev.isUpcoming ? "Upcoming \u00b7 " : "Recently \u00b7 ") +
                 (when || "TBA") +
                 (ev.location ? (" \u00b7 " + ev.location) : ""),
      link:      "events.html",
      createdAt: ev.createdAt || ev.startsAt || null,
    });
  }

  var newsRows = (data.news || []).map(function (n) {
    return {
      title:     n.title,
      sub:       n.summary || "",
      link:      n.link || "news.html",
      // News dates are date-only; pin to UTC midnight so the badge
      // "newer than lastSeen" comparison stays sane.
      createdAt: n.date ? (n.date + "T00:00:00Z") : null,
    };
  });

  return [
    { key: "friend", label: "Friend Requests", emptyText: "No pending requests.", rows: friendRows },
    { key: "event",  label: "Events",          emptyText: "No upcoming events.",  rows: eventRows  },
    { key: "news",   label: "News",            emptyText: "No news yet.",         rows: newsRows   },
  ];
}

/** Unread count = pending friend requests + any event/news row whose
 *  createdAt is newer than the last time the user opened the panel. */
function _notifUnreadCount(sections) {
  var since  = _notifGetLastSeen();
  var unread = 0;
  sections.forEach(function (sec) {
    if (sec.key === "friend") {
      unread += sec.rows.length;
      return;
    }
    sec.rows.forEach(function (row) {
      if (!row.createdAt) return;
      var t = Date.parse(row.createdAt);
      if (isFinite(t) && t > since) unread += 1;
    });
  });
  return unread;
}

/** Render the dropdown panel. Each row is a card-style block. */
function _notifRenderPanel(panelEl, sections, totalCount) {
  if (!panelEl) return;
  var html = '<div class="notif-header">Notifications' +
             '<small>' + totalCount + ' item' + (totalCount === 1 ? "" : "s") + '</small>' +
             '</div>';
  sections.forEach(function (sec) {
    html += '<div class="notif-section">' +
              '<div class="notif-section-title">' +
                _notifEscape(sec.label) +
                '<span class="notif-count">' + sec.rows.length + '</span>' +
              '</div>';
    if (!sec.rows.length) {
      html += '<div class="notif-empty">' + _notifEscape(sec.emptyText) + '</div>';
    } else {
      sec.rows.forEach(function (row) {
        html += '<a class="notif-row row-' + _notifEscape(sec.key) + '" ' +
                   'href="' + _notifEscape(row.link) + '">' +
                  '<div class="notif-title">' + _notifEscape(row.title) + '</div>' +
                  (row.sub ? '<div class="notif-sub">' + _notifEscape(row.sub) + '</div>' : '') +
                  (row.createdAt ? '<div class="notif-time">' + _notifEscape(_notifFormatTime(row.createdAt)) + '</div>' : '') +
                '</a>';
      });
    }
    html += '</div>';
  });
  panelEl.innerHTML = html;
}

/* -------------------------------------------------------------------
 * Welcome toasts. Same behaviour as the lab task toasts: stack at the
 * bottom-right, slide in from the right, auto-dismiss after ~6.5s, can
 * be closed manually. We only fire them on the first paint after login
 * so the user isn't spammed every time the bell polls.
 * ----------------------------------------------------------------- */
function _notifToastHost() {
  var host = document.getElementById("notifToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "notifToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function _notifShowToast(sectionKey, sectionLabel, row) {
  var host = _notifToastHost();
  var toast = document.createElement("a");
  toast.className = "notif-toast toast-" + sectionKey;
  toast.href = row.link || "#";
  toast.innerHTML =
    '<div class="head">' +
      '<span>' + _notifEscape(sectionLabel) + '</span>' +
      '<button type="button" class="close" aria-label="Dismiss">\u2715</button>' +
    '</div>' +
    '<div class="body">' + _notifEscape(row.title) + '</div>' +
    (row.sub ? '<div class="sub">' + _notifEscape(row.sub) + '</div>' : '');
  host.appendChild(toast);

  var dismiss = function (e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!toast.isConnected) return;
    toast.classList.add("fading");
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 500);
  };
  // Close button stops propagation so the user doesn't accidentally
  // navigate when dismissing the toast.
  toast.querySelector(".close").addEventListener("click", dismiss);
  setTimeout(dismiss, 6500);
}

function _notifFireWelcomeToasts(sections) {
  var since = _notifGetLastSeen();
  var pushed = 0;
  sections.forEach(function (sec) {
    sec.rows.forEach(function (row) {
      if (pushed >= 4) return;  // cap so we don't fill the corner
      // Friend requests are always considered fresh; events/news only
      // count when their timestamp is newer than the last time the
      // user opened the panel.
      var fresh = sec.key === "friend";
      if (!fresh && row.createdAt) {
        var t = Date.parse(row.createdAt);
        fresh = isFinite(t) && t > since;
      }
      if (!fresh) return;
      _notifShowToast(sec.key, sec.label, row);
      pushed += 1;
    });
  });
}

async function renderNotificationBell() {
  var wrap  = document.querySelector("[data-notif-wrap]");
  if (!wrap) return;
  var bell  = wrap.querySelector("[data-notif-toggle]");
  var badge = wrap.querySelector("[data-notif-badge]");
  if (!bell || !badge) return;

  var data     = await loadNotifications();
  var sections = _notifBuildSections(data);
  var unread   = _notifUnreadCount(sections);

  // Badge is ALWAYS visible — shows the unread count (red) or "0"
  // (muted) so the user always knows the current state.
  badge.textContent = unread > 9 ? "9+" : String(unread);
  badge.hidden = false;
  badge.classList.toggle("is-zero", unread === 0);

  // Cache the raw payload so toggleNotifPanel can rebuild sections
  // without a fresh network round-trip.
  bell.dataset.dataCache = JSON.stringify(data || {});

  // Fire welcome toasts only once per page load, and only if there are
  // actually unread items. Same lab-toast vibe the courses use.
  if (_notifFirstPaint) {
    _notifFirstPaint = false;
    if (unread > 0) _notifFireWelcomeToasts(sections);
  }
}

function toggleNotifPanel(forceState) {
  var wrap  = document.querySelector("[data-notif-wrap]");
  if (!wrap) return;
  var bell  = wrap.querySelector("[data-notif-toggle]");
  var panel = wrap.querySelector("[data-notif-panel]");
  var badge = wrap.querySelector("[data-notif-badge]");
  if (!bell || !panel) return;

  var willOpen = (typeof forceState === "boolean") ? forceState : panel.hidden;

  if (willOpen) {
    var data = {};
    try { data = JSON.parse(bell.dataset.dataCache || "{}"); } catch (e) { data = {}; }
    var sections = _notifBuildSections(data);
    var total    = sections.reduce(function (s, sec) { return s + sec.rows.length; }, 0);
    _notifRenderPanel(panel, sections, total);

    // Re-trigger the keyframe so the panel slides DOWN into view every
    // time it's opened (not just the first time).
    panel.style.animation = "none";
    void panel.offsetWidth;
    panel.style.animation = "";

    panel.hidden = false;
    bell.classList.add("is-open");
    bell.setAttribute("aria-expanded", "true");

    // Mark everything as seen and reset the badge to its zero-state
    // (still visible, just muted instead of red).
    _notifSetLastSeen(new Date().toISOString());
    if (badge) {
      badge.textContent = "0";
      badge.hidden = false;
      badge.classList.add("is-zero");
    }
  } else {
    panel.hidden = true;
    bell.classList.remove("is-open");
    bell.setAttribute("aria-expanded", "false");
  }
}

function initNotificationBell() {
  var wrap = document.querySelector("[data-notif-wrap]");
  if (!wrap) return;
  var bell = wrap.querySelector("[data-notif-toggle]");
  if (!bell) return;

  // Bell click — toggle the dropdown. The bell node is freshly created
  // every time renderAuthControls runs, so we can wire directly without
  // worrying about duplicate listeners.
  bell.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleNotifPanel();
  });

  // Document-level listeners only need to be wired once even if
  // renderAuthControls runs again after a re-login.
  if (!_notifGlobalBound) {
    _notifGlobalBound = true;

    // Outside-click closes the panel.
    document.addEventListener("click", function (e) {
      var w = document.querySelector("[data-notif-wrap]");
      if (!w) return;
      if (!w.contains(e.target)) toggleNotifPanel(false);
    });

    // Esc closes the panel too.
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggleNotifPanel(false);
    });
  }

  // Initial paint + 60s polling. Replace any prior timer (renderAuth
  // controls can run again after a logout/login cycle).
  renderNotificationBell();
  if (_notifPollTimer) clearInterval(_notifPollTimer);
  _notifPollTimer = setInterval(function () {
    if (!isLoggedIn()) {
      clearInterval(_notifPollTimer);
      _notifPollTimer = null;
      var stack = document.getElementById("notifToastStack");
      if (stack && stack.parentNode) stack.parentNode.removeChild(stack);
      return;
    }
    renderNotificationBell();
  }, 60 * 1000);
}

// ============================================
// STATIC DATA
// ============================================
var clubData = {
  resources: [
    { title: "TryHackMe", level: "Beginner", category: "Hands-on Labs", url: "https://tryhackme.com", desc: "Guided labs for Linux, networking, web security, and blue team topics.", logo: "assets/images/TryHachMe.png" },
    { title: "Hack The Box", level: "Intermediate", category: "Labs + Machines", url: "https://hackthebox.com", desc: "Realistic boxes and academy modules for practical skills.", logo: "assets/images/HackTheBox.webp" },
    { title: "PortSwigger Academy", level: "Beginner to Advanced", category: "Web Security", url: "https://portswigger.net/web-security", desc: "Structured web vulnerability labs with real-world scenarios.", logo: "assets/images/PortSwigger.png" },
    { title: "OverTheWire", level: "Beginner", category: "Linux", url: "https://overthewire.org", desc: "War games for Linux fundamentals and problem solving.", logo: "assets/images/overthewire.webp" },
    { title: "picoCTF", level: "Beginner", category: "CTF Training", url: "https://picoctf.org", desc: "Challenge-based platform for cybersecurity competitions.", logo: "assets/images/picoctf.png" },
    { title: "LabEx", level: "Beginner", category: "Linux", url: "https://labex.io", desc: "Hands-on Linux and cybersecurity skill paths with interactive labs.", logo: "assets/images/labex.png" },
    { title: "OWASP Top 10", level: "All levels", category: "Documentation", url: "https://owasp.org/www-project-top-ten/", desc: "Standard awareness document about web application security risks.", logo: "assets/images/OWASP Top10.png" },
    { title: "CyberChef", level: "All levels", category: "Tools", url: "https://gchq.github.io/CyberChef/", desc: "The Cyber Swiss Army Knife - encryption, encoding, and data analysis.", logo: "assets/images/CyberChef.png" },
    { title: "Wireshark", level: "Intermediate", category: "Network Analysis", url: "https://www.wireshark.org/", desc: "World's most popular network protocol analyzer.", logo: "assets/images/wireshark.png" }
  ],
  tracks: [
    { name: "Information Security", tag: "General", desc: "Protecting systems, data, and organizational assets from threats.", tools: "CISSP, Security+, GRC" },
    { name: "Network Security", tag: "Core", desc: "Securing networks through monitoring and defensive controls.", tools: "CCNA Security, Wireshark, Firewalls" },
    { name: "Web Security", tag: "Application", desc: "Understanding web vulnerabilities and secure development.", tools: "OWASP, Bug Bounty, Burp Suite" },
    { name: "Digital Forensics", tag: "Investigation", desc: "Analyzing digital evidence from systems and logs.", tools: "Autopsy, FTK, Volatility" },
    { name: "Malware Analysis", tag: "Analysis", desc: "Studying malicious software behavior and threats.", tools: "IDA Pro, Ghidra, Sandboxing" },
    { name: "Incident Response", tag: "Operations", desc: "Detecting, containing, and recovering from incidents.", tools: "SANS, NIST, SOC" },
    { name: "Cloud Security", tag: "Emerging", desc: "Securing cloud infrastructure and identity management.", tools: "AWS Security, Azure, DevSecOps" },
    { name: "Penetration Testing", tag: "Ethical Hacking", desc: "Authorized simulated attacks to find vulnerabilities.", tools: "OSCP, Metasploit, Kali Linux" },
    { name: "Security Operations", tag: "Defense", desc: "Monitoring and responding to security threats.", tools: "SIEM, Splunk, Threat Hunting" }
  ]
};

function renderResources() {
  var container = document.querySelector("[data-resources]");
  if (!container) return;
  container.innerHTML = clubData.resources.map(function (r) {
    return '<article class="card compact">' +
      '<div class="resource-thumb" style="display:flex;align-items:center;justify-content:center;padding:16px;">' +
      '<img src="' + r.logo + '" alt="' + r.title + '" style="width:100%;height:100%;object-fit:contain;" />' +
      '</div>' +
      '<div style="margin-top:16px">' +
      '<div class="badge-row"><span class="tag">' + r.category + '</span><span class="chip">' + r.level + '</span></div>' +
      '<h3 style="margin-top:14px">' + r.title + '</h3>' +
      '<p>' + r.desc + '</p>' +
      '<a class="btn btn-secondary" href="' + r.url + '" target="_blank" style="margin-top:8px">Open Resource →</a>' +
      '</div></article>';
  }).join("");
}

function renderTracks() {
  var container = document.querySelector("[data-orbital-tracks]");
  if (!container) return;

  var domains = [
    {
      id: "infosec", title: "Information Security", align: "left", desc: "Protecting systems and data through offensive and defensive measures.",
      paths: [
        { 
          name: "Penetration Testing (Network/Web/System)", 
          req: [{name:"eJPT (INE)", url:"https://ine.com"}, {name:"PenTest+ (CompTIA)", url:"https://www.comptia.org"}], 
          des: [{name:"OSCP (OffSec)", url:"https://www.offensive-security.com"}, {name:"OSWE (OffSec)", url:"https://www.offensive-security.com"}, {name:"CPENT (EC-Council)", url:"https://www.eccouncil.org"}] 
        },
        { 
          name: "Security Operations (SOC)", 
          req: [{name:"CyberOps (Cisco)", url:"https://www.cisco.com"}, {name:"CySA+ (CompTIA)", url:"https://www.comptia.org"}], 
          des: [{name:"BTL1 (Blue Team)", url:"https://securityblue.team"}, {name:"GSOC (SANS)", url:"https://www.giac.org"}] 
        },
        { 
          name: "Threat & Vulnerability Management", 
          req: [{name:"CTIA (EC-Council)", url:"https://www.eccouncil.org"}], 
          des: [{name:"FOR578 (SANS)", url:"https://www.sans.org"}, {name:"GCTI (SANS)", url:"https://www.giac.org"}] 
        }
      ]
    },
    {
      id: "grc", title: "Governance, Risk & Compliance", align: "right", desc: "Aligning security with business objectives, laws, and regulations.",
      paths: [
        { 
          name: "IT Auditing & Assessment", 
          req: [{name:"CISA (ISACA)", url:"https://www.isaca.org"}, {name:"GSNA (SANS)", url:"https://www.giac.org"}], 
          des: [{name:"CIA (IIA)", url:"https://www.theiia.org"}] 
        },
        { 
          name: "Risk Management", 
          req: [{name:"CRISC (ISACA)", url:"https://www.isaca.org"}, {name:"CGRC (ISC2)", url:"https://www.isc2.org"}], 
          des: [{name:"PMI-RMP (PMI)", url:"https://www.pmi.org"}, {name:"CGEIT (ISACA)", url:"https://www.isaca.org"}] 
        },
        { 
          name: "Information Security Management", 
          req: [{name:"CISM (ISACA)", url:"https://www.isaca.org"}, {name:"Security+ (CompTIA)", url:"https://www.comptia.org"}], 
          des: [{name:"CISSP (ISC2)", url:"https://www.isc2.org"}, {name:"GSLC (SANS)", url:"https://www.giac.org"}] 
        }
      ]
    },
    {
      id: "dfir", title: "Digital Forensics & Incident Response", align: "left", desc: "Investigating breaches, analyzing malware, and recovering systems.",
      paths: [
        { 
          name: "Digital Forensics", 
          req: [{name:"CHFI (EC-Council)", url:"https://www.eccouncil.org"}, {name:"eCDFP (INE)", url:"https://ine.com"}], 
          des: [{name:"GCFA (SANS)", url:"https://www.giac.org"}, {name:"GCFE (SANS)", url:"https://www.giac.org"}] 
        },
        { 
          name: "Incident Response", 
          req: [{name:"GCIH (SANS)", url:"https://www.giac.org"}, {name:"ECIH (EC-Council)", url:"https://www.eccouncil.org"}], 
          des: [{name:"IHRP (INE)", url:"https://ine.com"}] 
        },
        { 
          name: "Reverse Engineering & Malware", 
          req: [{name:"eCXD (INE)", url:"https://ine.com"}], 
          des: [{name:"GREM (SANS)", url:"https://www.giac.org"}, {name:"OSED (OffSec)", url:"https://www.offensive-security.com"}] 
        }
      ]
    },
    {
      id: "arch", title: "Security Engineering & Architecture", align: "right", desc: "Designing robust, secure network and cloud infrastructures.",
      paths: [
        { 
          name: "Cloud Security", 
          req: [{name:"Cloud+ (CompTIA)", url:"https://www.comptia.org"}, {name:"AWS Security", url:"https://aws.amazon.com"}], 
          des: [{name:"CCSP (ISC2)", url:"https://www.isc2.org"}, {name:"GCLD (SANS)", url:"https://www.giac.org"}] 
        },
        { 
          name: "Network & Infrastructure Security", 
          req: [{name:"CCNA (Cisco)", url:"https://www.cisco.com"}, {name:"Network+ (CompTIA)", url:"https://www.comptia.org"}], 
          des: [{name:"CCNP Security (Cisco)", url:"https://www.cisco.com"}, {name:"CASP+ (CompTIA)", url:"https://www.comptia.org"}] 
        },
        { 
          name: "Application Security (DevSecOps)", 
          req: [{name:"CASE (EC-Council)", url:"https://www.eccouncil.org"}, {name:"CSSLP (ISC2)", url:"https://www.isc2.org"}], 
          des: [{name:"GWEB (SANS)", url:"https://www.giac.org"}, {name:"CASS (EC-Council)", url:"https://www.eccouncil.org"}] 
        }
      ]
    }
  ];

  var html = '<div class="spine-root"><h2>Cybersecurity</h2></div>';

  domains.forEach(function(d) {
    var branchClass = d.align === 'right' ? ' right' : '';
    html += '<div class="spine-branch' + branchClass + '">';
    html += '<div class="branch-card">';
    html += '<h3>' + d.title + '</h3><p>' + d.desc + '</p>';
    
    d.paths.forEach(function(path) {
      var reqLinks = path.req.map(function(c) { return '<a href="'+c.url+'" target="_blank" rel="noopener" class="cert-link">'+c.name+'</a>'; }).join("");
      var desLinks = path.des.map(function(c) { return '<a href="'+c.url+'" target="_blank" rel="noopener" class="cert-link">'+c.name+'</a>'; }).join("");
      
      html += '<div class="path-card" onclick="this.classList.toggle(\'active\')">';
      html += '<div class="path-header"><h4>'+path.name+'</h4><span class="toggle-icon">+</span></div>';
      html += '<div class="path-details">';
      html += '<div class="cert-grid">';
      html += '<div class="cert-box"><strong>Required / Entry</strong>' + reqLinks + '</div>';
      html += '<div class="cert-box"><strong>Desired / Pro</strong>' + desLinks + '</div>';
      html += '</div></div></div>';
    });

    html += '</div></div>';
  });

  container.innerHTML = html;
}




function renderScoreboard() {
  var wrap = document.querySelector("[data-scoreboard]");
  if (!wrap) return;
  var events = [
    { rank: 1, team: "NullPointers", solved: 11, score: 4780 },
    { rank: 2, team: "PacketRiders", solved: 10, score: 4410 },
    { rank: 3, team: "SegFault Club", solved: 9, score: 3970 },
    { rank: 4, team: "BlueTrace", solved: 8, score: 3650 },
    { rank: 5, team: "RootRoute", solved: 7, score: 3330 }
  ];
  wrap.innerHTML = events.map(function (row) {
    return "<tr><td>#" + row.rank + "</td><td>" + row.team + "</td><td>" + row.solved + "</td><td>" + row.score + "</td></tr>";
  }).join("");
}

// ============================================
// JOIN FORM
// ============================================

/** Trim, lowercase if asked, and return value of a named field. */
function _joinField(form, name) {
  var el = form.querySelector('[name="' + name + '"]');
  return el ? String(el.value || "").trim() : "";
}

/** Render an inline error message under the field and mark it invalid. */
function _joinSetFieldError(form, name, message) {
  var el = form.querySelector('[name="' + name + '"]');
  if (!el) return;
  el.classList.add("invalid");
  var wrap = el.parentElement;
  // The phone wrapper for phoneCountry/phoneNumber lives one level up.
  var host = wrap && wrap.classList.contains("form-grid") ? wrap : wrap;
  var existing = host && host.querySelector('.field-error[data-for="' + name + '"]');
  if (existing) { existing.textContent = message; return; }
  var errEl = document.createElement("small");
  errEl.className = "field-error";
  errEl.setAttribute("data-for", name);
  errEl.textContent = message;
  host.appendChild(errEl);
}

/** Wipe any error styling/messages set by a previous submit attempt. */
function _joinClearErrors(form) {
  form.querySelectorAll(".invalid").forEach(function (el) {
    el.classList.remove("invalid");
  });
  form.querySelectorAll(".field-error").forEach(function (el) {
    el.parentNode && el.parentNode.removeChild(el);
  });
}

/** Run the same checks the backend will. Returns null if valid, else error map. */
function _validateJoinPayload(form) {
  var errors = {};

  var name = _joinField(form, "name");
  if (!name)                                errors.name = "Full name is required.";
  else if (!/^\s*\S+\s+\S+/.test(name))     errors.name = "Enter your first and last name.";

  var email = _joinField(form, "email").toLowerCase();
  if (!email)                               errors.email = "University email is required.";
  else if (!/^[^\s@]+@utb\.edu\.bh$/i.test(email)) {
    errors.email = "Use your @utb.edu.bh email address.";
  }

  var studentId = _joinField(form, "studentId");
  if (!studentId)                           errors.studentId = "Student ID is required.";
  else if (!/^bh[A-Za-z0-9]+$/i.test(studentId)) {
    errors.studentId = "Student ID must start with \u201Cbh\u201D.";
  }

  // Phone is optional, but if either side is filled both must validate.
  var phoneCountry = _joinField(form, "phoneCountry");
  var phoneNumber  = _joinField(form, "phoneNumber").replace(/\s+/g, "");
  if (phoneNumber) {
    if (!/^\+\d{1,4}$/.test(phoneCountry)) {
      errors.phoneNumber = "Pick a country code from the list.";
    } else if (!/^[0-9]{6,12}$/.test(phoneNumber)) {
      errors.phoneNumber = "Phone must be 6\u201312 digits.";
    }
  }

  return Object.keys(errors).length ? errors : null;
}

function initJoinForm() {
  var form = document.querySelector("[data-join-form]");
  var resultDiv = document.querySelector("[data-join-result]");
  if (!form || !resultDiv) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    _joinClearErrors(form);

    var errors = _validateJoinPayload(form);
    if (errors) {
      Object.keys(errors).forEach(function (name) {
        _joinSetFieldError(form, name, errors[name]);
      });
      resultDiv.innerHTML =
        '<div class="muted-box" style="border-color:var(--warning, #ff9b3d);">' +
        "\u274c Please fix the highlighted fields and try again." +
        "</div>";
      return;
    }

    // Combine country code + national number into one E.164-ish string.
    var phoneCountry = _joinField(form, "phoneCountry");
    var phoneNumber  = _joinField(form, "phoneNumber").replace(/\s+/g, "");
    var phoneCombined = phoneNumber ? (phoneCountry + " " + phoneNumber) : "";

    var payload = {
      name:       _joinField(form, "name"),
      email:      _joinField(form, "email").toLowerCase(),
      studentId:  _joinField(form, "studentId"),
      year:       _joinField(form, "year"),
      phone:      phoneCombined,
      major:      _joinField(form, "major"),
      motivation: _joinField(form, "motivation"),
    };

    resultDiv.innerHTML = '<div class="muted-box">Submitting…</div>';
    var result = await apiFetch("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (result.ok) {
      resultDiv.innerHTML =
        '<div class="muted-box" style="background:rgba(255,47,79,0.1);border-color:var(--accent);">' +
        '<strong>✅ Application Submitted!</strong><br>' +
        'Thank you ' + payload.name + '! Your application has been received.<br>' +
        '<small>The club admin will review your application within 1–2 business days.</small></div>';
      form.reset();

      // Send email notification via EmailJS (defined in join.html)
      if (typeof window.sendApplicationEmail === 'function') {
        window.sendApplicationEmail(
          payload.name,
          payload.email,
          payload.studentId,
          payload.year,
          payload.major,
          payload.phone,
          payload.motivation
        ).then(function () {
          console.log('EmailJS: notification sent successfully.');
        }).catch(function (err) {
          console.warn('EmailJS: notification failed.', err);
        });
      }
    } else {
      // Server-side validation maps onto the same field names we used
      // on the client — surface them inline if available.
      if (result.data && result.data.fields) {
        Object.keys(result.data.fields).forEach(function (name) {
          _joinSetFieldError(form, name, result.data.fields[name]);
        });
      }
      resultDiv.innerHTML =
        '<div class="muted-box" style="border-color:var(--warning);">❌ ' +
        (result.data.error || "Submission failed. Please try again.") + '</div>';
    }
  });
}

// ============================================
// LOGIN
// ============================================
function initLogin() {
  var form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("loginEmail").value;
    var password = document.getElementById("loginPassword").value;
    var statusDiv = document.getElementById("loginStatus");

    statusDiv.innerHTML = "<div>Logging in…</div>";
    var result = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });

    if (result.ok) {
      setToken(result.data.token);
      statusDiv.innerHTML = '<div style="color:var(--accent);">✅ Login successful! Redirecting…</div>';
      setTimeout(function () { window.location.href = "dashboard.html"; }, 1000);
    } else {
      statusDiv.innerHTML = '<div style="color:var(--warning);">❌ ' + (result.data.error || "Invalid credentials") + '</div>';
    }
  });
}

// ============================================
// DASHBOARD
// ============================================
var TOTAL_TASKS = 34;
var TOTAL_MODULES = 9;
var TOTAL_POSSIBLE_XP = 470;
var linuxTasksXP = {
  1: 10, 2: 10, 3: 10, 4: 15, 5: 10, 6: 10, 7: 10, 8: 15,
  9: 15, 10: 15, 11: 10, 12: 15, 13: 10, 14: 20, 15: 10,
  16: 15, 17: 15, 18: 15, 19: 20, 20: 20, 21: 20, 22: 15,
  23: 15, 24: 10, 25: 5, 26: 5, 27: 10, 28: 10, 29: 10,
  30: 15, 31: 10, 32: 10, 33: 10, 34: 15
};

// Network Fundamentals course totals. Keep in sync with backend/network_tasks.py.
var NETWORK_TOTAL_TASKS = 37;
var NETWORK_TOTAL_CHAPTERS = 9;
var NETWORK_TOTAL_XP = 435;

// Web & Application Fundamentals course totals. Keep in sync with backend/web_tasks.py.
var WEB_TOTAL_TASKS = 36;
var WEB_TOTAL_CHAPTERS = 9;
var WEB_TOTAL_XP = 465;

// Cybersecurity Ethics & Laws course totals. Keep in sync with backend/ethics_quiz.py.
var ETHICS_TOTAL_QUESTIONS = 36;
var ETHICS_TOTAL_CHAPTERS  = 9;
var ETHICS_TOTAL_XP        = 442;

// Cryptography course totals. Keep in sync with backend/crypto_tasks.py.
var CRYPTO_TOTAL_TASKS    = 36;
var CRYPTO_TOTAL_CHAPTERS = 9;
var CRYPTO_TOTAL_XP       = 443;

// Penetration Testing course totals. Keep in sync with backend/pentest_tasks.py.
var PENTEST_TOTAL_TASKS    = 48;
var PENTEST_TOTAL_CHAPTERS = 12;
var PENTEST_TOTAL_XP       = 685;

// =============================================================================
// COURSE UNLOCK CHAIN + ENROLLMENT (mirrors backend/routes/progress.py)
// -----------------------------------------------------------------------------
// Courses are sequential: ethics is always available, every other course
// requires its predecessor to be 100% complete. Enrollment is separate —
// the dashboard only shows courses the member has explicitly enrolled in.
// =============================================================================
var COURSE_ORDER = ["ethics", "linux", "network", "crypto", "web", "pentest"];
var COURSE_PREREQ = {
  ethics:  null,
  linux:   "ethics",
  network: "linux",
  crypto:  "network",
  web:     "crypto",
  pentest: "web",
};
var COURSE_LABEL = {
  ethics:  "Cybersecurity Ethics & Laws",
  linux:   "Linux Fundamentals",
  network: "Network Fundamentals",
  crypto:  "Cryptography",
  web:     "Web & Application Fundamentals",
  pentest: "Penetration Testing",
};

// Cached enrollment snapshot. Populated by getUserEnrollments() and read
// by both the dashboard and the learning-hub renderers so we only hit
// /api/progress/enrollments once per page load.
var _enrollmentCache = null;

/**
 * Fetch the member's {enrolled, unlocked, complete} from the server.
 * Returns a safe default for guests (only "ethics" unlocked).
 */
async function getUserEnrollments(opts) {
  opts = opts || {};
  if (!opts.force && _enrollmentCache) return _enrollmentCache;
  if (!isLoggedIn()) {
    _enrollmentCache = {
      enrolled: [], unlocked: ["ethics"], complete: [],
      order: COURSE_ORDER, prerequisites: COURSE_PREREQ,
    };
    return _enrollmentCache;
  }
  var result = await apiFetch("/progress/enrollments", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    _enrollmentCache = {
      enrolled: [], unlocked: ["ethics"], complete: [],
      order: COURSE_ORDER, prerequisites: COURSE_PREREQ,
    };
    return _enrollmentCache;
  }
  _enrollmentCache = result.data;
  return _enrollmentCache;
}

/**
 * POST /api/progress/enroll. Returns the fresh enrollment snapshot on
 * success, or null on failure. Errors are surfaced via alert() so the
 * caller doesn't have to.
 */
async function enrollInCourse(course) {
  if (!isLoggedIn()) {
    alert("Please log in to enroll in a course.");
    return null;
  }
  var result = await apiFetch("/progress/enroll", {
    method: "POST",
    headers: authHeaders(getToken()),
    body: JSON.stringify({ course: course }),
  });
  if (!result.ok) {
    var msg = (result.data && (result.data.message || result.data.error)) ||
              "Could not enroll. Make sure you've finished the previous course.";
    alert(msg);
    return null;
  }
  // Refresh the cache with the snapshot the server returned.
  if (result.data && result.data.enrolled) {
    _enrollmentCache = {
      enrolled: result.data.enrolled,
      unlocked: result.data.unlocked,
      complete: result.data.complete,
      order:    result.data.order || COURSE_ORDER,
      prerequisites: result.data.prerequisites || COURSE_PREREQ,
    };
  } else {
    _enrollmentCache = null;  // force refetch
  }
  return _enrollmentCache;
}

// Helper: count how many pentest chapters are fully complete.
function getCompletedPentestChapters(completedTaskIds) {
  if (!completedTaskIds || completedTaskIds.length === 0) return 0;
  // Pentest IDs follow the pattern (chapter * 100) + 4000 + n for chapter 1..9
  // (4101..4904) and (chapter * 100) + 4000 + n still works for 10..12 since
  // 4000 + 1000 + 1 = 5001 is exactly the 10*100+4000+1 we want. So:
  // chapter 1 → 4101..4104, chapter 12 → 5201..5204.
  var done = {};
  completedTaskIds.forEach(function (id) { done[id] = true; });
  var byChapter = {
    1:  [4101, 4102, 4103, 4104],
    2:  [4201, 4202, 4203, 4204],
    3:  [4301, 4302, 4303, 4304],
    4:  [4401, 4402, 4403, 4404],
    5:  [4501, 4502, 4503, 4504],
    6:  [4601, 4602, 4603, 4604],
    7:  [4701, 4702, 4703, 4704],
    8:  [4801, 4802, 4803, 4804],
    9:  [4901, 4902, 4903, 4904],
    10: [5001, 5002, 5003, 5004],
    11: [5101, 5102, 5103, 5104],
    12: [5201, 5202, 5203, 5204]
  };
  var finished = 0;
  for (var ch in byChapter) {
    var ok = true;
    for (var i = 0; i < byChapter[ch].length; i++) {
      if (!done[byChapter[ch][i]]) { ok = false; break; }
    }
    if (ok) finished++;
  }
  return finished;
}

// One-shot fetcher for the pentest progress row.
async function getUserPentestProgress() {
  if (!isLoggedIn()) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: PENTEST_TOTAL_XP };
  }
  var result = await apiFetch("/progress/pentest", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: PENTEST_TOTAL_XP };
  }
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    totalPossibleXP: result.data.totalPossibleXP || PENTEST_TOTAL_XP
  };
}

// Helper: count how many crypto chapters are fully complete.
function getCompletedCryptoChapters(completedTaskIds) {
  if (!completedTaskIds || completedTaskIds.length === 0) return 0;
  // Crypto IDs follow the pattern (chapter * 100) + 3000 + n (1..9 → 3101..3904).
  var done = {};
  completedTaskIds.forEach(function (id) { done[id] = true; });
  var byChapter = {
    1: [3101, 3102, 3103, 3104],
    2: [3201, 3202, 3203, 3204],
    3: [3301, 3302, 3303, 3304],
    4: [3401, 3402, 3403, 3404],
    5: [3501, 3502, 3503, 3504],
    6: [3601, 3602, 3603, 3604],
    7: [3701, 3702, 3703, 3704],
    8: [3801, 3802, 3803, 3804],
    9: [3901, 3902, 3903, 3904]
  };
  var finished = 0;
  for (var ch in byChapter) {
    var ok = true;
    for (var i = 0; i < byChapter[ch].length; i++) {
      if (!done[byChapter[ch][i]]) { ok = false; break; }
    }
    if (ok) finished++;
  }
  return finished;
}

// One-shot fetcher for the crypto progress row.
async function getUserCryptoProgress() {
  if (!isLoggedIn()) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: CRYPTO_TOTAL_XP };
  }
  var result = await apiFetch("/progress/crypto", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: CRYPTO_TOTAL_XP };
  }
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    totalPossibleXP: result.data.totalPossibleXP || CRYPTO_TOTAL_XP
  };
}

// Helper: count how many ethics chapters are fully complete.
function getCompletedEthicsChapters(completedQuestionIds) {
  if (!completedQuestionIds || completedQuestionIds.length === 0) return 0;
  // Ethics question IDs are (chapter * 100) + 2000 + n (chapter 1 → 2101..2199, etc.)
  // mirroring backend/ethics_quiz.py.
  var done = {};
  completedQuestionIds.forEach(function (id) { done[id] = true; });
  var byChapter = {
    1: [2101, 2102, 2103, 2104],
    2: [2201, 2202, 2203, 2204],
    3: [2301, 2302, 2303, 2304],
    4: [2401, 2402, 2403, 2404],
    5: [2501, 2502, 2503, 2504],
    6: [2601, 2602, 2603, 2604],
    7: [2701, 2702, 2703, 2704],
    8: [2801, 2802, 2803, 2804],
    9: [2901, 2902, 2903, 2904]
  };
  var finished = 0;
  for (var ch in byChapter) {
    var ok = true;
    for (var i = 0; i < byChapter[ch].length; i++) {
      if (!done[byChapter[ch][i]]) { ok = false; break; }
    }
    if (ok) finished++;
  }
  return finished;
}

// One-shot fetcher for the ethics progress row.
async function getUserEthicsProgress() {
  if (!isLoggedIn()) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: ETHICS_TOTAL_XP };
  }
  var result = await apiFetch("/progress/ethics", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: ETHICS_TOTAL_XP };
  }
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    totalPossibleXP: result.data.totalPossibleXP || ETHICS_TOTAL_XP
  };
}

// Helper: count how many web chapters are fully complete.
function getCompletedWebChapters(completedTaskIds) {
  if (!completedTaskIds || completedTaskIds.length === 0) return 0;
  // Web task IDs follow the pattern (chapter * 100) + 1000 + n where chapter is 1..9.
  // i.e. chapter 1 → 1101..1199, chapter 2 → 1201..1299, etc.
  var done = {};
  completedTaskIds.forEach(function (id) { done[id] = true; });
  // Ids per chapter (mirrors backend/web_tasks.py):
  var byChapter = {
    1: [1101, 1102, 1103, 1104],
    2: [1201, 1202, 1203, 1204],
    3: [1301, 1302, 1303, 1304],
    4: [1401, 1402, 1403, 1404],
    5: [1501, 1502, 1503, 1504],
    6: [1601, 1602, 1603, 1604],
    7: [1701, 1702, 1703, 1704],
    8: [1801, 1802, 1803, 1804],
    9: [1901, 1902, 1903, 1904]
  };
  var finished = 0;
  for (var ch in byChapter) {
    var ok = true;
    for (var i = 0; i < byChapter[ch].length; i++) {
      if (!done[byChapter[ch][i]]) { ok = false; break; }
    }
    if (ok) finished++;
  }
  return finished;
}

// One-shot fetcher for the web progress row.
async function getUserWebProgress() {
  if (!isLoggedIn()) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: WEB_TOTAL_XP };
  }
  var result = await apiFetch("/progress/web", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: WEB_TOTAL_XP };
  }
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    totalPossibleXP: result.data.totalPossibleXP || WEB_TOTAL_XP
  };
}

// Helper: count how many network chapters are fully complete.
function getCompletedNetworkChapters(completedTaskIds) {
  if (!completedTaskIds || completedTaskIds.length === 0) return 0;
  // Network task IDs follow the pattern {chapter * 100 + n} where chapter is 1..9.
  // Each chapter has its own set of IDs at 1xx, 2xx, ..., 9xx.
  var done = {};
  completedTaskIds.forEach(function (id) { done[id] = true; });
  // Ids per chapter (mirrors backend/network_tasks.py):
  var byChapter = {
    1: [101, 102, 103, 104],
    2: [201, 202, 203, 204],
    3: [301, 302, 303, 304],
    4: [401, 402, 403, 404],
    5: [501, 502, 503, 504],
    6: [601, 602, 603, 604],
    7: [701, 702, 703, 704],
    8: [801, 802, 803, 804, 805],
    9: [901, 902, 903, 904]
  };
  var finished = 0;
  for (var ch in byChapter) {
    var ok = true;
    for (var i = 0; i < byChapter[ch].length; i++) {
      if (!done[byChapter[ch][i]]) { ok = false; break; }
    }
    if (ok) finished++;
  }
  return finished;
}

// One-shot fetcher for the network progress row.
async function getUserNetworkProgress() {
  if (!isLoggedIn()) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: NETWORK_TOTAL_XP };
  }
  var result = await apiFetch("/progress/network", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    return { completedTasks: [], totalXP: 0, totalPossibleXP: NETWORK_TOTAL_XP };
  }
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    totalPossibleXP: result.data.totalPossibleXP || NETWORK_TOTAL_XP
  };
}

function getCompletedModulesCount(completedTasks) {
  if (!completedTasks || completedTasks.length === 0) return 0;
  var moduleTasks = [3, 4, 5, 4, 7, 3, 3, 3, 2]; // task counts per module (9 modules, 34 tasks total)
  var taskIndex = 1, modulesCompleted = 0;
  for (var i = 0; i < moduleTasks.length; i++) {
    var ok = true;
    for (var j = 0; j < moduleTasks[i]; j++) {
      if (!completedTasks.includes(taskIndex + j)) { ok = false; break; }
    }
    if (ok) modulesCompleted++;
    taskIndex += moduleTasks[i];
  }
  return modulesCompleted;
}

async function renderLeaderboard() {
  var body = document.getElementById("leaderboardBody");
  if (!body) return;

  var result = await apiFetch("/members", { headers: authHeaders(getToken()) });
  if (!result.ok || !Array.isArray(result.data)) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;">Unable to load leaderboard</td></tr>';
    return;
  }

  var members = result.data;
  var claims = getToken() ? decodeJwt(getToken()) : {};
  var myId = claims.sub ? parseInt(claims.sub) : -1;

  if (members.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;">No members yet</td></tr>';
    return;
  }

  body.innerHTML = members.map(function (m, index) {
    var rank = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "#" + (index + 1);
    var isYou = m.id === myId;
    var taskCount = m.tasksCompleted || 0;
    // Show just the count of completed tasks instead of "X/34". The total
    // grew from 34 (Linux only) to 71 once the Network course was added,
    // and the denominator was no longer meaningful at a glance.
    return "<tr><td style='font-weight:bold;'>" + rank + "</td><td>" +
      m.name + (isYou ? ' <span class="tag" style="font-size:10px;">You</span>' : "") +
      "</td><td><strong>" + (m.points || 0) + "</strong> XP</td><td>" +
      taskCount + " task" + (taskCount === 1 ? "" : "s") + "</td></tr>";
  }).join("");
}

async function updateDashboard() {
  await renderLeaderboard();

  var memberOnlyDiv = document.getElementById("memberOnlyContent");
  var loginPromptDiv = document.getElementById("loginPrompt");
  if (!memberOnlyDiv || !loginPromptDiv) return;

  if (!isLoggedIn()) {
    memberOnlyDiv.style.display = "none";
    loginPromptDiv.style.display = "block";
    return;
  }

  var meResult = await apiFetch("/auth/me", { headers: authHeaders(getToken()) });
  if (!meResult.ok) {
    clearToken();
    window.location.reload();
    return;
  }

  var user = meResult.data;
  memberOnlyDiv.style.display = "block";
  loginPromptDiv.style.display = "none";
  document.getElementById("memberName").textContent = user.name || "Member";
  document.getElementById("memberEmail").textContent = user.email || "";
  document.getElementById("memberStatus").textContent = user.status || "Active Member";

  // Linux progress (course 1)
  var progResult = await apiFetch("/progress", { headers: authHeaders(getToken()) });
  var progress = progResult.ok ? progResult.data : { completedTasks: [], totalXP: 0, labCompleted: false };

  // Enrollment snapshot — the dashboard only shows courses the member
  // explicitly enrolled in. We still fetch progress for every course so
  // the totals are correct if a course was once enrolled and is now
  // disabled (theoretical — we don't expose un-enroll yet).
  var enrollment = await getUserEnrollments({ force: true });
  var enrolledSet = new Set(enrollment.enrolled || []);

  // Network / Web / Ethics / Crypto / Pentest progress — fetched alongside
  // the Linux row so the dashboard totals reflect ALL SIX courses.
  var netProgress     = await getUserNetworkProgress();
  var webProgress     = await getUserWebProgress();
  var ethicsProgress  = await getUserEthicsProgress();
  var cryptoProgress  = await getUserCryptoProgress();
  var pentestProgress = await getUserPentestProgress();

  // Personal stats (combined across all six courses).
  var linuxTasksDone   = (progress.completedTasks || []).length;
  var networkTasksDone = (netProgress.completedTasks || []).length;
  var webTasksDone     = (webProgress.completedTasks || []).length;
  var ethicsDone       = (ethicsProgress.completedTasks || []).length;
  var cryptoDone       = (cryptoProgress.completedTasks || []).length;
  var pentestDone      = (pentestProgress.completedTasks || []).length;
  var tasksCompleted   = linuxTasksDone + networkTasksDone + webTasksDone + ethicsDone + cryptoDone + pentestDone;

  var linuxPoints   = (progress.totalXP || 0) + (progress.labCompleted ? 50 : 0);
  var networkPoints = (netProgress.totalXP || 0);
  var webPoints     = (webProgress.totalXP || 0);
  var ethicsPoints  = (ethicsProgress.totalXP || 0);
  var cryptoPoints  = (cryptoProgress.totalXP || 0);
  var pentestPoints = (pentestProgress.totalXP || 0);
  var totalPoints   = linuxPoints + networkPoints + webPoints + ethicsPoints + cryptoPoints + pentestPoints;

  var linuxModules   = getCompletedModulesCount(progress.completedTasks || []);
  var networkModules = getCompletedNetworkChapters(netProgress.completedTasks || []);
  var webModules     = getCompletedWebChapters(webProgress.completedTasks || []);
  var ethicsModules  = getCompletedEthicsChapters(ethicsProgress.completedTasks || []);
  var cryptoModules  = getCompletedCryptoChapters(cryptoProgress.completedTasks || []);
  var pentestModules = getCompletedPentestChapters(pentestProgress.completedTasks || []);
  var modulesCompleted = linuxModules + networkModules + webModules + ethicsModules + cryptoModules + pentestModules;

  document.getElementById("statPoints").textContent = totalPoints;
  document.getElementById("statTasks").textContent = tasksCompleted;
  document.getElementById("statModules").textContent = modulesCompleted;

  var membersResult = await apiFetch("/members", { headers: authHeaders(getToken()) });
  var allMembers = membersResult.ok && Array.isArray(membersResult.data) ? membersResult.data : [];
  var sorted = allMembers.slice().sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
  var claims = decodeJwt(getToken());
  var myId = parseInt(claims.sub);  // JWT identity is the member's numeric ID
  var userRank = sorted.findIndex(function (m) { return m.id === myId; }) + 1;

  document.getElementById("statRank").textContent = userRank > 0 ? "#" + userRank : "#N/A";
  document.getElementById("rankOutOf").textContent = "out of " + sorted.length + " members";

  var topPoints = sorted.length > 0 ? (sorted[0].points || 0) : 0;
  var pointsNeeded = Math.max(0, topPoints - totalPoints);
  var pct = topPoints > 0 ? (totalPoints / topPoints) * 100 : 0;

  document.getElementById("pointsNeeded").textContent = pointsNeeded + " points needed";
  document.getElementById("progressBar").style.width = pct + "%";
  document.getElementById("currentPoints").textContent = "Current: " + totalPoints + " pts";
  document.getElementById("topPoints").textContent = "Top #1: " + topPoints + " pts";

  // Courses section — pass all six course progress rows AND the
  // enrollment set, so the renderers can hide cards / activity rows for
  // courses the member has not yet enrolled in.
  renderCourses(progress, netProgress, webProgress, ethicsProgress, cryptoProgress, pentestProgress, enrolledSet);
  renderActivity(progress, netProgress, webProgress, ethicsProgress, cryptoProgress, pentestProgress, enrolledSet);

  // Friends feed + XP comparison — only when the member has friends.
  var feed = await getFriendsFeed();
  renderFriendsFeed(feed);
  renderFriendsComparison(feed);

  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      clearToken();
      window.location.reload();
    });
  }
}

function renderCourses(progress, netProgress, webProgress, ethicsProgress, cryptoProgress, pentestProgress, enrolledSet) {
  var container = document.getElementById("coursesList");
  if (!container) return;
  netProgress     = netProgress     || { completedTasks: [], totalXP: 0, totalPossibleXP: NETWORK_TOTAL_XP };
  webProgress     = webProgress     || { completedTasks: [], totalXP: 0, totalPossibleXP: WEB_TOTAL_XP };
  ethicsProgress  = ethicsProgress  || { completedTasks: [], totalXP: 0, totalPossibleXP: ETHICS_TOTAL_XP };
  cryptoProgress  = cryptoProgress  || { completedTasks: [], totalXP: 0, totalPossibleXP: CRYPTO_TOTAL_XP };
  pentestProgress = pentestProgress || { completedTasks: [], totalXP: 0, totalPossibleXP: PENTEST_TOTAL_XP };
  enrolledSet     = enrolledSet     || new Set();

  var tasksCompleted    = (progress.completedTasks || []).length;
  var netTasksCompleted = (netProgress.completedTasks || []).length;
  var webTasksCompleted = (webProgress.completedTasks || []).length;
  var ethicsCompleted   = (ethicsProgress.completedTasks || []).length;
  var cryptoCompleted   = (cryptoProgress.completedTasks || []).length;
  var pentestCompleted  = (pentestProgress.completedTasks || []).length;
  var labCompleted      = progress.labCompleted;

  // Empty state when the member is enrolled in NOTHING. Direct them to
  // the Learning hub to enrol in their first course (Ethics).
  if (enrolledSet.size === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:48px 20px;">' +
      '<div style="font-size:56px;margin-bottom:16px;">📚</div>' +
      '<h3 style="margin:0 0 10px;">No courses on your dashboard yet</h3>' +
      '<p style="color:#888;margin:0 0 24px;font-size:14px;">Head to the Learning page and enrol in your first course — start with <strong>Cybersecurity Ethics &amp; Laws</strong>, then Linux, Network, Cryptography, Web, and finally Penetration Testing.</p>' +
      '<a href="learning.html" class="btn btn-primary">Go to Learning →</a>' +
      '</div>';
    return;
  }

  var totalTasks = TOTAL_TASKS;
  var taskPct = (tasksCompleted / totalTasks) * 100;
  var modulesCompleted = getCompletedModulesCount(progress.completedTasks || []);
  var modulePct = (modulesCompleted / TOTAL_MODULES) * 100;
  var earnedXP = progress.totalXP || 0;
  var totalEarned = earnedXP + (labCompleted ? 50 : 0);
  var totalPossible = TOTAL_POSSIBLE_XP;
  var courseStatus = tasksCompleted === totalTasks ? "completed" : tasksCompleted > 0 ? "in-progress" : "locked";
  var borderColor = courseStatus === "completed" ? "#27c93f" : courseStatus === "in-progress" ? "#ffbd2e" : "transparent";

  // ---- Linux Fundamentals card ----
  var linuxCard =
    '<div class="course-card ' + courseStatus + '" style="border-left:3px solid ' + borderColor + ';">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">🐧</span>' +
    '<div><h3 style="margin:0;">Linux Fundamentals</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Academy-style Linux path with search, permissions, archives, and a Docker capstone lab</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,var(--accent),var(--accent-2));border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;">' + totalEarned + '/' + totalPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Tasks</span><span style="font-size:12px;">' + tasksCompleted + '/' + totalTasks + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + taskPct + '%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Modules</span><span style="font-size:12px;">' + modulesCompleted + '/' + TOTAL_MODULES + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + modulePct + '%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + earnedXP + ' XP earned</span><span>' + modulesCompleted + ' modules completed</span></div>' +
    (courseStatus === "completed" && !labCompleted
      ? '<div style="margin-top:12px;"><a href="linux-lab.html?lab=true" class="btn btn-primary" style="padding:8px 16px;font-size:13px;">Take Final Lab (+50 XP)</a></div>'
      : "") +
    (labCompleted
      ? '<div style="margin-top:12px;"><span style="color:#27c93f;">Lab Completed! +50 Bonus XP</span></div>'
      : "") +
    (courseStatus === "in-progress"
      ? '<div style="margin-top:12px;"><a href="linux-lab.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // ---- Network Fundamentals card ----
  var netEarned = netProgress.totalXP || 0;
  var netPossible = netProgress.totalPossibleXP || NETWORK_TOTAL_XP;
  var netChapters = getCompletedNetworkChapters(netProgress.completedTasks || []);
  var netTaskPct = (netTasksCompleted / NETWORK_TOTAL_TASKS) * 100;
  var netChapterPct = (netChapters / NETWORK_TOTAL_CHAPTERS) * 100;
  var netStatus =
    netTasksCompleted === NETWORK_TOTAL_TASKS ? "completed" :
    netTasksCompleted > 0 ? "in-progress" : "locked";
  var netBorder = netStatus === "completed" ? "#27c93f" : netStatus === "in-progress" ? "#3caaff" : "transparent";

  var networkCard =
    '<div class="course-card ' + netStatus + '" style="border-left:3px solid ' + netBorder + '; margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">🌐</span>' +
    '<div><h3 style="margin:0;">Network Fundamentals</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Nine beginner chapters with an in-browser terminal and a live topology lab — no installs required.</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,#3caaff,#6ea6ff);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:#0a0a0d;">' + netEarned + '/' + netPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Tasks</span><span style="font-size:12px;">' + netTasksCompleted + '/' + NETWORK_TOTAL_TASKS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + netTaskPct + '%;height:100%;background:linear-gradient(90deg,#3caaff,#6ea6ff);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Chapters</span><span style="font-size:12px;">' + netChapters + '/' + NETWORK_TOTAL_CHAPTERS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + netChapterPct + '%;height:100%;background:linear-gradient(90deg,#3caaff,#6ea6ff);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + netEarned + ' XP earned</span><span>' + netChapters + ' chapters completed</span></div>' +
    (netStatus !== "locked"
      ? '<div style="margin-top:12px;"><a href="network-fundamentals.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // ---- Web & Application Fundamentals card ----
  var webEarned = webProgress.totalXP || 0;
  var webPossible = webProgress.totalPossibleXP || WEB_TOTAL_XP;
  var webChapters = getCompletedWebChapters(webProgress.completedTasks || []);
  var webTaskPct = (webTasksCompleted / WEB_TOTAL_TASKS) * 100;
  var webChapterPct = (webChapters / WEB_TOTAL_CHAPTERS) * 100;
  var webStatus =
    webTasksCompleted === WEB_TOTAL_TASKS ? "completed" :
    webTasksCompleted > 0 ? "in-progress" : "locked";
  var webBorder = webStatus === "completed" ? "#27c93f" : webStatus === "in-progress" ? "#b29cff" : "transparent";

  var webCard =
    '<div class="course-card ' + webStatus + '" style="border-left:3px solid ' + webBorder + '; margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">🕸️</span>' +
    '<div><h3 style="margin:0;">Web &amp; Application Fundamentals</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Nine beginner chapters covering clients/servers, HTTP vs HTTPS, DNS, URLs, headers, proxies and the developer toolbox — all with an in-browser sandbox.</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,#b29cff,#7c4dff);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:#0a0a0d;">' + webEarned + '/' + webPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Tasks</span><span style="font-size:12px;">' + webTasksCompleted + '/' + WEB_TOTAL_TASKS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + webTaskPct + '%;height:100%;background:linear-gradient(90deg,#b29cff,#7c4dff);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Chapters</span><span style="font-size:12px;">' + webChapters + '/' + WEB_TOTAL_CHAPTERS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + webChapterPct + '%;height:100%;background:linear-gradient(90deg,#b29cff,#7c4dff);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + webEarned + ' XP earned</span><span>' + webChapters + ' chapters completed</span></div>' +
    (webStatus !== "locked"
      ? '<div style="margin-top:12px;"><a href="web-fundamentals.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // ---- Cybersecurity Ethics & Laws card ----
  var ethicsEarned    = ethicsProgress.totalXP || 0;
  var ethicsPossible  = ethicsProgress.totalPossibleXP || ETHICS_TOTAL_XP;
  var ethicsChapters  = getCompletedEthicsChapters(ethicsProgress.completedTasks || []);
  var ethicsTaskPct   = (ethicsCompleted / ETHICS_TOTAL_QUESTIONS) * 100;
  var ethicsChapPct   = (ethicsChapters / ETHICS_TOTAL_CHAPTERS) * 100;
  var ethicsStatus =
    ethicsCompleted === ETHICS_TOTAL_QUESTIONS ? "completed" :
    ethicsCompleted > 0 ? "in-progress" : "locked";
  var ethicsBorder = ethicsStatus === "completed" ? "#27c93f" : ethicsStatus === "in-progress" ? "#ffbd2e" : "transparent";

  var ethicsCard =
    '<div class="course-card ' + ethicsStatus + '" style="border-left:3px solid ' + ethicsBorder + '; margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">⚖️</span>' +
    '<div><h3 style="margin:0;">Cybersecurity Ethics &amp; Laws</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Nine quiz-driven chapters drawn from real curricula — ACM &amp; (ISC)² codes, GDPR, CFAA, Bahrain PDPL, NIST frameworks, EU AI Act.</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,#ffbd2e,#ff8a2e);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:#0a0a0d;">' + ethicsEarned + '/' + ethicsPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Questions</span><span style="font-size:12px;">' + ethicsCompleted + '/' + ETHICS_TOTAL_QUESTIONS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + ethicsTaskPct + '%;height:100%;background:linear-gradient(90deg,#ffbd2e,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Chapters</span><span style="font-size:12px;">' + ethicsChapters + '/' + ETHICS_TOTAL_CHAPTERS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + ethicsChapPct + '%;height:100%;background:linear-gradient(90deg,#ffbd2e,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + ethicsEarned + ' XP earned</span><span>' + ethicsChapters + ' chapters completed</span></div>' +
    (ethicsStatus !== "locked"
      ? '<div style="margin-top:12px;"><a href="cybersecurity-ethics.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // ---- Cryptography card ----
  var cryEarned    = cryptoProgress.totalXP || 0;
  var cryPossible  = cryptoProgress.totalPossibleXP || CRYPTO_TOTAL_XP;
  var cryChapters  = getCompletedCryptoChapters(cryptoProgress.completedTasks || []);
  var cryTaskPct   = (cryptoCompleted / CRYPTO_TOTAL_TASKS) * 100;
  var cryChapPct   = (cryChapters / CRYPTO_TOTAL_CHAPTERS) * 100;
  var cryStatus =
    cryptoCompleted === CRYPTO_TOTAL_TASKS ? "completed" :
    cryptoCompleted > 0 ? "in-progress" : "locked";
  var cryBorder = cryStatus === "completed" ? "#27c93f" : cryStatus === "in-progress" ? "#ff8a2e" : "transparent";

  var cryptoCard =
    '<div class="course-card ' + cryStatus + '" style="border-left:3px solid ' + cryBorder + '; margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">🔑</span>' +
    '<div><h3 style="margin:0;">Cryptography</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Nine connected chapters from Caesar to AES, RSA and digital signatures, with tiny openssl labs in your own sandbox.</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,#ffbd2e,#ff8a2e);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:#0a0a0d;">' + cryEarned + '/' + cryPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Tasks</span><span style="font-size:12px;">' + cryptoCompleted + '/' + CRYPTO_TOTAL_TASKS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + cryTaskPct + '%;height:100%;background:linear-gradient(90deg,#ffbd2e,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Chapters</span><span style="font-size:12px;">' + cryChapters + '/' + CRYPTO_TOTAL_CHAPTERS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + cryChapPct + '%;height:100%;background:linear-gradient(90deg,#ffbd2e,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + cryEarned + ' XP earned</span><span>' + cryChapters + ' chapters completed</span></div>' +
    (cryStatus !== "locked"
      ? '<div style="margin-top:12px;"><a href="cryptography.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // ---- Penetration Testing card ----
  var ptEarned    = pentestProgress.totalXP || 0;
  var ptPossible  = pentestProgress.totalPossibleXP || PENTEST_TOTAL_XP;
  var ptChapters  = getCompletedPentestChapters(pentestProgress.completedTasks || []);
  var ptTaskPct   = (pentestCompleted / PENTEST_TOTAL_TASKS) * 100;
  var ptChapPct   = (ptChapters / PENTEST_TOTAL_CHAPTERS) * 100;
  var ptStatus =
    pentestCompleted === PENTEST_TOTAL_TASKS ? "completed" :
    pentestCompleted > 0 ? "in-progress" : "locked";
  var ptBorder = ptStatus === "completed" ? "#27c93f" : ptStatus === "in-progress" ? "#ff5f56" : "transparent";

  var pentestCard =
    '<div class="course-card ' + ptStatus + '" style="border-left:3px solid ' + ptBorder + '; margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">' +
    '<div style="display:flex;align-items:center;gap:12px;">' +
    '<span style="font-size:28px;">💥</span>' +
    '<div><h3 style="margin:0;">Penetration Testing</h3>' +
    '<p style="margin:4px 0 0;font-size:12px;color:#888;">Twelve chapters from ROE &amp; legal scoping through nmap, gobuster, sqlmap, Burp, Metasploit, john &amp; reporting — in a Kali sandbox.</p></div>' +
    '</div>' +
    '<span style="background:linear-gradient(135deg,#ff5f56,#ff8a2e);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;color:#0a0a0d;">' + ptEarned + '/' + ptPossible + ' XP</span>' +
    '</div>' +
    '<div style="margin-top:16px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Tasks</span><span style="font-size:12px;">' + pentestCompleted + '/' + PENTEST_TOTAL_TASKS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + ptTaskPct + '%;height:100%;background:linear-gradient(90deg,#ff5f56,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="margin-top:12px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;">Chapters</span><span style="font-size:12px;">' + ptChapters + '/' + PENTEST_TOTAL_CHAPTERS + '</span></div>' +
    '<div class="progress-bar-custom"><div style="width:' + ptChapPct + '%;height:100%;background:linear-gradient(90deg,#ff5f56,#ff8a2e);border-radius:3px;"></div></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:12px;"><span>' + ptEarned + ' XP earned</span><span>' + ptChapters + ' chapters completed</span></div>' +
    (ptStatus !== "locked"
      ? '<div style="margin-top:12px;"><a href="penetration-testing.html" class="btn btn-secondary" style="padding:8px 16px;font-size:13px;">Continue Learning →</a></div>'
      : "") +
    '</div>';

  // Stitch only the cards the member is actually enrolled in. Order
  // matches the unlock chain so the dashboard reads top-to-bottom.
  var cards = "";
  if (enrolledSet.has("ethics"))  cards += ethicsCard;
  if (enrolledSet.has("linux"))   cards += linuxCard;
  if (enrolledSet.has("network")) cards += networkCard;
  if (enrolledSet.has("crypto"))  cards += cryptoCard;
  if (enrolledSet.has("web"))     cards += webCard;
  if (enrolledSet.has("pentest")) cards += pentestCard;
  container.innerHTML = cards;
}

// ============================================
// FRIENDS FEED + XP COMPARISON (dashboard)
// ============================================

/**
 * Fetch /api/auth/friends/feed which returns:
 *   { me:{id,name,totalXP}, activities:[…], comparisons:[…] }
 * Returns null on auth failure or network error so callers can simply
 * skip rendering the friends sections.
 */
async function getFriendsFeed() {
  if (!isLoggedIn()) return null;
  var result = await apiFetch("/auth/friends/feed", {
    headers: authHeaders(getToken()),
  });
  if (!result.ok) return null;
  return result.data || null;
}

/** Render the "Friends' Latest Updates" card. Hides itself when empty. */
function renderFriendsFeed(feed) {
  var card = document.getElementById("friendsFeedCard");
  var list = document.getElementById("friendsActivityList");
  if (!card || !list) return;

  var rows = (feed && feed.activities) || [];
  if (!rows.length) {
    card.style.display = "none";
    list.innerHTML = "";
    return;
  }
  card.style.display = "";

  list.innerHTML = rows.map(function (a) {
    var done  = a.tasksCompleted || 0;
    var total = a.taskTotal || "?";
    var labBadge = a.labCompleted
      ? ' <span style="color:#27c93f; font-size:11px; margin-left:6px;">✓ Lab</span>'
      : "";
    return '<div class="friend-feed-row">' +
             '<div>' +
               '<a class="member-link" href="member.html?id=' + a.friendId + '">' +
                 _escapeHtml(a.friendName) +
               "</a> · " +
               '<span>' + _escapeHtml(a.label) + "</span>" + labBadge +
               '<div class="meta" data-last-seen="' + _escapeHtml(a.lastUpdated || "") +
                 '" data-last-seen-prefix="">' +
                 done + "/" + total + " tasks · updated " +
                 _escapeHtml(formatLastSeen(a.lastUpdated)) +
               "</div>" +
             "</div>" +
             '<span class="xp">+' + (a.earnedXP || 0) + ' XP</span>' +
           "</div>";
  }).join("");

  // Walk every [data-last-seen] in this list and re-format — our regex
  // injection of the prefix above used the value at render time; the
  // periodic 30s tick will pick the row up too via refreshLastSeenLabels.
  // We patch the displayed text now so the prefix "X/Y tasks · updated"
  // stays in place across ticks (the helper only uses data-last-seen-prefix).
  list.querySelectorAll("[data-last-seen]").forEach(function (el) {
    var iso    = el.getAttribute("data-last-seen");
    var prefix = el.dataset.metaPrefix;
    if (prefix === undefined) {
      // Stash the static text portion so the auto-refresh doesn't
      // wipe out the "X/Y tasks · updated " prefix.
      var txt = el.textContent;
      var idx = txt.lastIndexOf("updated ");
      if (idx >= 0) {
        prefix = txt.slice(0, idx + "updated ".length);
        el.dataset.metaPrefix = prefix;
        el.setAttribute("data-last-seen-prefix", prefix);
      }
    }
  });
}

/** Render the "How You Compare" card. Hides itself when empty. */
function renderFriendsComparison(feed) {
  var card = document.getElementById("friendsComparisonCard");
  var list = document.getElementById("friendsComparisonList");
  if (!card || !list) return;

  var rows = (feed && feed.comparisons) || [];
  if (!rows.length) {
    card.style.display = "none";
    list.innerHTML = "";
    return;
  }
  card.style.display = "";

  list.innerHTML = rows.map(function (c) {
    var f      = c.friend || {};
    var myXP   = c.myXP   || 0;
    var their  = c.theirXP || 0;
    var diff   = c.diff || 0;
    var status = c.status || "tied";

    var verdict;
    if (status === "behind") {
      verdict = '<span class="verdict behind">\u26a0\ufe0f You need <strong>' +
                Math.abs(diff) + ' XP</strong> to surpass ' +
                _escapeHtml(f.name) + ".</span>";
    } else if (status === "ahead") {
      verdict = '<span class="verdict ahead">\u2705 You\u2019re <strong>' +
                Math.abs(diff) + ' XP</strong> ahead of ' +
                _escapeHtml(f.name) + ".</span>";
    } else {
      verdict = '<span class="verdict tied">\u2696\ufe0f You\u2019re tied with ' +
                _escapeHtml(f.name) + ".</span>";
    }

    // Bar widths — normalize to whichever XP is larger so both bars are
    // on the same scale.
    var ceil   = Math.max(myXP, their, 1);
    var meWidth    = (myXP   / ceil) * 100;
    var theirWidth = (their / ceil) * 100;

    return '<div class="compare-row">' +
             '<div class="top">' +
               '<a class="member-link" href="member.html?id=' + f.id + '" ' +
                 'style="color:#fff; text-decoration:none; font-weight:600;">' +
                 _escapeHtml(f.name) +
               "</a>" +
               '<small style="color:var(--muted, #888);">' +
                 their + ' XP · #' + f.id +
               "</small>" +
             "</div>" +
             verdict +
             '<div class="compare-bar">' +
               '<div class="ghost" style="width:' + theirWidth + '%;"></div>' +
               '<div class="fill"  style="width:' + meWidth   + '%;"></div>' +
             "</div>" +
             '<div class="compare-meta">' +
               "<span>You: " + myXP + " XP</span>" +
               "<span>" + _escapeHtml(f.name) + ": " + their + " XP</span>" +
             "</div>" +
           "</div>";
  }).join("");
}

function renderActivity(progress, netProgress, webProgress, ethicsProgress, cryptoProgress, pentestProgress, enrolledSet) {
  var container = document.getElementById("recentActivity");
  if (!container) return;
  netProgress     = netProgress     || { completedTasks: [], totalXP: 0 };
  webProgress     = webProgress     || { completedTasks: [], totalXP: 0 };
  ethicsProgress  = ethicsProgress  || { completedTasks: [], totalXP: 0 };
  cryptoProgress  = cryptoProgress  || { completedTasks: [], totalXP: 0 };
  pentestProgress = pentestProgress || { completedTasks: [], totalXP: 0 };
  enrolledSet     = enrolledSet     || new Set();

  var tasksCompleted    = (progress.completedTasks || []).length;
  var earnedXP          = progress.totalXP || 0;
  var netTasksCompleted = (netProgress.completedTasks || []).length;
  var netEarned         = netProgress.totalXP || 0;
  var webTasksCompleted = (webProgress.completedTasks || []).length;
  var webEarned         = webProgress.totalXP || 0;
  var ethicsCompleted   = (ethicsProgress.completedTasks || []).length;
  var ethicsEarned      = ethicsProgress.totalXP || 0;
  var cryptoCompleted   = (cryptoProgress.completedTasks || []).length;
  var cryptoEarned      = cryptoProgress.totalXP || 0;
  var pentestCompleted  = (pentestProgress.completedTasks || []).length;
  var pentestEarned     = pentestProgress.totalXP || 0;

  if (tasksCompleted === 0 && !progress.labCompleted && netTasksCompleted === 0 && webTasksCompleted === 0 && ethicsCompleted === 0 && cryptoCompleted === 0 && pentestCompleted === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No activity yet. Start a course to earn points!</div>';
    return;
  }

  var activities = [];
  var today = new Date().toLocaleDateString();
  // Filter every section by enrollment so an un-enrolled course never
  // shows up in 'Recent activity', even if it has lingering progress.
  if (enrolledSet.has("linux") && tasksCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Linux Fundamentals</strong> — Completed ' + tasksCompleted + '/' + TOTAL_TASKS + ' tasks</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:var(--accent);">+' + earnedXP + ' XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("linux") && progress.labCompleted) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Linux Fundamentals</strong> — Completed Final Lab</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:var(--accent);">+50 XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("network") && netTasksCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Network Fundamentals</strong> — Completed ' + netTasksCompleted + '/' + NETWORK_TOTAL_TASKS + ' tasks</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:#3caaff;">+' + netEarned + ' XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("web") && webTasksCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Web &amp; Application Fundamentals</strong> — Completed ' + webTasksCompleted + '/' + WEB_TOTAL_TASKS + ' tasks</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:#b29cff;">+' + webEarned + ' XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("ethics") && ethicsCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Cybersecurity Ethics &amp; Laws</strong> — Answered ' + ethicsCompleted + '/' + ETHICS_TOTAL_QUESTIONS + ' questions</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:#ffbd2e;">+' + ethicsEarned + ' XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("crypto") && cryptoCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Cryptography</strong> — Completed ' + cryptoCompleted + '/' + CRYPTO_TOTAL_TASKS + ' tasks</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:#ff8a2e;">+' + cryptoEarned + ' XP</strong>' +
      '</div>');
  }
  if (enrolledSet.has("pentest") && pentestCompleted > 0) {
    activities.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
      '<div><div><strong>Penetration Testing</strong> — Completed ' + pentestCompleted + '/' + PENTEST_TOTAL_TASKS + ' tasks</div>' +
      '<small style="color:#888;">' + today + '</small></div>' +
      '<strong style="color:#ff5f56;">+' + pentestEarned + ' XP</strong>' +
      '</div>');
  }
  container.innerHTML = activities.join("");
}

// ============================================
// LINUX LAB PROGRESS (called from linux-lab.html)
// ============================================
async function saveUserLinuxProgress(completedTasks, totalXP, labCompleted) {
  if (!isLoggedIn()) return false;
  var result = await apiFetch("/progress", {
    method: "PUT",
    headers: authHeaders(getToken()),
    body: JSON.stringify({ completedTasks: completedTasks, labCompleted: labCompleted })
  });
  return result.ok;
}

async function getUserLinuxProgress() {
  if (!isLoggedIn()) return { completedTasks: [], totalXP: 0, labCompleted: false };
  var result = await apiFetch("/progress", { headers: authHeaders(getToken()) });
  if (!result.ok) return { completedTasks: [], totalXP: 0, labCompleted: false };
  return {
    completedTasks: result.data.completedTasks || [],
    totalXP: result.data.totalXP || 0,
    labCompleted: result.data.labCompleted || false
  };
}

// ============================================
// ADMIN
// ============================================
function _adminEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function _adminFormatDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function _adminActionTag(action) {
  var label = action.replace(/_/g, " ");
  var cls = "info";
  if (action.indexOf("failure") >= 0) cls = "bad";
  else if (action.indexOf("success") >= 0) cls = "ok";
  else if (action === "api_request") cls = "muted";
  return '<span class="admin-tag ' + cls + '">' + _adminEscape(label) + '</span>';
}

function _adminShortUA(ua) {
  if (!ua) return "—";
  // Best-effort "browser on OS" summary; fall back to the raw string.
  var m = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)[\/ ](\d+)/);
  var os = (ua.match(/\((Macintosh|Windows[^;)]+|X11[^;)]+|iPhone|iPad|Android[^;)]+)/) || [])[1];
  if (m) return m[1] + " " + m[2] + (os ? " · " + os : "");
  return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
}

function initAdmin() {
  if (!window.location.pathname.includes("admin.html")) return;

  var loginDiv   = document.getElementById("adminLoginDiv");
  var contentDiv = document.getElementById("adminContent");

  function showAuthed() {
    if (loginDiv)   loginDiv.style.display   = "none";
    if (contentDiv) contentDiv.style.display = "block";
    loadAdminData();
  }

  if (isAdminLoggedIn()) showAuthed();

  var adminForm = document.getElementById("adminLoginForm");
  if (adminForm) {
    adminForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var password = document.getElementById("adminPassword").value;
      var statusDiv = document.getElementById("adminLoginStatus");
      statusDiv.innerHTML = "<div>Logging in…</div>";

      var result = await apiFetch("/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password })
      });

      if (result.ok) {
        setAdminToken(result.data.token);
        showAuthed();
        statusDiv.innerHTML = '<div style="color:var(--accent);">✅ Login successful!</div>';
      } else {
        statusDiv.innerHTML = '<div style="color:var(--warning);">❌ ' + (result.data.error || "Incorrect password") + '</div>';
      }
    });
  }

  var logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      clearAdminToken();
      if (loginDiv)   loginDiv.style.display   = "block";
      if (contentDiv) contentDiv.style.display = "none";
      var pwdField = document.getElementById("adminPassword");
      if (pwdField) pwdField.value = "";
    });
  }

  // Tab switcher
  var tabBar = document.querySelector("[data-admin-tabs]");
  if (tabBar) {
    tabBar.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-tab]");
      if (!btn) return;
      var name = btn.getAttribute("data-tab");
      tabBar.querySelectorAll("button[data-tab]").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      document.querySelectorAll("[data-tab-panel]").forEach(function (p) {
        p.classList.toggle("active", p.getAttribute("data-tab-panel") === name);
      });
    });
  }

  // Audit log filter form
  var applyAuditBtn = document.getElementById("auditApplyBtn");
  if (applyAuditBtn) {
    applyAuditBtn.addEventListener("click", function () { loadAuditLog(); });
  }

  // Event form
  var eventForm = document.getElementById("eventForm");
  if (eventForm) {
    eventForm.addEventListener("submit", handleEventFormSubmit);
  }
  var eventCancelBtn = document.getElementById("eventCancelBtn");
  if (eventCancelBtn) {
    eventCancelBtn.addEventListener("click", resetEventForm);
  }
}

async function loadAdminData() {
  await Promise.all([
    loadAdminOverview(),
    loadAdminApplications(),
    loadAdminMembers(),
    loadAuditLog(),
    loadAdminEvents(),
  ]);
}

async function loadAdminOverview() {
  var r = await apiFetch("/admin/overview", { headers: authHeaders(getAdminToken()) });
  if (!r.ok) return;
  var s = r.data;
  var setNum = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v == null ? 0 : v); };
  setNum("pendingCount",     s.pendingCount);
  setNum("approvedCount",    s.approvedCount);
  setNum("totalCount",       s.totalCount);
  setNum("eventsTotalCount", s.eventsTotal);
  setNum("failedLoginCount", s.failedLogins24h);

  var body = document.getElementById("recentLoginsBody");
  if (body) {
    var rows = s.recentLogins || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">No login activity yet.</td></tr>';
    } else {
      body.innerHTML = rows.map(function (row) {
        var who = row.memberName
          ? _adminEscape(row.memberName)
          : (row.emailAttempted ? _adminEscape(row.emailAttempted) : '<em>admin</em>');
        return '<tr>' +
          '<td>' + _adminEscape(_adminFormatDate(row.createdAt)) + '</td>' +
          '<td>' + who + '</td>' +
          '<td>' + _adminActionTag(row.action) + '</td>' +
          '<td>' + _adminEscape(row.ip || "—") + '</td>' +
          '<td class="ua-cell" title="' + _adminEscape(row.userAgent || "") + '">' + _adminEscape(_adminShortUA(row.userAgent)) + '</td>' +
          '</tr>';
      }).join("");
    }
  }
}

async function loadAdminApplications() {
  var r = await apiFetch("/applications?status=pending", { headers: authHeaders(getAdminToken()) });
  var pendingDiv = document.getElementById("pendingApplications");
  if (!(pendingDiv && r.ok)) return;
  var apps = r.data;
  if (!apps.length) {
    pendingDiv.innerHTML = '<div class="muted-box">No pending applications</div>';
    return;
  }
  pendingDiv.innerHTML = apps.map(function (app) {
    var motivation = app.motivation || "";
    return '<div class="row" style="flex-direction:column;align-items:flex-start;gap:8px;border-bottom:1px solid rgba(255,255,255,0.06);padding:12px 0;">' +
      '<div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:6px;">' +
      '<strong>' + _adminEscape(app.name) + '</strong>' +
      '<span class="tag">' + _adminEscape(app.year || "") + ' • ' + _adminEscape(app.major || "") + '</span>' +
      '</div>' +
      '<div>✉️ ' + _adminEscape(app.email) + '</div>' +
      '<div>🆔 ' + _adminEscape(app.studentId) + '</div>' +
      '<div>📞 ' + _adminEscape(app.phone) + '</div>' +
      (motivation ? '<div style="font-size:13px;color:var(--muted);">"' + _adminEscape(motivation) + '"</div>' : '') +
      '<div style="display:flex;gap:12px;margin-top:8px;">' +
      '<button onclick="openCreateModal(' + app.id + ',&quot;' + _adminEscape(app.email) + '&quot;,&quot;' + _adminEscape(app.name) + '&quot;)" class="btn btn-primary" style="padding:6px 16px;">Approve</button>' +
      '<button onclick="rejectApp(' + app.id + ',&quot;' + _adminEscape(app.name) + '&quot;)" class="btn btn-secondary" style="padding:6px 16px;">Reject</button>' +
      '</div>' +
      '<small>Applied: ' + _adminEscape(_adminFormatDate(app.appliedDate)) + '</small>' +
      '</div>';
  }).join("");
}

async function loadAdminMembers() {
  var r = await apiFetch("/admin/members", { headers: authHeaders(getAdminToken()) });
  var tbody = document.getElementById("membersList");
  if (!(tbody && r.ok)) return;
  var members = r.data;
  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No members yet</td></tr>';
    return;
  }
  // Plain text-style links so the row stays compact — no button chrome.
  var tinyBtnStyle = 'background:none;border:none;color:var(--accent, #ff2f4f);'
                   + 'cursor:pointer;font:inherit;font-size:11px;padding:0;'
                   + 'margin-right:8px;text-decoration:underline;';
  var tinyDeleteStyle = tinyBtnStyle.replace('var(--accent, #ff2f4f)', 'var(--warning, #ff9b3d)');

  tbody.innerHTML = members.map(function (m) {
    var statusCell = m.passwordSet === false
      ? '<span class="admin-tag warn">Pending setup</span>'
      : '<span class="admin-tag ok">Active</span>';
    var pwdActions = m.passwordSet === false
      ? '<button type="button" style="' + tinyBtnStyle + '" onclick="resendSetupLink(' + m.id + ',&quot;' + _adminEscape(m.name) + '&quot;)">Resend link</button>' +
        '<button type="button" style="' + tinyBtnStyle + '" onclick="adminSetPassword(' + m.id + ',&quot;' + _adminEscape(m.name) + '&quot;)">Set password</button>'
      : '<button type="button" style="' + tinyBtnStyle + '" onclick="adminSetPassword(' + m.id + ',&quot;' + _adminEscape(m.name) + '&quot;)">Reset password</button>';
    return '<tr>' +
      '<td>' + _adminEscape(m.name) + '</td>' +
      '<td>' + _adminEscape(m.email || "") + '</td>' +
      '<td>' + _adminEscape(m.phone || "—") + '</td>' +
      '<td>' + _adminEscape(m.studentId || "—") + '</td>' +
      '<td>' + _adminEscape(m.year || "—") + '</td>' +
      '<td>' + _adminEscape(m.major || "—") + '</td>' +
      '<td>' + (m.points || 0) + '</td>' +
      '<td>' + statusCell + '</td>' +
      '<td>' + _adminEscape(_adminFormatDate(m.lastSeen)) + '</td>' +
      '<td>' + _adminEscape(m.lastIp || "—") + '</td>' +
      '<td class="ua-cell" title="' + _adminEscape(m.lastUserAgent || "") + '">' + _adminEscape(_adminShortUA(m.lastUserAgent)) + '</td>' +
      '<td style="white-space:nowrap;">' + pwdActions +
        '<button type="button" style="' + tinyDeleteStyle + '" onclick="deleteMember(' + m.id + ',&quot;' + _adminEscape(m.name) + '&quot;)">Delete</button>' +
      '</td>' +
      '</tr>';
  }).join("");
}

window.resendSetupLink = async function (memberId, name) {
  if (!confirm("Re-send the password setup link to " + name + "?\nAny previous link will stop working.")) return;
  var r = await apiFetch("/admin/members/" + memberId + "/resend-setup", {
    method: "POST",
    headers: authHeaders(getAdminToken()),
    body: JSON.stringify({}),
  });
  if (!r.ok) {
    alert("❌ " + ((r.data && r.data.error) || "Failed to issue link"));
    return;
  }
  var d = r.data || {};
  var emailedNote = d.emailSent
    ? "✉\ufe0f Setup link emailed to " + name + "."
    : "⚠\ufe0f Mail not configured — copy the link below and send it manually.";
  var copy = d.setupLink ? "\n\n" + d.setupLink : "";
  alert(emailedNote + copy);
  loadAdminMembers();
};

window.adminSetPassword = async function (memberId, name) {
  var pwd = prompt("Set a new password for " + name + " (min 8 characters):");
  if (pwd === null) return;
  pwd = pwd.trim();
  if (pwd.length < 8) {
    alert("❌ Password must be at least 8 characters.");
    return;
  }
  if (!confirm("Set this password for " + name + "? Any pending setup link will be invalidated.")) return;
  var r = await apiFetch("/admin/members/" + memberId + "/set-password", {
    method: "POST",
    headers: authHeaders(getAdminToken()),
    body: JSON.stringify({ password: pwd }),
  });
  if (r.ok) {
    alert("✅ Password updated for " + name + ". Make sure to share it with them via a secure channel.");
    loadAdminMembers();
  } else {
    alert("❌ " + ((r.data && r.data.error) || "Failed to set password"));
  }
};

async function loadAuditLog() {
  var actionEl = document.getElementById("auditFilterAction");
  var qEl      = document.getElementById("auditFilterSearch");
  var action   = actionEl ? actionEl.value : "all";
  var qStr     = qEl      ? qEl.value      : "";
  var url = "/admin/audit-log?limit=200";
  if (action && action !== "all") url += "&action=" + encodeURIComponent(action);
  if (qStr)                       url += "&q=" + encodeURIComponent(qStr);
  var r = await apiFetch(url, { headers: authHeaders(getAdminToken()) });
  var body = document.getElementById("auditLogBody");
  if (!(body && r.ok)) return;
  var rows = r.data;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);">No log entries match.</td></tr>';
    return;
  }
  body.innerHTML = rows.map(function (row) {
    var who = row.memberName
      ? _adminEscape(row.memberName)
      : (row.emailAttempted ? _adminEscape(row.emailAttempted) : '<em>—</em>');
    var sid = (row.sessionId || "").slice(0, 8) || "—";
    return '<tr>' +
      '<td>' + _adminEscape(_adminFormatDate(row.createdAt)) + '</td>' +
      '<td>' + _adminActionTag(row.action) + '</td>' +
      '<td>' + who + '</td>' +
      '<td><code style="font-size:11px;">' + _adminEscape((row.method || "") + " " + (row.path || "")) + '</code></td>' +
      '<td>' + (row.statusCode == null ? "—" : row.statusCode) + '</td>' +
      '<td>' + _adminEscape(row.ip || "—") + '</td>' +
      '<td class="ua-cell" title="' + _adminEscape(row.userAgent || "") + '">' + _adminEscape(_adminShortUA(row.userAgent)) + '</td>' +
      '<td><code style="font-size:11px;">' + _adminEscape(sid) + '</code></td>' +
      '</tr>';
  }).join("");
}

async function loadAdminEvents() {
  var r = await apiFetch("/admin/events", { headers: authHeaders(getAdminToken()) });
  var list = document.getElementById("eventsList");
  if (!(list && r.ok)) return;
  var events = r.data;
  if (!events.length) {
    list.innerHTML = '<div class="muted-box">No events yet — create your first one above.</div>';
    return;
  }
  list.innerHTML = events.map(function (ev) {
    var img = ev.imageUrl
      ? '<img src="' + _adminEscape(ev.imageUrl) + '" alt="">'
      : '<div class="placeholder">No image</div>';
    var when = _adminFormatDate(ev.startsAt) + (ev.endsAt ? " → " + _adminFormatDate(ev.endsAt) : "");
    return '<div class="event-card" data-event-card="' + ev.id + '">' +
      '<div>' + img + '</div>' +
      '<div>' +
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '<strong>' + _adminEscape(ev.title) + '</strong>' +
      '<span class="admin-tag info">' + (ev.registrationsCount || 0) + ' registered</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px;">📅 ' + _adminEscape(when) + '</div>' +
      (ev.location ? '<div style="font-size:12px;color:var(--muted);">📍 ' + _adminEscape(ev.location) + '</div>' : '') +
      (ev.description ? '<p style="margin-top:6px;font-size:13px;">' + _adminEscape(ev.description) + '</p>' : '') +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-secondary" style="padding:4px 12px;" onclick="editEvent(' + ev.id + ')">Edit</button>' +
      '<button class="btn btn-secondary" style="padding:4px 12px;" onclick="deleteEvent(' + ev.id + ')">Delete</button>' +
      '<button class="btn btn-secondary" style="padding:4px 12px;" onclick="viewRegistrants(' + ev.id + ')">View registrants</button>' +
      '</div>' +
      '<div data-registrants-for="' + ev.id + '" style="display:none;margin-top:10px;"></div>' +
      '</div>' +
      '</div>';
  }).join("");
  // Cache for editEvent
  window.__adminEvents = events;
}

window.viewRegistrants = async function (eventId) {
  var slot = document.querySelector('[data-registrants-for="' + eventId + '"]');
  if (!slot) return;
  // Toggle off if already showing.
  if (slot.style.display !== "none" && slot.dataset.loaded === "1") {
    slot.style.display = "none";
    slot.dataset.loaded = "";
    return;
  }
  slot.style.display = "";
  slot.innerHTML = '<div class="muted-box">Loading registrants…</div>';
  var r = await apiFetch("/admin/events/" + eventId + "/registrations", {
    headers: authHeaders(getAdminToken()),
  });
  if (!r.ok) {
    slot.innerHTML = '<div class="muted-box" style="border-color:var(--warning);">Failed to load registrants.</div>';
    return;
  }
  var rows = r.data || [];
  if (!rows.length) {
    slot.innerHTML = '<div class="muted-box">No one has registered for this event yet.</div>';
    slot.dataset.loaded = "1";
    return;
  }
  slot.innerHTML =
    '<table class="admin-table" style="margin-top:6px;">' +
    '<thead><tr><th>Name</th><th>Email</th><th>Registered at</th></tr></thead>' +
    '<tbody>' +
    rows.map(function (row) {
      return '<tr>' +
        '<td>' + _adminEscape(row.memberName  || ("#" + row.memberId)) + '</td>' +
        '<td>' + _adminEscape(row.memberEmail || "—") + '</td>' +
        '<td>' + _adminEscape(_adminFormatDate(row.createdAt)) + '</td>' +
        '</tr>';
    }).join("") +
    '</tbody></table>';
  slot.dataset.loaded = "1";
};

function _eventFormDateValue(iso) {
  // Convert an ISO string (with Z) to the value an <input type=datetime-local>
  // expects. We strip the timezone and the seconds.
  if (!iso) return "";
  return iso.replace(/Z$/, "").replace(/:[0-9]{2}\.\d+/, "").slice(0, 16);
}

function resetEventForm() {
  document.getElementById("eventId").value = "";
  document.getElementById("eventTitle").value = "";
  document.getElementById("eventDescription").value = "";
  document.getElementById("eventStartsAt").value = "";
  document.getElementById("eventEndsAt").value = "";
  document.getElementById("eventLocation").value = "";
  var f = document.getElementById("eventImage"); if (f) f.value = "";
  document.getElementById("eventFormHeading").textContent = "Create event";
  document.getElementById("eventSubmitBtn").textContent   = "Create event";
  document.getElementById("eventCancelBtn").style.display = "none";
  document.getElementById("eventFormStatus").innerHTML = "";
}

window.editEvent = function (id) {
  var events = window.__adminEvents || [];
  var ev = events.find(function (e) { return e.id === id; });
  if (!ev) return;
  document.getElementById("eventId").value          = ev.id;
  document.getElementById("eventTitle").value       = ev.title || "";
  document.getElementById("eventDescription").value = ev.description || "";
  document.getElementById("eventStartsAt").value    = _eventFormDateValue(ev.startsAt);
  document.getElementById("eventEndsAt").value      = _eventFormDateValue(ev.endsAt);
  document.getElementById("eventLocation").value    = ev.location || "";
  document.getElementById("eventFormHeading").textContent = "Edit event #" + ev.id;
  document.getElementById("eventSubmitBtn").textContent   = "Save changes";
  document.getElementById("eventCancelBtn").style.display = "";
  // Bring the form back into view since it lives at the top of the panel.
  var formEl = document.getElementById("eventForm");
  if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteEvent = async function (id) {
  if (!confirm("Delete this event? This cannot be undone.")) return;
  var r = await apiFetch("/admin/events/" + id, {
    method: "DELETE",
    headers: authHeaders(getAdminToken()),
  });
  if (r.ok) loadAdminEvents();
  else alert("❌ " + (r.data.error || "Failed to delete event"));
};

async function handleEventFormSubmit(e) {
  e.preventDefault();
  var statusDiv = document.getElementById("eventFormStatus");
  statusDiv.innerHTML = '<div class="muted-box">Saving…</div>';

  var idVal = document.getElementById("eventId").value;
  var payload = {
    title:       document.getElementById("eventTitle").value,
    description: document.getElementById("eventDescription").value,
    startsAt:    document.getElementById("eventStartsAt").value,
    endsAt:      document.getElementById("eventEndsAt").value || null,
    location:    document.getElementById("eventLocation").value,
  };
  var url    = idVal ? ("/admin/events/" + idVal) : "/admin/events";
  var method = idVal ? "PUT" : "POST";
  var r = await apiFetch(url, {
    method: method,
    headers: authHeaders(getAdminToken()),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    var msg = r.data && r.data.error ? r.data.error : "Failed to save event.";
    if (r.data && r.data.fields) {
      msg += " — " + Object.values(r.data.fields).join(" / ");
    }
    statusDiv.innerHTML = '<div class="muted-box" style="border-color:var(--warning);">❌ ' + _adminEscape(msg) + '</div>';
    return;
  }

  var savedId = (r.data && r.data.id) || idVal;

  // Optional image upload (multipart, separate request).
  var fileInput = document.getElementById("eventImage");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var fd = new FormData();
    fd.append("file", fileInput.files[0]);
    try {
      var uploadRes = await fetch(API_BASE + "/admin/events/" + savedId + "/image", {
        method: "POST",
        headers: { "Authorization": "Bearer " + getAdminToken() },
        body: fd,
      });
      var uploadJson = await uploadRes.json().catch(function () { return {}; });
      if (!uploadRes.ok) {
        statusDiv.innerHTML = '<div class="muted-box" style="border-color:var(--warning);">⚠️ Event saved but image upload failed: ' + _adminEscape(uploadJson.error || "unknown") + '</div>';
        loadAdminEvents();
        return;
      }
    } catch (err) {
      statusDiv.innerHTML = '<div class="muted-box" style="border-color:var(--warning);">⚠️ Event saved but image upload failed.</div>';
      loadAdminEvents();
      return;
    }
  }

  statusDiv.innerHTML = '<div class="muted-box" style="border-color:var(--accent);">✅ Saved.</div>';
  resetEventForm();
  loadAdminEvents();
  loadAdminOverview();
}

window.openCreateModal = function (appId, email, name) {
  document.getElementById("modalEmail").value = appId;
  document.getElementById("modalName").value = name;
  document.getElementById("modalEmailDisplay").value = email;
  document.getElementById("createStatus").innerHTML = "";
  document.getElementById("createModal").style.display = "flex";
};

window.closeModal = function () {
  document.getElementById("createModal").style.display = "none";
  document.getElementById("createStatus").innerHTML = "";
};

window.createAccount = async function () {
  var appId = document.getElementById("modalEmail").value;
  var statusDiv = document.getElementById("createStatus");
  statusDiv.innerHTML = '<div class="muted-box">Approving\u2026</div>';

  var result = await apiFetch("/applications/" + appId + "/approve", {
    method: "POST",
    headers: authHeaders(getAdminToken()),
    body: JSON.stringify({}),
  });

  if (!result.ok) {
    statusDiv.innerHTML = '<div style="color:var(--warning);">\u274c ' +
      _adminEscape((result.data && result.data.error) || "Failed to create account") + '</div>';
    return;
  }

  var d = result.data || {};
  var emailedNote = d.emailSent
    ? '<div style="color:var(--accent);">\u2709\ufe0f Setup link emailed to the applicant.</div>'
    : '<div style="color:var(--warning);">\u26a0\ufe0f Mail isn\u2019t configured \u2014 send the link below manually.</div>';
  var linkHtml = d.setupLink
    ? '<div style="margin-top:10px;">' +
      '<small style="color:var(--muted, #aaa);">One-time setup link (valid 24h):</small>' +
      '<input type="text" readonly id="setupLinkField" value="' + _adminEscape(d.setupLink) +
      '" style="width:100%;padding:10px;margin-top:6px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:#fff;">' +
      '<button type="button" class="btn btn-secondary" id="copySetupLinkBtn" style="margin-top:8px;padding:6px 12px;">Copy link</button>' +
      '</div>'
    : '';

  statusDiv.innerHTML =
    '<div style="color:var(--accent);">\u2705 Account created.</div>' + emailedNote + linkHtml;

  var copyBtn = document.getElementById("copySetupLinkBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var f = document.getElementById("setupLinkField");
      if (!f) return;
      f.select();
      try { document.execCommand("copy"); copyBtn.textContent = "Copied!"; }
      catch (e) { copyBtn.textContent = "Press \u2318C to copy"; }
    });
  }
  loadAdminData();
};

window.rejectApp = async function (appId, name) {
  if (!confirm("Are you sure you want to reject " + name + "'s application?")) return;
  var result = await apiFetch("/applications/" + appId, {
    method: "DELETE",
    headers: authHeaders(getAdminToken())
  });
  if (result.ok) { loadAdminData(); }
  else { alert("❌ " + (result.data.error || "Failed to reject application")); }
};

window.deleteMember = async function (memberId, name) {
  if (!confirm("Are you sure you want to delete " + name + "?")) return;
  var result = await apiFetch("/members/" + memberId, {
    method: "DELETE",
    headers: authHeaders(getAdminToken())
  });
  if (result.ok) { loadAdminData(); }
  else { alert("❌ " + (result.data.error || "Failed to delete member")); }
};

// ============================================
// SET-PASSWORD PAGE (one-time link from approval email)
// ============================================
function _setupShowPanel(name) {
  document.querySelectorAll("[data-setup-panel]").forEach(function (el) {
    el.classList.toggle("active", el.getAttribute("data-setup-panel") === name);
  });
}

async function initSetPasswordPage() {
  if (!window.location.pathname.includes("set-password.html")) return;

  var params = new URLSearchParams(window.location.search);
  var token = (params.get("token") || "").trim();
  if (!token) {
    var errEl = document.querySelector("[data-setup-error]");
    if (errEl) errEl.textContent = "This link is missing the token. Ask the admin for a fresh email.";
    _setupShowPanel("invalid");
    return;
  }

  // 1) Validate the token.
  var r = await apiFetch("/auth/setup-password/validate?token=" + encodeURIComponent(token));
  if (!r.ok) {
    var errEl2 = document.querySelector("[data-setup-error]");
    if (errEl2) errEl2.textContent =
      (r.data && (r.data.error || r.data.message)) || "This link is invalid or has expired.";
    _setupShowPanel("invalid");
    return;
  }

  // 2) Greet the user and show the form.
  var d = r.data || {};
  var greet = document.getElementById("setupGreeting");
  var sub   = document.getElementById("setupSubtitle");
  if (greet) greet.textContent = "Welcome, " + (d.name || "new member") + "!";
  if (sub && d.email) {
    sub.textContent = "Choose a password for " + d.email +
      ". The link will stop working as soon as you submit.";
  }
  _setupShowPanel("form");

  // 3) Wire the submit.
  var form     = document.getElementById("setupForm");
  var pwdEl    = document.getElementById("setupPassword");
  var confEl   = document.getElementById("setupConfirm");
  var statusEl = document.getElementById("setupStatus");
  var submit   = document.getElementById("setupSubmit");
  if (!form) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    statusEl.classList.remove("ok", "error");
    statusEl.textContent = "";

    var pwd  = pwdEl.value || "";
    var conf = confEl.value || "";
    if (pwd.length < 8) {
      statusEl.classList.add("error");
      statusEl.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (pwd !== conf) {
      statusEl.classList.add("error");
      statusEl.textContent = "Passwords do not match.";
      return;
    }

    submit.disabled = true;
    statusEl.textContent = "Saving\u2026";

    var saved = await apiFetch("/auth/setup-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token: token, password: pwd, confirm: conf }),
    });

    if (saved.ok) {
      _setupShowPanel("done");
      return;
    }
    submit.disabled = false;
    statusEl.classList.add("error");
    statusEl.textContent =
      (saved.data && (saved.data.error || saved.data.message)) ||
      "Could not save your password. Try again.";
  });
}

// ============================================
// PUBLIC EVENTS PAGE
// ============================================
async function initEventsPage() {
  var container = document.querySelector("[data-events-list]");
  if (!container) return;
  // The empty-state node may or may not be inside the container. Stash a
  // reference now so we can re-show it after we wipe the inner HTML.
  var emptyEl = container.querySelector("[data-events-empty]");
  await renderPublicEventsList(container, emptyEl);
}

async function renderPublicEventsList(container, emptyEl) {
  var headers = isLoggedIn() ? authHeaders(getToken()) : {};
  var r = await apiFetch("/events", { headers: headers });
  if (!r.ok) {
    container.innerHTML = "";
    if (emptyEl) { container.appendChild(emptyEl); emptyEl.style.display = ""; }
    return;
  }
  var events = r.data || [];
  container.innerHTML = "";
  if (!events.length) {
    if (emptyEl) { container.appendChild(emptyEl); emptyEl.style.display = ""; }
    return;
  }
  if (emptyEl) emptyEl.style.display = "none";

  events.forEach(function (ev) {
    var img = ev.imageUrl
      ? '<img src="' + _adminEscape(ev.imageUrl) + '" alt="" style="width:100%;border-radius:8px;margin-bottom:12px;max-height:220px;object-fit:cover;">'
      : '';
    var startsLocal = ev.startsAt ? new Date(ev.startsAt).toLocaleString() : "";
    var endsLocal   = ev.endsAt   ? new Date(ev.endsAt).toLocaleString()   : "";
    var when = startsLocal + (endsLocal ? " → " + endsLocal : "");

    // Register/Cancel button:
    //   - logged out      → "Login to register" link
    //   - logged in (no)  → Register button
    //   - logged in (yes) → "You're registered" + Cancel button
    var actionHtml;
    if (!isLoggedIn()) {
      actionHtml =
        '<a class="btn btn-secondary" href="login.html" style="padding:6px 14px;">Log in to register</a>';
    } else if (ev.registered) {
      actionHtml =
        '<span class="admin-tag ok" style="margin-right:8px;">✓ You’re registered</span>' +
        '<button class="btn btn-secondary" data-cancel-event="' + ev.id + '" style="padding:6px 14px;">Cancel registration</button>';
    } else {
      actionHtml =
        '<button class="btn btn-primary" data-register-event="' + ev.id + '" style="padding:6px 14px;">Register</button>';
    }

    var article = document.createElement("article");
    article.className = "card";
    article.setAttribute("data-event-id", String(ev.id));
    article.innerHTML =
      '<span class="tag">Upcoming Event</span>' +
      img +
      '<h2 style="margin-top:14px">' + _adminEscape(ev.title) + '</h2>' +
      '<div class="event-meta">' +
        '<div class="meta"><strong>When</strong><br>' + _adminEscape(when || "TBA") + '</div>' +
        (ev.location ? '<div class="meta"><strong>Location</strong><br>' + _adminEscape(ev.location) + '</div>' : '') +
        '<div class="meta"><strong>Registered</strong><br><span data-event-count="' + ev.id + '">' +
          (ev.registrationsCount || 0) + '</span> attendee' + ((ev.registrationsCount === 1) ? '' : 's') +
        '</div>' +
      '</div>' +
      (ev.description ? '<p style="margin-top:10px;">' + _adminEscape(ev.description) + '</p>' : '') +
      '<div style="margin-top:14px;" data-event-action="' + ev.id + '">' + actionHtml + '</div>' +
      '<div data-event-status="' + ev.id + '" style="margin-top:8px;font-size:12px;color:var(--muted, #888);"></div>';
    container.appendChild(article);
  });

  // Wire register / cancel buttons.
  container.querySelectorAll("[data-register-event]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      _toggleEventRegistration(parseInt(btn.getAttribute("data-register-event"), 10), "register", btn);
    });
  });
  container.querySelectorAll("[data-cancel-event]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      _toggleEventRegistration(parseInt(btn.getAttribute("data-cancel-event"), 10), "cancel", btn);
    });
  });
}

async function _toggleEventRegistration(eventId, action, btn) {
  if (!eventId) return;
  if (!isLoggedIn()) {
    window.location.href = "login.html";
    return;
  }
  var statusEl = document.querySelector('[data-event-status="' + eventId + '"]');
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = action === "register" ? "Registering\u2026" : "Cancelling\u2026";

  var r = await apiFetch("/events/" + eventId + "/register", {
    method:  action === "register" ? "POST" : "DELETE",
    headers: authHeaders(getToken()),
  });

  if (!r.ok) {
    if (statusEl) statusEl.textContent = (r.data && (r.data.error || r.data.message)) || "Could not update registration.";
    if (btn) btn.disabled = false;
    return;
  }

  // Refresh the action area + count using the response payload.
  var ev = r.data || {};
  var actionSlot = document.querySelector('[data-event-action="' + eventId + '"]');
  var countSlot  = document.querySelector('[data-event-count="'  + eventId + '"]');
  if (countSlot) countSlot.textContent = ev.registrationsCount || 0;
  if (actionSlot) {
    if (ev.registered) {
      actionSlot.innerHTML =
        '<span class="admin-tag ok" style="margin-right:8px;">✓ You’re registered</span>' +
        '<button class="btn btn-secondary" data-cancel-event="' + eventId + '" style="padding:6px 14px;">Cancel registration</button>';
      actionSlot.querySelector("[data-cancel-event]").addEventListener("click", function (e) {
        _toggleEventRegistration(eventId, "cancel", e.currentTarget);
      });
    } else {
      actionSlot.innerHTML =
        '<button class="btn btn-primary" data-register-event="' + eventId + '" style="padding:6px 14px;">Register</button>';
      actionSlot.querySelector("[data-register-event]").addEventListener("click", function (e) {
        _toggleEventRegistration(eventId, "register", e.currentTarget);
      });
    }
  }
  if (statusEl) {
    statusEl.textContent = ev.registered ? "You\u2019re on the list \u2014 see you there!" : "Registration cancelled.";
    setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 3500);
  }
}

// ============================================
// LEARNING PAGE
// ============================================

/**
 * Paint each .path-card[data-course] with the right lock / enroll /
 * continue state. Wires the click handler too. Safe to call without a
 * login — in that case every card except Ethics is shown as locked and
 * clicking Ethics asks the user to log in.
 */
async function paintLearningHubCards() {
  var cards = document.querySelectorAll(".path-card[data-course]");
  if (!cards.length) return;

  var enrollment = await getUserEnrollments({ force: true });
  var enrolled   = new Set(enrollment.enrolled || []);
  var unlocked   = new Set(enrollment.unlocked || ["ethics"]);
  var complete   = new Set(enrollment.complete || []);

  cards.forEach(function (card) {
    var course   = card.getAttribute("data-course");
    var target   = card.getAttribute("data-target") || "learning.html";
    var prereq   = COURSE_PREREQ[course];
    var prereqLabel = prereq ? COURSE_LABEL[prereq] : null;

    var badge    = card.querySelector("[data-state-badge]");
    var btn      = card.querySelector("[data-action-btn]");
    var hint     = card.querySelector("[data-prereq-hint]");

    // Decide state
    var state;
    if (!unlocked.has(course))      state = "locked";
    else if (complete.has(course))  state = "completed";
    else if (enrolled.has(course))  state = "enrolled";
    else                            state = "unlocked";

    card.classList.remove("locked", "unlocked", "enrolled", "completed");
    card.classList.add(state);

    // Badge + button label
    if (state === "locked") {
      if (badge) badge.textContent = "🔒 Locked";
      if (btn)   btn.textContent   = "Locked";
      if (hint) {
        hint.textContent = "Complete " + (prereqLabel || "the previous course") + " first to unlock.";
        hint.style.display = "block";
      }
    } else if (state === "unlocked") {
      if (badge) badge.textContent = "Unlocked · not enrolled";
      if (btn)   btn.textContent   = isLoggedIn() ? "Enroll Now" : "Login to enroll";
      if (hint)  hint.style.display = "none";
    } else if (state === "enrolled") {
      if (badge) badge.textContent = "✓ Enrolled";
      if (btn)   btn.textContent   = "Continue →";
      if (hint)  hint.style.display = "none";
    } else if (state === "completed") {
      if (badge) badge.textContent = "✓ Completed";
      if (btn)   btn.textContent   = "Review →";
      if (hint)  hint.style.display = "none";
    }

    // Click handler. Replace the node to drop any prior listener.
    if (btn) {
      var clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener("click", async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (state === "locked") {
          alert("🔒 " + (COURSE_LABEL[course] || course) + " is locked.\n" +
                "You need to finish " + (prereqLabel || "the previous course") + " first.");
          return;
        }
        if (state === "unlocked") {
          if (!isLoggedIn()) {
            window.location.href = "login.html";
            return;
          }
          var ok = await enrollInCourse(course);
          if (!ok) return;
          window.location.href = target;
          return;
        }
        // enrolled or completed → just navigate
        window.location.href = target;
      });
    }

    // Whole-card click on unlocked / enrolled / completed cards still
    // navigates. Locked cards stay inert.
    card.onclick = function (ev) {
      // Don't double-fire if the user clicked the action button directly.
      if (ev.target && ev.target.closest("[data-action-btn]")) return;
      if (state === "locked") {
        alert("🔒 " + (COURSE_LABEL[course] || course) + " is locked. Finish " +
              (prereqLabel || "the previous course") + " first.");
        return;
      }
      if (state === "unlocked" && !isLoggedIn()) {
        window.location.href = "login.html";
        return;
      }
      if (state === "unlocked" && isLoggedIn()) {
        // Don't auto-enroll on whole-card click; require the explicit
        // Enroll button. Just nudge with a hint.
        return;
      }
      window.location.href = target;
    };
  });

  return enrollment;
}

async function loadUserProgressForLearning() {
  // Paint the cards (lock / enroll / continue) for everyone, even guests.
  var enrollment = await paintLearningHubCards();

  var card = document.getElementById("userProgressCard");
  if (!card || !isLoggedIn()) return;

  var meResult = await apiFetch("/auth/me", { headers: authHeaders(getToken()) });
  if (!meResult.ok) return;

  var enrolledSet = new Set((enrollment && enrollment.enrolled) || []);

  // Pull all six course progress rows so we can draw all six progress
  // lines and the combined XP counter on the learning-hub welcome card.
  var progResult      = await apiFetch("/progress", { headers: authHeaders(getToken()) });
  var progress        = progResult.ok ? progResult.data : { completedTasks: [], totalXP: 0, labCompleted: false };
  var netProgress     = await getUserNetworkProgress();
  var webProgress     = await getUserWebProgress();
  var ethicsProgress  = await getUserEthicsProgress();
  var cryptoProgress  = await getUserCryptoProgress();
  var pentestProgress = await getUserPentestProgress();

  card.style.display = "block";
  var nameEl         = document.getElementById("userName");
  var emailEl        = document.getElementById("userEmail");
  var xpEl           = document.getElementById("totalXP");
  var doneEl         = document.getElementById("coursesCompleted");
  // Welcome-card bars (top of the page).
  var wLinuxBar      = document.getElementById("welcomeLinuxBar");
  var wNetBar        = document.getElementById("welcomeNetworkBar");
  var wWebBar        = document.getElementById("welcomeWebBar");
  var wEthicsBar     = document.getElementById("welcomeEthicsBar");
  var wCryptoBar     = document.getElementById("welcomeCryptoBar");
  var wPentestBar    = document.getElementById("welcomePentestBar");
  var wLinuxLbl      = document.getElementById("welcomeLinuxLabel");
  var wNetLbl        = document.getElementById("welcomeNetworkLabel");
  var wWebLbl        = document.getElementById("welcomeWebLabel");
  var wEthicsLbl     = document.getElementById("welcomeEthicsLabel");
  var wCryptoLbl     = document.getElementById("welcomeCryptoLabel");
  var wPentestLbl    = document.getElementById("welcomePentestLabel");
  // Path-card bars (the thin line under each course tile in the grid).
  var linuxPathBar   = document.getElementById("linuxProgress");
  var netPathBar     = document.getElementById("networkProgress");
  var webPathBar     = document.getElementById("webPathProgress");
  var ethicsPathBar  = document.getElementById("ethicsPathProgress");
  var cryptoPathBar  = document.getElementById("cryptoPathProgress");
  var pentestPathBar = document.getElementById("pentestPathProgress");

  if (nameEl)  nameEl.textContent  = "Welcome back, " + meResult.data.name + "!";
  if (emailEl) emailEl.textContent = meResult.data.email;

  // Combined XP across all six courses.
  var linuxXP    = progress.totalXP || 0;
  var linuxBonus = progress.labCompleted ? 50 : 0;
  var networkXP  = netProgress.totalXP || 0;
  var webXP      = webProgress.totalXP || 0;
  var ethicsXP   = ethicsProgress.totalXP || 0;
  var cryptoXP   = cryptoProgress.totalXP || 0;
  var pentestXP  = pentestProgress.totalXP || 0;
  if (xpEl) xpEl.textContent = (linuxXP + linuxBonus + networkXP + webXP + ethicsXP + cryptoXP + pentestXP);

  // Linux progress — percentage of Linux tasks completed. Paint BOTH the
  // welcome bar AND the thin line on the Linux path card so neither stays
  // stuck at 0% just because the user already had progress in the DB.
  var linuxDone = (progress.completedTasks || []).length;
  var linuxPct  = Math.min(100, (linuxDone / TOTAL_TASKS) * 100);
  if (wLinuxBar)    wLinuxBar.style.width    = linuxPct + "%";
  if (linuxPathBar) linuxPathBar.style.width = linuxPct + "%";
  if (wLinuxLbl)    wLinuxLbl.textContent    = Math.round(linuxPct) + "%";

  // Network progress — percentage of Network tasks completed. Same
  // dual-paint trick: welcome bar + path-card bar.
  var netDone = (netProgress.completedTasks || []).length;
  var netPct  = Math.min(100, (netDone / NETWORK_TOTAL_TASKS) * 100);
  if (wNetBar)    wNetBar.style.width    = netPct + "%";
  if (netPathBar) netPathBar.style.width = netPct + "%";
  if (wNetLbl)    wNetLbl.textContent    = Math.round(netPct) + "%";

  // Web progress — percentage of Web tasks completed.
  var webDone = (webProgress.completedTasks || []).length;
  var webPct  = Math.min(100, (webDone / WEB_TOTAL_TASKS) * 100);
  if (wWebBar)    wWebBar.style.width    = webPct + "%";
  if (webPathBar) webPathBar.style.width = webPct + "%";
  if (wWebLbl)    wWebLbl.textContent    = Math.round(webPct) + "%";

  // Ethics progress — percentage of MCQs answered correctly.
  var ethicsDone = (ethicsProgress.completedTasks || []).length;
  var ethicsPct  = Math.min(100, (ethicsDone / ETHICS_TOTAL_QUESTIONS) * 100);
  if (wEthicsBar)    wEthicsBar.style.width    = ethicsPct + "%";
  if (ethicsPathBar) ethicsPathBar.style.width = ethicsPct + "%";
  if (wEthicsLbl)    wEthicsLbl.textContent    = Math.round(ethicsPct) + "%";

  // Crypto progress — percentage of crypto lab tasks completed.
  var cryptoDone = (cryptoProgress.completedTasks || []).length;
  var cryptoPct  = Math.min(100, (cryptoDone / CRYPTO_TOTAL_TASKS) * 100);
  if (wCryptoBar)    wCryptoBar.style.width    = cryptoPct + "%";
  if (cryptoPathBar) cryptoPathBar.style.width = cryptoPct + "%";
  if (wCryptoLbl)    wCryptoLbl.textContent    = Math.round(cryptoPct) + "%";

  // Pentest progress — percentage of pentest lab tasks completed.
  var pentestDone = (pentestProgress.completedTasks || []).length;
  var pentestPct  = Math.min(100, (pentestDone / PENTEST_TOTAL_TASKS) * 100);
  if (wPentestBar)    wPentestBar.style.width    = pentestPct + "%";
  if (pentestPathBar) pentestPathBar.style.width = pentestPct + "%";
  if (wPentestLbl)    wPentestLbl.textContent    = Math.round(pentestPct) + "%";

  // Welcome-card chip is now "Enrolled: X/6".
  if (doneEl) doneEl.textContent = enrolledSet.size;

  // Hide welcome-card progress rows for any course the user is NOT
  // enrolled in, so the welcome card matches the dashboard view.
  var rows = document.querySelectorAll("[data-welcome-row]");
  rows.forEach(function (row) {
    var c = row.getAttribute("data-welcome-row");
    row.style.display = enrolledSet.has(c) ? "" : "none";
  });
}

// ============================================
// PROFILE PAGE
// ============================================

/**
 * Escape arbitrary text for safe injection into innerHTML. Used for the
 * friends list since names come from other members' input.
 */
function _escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format an ISO timestamp as a coarse "X minutes/hours/days ago" string.
 * Returns "never" for null / undefined input.
 *
 * Defensive about timezone-less timestamps: the backend stores naive
 * UTC values (``datetime.utcnow``); if the string we receive has no
 * ``Z`` / ``+HH:MM`` suffix we re-interpret it as UTC, otherwise
 * ``new Date(…)`` would treat it as local time and the displayed
 * "Last seen" would drift by the viewer's UTC offset.
 */
function formatLastSeen(iso) {
  if (!iso) return "never";
  var s = String(iso);
  if (s && !/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  var t;
  try { t = new Date(s).getTime(); } catch (e) { return "never"; }
  if (!Number.isFinite(t)) return "never";
  var diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60)        return "just now";
  if (diffSec < 60 * 60)   return Math.floor(diffSec / 60) + " min ago";
  if (diffSec < 60 * 60 * 24) {
    var h = Math.floor(diffSec / 3600);
    return h + (h === 1 ? " hour ago" : " hours ago");
  }
  var days = Math.floor(diffSec / (60 * 60 * 24));
  if (days === 1) return "yesterday";
  if (days < 7)   return days + " days ago";
  if (days < 30)  return Math.floor(days / 7) + "w ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
}

/**
 * Walk every element with ``data-last-seen="<iso>"`` and re-render its
 * text. Lets the friends-list / member-profile pages keep "5 min ago"
 * rolling forward without reloading.
 */
function refreshLastSeenLabels() {
  var nodes = document.querySelectorAll("[data-last-seen]");
  nodes.forEach(function (el) {
    var iso = el.getAttribute("data-last-seen");
    var prefix = el.getAttribute("data-last-seen-prefix") || "";
    el.textContent = prefix + formatLastSeen(iso || "");
  });
}

// Tick relative-time labels every 30 seconds.
if (typeof window !== "undefined" && !window._lastSeenTimer) {
  window._lastSeenTimer = setInterval(refreshLastSeenLabels, 30 * 1000);
}

/** Snapshot of the last-loaded profile, used by the "Reset" button. */
var _profileSnapshot = null;

/**
 * Render the profile payload returned by /api/auth/profile into the
 * page. Idempotent — safe to call again after a successful save.
 */
function renderProfile(profile) {
  _profileSnapshot = profile;

  var content = document.getElementById("profileContent");
  var loading = document.getElementById("profileLoading");
  if (loading) loading.style.display = "none";
  if (content) content.style.display = "";

  // Identity (read-only)
  var setText = function (id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  };
  setText("profileName",            profile.name);
  setText("profileEmailHeader",     profile.email);
  setText("profileNameValue",       profile.name);
  setText("profileEmailValue",      profile.email);
  setText("profileStudentIdValue",  profile.studentId);
  setText("profileMemberIdValue",   "#" + profile.id);

  // Avatar initials
  var avatar = document.getElementById("profileAvatar");
  if (avatar) avatar.textContent = getInitials(profile.name);

  // Editable fields
  var yearSel  = document.getElementById("profileYear");
  var majorInp = document.getElementById("profileMajor");
  if (yearSel) {
    var yearValue = profile.year || "";
    // If the stored year isn't one of our preset options, inject it as a
    // one-off so legacy values (e.g. "Sophomore") still display.
    var matched = false;
    for (var i = 0; i < yearSel.options.length; i++) {
      if (yearSel.options[i].value === yearValue) { matched = true; break; }
    }
    if (!matched && yearValue) {
      var opt = document.createElement("option");
      opt.value = yearValue;
      opt.textContent = yearValue + " (legacy)";
      yearSel.appendChild(opt);
    }
    yearSel.value = yearValue;
  }
  if (majorInp) majorInp.value = profile.major || "";

  // Enrollments
  var enrollEl = document.getElementById("profileEnrollments");
  if (enrollEl) {
    var rows = profile.enrollments || [];
    if (rows.length === 0) {
      enrollEl.innerHTML =
        '<div style="color:var(--muted, #888); font-size:14px;">' +
        "You haven\u2019t enrolled in any courses yet. Visit the Learning page to start with " +
        "<strong>Cybersecurity Ethics &amp; Laws</strong>." +
        "</div>";
    } else {
      enrollEl.innerHTML = rows.map(function (r) {
        return '<span class="enrollment-pill">' +
               _escapeHtml(r.label || r.course) +
               "</span>";
      }).join("");
    }
  }

  // Friends list — each row links to the friend's public profile.
  var friendsEl = document.getElementById("profileFriends");
  if (friendsEl) {
    var friends = profile.friends || [];
    if (friends.length === 0) {
      friendsEl.innerHTML =
        '<div class="friend-empty">' +
        "\ud83d\udc65 No friends yet.<br>" +
        "<small>Send a request below to start your friends list.</small>" +
        "</div>";
    } else {
      friendsEl.innerHTML = friends.map(function (f) {
        return '<div class="friend-row" data-friend-id="' + f.id + '">' +
               '<div>' +
                 '<a class="friend-link" href="member.html?id=' + f.id + '">' +
                   _escapeHtml(f.name) +
                 "</a>" +
                 '<div class="friend-meta" data-last-seen="' +
                   _escapeHtml(f.lastSeen || "") + '" data-last-seen-prefix="Last seen ">' +
                   "Last seen " + _escapeHtml(formatLastSeen(f.lastSeen)) +
                 "</div>" +
               "</div>" +
               '<div style="display:flex; align-items:center; gap:6px;">' +
                 '<small class="friend-meta">#' + f.id + "</small>" +
                 '<button type="button" class="remove-friend" data-remove-friend="' + f.id +
                 '" title="Remove friend">Remove</button>' +
               "</div>" +
               "</div>";
      }).join("");
    }

    // Wire the per-row Remove buttons. Replace listeners on each render.
    friendsEl.querySelectorAll("[data-remove-friend]").forEach(function (btn) {
      btn.addEventListener("click", async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var friendId = parseInt(btn.getAttribute("data-remove-friend"), 10);
        if (!friendId) return;
        var name = btn.closest(".friend-row")
                      .querySelector(".friend-link, strong").textContent || "this friend";
        if (!confirm("Remove " + name + " from your friends list?")) return;
        btn.disabled = true;
        var result = await apiFetch("/auth/friends/" + friendId, {
          method:  "DELETE",
          headers: authHeaders(getToken()),
        });
        if (result.ok && result.data && result.data.profile) {
          renderProfile(result.data.profile);
          _setAddFriendStatus(
            '<span style="color:var(--accent);">\u2713 Removed ' +
            _escapeHtml(name) + "</span>",
          );
        } else {
          btn.disabled = false;
          var msg = (result.data && (result.data.error || result.data.message)) ||
                    "Could not remove friend.";
          alert("✗ " + msg);
        }
      });
    });
  }

  // Incoming + outgoing friend requests.
  var reqs = profile.friendRequests || { incoming: [], outgoing: [] };
  _renderIncomingRequests(reqs.incoming || []);
  _renderOutgoingRequests(reqs.outgoing || []);
}

/** Render the "Incoming Requests" panel and wire Accept/Reject. */
function _renderIncomingRequests(rows) {
  var section = document.getElementById("incomingRequestsSection");
  var list    = document.getElementById("incomingRequests");
  if (!section || !list) return;

  if (!rows.length) { section.style.display = "none"; list.innerHTML = ""; return; }
  section.style.display = "";

  list.innerHTML = rows.map(function (r) {
    var m = r.member || {};
    return '<div class="request-row" data-request-id="' + r.id + '">' +
             '<div>' +
               '<a class="friend-link" href="member.html?id=' + m.id + '">' +
                 _escapeHtml(m.name || ("Member #" + m.id)) +
               "</a>" +
               '<div class="friend-meta">Wants to be your friend</div>' +
             "</div>" +
             '<div class="request-actions">' +
               '<button type="button" class="accept" data-accept-request="' + r.id + '">Accept</button>' +
               '<button type="button" class="reject" data-reject-request="' + r.id + '">Reject</button>' +
             "</div>" +
           "</div>";
  }).join("");

  list.querySelectorAll("[data-accept-request]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      _respondToRequest(parseInt(btn.getAttribute("data-accept-request"), 10), "accept", btn);
    });
  });
  list.querySelectorAll("[data-reject-request]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      _respondToRequest(parseInt(btn.getAttribute("data-reject-request"), 10), "reject", btn);
    });
  });
}

/** Render the "Sent Requests" panel — read-only with status pill. */
function _renderOutgoingRequests(rows) {
  var section = document.getElementById("outgoingRequestsSection");
  var list    = document.getElementById("outgoingRequests");
  if (!section || !list) return;

  // Hide accepted ones — they're already in the friends list above.
  var visible = rows.filter(function (r) { return r.status !== "accepted"; });
  if (!visible.length) { section.style.display = "none"; list.innerHTML = ""; return; }
  section.style.display = "";

  list.innerHTML = visible.map(function (r) {
    var m = r.member || {};
    var statusLabel = (r.status || "pending").charAt(0).toUpperCase() +
                      (r.status || "pending").slice(1);
    return '<div class="request-row" data-request-id="' + r.id + '">' +
             '<div>' +
               '<strong>' + _escapeHtml(m.name || ("Member #" + m.id)) + "</strong>" +
               '<div class="friend-meta">Sent ' +
                 _escapeHtml(formatLastSeen(r.createdAt)) +
               "</div>" +
             "</div>" +
             '<span class="status-pill ' + _escapeHtml(r.status) + '">' +
               _escapeHtml(statusLabel) +
             "</span>" +
           "</div>";
  }).join("");
}

/** POST /auth/friends/requests/<id>/accept|reject and re-render. */
async function _respondToRequest(reqId, action, btn) {
  if (!reqId || (action !== "accept" && action !== "reject")) return;
  if (btn) btn.disabled = true;
  var result = await apiFetch("/auth/friends/requests/" + reqId + "/" + action, {
    method:  "POST",
    headers: authHeaders(getToken()),
  });
  if (result.ok && result.data && result.data.profile) {
    renderProfile(result.data.profile);
    _setAddFriendStatus(
      '<span style="color:var(--accent);">\u2713 ' +
      _escapeHtml(result.data.message || "Request " + action + "ed") + "</span>",
    );
  } else {
    if (btn) btn.disabled = false;
    var msg = (result.data && (result.data.error || result.data.message)) ||
              "Could not update the request.";
    alert("✗ " + msg);
  }
}

/** Inject a transient status message under the add-friend form. */
function _setAddFriendStatus(html) {
  var el = document.getElementById("addFriendStatus");
  if (!el) return;
  el.innerHTML = html || "";
  if (html) {
    setTimeout(function () {
      // Only clear if the message is still the same (avoid clobbering a
      // newer status from a subsequent action).
      if (el.innerHTML === html) el.innerHTML = "";
    }, 3500);
  }
}

/**
 * Initial profile page bootstrap. Decides between the login prompt and
 * the live profile view, fetches the data, and wires the save form.
 */
async function initProfilePage() {
  var loginPrompt = document.getElementById("profileLoginPrompt");
  var content     = document.getElementById("profileContent");
  var loading     = document.getElementById("profileLoading");

  if (!isLoggedIn()) {
    if (loading)     loading.style.display = "none";
    if (content)     content.style.display = "none";
    if (loginPrompt) loginPrompt.style.display = "";
    return;
  }

  // Fetch profile.
  var result = await apiFetch("/auth/profile", { headers: authHeaders(getToken()) });
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      // Stale token — force a re-login.
      clearToken();
      window.location.href = "login.html";
      return;
    }
    if (loading) {
      loading.innerHTML =
        '<div style="color:var(--warning, #ff9b3d);">' +
        (result.data && (result.data.error || result.data.message) ||
         "Could not load your profile. Please try again.") +
        "</div>";
    }
    return;
  }

  renderProfile(result.data);

  // Wire the save form.
  var form = document.getElementById("profileForm");
  if (form) {
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var saveBtn  = document.getElementById("profileSaveBtn");
      var statusEl = document.getElementById("saveStatus");
      if (saveBtn)  saveBtn.disabled = true;
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted, #888);">Saving\u2026</span>';

      var yearSel  = document.getElementById("profileYear");
      var majorInp = document.getElementById("profileMajor");
      var payload  = {
        year:  yearSel  ? yearSel.value  : "",
        major: majorInp ? majorInp.value : "",
      };

      var saveResult = await apiFetch("/auth/profile", {
        method: "PUT",
        headers: authHeaders(getToken()),
        body: JSON.stringify(payload),
      });

      if (saveBtn) saveBtn.disabled = false;

      if (saveResult.ok) {
        if (statusEl) statusEl.innerHTML =
          '<span style="color:var(--accent);">\u2713 Saved</span>';
        if (saveResult.data && saveResult.data.profile) {
          renderProfile(saveResult.data.profile);
        }
        setTimeout(function () { if (statusEl) statusEl.innerHTML = ""; }, 2500);
      } else {
        var msg = (saveResult.data && (saveResult.data.error || saveResult.data.message)) ||
                  "Could not save changes.";
        if (statusEl) statusEl.innerHTML =
          '<span style="color:var(--warning, #ff9b3d);">\u2717 ' +
          _escapeHtml(msg) + "</span>";
      }
    });
  }

  // Reset button — restore last-loaded values.
  var resetBtn = document.getElementById("profileResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      if (_profileSnapshot) renderProfile(_profileSnapshot);
      var statusEl = document.getElementById("saveStatus");
      if (statusEl) statusEl.innerHTML = "";
    });
  }

  // Add-friend form. Submit posts the entered ID to /auth/friends and
  // re-renders the page from the response payload.
  var addForm = document.getElementById("addFriendForm");
  if (addForm) {
    addForm.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var input = document.getElementById("addFriendInput");
      var btn   = document.getElementById("addFriendBtn");
      var raw   = (input && input.value || "").trim();
      if (!raw) {
        _setAddFriendStatus(
          '<span style="color:var(--warning, #ff9b3d);">' +
          "Enter the Member ID of the friend you want to add.</span>",
        );
        return;
      }
      // Allow either "#42" or "42".
      var memberId = parseInt(raw.replace(/^#/, ""), 10);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        _setAddFriendStatus(
          '<span style="color:var(--warning, #ff9b3d);">' +
          "That doesn\u2019t look like a valid Member ID.</span>",
        );
        return;
      }

      if (btn) btn.disabled = true;
      _setAddFriendStatus(
        '<span style="color:var(--muted, #888);">Adding\u2026</span>',
      );

      var result = await apiFetch("/auth/friends/request", {
        method:  "POST",
        headers: authHeaders(getToken()),
        body:    JSON.stringify({ memberId: memberId }),
      });

      if (btn) btn.disabled = false;

      if (result.ok) {
        if (result.data && result.data.profile) renderProfile(result.data.profile);
        if (input) input.value = "";
        var msg = (result.data && result.data.message) || "Friend request sent.";
        _setAddFriendStatus(
          '<span style="color:var(--accent);">\u2713 ' + _escapeHtml(msg) + "</span>",
        );
      } else {
        var err = (result.data && (result.data.error || result.data.message)) ||
                  "Could not send friend request.";
        _setAddFriendStatus(
          '<span style="color:var(--warning, #ff9b3d);">\u2717 ' +
          _escapeHtml(err) + "</span>",
        );
      }
    });
  }
}

// ============================================
// MEMBER (FRIEND) PUBLIC PROFILE PAGE
// ============================================

/** Read ?id=<n> from the URL. Returns null if missing/invalid. */
function _getMemberIdFromQuery() {
  try {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("id") || "";
    var n = parseInt(raw.replace(/^#/, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

/** Show the appropriate panel on member.html. */
function _setMemberPanel(which) {
  ["memberLoginPrompt", "memberLoading", "memberError", "memberContent"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === which) ? "" : "none";
  });
}

function _showMemberError(title, message) {
  var t = document.getElementById("memberErrorTitle");
  var m = document.getElementById("memberErrorMessage");
  if (t) t.textContent = title;
  if (m) m.textContent = message;
  _setMemberPanel("memberError");
}

async function initMemberProfilePage() {
  if (!isLoggedIn()) {
    _setMemberPanel("memberLoginPrompt");
    return;
  }
  var memberId = _getMemberIdFromQuery();
  if (!memberId) {
    _showMemberError("Profile not found",
      "This page expects a Member ID in the URL, e.g. member.html?id=42.");
    return;
  }

  var result = await apiFetch("/members/" + memberId + "/public-profile", {
    headers: authHeaders(getToken()),
  });

  if (!result.ok) {
    if (result.status === 401) {
      clearToken();
      window.location.href = "login.html";
      return;
    }
    if (result.status === 403) {
      _showMemberError("Not your friend yet",
        "You can only view profiles of members you\u2019re friends with. " +
        "Send a friend request from your profile page first.");
      return;
    }
    if (result.status === 404) {
      _showMemberError("Member not found",
        "There is no member with ID #" + memberId + ".");
      return;
    }
    var msg = (result.data && (result.data.error || result.data.message)) ||
              "Could not load this profile.";
    _showMemberError("Profile unavailable", msg);
    return;
  }

  _renderMemberPublicProfile(result.data);
}

function _renderMemberPublicProfile(p) {
  _setMemberPanel("memberContent");

  var avatar = document.getElementById("memberAvatar");
  if (avatar) avatar.textContent = getInitials(p.name);

  var setText = function (id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || "\u2014";
  };
  setText("memberName",     p.name);
  setText("memberMajor",    p.major || "Not set");
  var ls = document.getElementById("memberLastSeen");
  if (ls) {
    ls.setAttribute("data-last-seen", p.lastSeen || "");
    ls.removeAttribute("data-last-seen-prefix");
    ls.textContent = formatLastSeen(p.lastSeen);
  }

  // Enrolled courses
  var enrollEl = document.getElementById("memberEnrollments");
  if (enrollEl) {
    var rows = p.enrollments || [];
    if (!rows.length) {
      enrollEl.innerHTML =
        '<div class="empty-block">Hasn\u2019t enrolled in any courses yet.</div>';
    } else {
      enrollEl.innerHTML = rows.map(function (r) {
        return '<span class="enrollment-pill">' +
               _escapeHtml(r.label || r.course) +
               "</span>";
      }).join("");
    }
  }

  // Recent activities
  var actEl = document.getElementById("memberActivities");
  if (actEl) {
    var acts = p.recentActivities || [];
    if (!acts.length) {
      actEl.innerHTML =
        '<div class="empty-block">No recent activity yet.</div>';
    } else {
      actEl.innerHTML = acts.map(function (a) {
        var done  = a.tasksCompleted || 0;
        var total = a.taskTotal || "?";
        var labBadge = a.labCompleted
          ? ' <span class="status-pill accepted" style="margin-left:8px;">Lab ✓</span>'
          : "";
        return '<div class="activity-row">' +
                 '<div>' +
                   '<strong>' + _escapeHtml(a.label) + "</strong>" + labBadge +
                   '<div class="activity-meta">' +
                     done + "/" + total + " tasks" +
                     (a.lastUpdated
                       ? " \u00b7 updated " + _escapeHtml(formatLastSeen(a.lastUpdated))
                       : "") +
                   "</div>" +
                 "</div>" +
                 '<span class="xp">+' + (a.earnedXP || 0) + ' XP</span>' +
               "</div>";
      }).join("");
    }
  }
}

// ============================================
// HOME HERO TYPEWRITER
// ============================================
function initHeroTypewriter() {
  var el = document.querySelector(".hero-clean h1");
  if (!el) return;
  var fullText = (el.textContent || "").trim();
  if (!fullText) return;

  // Respect users who prefer reduced motion.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  el.innerHTML = '<span class="tw-text"></span><span class="tw-cursor" aria-hidden="true">|</span>';
  var textSpan = el.querySelector(".tw-text");
  var cursor = el.querySelector(".tw-cursor");
  var i = 0;
  var speed = 90;  // ms per character

  function type() {
    if (i >= fullText.length) {
      // Fade the cursor out ~2s after typing finishes, keeping a subtle idle state.
      setTimeout(function () { if (cursor) cursor.style.opacity = "0.4"; }, 2000);
      return;
    }
    textSpan.textContent = fullText.slice(0, i + 1);
    i++;
    setTimeout(type, speed);
  }

  setTimeout(type, 350);
}

// ============================================
// INIT
// ============================================
document.addEventListener("DOMContentLoaded", function () {
  initMenu();
  setActiveNav();
  renderAuthControls();
  initHeroTypewriter();
  renderResources();
  renderTracks();
  renderScoreboard();
  initJoinForm();
  initLogin();
  initAdmin();

  if (window.location.pathname.includes("dashboard.html")) {
    updateDashboard();
  }
  if (window.location.pathname.includes("learning.html")) {
    loadUserProgressForLearning();
  }
  if (window.location.pathname.includes("profile.html")) {
    initProfilePage();
  }
  if (window.location.pathname.includes("member.html")) {
    initMemberProfilePage();
  }
  if (window.location.pathname.includes("events.html")) {
    initEventsPage();
  }
  if (window.location.pathname.includes("set-password.html")) {
    initSetPasswordPage();
  }
});

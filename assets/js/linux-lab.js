console.log("[linux-lab.js] Script loaded successfully.");
// ============================================
// API & JWT AUTH HELPERS
// ============================================
// NOTE: ``API_BASE`` is declared by assets/js/app.js, which linux-lab.html
// now loads before this file. Top-level ``const`` declarations in classic
// scripts are shared across <script> tags on the same page, so we read it
// directly here instead of redeclaring it (which would throw
// "Identifier 'API_BASE' has already been declared").
const COURSE_CONFIG = {
  totalModules: 9,
  totalTasks: 34,
  labBonusXP: 50,
  flag: "UTB{linux_foundations_mastered}"
};
const isLabMode = new URLSearchParams(window.location.search).get("lab") === "true";

function getToken() { return localStorage.getItem("token"); }

function decodeJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); }
  catch (e) { return {}; }
}

async function apiFetch(path, options) {
  options = options || {};
  try {
    const res = await fetch(API_BASE + path, options);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) {
    return { ok: false, status: 0, data: { error: "Cannot reach server" } };
  }
}

function apiHeaders() {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": "Bearer " + token } : {})
  };
}

// ============================================
// MENU
// ============================================
function initMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");
  const body = document.body;
  if (!menuToggle || !navLinks) return;

  menuToggle.innerHTML = `<div class="hamburger"><span></span><span></span><span></span></div>`;

  menuToggle.addEventListener("click", function (e) {
    e.stopPropagation();
    navLinks.classList.toggle("open");
    menuToggle.classList.toggle("active");
    body.classList.toggle("menu-open");
  });

  document.querySelectorAll(".nav-links a").forEach(link => {
    link.addEventListener("click", function () {
      navLinks.classList.remove("open");
      menuToggle.classList.remove("active");
      body.classList.remove("menu-open");
    });
  });

  document.addEventListener("click", function (e) {
    if (window.innerWidth <= 768) {
      if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
        navLinks.classList.remove("open");
        menuToggle.classList.remove("active");
        body.classList.remove("menu-open");
      }
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) {
      navLinks.classList.remove("open");
      menuToggle.classList.remove("active");
      body.classList.remove("menu-open");
    }
  });
}

function setActiveNav() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });
}

// ============================================
// COURSE DATA
// ============================================
const modules = [
  {
    id: 1,
    level: "Level 0",
    name: "Orientation & Identity",
    description: "Meet the Linux shell, understand your user context, and read the working directory with confidence.",
    focus: "Foundations",
    overview: "This stage builds terminal confidence. You will identify your user, confirm where you are in the filesystem, and inspect the contents of your home directory.",
    tasks: [
      {
        id: "m1-info-1",
        type: "info",
        title: "Mission Briefing",
        content: "This course is structured like an academy path: short theory blocks, then hands-on terminal objectives. Finish each stage in order to unlock the Docker capstone at the end."
      },
      {
        id: "m1-info-2",
        type: "info",
        title: "Why Linux Matters",
        content: "Linux powers servers, cloud infrastructure, containers, and most security tooling. If you can navigate Linux efficiently, you can learn blue team, red team, and systems work faster."
      },
      {
        id: 1,
        command: "whoami",
        points: 10,
        title: "Identify the Active User",
        description: "Print the username that owns your current shell session.",
        explanation: "Use whoami whenever you need to confirm which account is currently running commands."
      },
      {
        id: 2,
        command: "pwd",
        points: 10,
        title: "Check the Working Directory",
        description: "Display the full path to your current location.",
        explanation: "pwd stands for Print Working Directory. It helps you verify context before creating, deleting, or moving files."
      },
      {
        id: 3,
        command: "ls",
        points: 10,
        title: "List Home Directory Contents",
        description: "Inspect the files and folders currently available in your workspace.",
        explanation: "ls is your baseline reconnaissance command. Use it constantly when you enter a directory."
      }
    ]
  },
  {
    id: 2,
    level: "Level 1",
    name: "Navigation & Paths",
    description: "Move around the filesystem using relative and absolute paths.",
    focus: "Navigation",
    overview: "Navigation is a core Linux skill. You will inspect hidden files, move into subdirectories, move back out, and visit the root of the filesystem.",
    tasks: [
      {
        id: "m2-info-1",
        type: "info",
        title: "Absolute vs Relative Paths",
        content: "Absolute paths start at /. Relative paths start from where you are now. Good Linux users understand both and switch between them naturally."
      },
      {
        id: 4,
        command: "ls -la",
        points: 15,
        title: "Reveal Hidden Files",
        description: "List all files, including hidden entries that start with a dot.",
        explanation: "-l shows details and -a shows hidden files. Together, ls -la is a standard inspection command."
      },
      {
        id: 5,
        command: "cd Documents",
        points: 10,
        title: "Enter a Subdirectory",
        description: "Move from your home directory into Documents using a relative path.",
        explanation: "cd changes the current working directory. Relative paths are shorter when the target is nearby."
      },
      {
        id: 6,
        command: "cd ..",
        points: 10,
        title: "Move Up One Level",
        description: "Return to the parent directory from Documents.",
        explanation: ".. always refers to the directory one level above your current location."
      },
      {
        id: 7,
        command: "cd /",
        points: 10,
        title: "Visit the Root Directory",
        description: "Jump to the top of the Linux filesystem.",
        explanation: "The root directory / is the starting point of the entire Linux directory tree."
      }
    ]
  },
  {
    id: 3,
    level: "Level 1",
    name: "Home Workspace Setup",
    description: "Return home and build a clean workspace for the rest of the course.",
    focus: "Workspace",
    overview: "You now create a dedicated practice directory and begin writing your first file from the command line.",
    tasks: [
      {
        id: "m3-info-1",
        type: "info",
        title: "The Home Directory",
        content: "Your home directory is your personal operating area. Use it as the safe default location for practice, labs, and projects."
      },
      {
        id: 8,
        command: "cd ~",
        points: 15,
        title: "Return Home",
        description: "Use the home shortcut to jump back to your user directory.",
        explanation: "~ expands to your home directory and is one of the most useful path shortcuts in Linux."
      },
      {
        id: 9,
        command: "mkdir -p academy",
        points: 15,
        title: "Create a Course Workspace",
        description: "Create an academy directory where you will complete most exercises.",
        explanation: "mkdir -p safely creates a directory and does not fail if it already exists."
      },
      {
        id: 10,
        command: "cd academy",
        points: 15,
        title: "Enter the Workspace",
        description: "Move into your new academy directory.",
        explanation: "Staying aware of your current location prevents mistakes when manipulating files."
      },
      {
        id: 11,
        command: "touch notes.txt",
        points: 10,
        title: "Create an Empty File",
        description: "Create a notes file that will hold your first Linux content.",
        explanation: "touch is often used to create empty files quickly or to update a file timestamp."
      },
      {
        id: 12,
        command: "echo 'Linux foundations' > notes.txt",
        points: 15,
        title: "Write Data into the File",
        description: "Write your first line of content into notes.txt.",
        explanation: "The > redirection operator sends output into a file, replacing any previous content."
      }
    ]
  },
  {
    id: 4,
    level: "Level 2",
    name: "Reading & Managing Files",
    description: "Inspect contents, duplicate data, and rename files cleanly.",
    focus: "File Operations",
    overview: "Every Linux user must be able to read files, create backups, and rename artifacts without leaving the terminal.",
    tasks: [
      {
        id: "m4-info-1",
        type: "info",
        title: "Safe File Handling",
        content: "Before editing or deleting important data, create a backup or copy. Simple habits like this prevent avoidable mistakes."
      },
      {
        id: 13,
        command: "cat notes.txt",
        points: 10,
        title: "Read a Text File",
        description: "Display the contents of notes.txt directly in the terminal.",
        explanation: "cat is the fastest way to display the full contents of a short file."
      },
      {
        id: 14,
        command: "cp notes.txt notes-copy.txt",
        points: 20,
        title: "Create a Backup Copy",
        description: "Duplicate notes.txt into a second file.",
        explanation: "cp copies files and directories. It is a basic but essential safety tool."
      },
      {
        id: 15,
        command: "mv notes-copy.txt notes-archive.txt",
        points: 10,
        title: "Rename the Backup",
        description: "Rename your backup copy into an archive file.",
        explanation: "mv moves files, but it also acts as a rename command when source and destination stay in the same directory."
      },
      {
        id: 16,
        command: "ls -l",
        points: 15,
        title: "Inspect Detailed Metadata",
        description: "Display a long listing of the workspace so you can review permissions and file sizes.",
        explanation: "ls -l is the starting point for understanding ownership, permissions, and basic metadata."
      }
    ]
  },
  {
    id: 5,
    level: "Level 2",
    name: "Discovery & Search",
    description: "Create nested content and search for it using classic Linux discovery tools.",
    focus: "Recon",
    overview: "Security work depends on finding files and strings quickly. This stage introduces search habits that scale from lab work to real environments.",
    tasks: [
      {
        id: "m5-info-1",
        type: "info",
        title: "Search First, Guess Less",
        content: "Experienced Linux users do not manually browse everything. They use find, grep, tree, and file to locate targets and understand them fast."
      },
      {
        id: 17,
        command: "mkdir -p labs",
        points: 15,
        title: "Create a Nested Lab Folder",
        description: "Create a labs directory inside your academy workspace.",
        explanation: "Organizing work into folders helps you isolate notes, scripts, and challenge files."
      },
      {
        id: 18,
        command: "touch labs/mission.txt",
        points: 15,
        title: "Add a Mission File",
        description: "Create a text file inside the labs directory.",
        explanation: "Linux paths can target files in subdirectories without needing to change into them first."
      },
      {
        id: 19,
        command: "echo 'find me' > labs/mission.txt",
        points: 20,
        title: "Write Searchable Content",
        description: "Place a recognizable string into the mission file.",
        explanation: "Adding known content makes it easy to practice text-based searching."
      },
      {
        id: 20,
        command: "find . -name \"mission.txt\"",
        points: 20,
        title: "Locate a File by Name",
        description: "Search recursively from the current directory for mission.txt.",
        explanation: "find walks a directory tree and is one of the most powerful file discovery tools in Linux."
      },
      {
        id: 21,
        command: "grep -R \"find me\" .",
        points: 20,
        title: "Locate Text Recursively",
        description: "Search every file in the current directory tree for the string you created.",
        explanation: "grep -R searches recursively through file contents and is invaluable when triaging code or logs."
      },
      {
        id: 22,
        command: "tree",
        points: 15,
        title: "Visualize the Directory Structure",
        description: "Render a tree view of your workspace.",
        explanation: "tree is useful when you want a quick visual model of nested directories and files."
      },
      {
        id: 23,
        command: "file notes-archive.txt",
        points: 15,
        title: "Identify File Type",
        description: "Ask Linux what kind of file notes-archive.txt is.",
        explanation: "The file command inspects a target and reports what kind of content it likely contains."
      }
    ]
  },
  {
    id: 6,
    level: "Level 3",
    name: "Permissions & Execution",
    description: "Understand execution rights and basic permission visibility.",
    focus: "Permissions",
    overview: "Permissions are a major Linux security concept. You will create a script, make it executable, and inspect the resulting access bits.",
    tasks: [
      {
        id: "m6-info-1",
        type: "info",
        title: "Permissions in Practice",
        content: "Linux permissions define who can read, write, or execute a file. In security, misconfigured permissions can expose secrets or enable abuse."
      },
      {
        id: "m6-info-perm",
        type: "info",
        title: "🔐 Reading the Permission String",
        content: `When you run <code>ls -l</code>, each line starts with a 10-character permission string:<br><br>
<code style="font-size:13px;letter-spacing:1px;">-rwxrw-r--  1  student  student  245  Apr 4 2026  script.sh</code><br><br>
<strong>Breakdown:</strong><br>
<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;">
  <tr><td style="padding:4px 8px;color:#ffbd2e;width:30px;"><code>-</code></td><td>File type: <strong>-</strong> = regular file, <strong>d</strong> = directory, <strong>l</strong> = symlink</td></tr>
  <tr><td style="padding:4px 8px;color:#27c93f;"><code>rwx</code></td><td><strong>User (owner)</strong> — can Read, Write, Execute</td></tr>
  <tr><td style="padding:4px 8px;color:#64d8ff;"><code>rw-</code></td><td><strong>Group</strong> — can Read, Write (no execute)</td></tr>
  <tr><td style="padding:4px 8px;color:#ff5f56;"><code>r--</code></td><td><strong>Others</strong> — can only Read</td></tr>
</table><br>
<strong>Numeric (Octal) System:</strong> Each permission letter has a value: r=4, w=2, x=1<br>
Add them per group to get the numeric mode:<br>
<code>rwx</code> = 4+2+1 = <strong>7</strong> &nbsp;|&nbsp; <code>rw-</code> = 4+2+0 = <strong>6</strong> &nbsp;|&nbsp; <code>r-x</code> = 4+0+1 = <strong>5</strong> &nbsp;|&nbsp; <code>r--</code> = 4+0+0 = <strong>4</strong><br><br>
<strong>Common Modes:</strong><br>
<code>777</code> = rwxrwxrwx — everyone full access (dangerous!)<br>
<code>755</code> = rwxr-xr-x — owner full, others read+exec (typical for programs)<br>
<code>644</code> = rw-r--r-- — owner read+write, others read-only (typical for files)<br>
<code>600</code> = rw------- — owner only, completely private<br>
<code>700</code> = rwx------ — owner only, private + executable`
      },
      {
        id: 24,
        command: "touch script.sh",
        points: 10,
        title: "Prepare a Script File",
        description: "Create a shell script file that will later become executable.",
        explanation: "Scripts are just text files until Linux is told they can be executed."
      },
      {
        id: 25,
        command: "chmod +x script.sh",
        points: 5,
        title: "Grant Execute Permission",
        description: "Add the executable bit to script.sh.",
        explanation: "chmod changes file modes. +x adds execute permission to user, group, and others. Equivalent to chmod 755 for a file."
      },
      {
        id: 26,
        command: "ls -l script.sh",
        points: 5,
        title: "Verify the Permission Change",
        description: "Inspect script.sh and confirm that execute permission (x) now appears in the listing for user, group, and others.",
        explanation: "After chmod +x, ls -l shows -rwxr-xr-x, where the x bits confirm executability. The numeric equivalent is 755: User=7(rwx), Group=5(r-x), Others=5(r-x)."
      }
    ]
  },
  {
    id: 7,
    level: "Level 3",
    name: "Archives & Portability",
    description: "Bundle your work into reusable archives.",
    focus: "Packaging",
    overview: "Compression and archiving matter when moving evidence, source code, or reports between systems. You will package your workspace in both tar and zip formats.",
    tasks: [
      {
        id: "m7-info-1",
        type: "info",
        title: "Why Archives Matter",
        content: "tar is a Linux staple for collecting files into one archive. zip is common for portability across operating systems."
      },
      {
        id: 27,
        command: "cd /home/student",
        points: 10,
        title: "Return to Home for Packaging",
        description: "Move back to your home directory so you can archive the academy workspace.",
        explanation: "Archive commands are easier when you run them from the parent directory of the target."
      },
      {
        id: 28,
        command: "tar -cvf academy.tar academy",
        points: 10,
        title: "Create a TAR Archive",
        description: "Bundle the academy directory into a tar archive.",
        explanation: "tar -cvf creates an uncompressed archive and lists what it includes."
      },
      {
        id: 29,
        command: "zip -r academy.zip academy",
        points: 10,
        title: "Create a ZIP Archive",
        description: "Create a recursive zip archive of the same workspace.",
        explanation: "zip -r archives directories recursively, which makes it useful for portable file sharing."
      }
    ]
  },
  {
    id: 8,
    level: "Level 4",
    name: "Mission Preparation",
    description: "Move into the challenge area and inspect the capstone briefing.",
    focus: "Pre-Capstone",
    overview: "Before the final lab, you will locate the challenge briefing and confirm where the final mission files live.",
    tasks: [
      {
        id: "m8-info-1",
        type: "info",
        title: "Capstone Mindset",
        content: "The final lab is intentionally small but realistic: inspect, extract, search, and recover the flag using the exact habits you practiced in earlier modules."
      },
      {
        id: 30,
        command: "cd /home/student/challenges",
        points: 15,
        title: "Enter the Challenge Directory",
        description: "Move into the shared challenge area of your personal environment.",
        explanation: "This directory contains the capstone files prepared for your account."
      },
      {
        id: 31,
        command: "find . -name \"README.txt\"",
        points: 10,
        title: "Locate the Briefing File",
        description: "Search the challenge tree for a README file.",
        explanation: "This reinforces file discovery before the capstone begins."
      },
      {
        id: 32,
        command: "cat /home/student/challenges/final-lab/README.txt",
        points: 10,
        title: "Read the Capstone Brief",
        description: "Display the mission briefing for the final lab.",
        explanation: "Reading instructions carefully is part of professional lab work."
      }
    ]
  },
  {
    id: 9,
    level: "Level 4",
    name: "Capstone Gate",
    description: "Inspect the capstone directory and confirm the flag workflow before entering the final lab.",
    focus: "Gate",
    overview: "This last course stage proves you can investigate a target directory before beginning the final challenge.",
    tasks: [
      {
        id: "m9-info-1",
        type: "info",
        title: "Final Reminder",
        content: "When you finish this stage, the Docker capstone becomes available. Complete the capstone to capture the UTB flag and unlock your certificate."
      },
      {
        id: 33,
        command: "ls -la /home/student/challenges/final-lab",
        points: 10,
        title: "Inspect the Capstone Directory",
        description: "List the contents of the final-lab directory, including hidden entries.",
        explanation: "Always inspect the target before interacting with it. This habit prevents blind execution."
      },
      {
        id: 34,
        command: "grep -R \"flag\" /home/student/challenges/final-lab",
        points: 15,
        title: "Confirm the Flag Format Clue",
        description: "Search the capstone directory for references to the final flag.",
        explanation: "grep is often the fastest way to identify clues hidden in notes, configs, or documentation."
      }
    ]
  }
];

const finalLab = {
  title: "Operation Nightfall · Docker Capstone",
  description: "You are a junior SOC analyst. A suspicious process was detected on a university server. Your mission: investigate the compromised directory, analyze the evidence logs, and capture the hidden forensic flag. Think like an analyst — no step-by-step commands are given.",
  scenario: "A critical server was accessed without authorization last night. The forensic team has sealed the evidence in a tar archive inside your challenge directory. You must extract it, trace the logs, find the hidden evidence directory, and recover the flag left by the forensic team before the investigation window closes.",
  objectives: [
    {
      id: "lab-1",
      title: "Objective 1 — Reach the Investigation Zone",
      description: "Your challenge environment is located at /home/student/challenges/final-lab. Navigate there and read the mission briefing file to understand the scope of the investigation.",
      tools: ["cd", "cat"],
      hint: "Start at /home/student/challenges/final-lab — read README.txt for the briefing."
    },
    {
      id: "lab-2",
      title: "Objective 2 — Enumerate the Scene",
      description: "Before touching any evidence, enumerate ALL files in the directory — including hidden ones. Analysts never skip enumeration. Hidden files and directories can reveal critical artifacts.",
      tools: ["ls -la"],
      hint: "Hidden files start with a dot. Use the right flags to reveal them."
    },
    {
      id: "lab-3",
      title: "Objective 3 — Unpack the Evidence Archive",
      description: "The forensic team sealed the evidence inside an archive called mission.tar. Extract it to access the investigation artifacts. List what was unpacked.",
      tools: ["tar", "ls"],
      hint: "Use tar to extract — the archive name is mission.tar. Check what appears after extraction."
    },
    {
      id: "lab-4",
      title: "Objective 4 — Analyze the Incident Log",
      description: "An incident log was packed inside the evidence. Find it and read it carefully. It contains timestamps of suspicious events and a clue about where the flag is stored.",
      tools: ["find", "cat", "grep"],
      hint: "Look for a file ending in .log inside the extracted directory. Read it with cat."
    },
    {
      id: "lab-5",
      title: "Objective 5 — Access the Hidden Evidence Directory",
      description: "The incident log references a hidden evidence directory (.evidence) containing an access log. Navigate to the extracted directory and enumerate it — including all hidden entries. Then read the access log.",
      tools: ["ls -la", "cat"],
      hint: "Look inside extracted/ — you'll find a hidden directory starting with a dot."
    },
    {
      id: "lab-6",
      title: "Objective 6 — Hunt the Flag Pattern",
      description: "Search the entire extracted directory tree recursively for the UTB flag pattern. The forensic team confirmed it starts with UTB{ — use text search to locate it across all files.",
      tools: ["grep -R"],
      hint: "Search for UTB{ recursively inside the extracted directory. grep is your best tool here."
    },
    {
      id: "lab-7",
      title: "Objective 7 — Capture the Flag",
      description: "You have traced the clues. Now retrieve the actual flag by reading the flag file directly. It is stored inside a hidden sub-directory within .evidence. Cat the file to display the flag.",
      tools: ["cat"],
      hint: "The access log told you where — read extracted/.evidence/.flag/flag.txt"
    }
  ]
};

// ============================================
// USER PROGRESS
// ============================================
let completedTasks = [];
let totalXP = 0;
let currentModule = 1;
let isLoggedIn = false;
let labCompleted = false;
let completedLabObjectives = [];

function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  const claims = decodeJwt(token);
  if (!claims || !claims.email) return null;
  return { name: claims.name || claims.email.split("@")[0], email: claims.email };
}

function getGuestTerminalSessionId() {
  const key = "guestTerminalSessionId";
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : ("guest-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function getLabStateKey() {
  const user = getCurrentUser();
  if (user && user.email) {
    return "linux_lab_state_" + user.email.replace(/[^a-zA-Z0-9]/g, "_");
  }
  return "linux_lab_state_" + getGuestTerminalSessionId();
}

function loadLabStateFromSession() {
  try {
    const raw = sessionStorage.getItem(getLabStateKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.completedLabObjectives)) {
      completedLabObjectives = parsed.completedLabObjectives.slice();
    }
    if (!labCompleted) {
      labCompleted = !!parsed.labCompleted;
    }
  } catch (e) {}

  if (labCompleted) {
    completedLabObjectives = finalLab.objectives.map(objective => objective.id);
  }
}

function saveLabStateToSession() {
  sessionStorage.setItem(getLabStateKey(), JSON.stringify({
    completedLabObjectives,
    labCompleted
  }));
}

async function loadProgressFromAPI() {
  const result = await apiFetch("/progress", { headers: apiHeaders() });
  if (result.ok) {
    return {
      linuxCompleted: result.data.completedTasks || [],
      linuxXP: result.data.totalXP || 0,
      linuxLabCompleted: result.data.labCompleted || false
    };
  }
  return { linuxCompleted: [], linuxXP: 0, linuxLabCompleted: false };
}

async function saveProgressToAPI(labStatus) {
  await apiFetch("/progress", {
    method: "PUT",
    headers: apiHeaders(),
    body: JSON.stringify({
      completedTasks: completedTasks,
      labCompleted: labStatus || false
    })
  });
}

function getCourseCommandTasks() {
  return modules.flatMap(module => module.tasks.filter(task => task.command));
}

function hasCompletedCourse() {
  return getCourseCommandTasks().every(task => completedTasks.includes(task.id));
}

function isModuleUnlocked(moduleId) {
  if (moduleId === 1) return true;
  const previousModule = modules.find(module => module.id === moduleId - 1);
  if (!previousModule) return false;
  const previousTaskIds = previousModule.tasks.filter(task => task.command).map(task => task.id);
  return previousTaskIds.every(id => completedTasks.includes(id));
}

function isModuleCompleted(moduleId) {
  const module = modules.find(item => item.id === moduleId);
  if (!module) return false;
  const taskIds = module.tasks.filter(task => task.command).map(task => task.id);
  return taskIds.length > 0 && taskIds.every(id => completedTasks.includes(id));
}

async function loadUserData() {
  const token = getToken();
  if (token) {
    isLoggedIn = true;
    const progress = await loadProgressFromAPI();
    completedTasks = progress.linuxCompleted;
    totalXP = progress.linuxXP;
    labCompleted = progress.linuxLabCompleted;

    const claims = decodeJwt(token);
    if (claims.email) {
      const sanitized = claims.email.replace(/[^a-zA-Z0-9]/g, "_");
      localStorage.removeItem("course_progress_" + sanitized);
      localStorage.removeItem("linux_progress_" + sanitized);
    }
    localStorage.removeItem("userCourseProgress");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("clubMembers");
  } else {
    isLoggedIn = false;
    const guestProgress = sessionStorage.getItem("linux_guest_progress");
    if (guestProgress) {
      try {
        const guest = JSON.parse(guestProgress);
        completedTasks = guest.completedTasks || [];
        totalXP = guest.totalXP || 0;
        currentModule = guest.currentModule || 1;
        labCompleted = guest.labCompleted || false;
      } catch (e) {
        completedTasks = [];
        totalXP = 0;
        currentModule = 1;
        labCompleted = false;
      }
    }
  }

  loadLabStateFromSession();

  if (!isLabMode && completedTasks.length > 0) {
    for (let i = modules.length; i >= 1; i--) {
      if (isModuleUnlocked(i)) {
        currentModule = i;
        break;
      }
    }
  }
}

async function saveUserData() {
  saveLabStateToSession();
  if (isLoggedIn) {
    await saveProgressToAPI(labCompleted);
  } else {
    sessionStorage.setItem("linux_guest_progress", JSON.stringify({
      completedTasks: completedTasks,
      totalXP: totalXP,
      currentModule: currentModule,
      labCompleted: labCompleted,
      lastUpdated: new Date().toISOString()
    }));
  }
}

// ============================================
// UI RENDERING
// ============================================
function updateHeroForMode() {
  const eyebrow = document.querySelector(".page-hero .eyebrow");
  const heading = document.querySelector(".page-hero h1");
  const backButton = document.querySelector(".back-button");

  if (eyebrow) {
    eyebrow.textContent = isLabMode ? "Linux Final Lab" : "Linux Course";
  }
  if (heading) {
    heading.textContent = isLabMode ? "Docker Capstone" : "Linux Fundamentals";
  }
  if (backButton) {
    backButton.textContent = isLabMode ? "← Back to Linux Course" : "← Back to Learning Paths";
    backButton.onclick = function () {
      window.location.href = isLabMode ? "linux-lab.html" : "learning.html";
    };
  }
}

function updateUserDisplay() {
  const user = getCurrentUser();
  const greetingElement = document.getElementById("userGreeting");
  const userStatsElement = document.getElementById("userStats");
  const loginWarning = document.getElementById("loginWarning");

  if (user && user.name) {
    if (greetingElement) {
      greetingElement.innerHTML = isLabMode
        ? `Welcome back, ${user.name}! The Docker capstone is ready. Recover the flag to unlock your certificate.`
        : `Welcome back, ${user.name}! Progress is saved to your account. Complete each level to unlock the final Docker capstone.`;
    }
    if (userStatsElement) {
      userStatsElement.innerHTML = isLabMode
        ? `👤 ${user.name} • Final Lab • Docker Capstone`
        : `👤 ${user.name} • ${COURSE_CONFIG.totalModules} Modules • ${COURSE_CONFIG.totalTasks} Tasks`;
    }
    if (loginWarning) {
      loginWarning.style.display = "none";
    }
  } else {
    if (greetingElement) {
      greetingElement.innerHTML = isLabMode
        ? `⚠️ You are not logged in. You can still attempt the Docker capstone, but your certificate progress will only be stored for this session.`
        : `⚠️ You are not logged in. Progress will only be stored for this session. <a href="login.html" style="color: var(--accent);">Login</a> to save your course and certificate progress.`;
    }
    if (userStatsElement) {
      userStatsElement.innerHTML = isLabMode
        ? `🔓 Guest Mode • Final Lab not permanently saved`
        : `🔓 Guest Mode • ${COURSE_CONFIG.totalModules} Modules • ${COURSE_CONFIG.totalTasks} Tasks`;
    }
    if (loginWarning) {
      loginWarning.style.display = "block";
    }
  }
}

function updateProgress() {
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const xpEarned = document.getElementById("xpEarned");
  const tasksCompletedElement = document.getElementById("tasksCompleted");
  const totalTasksElement = document.getElementById("totalTasks");

  let completedCount = completedTasks.length;
  let totalCount = COURSE_CONFIG.totalTasks;

  if (isLabMode) {
    completedCount = labCompleted ? finalLab.objectives.length : completedLabObjectives.length;
    totalCount = finalLab.objectives.length;
  }

  const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
  if (xpEarned) xpEarned.textContent = totalXP + (labCompleted ? COURSE_CONFIG.labBonusXP : 0);
  if (tasksCompletedElement) tasksCompletedElement.textContent = completedCount;
  if (totalTasksElement) totalTasksElement.textContent = totalCount;
}

function renderOutline() {
  if (isLabMode) {
    renderLabOutline();
  } else {
    renderCourseOutline();
  }
}

function renderCourseOutline() {
  const container = document.getElementById("outlineContainer");
  const outlineHeading = document.querySelector(".outline-header h3");
  if (!container) return;
  if (outlineHeading) outlineHeading.textContent = "Course Content";

  container.innerHTML = "";

  modules.forEach(module => {
    const unlocked = isModuleUnlocked(module.id);
    const completed = isModuleCompleted(module.id);
    const isCurrent = module.id === currentModule;

    let badgeClass = "locked";
    let badgeText = `${module.tasks.filter(task => task.command).length} tasks`;

    if (completed) {
      badgeClass = "completed";
      badgeText = "✓ Completed";
    } else if (unlocked) {
      badgeClass = "current";
      badgeText = `${module.tasks.filter(task => task.command).length} tasks`;
    }

    const taskItems = module.tasks
      .filter(task => task.command)
      .map(task => {
        const done = completedTasks.includes(task.id);
        return `
          <div class="outline-task ${done ? "completed" : "pending"}">
            <span class="task-status">${done ? "✓" : "○"}</span>
            <span>${task.title}</span>
          </div>
        `;
      }).join("");

    container.insertAdjacentHTML("beforeend", `
      <div class="outline-module ${isCurrent ? "current" : ""} ${completed ? "completed" : ""}" data-module="${module.id}">
        <div class="outline-module-header" onclick="goToModule(${module.id})">
          <span class="outline-module-title">${module.level} · ${module.name}</span>
          <span class="outline-module-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="outline-tasks ${isCurrent ? "show" : ""}" id="outline-tasks-${module.id}">
          ${taskItems}
        </div>
      </div>
    `);
  });
}

function renderLabOutline() {
  const container = document.getElementById("outlineContainer");
  const outlineHeading = document.querySelector(".outline-header h3");
  if (!container) return;
  if (outlineHeading) outlineHeading.textContent = "Final Lab";

  const labUnlocked = hasCompletedCourse();
  const labComplete = labCompleted;
  const badgeClass = labComplete ? "completed" : (labUnlocked ? "current" : "locked");
  const badgeText = labComplete
    ? "✓ Completed"
    : (labUnlocked ? `${finalLab.objectives.length} objectives` : "Locked");

  const objectiveItems = finalLab.objectives.map((objective, index) => {
    const done = labCompleted || completedLabObjectives.includes(objective.id);
    return `
      <div class="outline-task ${done ? "completed" : "pending"}">
        <span class="task-status">${done ? "✓" : "○"}</span>
        <span>Obj ${index + 1}: ${objective.title.replace(/^Objective \d+ — /, "")}</span>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="outline-module current ${labComplete ? "completed" : ""}">
      <div class="outline-module-header">
        <span class="outline-module-title">Docker Capstone</span>
        <span class="outline-module-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="outline-tasks show" id="outline-tasks-final-lab">
        ${objectiveItems}
      </div>
    </div>
  `;
}

function renderCurrentModule() {
  if (isLabMode) {
    renderLabMission();
    return;
  }

  const module = modules.find(item => item.id === currentModule);
  const container = document.getElementById("moduleContent");
  const heading = document.querySelector(".panel-header h3");
  const moduleIndicator = document.getElementById("moduleIndicator");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (!module || !container) return;

  if (heading) {
    heading.innerHTML = `Module <span id="currentModuleNum">${currentModule}</span> of <span id="totalModules">${COURSE_CONFIG.totalModules}</span>`;
  }
  if (moduleIndicator) {
    moduleIndicator.textContent = `${module.level} · ${module.name}`;
  }

  prevBtn.disabled = currentModule === 1;
  prevBtn.textContent = "← Previous";

  const nextModule = modules.find(item => item.id === currentModule + 1);
  const nextUnlocked = nextModule ? isModuleUnlocked(nextModule.id) : false;
  const currentCompleted = isModuleCompleted(currentModule);

  if (currentModule === modules.length) {
    nextBtn.disabled = !currentCompleted;
    nextBtn.textContent = labCompleted ? "Certificate →" : "Final Lab →";
  } else {
    nextBtn.disabled = !nextModule || (!nextUnlocked && !currentCompleted);
    nextBtn.textContent = "Next →";
  }

  let tasksHtml = `
    <div class="module-title">${module.level} · ${module.name}</div>
    <div class="module-desc">${module.description}</div>
    <div class="task-card">
      <div class="task-header">
        <div class="task-title">${module.focus}</div>
        <span class="task-badge pending">${module.level}</span>
      </div>
      <div class="explanation-text">${module.overview}</div>
    </div>
  `;

  module.tasks.forEach(task => {
    if (task.type === "info") {
      tasksHtml += `
        <div class="task-card">
          <div class="task-header">
            <div class="task-title">${task.title}</div>
          </div>
          <div class="explanation-text">${task.content}</div>
        </div>
      `;
      return;
    }

    const done = completedTasks.includes(task.id);
    tasksHtml += `
      <div class="task-card ${done ? "completed" : "pending"}">
        <div class="task-header">
          <div class="task-title">${task.title}</div>
          <span class="task-badge ${done ? "completed" : "pending"}">
            ${done ? "Completed" : `+${task.points} XP`}
          </span>
        </div>
        <div class="command-box"><code>${task.command}</code></div>
        <div class="explanation-text">${task.description}</div>
        <div class="tip-box">📖 ${task.explanation}</div>
      </div>
    `;
  });

  if (currentCompleted && currentModule < modules.length) {
    tasksHtml += `
      <div class="completion-message">
        <strong>✓ Level Cleared</strong><br>
        This stage is complete. Continue to the next level when you are ready.
      </div>
    `;
  }

  if (currentModule === modules.length && currentCompleted) {
    if (labCompleted) {
      // Course + lab both done → show certificate AND option to revisit lab
      tasksHtml += `
        <div class="completion-message">
          <strong>🏆 Course and Capstone Completed</strong><br>
          The academy path and Docker capstone are both complete. Your certificate is ready.
        </div>
        <button class="certificate-btn" onclick="generateCertificate()">
          🏆 Claim Your Certificate
        </button>
        <button class="certificate-btn" onclick="enterFinalLab()" style="margin-top:10px;background:rgba(255,255,255,0.08);border:1px solid var(--border);">
          🔁 Revisit Operation Nightfall
        </button>
      `;
    } else {
      // Course done, lab not yet done → show Start Final Lab
      tasksHtml += `
        <div class="completion-message">
          <strong>🔓 Operation Nightfall Unlocked</strong><br>
          You have completed the academy path. Enter the Docker capstone lab, investigate the breach, and submit the flag to claim your certificate.
        </div>
        <button class="certificate-btn" onclick="enterFinalLab()">
          🚀 Start Final Lab
        </button>
      `;
    }
  }

  container.innerHTML = tasksHtml;
}

function renderLabMission() {
  const container = document.getElementById("moduleContent");
  const heading = document.querySelector(".panel-header h3");
  const moduleIndicator = document.getElementById("moduleIndicator");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (!container) return;

  if (heading) {
    heading.textContent = "Docker Capstone · Operation Nightfall";
  }
  if (moduleIndicator) {
    moduleIndicator.textContent = "SOC Investigation — Capture the Flag";
  }

  prevBtn.disabled = false;
  prevBtn.textContent = "← Back to Course";
  nextBtn.textContent = labCompleted ? "🏆 Certificate →" : "⏳ Awaiting Flag";
  nextBtn.disabled = !labCompleted;

  if (!hasCompletedCourse()) {
    container.innerHTML = `
      <div class="module-title">${finalLab.title}</div>
      <div class="module-desc">${finalLab.description}</div>
      <div class="completion-message">
        <strong>🔒 Final Lab Locked</strong><br>
        Complete all ${COURSE_CONFIG.totalTasks} course tasks first, then return to launch the Docker capstone.
      </div>
      <button class="certificate-btn" onclick="returnToCourse()">
        ← Return to Course
      </button>
    `;
    return;
  }

  // If lab was already completed, treat all objectives as done for display purposes
  if (labCompleted && completedLabObjectives.length < finalLab.objectives.length) {
    completedLabObjectives = finalLab.objectives.map(obj => obj.id);
  }
  const allObjectivesDone = completedLabObjectives.length === finalLab.objectives.length;

  let tasksHtml = `
    <div class="module-title">${finalLab.title}</div>
    <div class="module-desc">${finalLab.description}</div>

    <!-- Scenario Brief -->
    <div class="task-card" style="border-left:3px solid var(--accent);background:rgba(255,47,79,0.05);">
      <div class="task-header">
        <div class="task-title">📋 Scenario Brief</div>
        <span class="task-badge pending" style="background:rgba(255,47,79,0.2);color:var(--accent);">SOC Investigation</span>
      </div>
      <div class="explanation-text">${finalLab.scenario}</div>
      <div class="tip-box">🎯 Flag format: <code>UTB{...}</code> — You must find it yourself. No commands are shown here — think like an analyst!</div>
    </div>
  `;

  finalLab.objectives.forEach((objective, index) => {
    const done = labCompleted || completedLabObjectives.includes(objective.id);
    const toolsHtml = objective.tools.map(t => `<span class="chip" style="font-size:11px;font-family:monospace;">${t}</span>`).join(" ");
    tasksHtml += `
      <div class="task-card ${done ? "completed" : "pending"}">
        <div class="task-header">
          <div class="task-title">${objective.title}</div>
          <span class="task-badge ${done ? "completed" : "pending"}">
            ${done ? "✓ Cleared" : "Active"}
          </span>
        </div>
        <div class="explanation-text">${objective.description}</div>
        <div style="margin:10px 0 6px;font-size:12px;color:#888;">🛠 Useful tools:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">${toolsHtml}</div>
        <div class="tip-box">💡 <em>${objective.hint}</em></div>
      </div>
    `;
  });

  // Flag submission form — visible once all objectives are explored
  if (allObjectivesDone && !labCompleted) {
    tasksHtml += `
      <div class="task-card" style="border-left:3px solid #ffbd2e;background:rgba(255,189,46,0.05);">
        <div class="task-header">
          <div class="task-title">🚩 Submit Your Flag</div>
          <span class="task-badge pending" style="background:rgba(255,189,46,0.2);color:#ffbd2e;">Final Step</span>
        </div>
        <div class="explanation-text">
          You have explored all objectives. Now submit the flag you captured from the investigation.
          The server will verify it — correct flags unlock your certificate and +50 XP.
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input id="flagInput" type="text" placeholder="UTB{...}" style="
            flex:1;min-width:200px;background:#111;border:1px solid #333;color:#e8e8e8;
            padding:10px 14px;border-radius:8px;font-family:monospace;font-size:14px;
          "/>
          <button id="flagSubmitBtn" onclick="submitFlag(document.getElementById('flagInput').value)" style="
            background:linear-gradient(135deg,var(--accent),var(--accent-2));
            border:none;color:white;padding:10px 20px;border-radius:8px;
            font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap;
          ">Submit Flag →</button>
        </div>
        <div id="flagResult" style="margin-top:12px;font-size:13px;min-height:20px;"></div>
      </div>
    `;
  }

  if (labCompleted) {
    tasksHtml += `
      <div class="completion-message">
        <strong>🏁 Operation Nightfall — Complete</strong><br>
        Flag captured: <code>${COURSE_CONFIG.flag}</code><br>
        Outstanding investigative work, analyst. Your certificate is now available.
      </div>
      <button class="certificate-btn" onclick="generateCertificate()">
        🏆 Claim Your Certificate
      </button>
    `;
  }

  container.innerHTML = tasksHtml;

  // Restore flag submission handlers after innerHTML update
  window.submitFlag = submitFlag;
}

function goToModule(moduleId) {
  if (!isModuleUnlocked(moduleId)) {
    if (term) term.writeln(`\n[!] Module ${moduleId} is locked. Complete the previous level first.\n`);
    return;
  }
  currentModule = moduleId;
  saveUserData();
  renderCurrentModule();
  renderOutline();
  if (term) {
    const module = modules.find(item => item.id === moduleId);
    term.writeln(`\n[+] Navigated to ${module.level} · ${module.name}\n`);
  }
}

function goToPrevModule() {
  if (currentModule <= 1) return;
  currentModule -= 1;
  saveUserData();
  renderCurrentModule();
  renderOutline();
  if (term) {
    const module = modules.find(item => item.id === currentModule);
    term.writeln(`\n[+] Navigated to ${module.level} · ${module.name}\n`);
  }
}

function goToNextModule() {
  if (currentModule >= modules.length) return;
  const nextModuleId = currentModule + 1;
  const nextModule = modules.find(item => item.id === nextModuleId);
  if (!nextModule || (!isModuleUnlocked(nextModuleId) && !isModuleCompleted(currentModule))) {
    if (term) term.writeln(`\n[!] Complete the current level before moving forward.\n`);
    return;
  }
  currentModule = nextModuleId;
  saveUserData();
  renderCurrentModule();
  renderOutline();
  if (term) term.writeln(`\n[+] Navigated to ${nextModule.level} · ${nextModule.name}\n`);
}

function enterFinalLab() {
  if (!hasCompletedCourse()) return;
  window.location.href = "linux-lab.html?lab=true";
}

function returnToCourse() {
  window.location.href = "linux-lab.html";
}

function handlePrevAction() {
  if (isLabMode) {
    returnToCourse();
    return;
  }
  goToPrevModule();
}

function handleNextAction() {
  if (isLabMode) {
    if (labCompleted) generateCertificate();
    return;
  }

  if (currentModule === modules.length && isModuleCompleted(currentModule)) {
    if (labCompleted) {
      generateCertificate();
    } else {
      enterFinalLab();
    }
    return;
  }

  goToNextModule();
}

// ============================================
// SIMULATION FILESYSTEM
// ============================================
function createDir(content, perms) {
  return { type: "dir", content: content || {}, perms: perms || "755" };
}

function createFile(content, perms, extra) {
  return {
    type: "file",
    content: content || "",
    perms: perms || "644",
    ...(extra || {})
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createInitialFileSystem() {
  const missionArchiveEntries = {
    extracted: createDir({
      "hint.txt": createFile(
        "ANALYST HINT — Operation Nightfall\n\nThe forensic team left the flag in a hidden directory.\nSearch deeper — use find and grep to locate it.\n\nTip: Hidden directories start with a dot. Try ls -la.\nThe flag follows the format UTB{...}",
        "644"
      ),
      "incident.log": createFile(
        "[2026-04-01 02:14:33] WARN  Unauthorized access attempt from 10.0.0.47\n[2026-04-01 02:14:45] ERROR SSH login failure for user 'admin'\n[2026-04-01 02:15:02] WARN  Port scan detected on interface eth0\n[2026-04-01 02:15:18] CRIT  Privilege escalation attempt blocked\n[2026-04-01 02:15:44] INFO  Forensic team flagged directory: .evidence\n[2026-04-01 02:16:01] INFO  Evidence container sealed at .evidence/.flag/\n[2026-04-01 02:16:10] INFO  Recovery token stored — search for UTB pattern",
        "644"
      ),
      "config": createDir({
        "server.conf": createFile(
          "# Server Configuration — UTB SOC Lab\nHOSTNAME=lab-server-01\nENV=investigation\nFLAG_LOCATION=.evidence/.flag/flag.txt\nACCESS_LOG=.evidence/access.log\n# DO NOT MODIFY — forensic snapshot",
          "644"
        )
      }, "755"),
      ".evidence": createDir({
        "access.log": createFile(
          "[02:15:55] Forensic analyst accessed: /home/student/challenges/final-lab\n[02:16:00] Evidence sealed in: .evidence/.flag/\n[02:16:05] Token written. Retrieve with: cat .evidence/.flag/flag.txt",
          "644"
        ),
        ".flag": createDir({
          "flag.txt": createFile(COURSE_CONFIG.flag, "600")
        }, "700")
      }, "755")
    }, "755")
  };

  return {
    "/": createDir({
      "home": createDir({
        "student": createDir({
          "file1.txt": createFile("This is file1.txt", "644"),
          ".hidden": createFile("Hidden file", "600"),
          "Documents": createDir({}, "755"),
          "Downloads": createDir({}, "755"),
          "Desktop": createDir({
            "start-here.txt": createFile("Welcome to your Linux practice environment.", "644")
          }, "755"),
          "projects": createDir({}, "755"),
          "private": createDir({
            "member-info.txt": createFile("Private member notes", "600")
          }, "700"),
          "challenges": createDir({
            "README.txt": createFile(
              "Challenge Workspace\n\nThis directory contains the final capstone challenge.\nNavigate to final-lab/ to begin the mission.\n\nUse: find, cat, grep, tar, ls -la",
              "644"
            ),
            "final-lab": createDir({
              "README.txt": createFile(
                "=== OPERATION NIGHTFALL ===\nCybersecurity Club UTB — Final Capstone Lab\n\nBriefing:\nA suspicious process was detected on one of the university servers.\nAs a junior SOC analyst, your mission is to investigate the\ncompromised directory, analyze the evidence, and capture the\nflag hidden by the forensic team.\n\nObjectives:\n1. Extract the mission archive (mission.tar)\n2. Investigate the incident logs\n3. Locate hidden evidence directories\n4. Recover the hidden flag\n\nFlag format: UTB{...}\n\nGood luck, analyst.",
                "644"
              ),
              "mission.tar": createFile("tar archive", "644", {
                archiveEntries: missionArchiveEntries
              })
            }, "755")
          }, "755"),
          "welcome.txt": createFile("Welcome to your account workspace.", "644"),
          "script.sh": createFile("#!/bin/bash\necho \"Hello\"\n", "644")
        }, "755")
      }, "755"),
      "etc": createDir({
        "passwd": createFile("student:x:1000:1000:Student:/home/student:/bin/bash", "644")
      }, "755"),
      "var": createDir({
        "log": createDir({
          "syslog": createFile("System logs", "644")
        }, "755")
      }, "755"),
      "tmp": createDir({}, "777")
    }, "755")
  };
}

let currentDirectory = "/home/student";
let fileSystem = createInitialFileSystem();

function normalizePath(path) {
  const segments = [];
  (path || "/").split("/").forEach(part => {
    if (!part || part === ".") return;
    if (part === "..") {
      if (segments.length) segments.pop();
      return;
    }
    segments.push(part);
  });
  return "/" + segments.join("/");
}

function resolvePath(path) {
  if (!path || path === ".") return currentDirectory;
  if (path === "~") return "/home/student";
  if (path.startsWith("~/")) return normalizePath("/home/student/" + path.slice(2));
  if (path.startsWith("/")) return normalizePath(path);
  return normalizePath(currentDirectory + "/" + path);
}

function getNode(path) {
  const normalized = normalizePath(path);
  let current = fileSystem["/"];
  if (normalized === "/") return current;

  const parts = normalized.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    if (!current.content || !current.content[parts[i]]) return null;
    current = current.content[parts[i]];
  }
  return current;
}

function getParentAndName(path) {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter(Boolean);
  const name = parts.pop();
  const parentPath = "/" + parts.join("/");
  return {
    parent: getNode(parentPath || "/"),
    name: name,
    parentPath: parentPath || "/"
  };
}

function ensureDirectory(path) {
  const normalized = normalizePath(path);
  let current = fileSystem["/"];
  if (normalized === "/") return current;

  const parts = normalized.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!current.content[part]) {
      current.content[part] = createDir({}, "755");
    }
    if (current.content[part].type !== "dir") return null;
    current = current.content[part];
  }
  return current;
}

function writeNode(path, node) {
  const { parent, name } = getParentAndName(path);
  if (!parent || parent.type !== "dir" || !name) return false;
  parent.content[name] = node;
  return true;
}

function removeNode(path) {
  const { parent, name } = getParentAndName(path);
  if (!parent || parent.type !== "dir" || !name || !parent.content[name]) return false;
  delete parent.content[name];
  return true;
}

function getPromptPath() {
  if (currentDirectory === "/home/student") return "~";
  if (currentDirectory.startsWith("/home/student/")) {
    return "~" + currentDirectory.slice("/home/student".length);
  }
  return currentDirectory;
}

function formatPermissions(perms) {
  const map = {
    "7": "rwx",
    "6": "rw-",
    "5": "r-x",
    "4": "r--",
    "3": "-wx",
    "2": "-w-",
    "1": "--x",
    "0": "---"
  };
  const digits = String(perms || "644").split("");
  return (map[digits[0]] || "---") + (map[digits[1]] || "---") + (map[digits[2]] || "---");
}

function tokenizeCommand(input) {
  return input.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function formatLsLine(name, node) {
  const type = node.type === "dir" ? "d" : "-";
  const perms = formatPermissions(node.perms || (node.type === "dir" ? "755" : "644"));
  const size = node.type === "dir" ? "4096" : String((node.content || "").length);
  return `${type}${perms} 1 student student ${size} Apr 4 2026 ${name}`;
}

function formatSearchPath(matchPath, originalArg, basePath) {
  if (originalArg && originalArg.startsWith("/")) {
    return matchPath;
  }
  if (originalArg === "." || !originalArg) {
    if (matchPath === basePath) return ".";
    return "." + matchPath.slice(basePath.length);
  }
  if (matchPath === basePath) return originalArg;
  return originalArg.replace(/\/+$/, "") + matchPath.slice(basePath.length);
}

function walkNode(node, currentPath, callback) {
  callback(node, currentPath);
  if (node.type !== "dir") return;
  Object.keys(node.content).sort().forEach(name => {
    walkNode(node.content[name], currentPath === "/" ? "/" + name : currentPath + "/" + name, callback);
  });
}

function buildTreeOutput(node) {
  const lines = ["."];

  function walk(currentNode, prefix) {
    const names = Object.keys(currentNode.content || {})
      .filter(name => !name.startsWith("."))
      .sort();

    names.forEach((name, index) => {
      const child = currentNode.content[name];
      const isLast = index === names.length - 1;
      lines.push(prefix + (isLast ? "└── " : "├── ") + name);
      if (child.type === "dir") {
        walk(child, prefix + (isLast ? "    " : "│   "));
      }
    });
  }

  walk(node, "");
  return lines.join("\n");
}

function executeCommand(cmd) {
  const trimmed = cmd.trim();
  if (!trimmed) return "";

  if (/^echo\s+.+>\s*.+$/i.test(trimmed)) {
    const match = trimmed.match(/^echo\s+(.+?)\s*>\s*(.+)$/i);
    if (!match) return "";
    const rawContent = match[1].replace(/^['"]|['"]$/g, "");
    const targetPath = resolvePath(match[2].trim());
    writeNode(targetPath, createFile(rawContent, "644"));
    return "";
  }

  const parts = tokenizeCommand(trimmed);
  const command = parts[0];
  const args = parts.slice(1);

  switch (command) {
    case "whoami":
      return "student";

    case "pwd":
      return currentDirectory;

    case "ls": {
      let showAll = false;
      let longFormat = false;
      let targetArg = null;

      args.forEach(arg => {
        if (arg.startsWith("-")) {
          if (arg.includes("a")) showAll = true;
          if (arg.includes("l")) longFormat = true;
        } else if (!targetArg) {
          targetArg = arg;
        }
      });

      const targetPath = resolvePath(targetArg || currentDirectory);
      const node = getNode(targetPath);
      if (!node) return `ls: cannot access '${targetArg || "."}': No such file or directory`;

      if (node.type === "file") {
        const name = targetPath.split("/").filter(Boolean).pop() || targetPath;
        return longFormat ? formatLsLine(name, node) : name;
      }

      const names = Object.keys(node.content)
        .filter(name => showAll || !name.startsWith("."))
        .sort();

      if (longFormat) {
        return names.map(name => formatLsLine(name, node.content[name])).join("\n");
      }
      return names.join("  ");
    }

    case "cd": {
      const nextPath = resolvePath(args[0] || "~");
      const node = getNode(nextPath);
      if (!node) return `cd: ${args[0]}: No such file or directory`;
      if (node.type !== "dir") return `cd: ${args[0]}: Not a directory`;
      currentDirectory = nextPath;
      return "";
    }

    case "mkdir": {
      const hasP = args.includes("-p");
      const pathArg = args.find(arg => !arg.startsWith("-"));
      if (!pathArg) return "mkdir: missing operand";
      const targetPath = resolvePath(pathArg);

      if (hasP) {
        ensureDirectory(targetPath);
        return "";
      }

      if (getNode(targetPath)) {
        return `mkdir: cannot create directory '${pathArg}': File exists`;
      }

      const { parent, name } = getParentAndName(targetPath);
      if (!parent || parent.type !== "dir") {
        return `mkdir: cannot create directory '${pathArg}': No such file or directory`;
      }
      parent.content[name] = createDir({}, "755");
      return "";
    }

    case "touch": {
      const pathArg = args[0];
      if (!pathArg) return "touch: missing operand";
      const targetPath = resolvePath(pathArg);
      const node = getNode(targetPath);
      if (node) return "";
      writeNode(targetPath, createFile("", "644"));
      return "";
    }

    case "cat": {
      const pathArg = args[0];
      if (!pathArg) return "cat: missing operand";
      const targetPath = resolvePath(pathArg);
      const node = getNode(targetPath);
      if (!node) return `cat: ${pathArg}: No such file or directory`;
      if (node.type !== "file") return `cat: ${pathArg}: Is a directory`;
      return node.content;
    }

    case "cp": {
      if (args.length < 2) return "cp: missing operand";
      const sourcePath = resolvePath(args[0]);
      const destinationPath = resolvePath(args[1]);
      const sourceNode = getNode(sourcePath);
      if (!sourceNode) return `cp: cannot stat '${args[0]}': No such file or directory`;
      writeNode(destinationPath, deepClone(sourceNode));
      return "";
    }

    case "mv": {
      if (args.length < 2) return "mv: missing operand";
      const sourcePath = resolvePath(args[0]);
      const destinationPath = resolvePath(args[1]);
      const sourceNode = getNode(sourcePath);
      if (!sourceNode) return `mv: cannot stat '${args[0]}': No such file or directory`;
      writeNode(destinationPath, deepClone(sourceNode));
      removeNode(sourcePath);
      return "";
    }

    case "rm": {
      const pathArg = args[0];
      if (!pathArg) return "rm: missing operand";
      const targetPath = resolvePath(pathArg);
      const node = getNode(targetPath);
      if (!node) return `rm: cannot remove '${pathArg}': No such file or directory`;
      if (node.type === "dir") return `rm: cannot remove '${pathArg}': Is a directory`;
      removeNode(targetPath);
      return "";
    }

    case "rmdir": {
      const pathArg = args[0];
      if (!pathArg) return "rmdir: missing operand";
      const targetPath = resolvePath(pathArg);
      const node = getNode(targetPath);
      if (!node) return `rmdir: failed to remove '${pathArg}': No such file or directory`;
      if (node.type !== "dir") return `rmdir: failed to remove '${pathArg}': Not a directory`;
      if (Object.keys(node.content).length > 0) return `rmdir: failed to remove '${pathArg}': Directory not empty`;
      removeNode(targetPath);
      return "";
    }

    case "chmod": {
      if (args.length < 2) return "chmod: missing operand";
      const mode = args[0];
      const targetPath = resolvePath(args[1]);
      const node = getNode(targetPath);
      if (!node) return `chmod: cannot access '${args[1]}': No such file or directory`;
      if (mode === "+x") {
        node.perms = node.type === "dir" ? "755" : "755";
      } else if (/^\d{3}$/.test(mode)) {
        node.perms = mode;
      }
      return "";
    }

    case "find": {
      const pathArg = args[0] || ".";
      const nameIndex = args.indexOf("-name");
      const pattern = nameIndex >= 0 && args[nameIndex + 1]
        ? args[nameIndex + 1].replace(/^['"]|['"]$/g, "")
        : null;
      if (!pattern) return "find: missing search pattern";

      const basePath = resolvePath(pathArg);
      const startNode = getNode(basePath);
      if (!startNode) return `find: '${pathArg}': No such file or directory`;

      const matches = [];
      walkNode(startNode, basePath, function (node, currentPath) {
        const currentName = currentPath.split("/").filter(Boolean).pop();
        if (currentName === pattern) {
          matches.push(formatSearchPath(currentPath, pathArg, basePath));
        }
      });
      return matches.join("\n");
    }

    case "grep": {
      const recursive = args.includes("-R") || args.includes("-r");
      const filtered = args.filter(arg => arg !== "-R" && arg !== "-r");
      if (filtered.length < 2) return "grep: missing operand";

      const pattern = filtered[0].replace(/^['"]|['"]$/g, "");
      const pathArg = filtered[1];
      const targetPath = resolvePath(pathArg);
      const targetNode = getNode(targetPath);
      if (!targetNode) return `grep: ${pathArg}: No such file or directory`;

      const matches = [];
      const searchNode = function (node, currentPath) {
        if (node.type === "file") {
          String(node.content || "").split("\n").forEach(line => {
            if (line.includes(pattern)) {
              matches.push(`${formatSearchPath(currentPath, pathArg, targetPath)}:${line}`);
            }
          });
          return;
        }

        if (node.type === "dir" && recursive) {
          Object.keys(node.content).sort().forEach(name => {
            searchNode(node.content[name], currentPath === "/" ? "/" + name : currentPath + "/" + name);
          });
        }
      };

      if (targetNode.type === "file") {
        searchNode(targetNode, targetPath);
      } else if (recursive) {
        searchNode(targetNode, targetPath);
      } else {
        return `grep: ${pathArg}: Is a directory`;
      }

      return matches.join("\n");
    }

    case "tree": {
      const targetPath = resolvePath(args[0] || ".");
      const node = getNode(targetPath);
      if (!node) return `tree: ${args[0] || "."}: No such file or directory`;
      if (node.type !== "dir") return targetPath.split("/").filter(Boolean).pop() || ".";
      return buildTreeOutput(node);
    }

    case "file": {
      const pathArg = args[0];
      if (!pathArg) return "file: missing operand";
      const targetPath = resolvePath(pathArg);
      const node = getNode(targetPath);
      if (!node) return `file: cannot open '${pathArg}': No such file or directory`;
      const name = targetPath.split("/").filter(Boolean).pop() || targetPath;
      if (node.type === "dir") return `${name}: directory`;
      if (node.archiveEntries || name.endsWith(".tar")) return `${name}: POSIX tar archive`;
      if (name.endsWith(".zip")) return `${name}: Zip archive data`;
      return `${name}: ASCII text`;
    }

    case "zip": {
      if (args.length < 3 || args[0] !== "-r") return "zip: missing operand";
      const archivePath = resolvePath(args[1]);
      const sourcePath = resolvePath(args[2]);
      const sourceNode = getNode(sourcePath);
      if (!sourceNode) return `zip: name not matched: ${args[2]}`;
      writeNode(archivePath, createFile("zip archive", "644", {
        archiveEntries: {
          [sourcePath.split("/").filter(Boolean).pop()]: deepClone(sourceNode)
        }
      }));
      return `  adding: ${args[2]} (stored 0%)`;
    }

    case "tar": {
      if (args[0] === "-cvf" && args.length >= 3) {
        const archivePath = resolvePath(args[1]);
        const sourcePath = resolvePath(args[2]);
        const sourceNode = getNode(sourcePath);
        if (!sourceNode) return `tar: ${args[2]}: Cannot stat: No such file or directory`;
        writeNode(archivePath, createFile("tar archive", "644", {
          archiveEntries: {
            [sourcePath.split("/").filter(Boolean).pop()]: deepClone(sourceNode)
          }
        }));
        return args[2];
      }

      if (args[0] === "-xvf" && args.length >= 2) {
        const archivePath = resolvePath(args[1]);
        const archiveNode = getNode(archivePath);
        if (!archiveNode) return `tar: ${args[1]}: Cannot open: No such file or directory`;
        if (!archiveNode.archiveEntries) return `tar: ${args[1]}: This does not look like a tar archive`;

        Object.keys(archiveNode.archiveEntries).forEach(name => {
          writeNode(resolvePath(name), deepClone(archiveNode.archiveEntries[name]));
        });
        return Object.keys(archiveNode.archiveEntries).join("\n");
      }

      return "tar: unsupported operation";
    }

    case "clear":
      return "__CLEAR__";

    case "help":
      return `Available commands:

  whoami             - Show current user
  pwd                - Print working directory
  ls / ls -la / ls -l- List directory contents
  cd [dir]           - Change directory
  mkdir -p [dir]     - Create directories
  touch [file]       - Create empty file
  cat [file]         - Display file content
  echo 'text' > file - Write text into a file
  cp [src] [dst]     - Copy a file
  mv [src] [dst]     - Move or rename a file
  rm [file]          - Remove a file
  rmdir [dir]        - Remove an empty directory
  chmod +x [file]    - Add execute permission
  find . -name file  - Search for a file by name
  grep -R text .     - Search recursively for text
  tree               - Display directory structure
  file [target]      - Identify file type
  tar -cvf           - Create a tar archive
  tar -xvf           - Extract a tar archive
  zip -r             - Create a zip archive
  clear              - Clear terminal
  help               - Show this help`;

    default:
      return `bash: ${command}: command not found. Type 'help' for available commands.`;
  }
}

function normalizeCommand(command) {
  var result = (command || "")
    // Strip ANSI escape sequences (can appear in pasted text from terminals)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    // Normalize all Unicode whitespace variants to regular space
    .replace(/[\u00a0\u202f\u200b\u2009\u2008\u2007\u2006\u2005\u2004\u2003\u2002\u2001\u2000\u3000\ufeff]/g, " ")
    // Normalize line endings to spaces
    .replace(/\r?\n/g, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Strip leading sudo
    .replace(/^sudo\s+/, "")
    // Strip quotes (both smart quotes and regular)
    .replace(/[""''"`]/g, "")
    // Strip trailing semicolons
    .replace(/;+\s*$/, "")
    // Common ls variant aliases
    .replace(/^ls -al\b/, "ls -la")
    // Common tar variant aliases
    .replace(/^tar cvf\b/, "tar -cvf")
    .replace(/^tar -vcf\b/, "tar -cvf")
    .replace(/^tar xvf\b/, "tar -xvf")
    .replace(/^tar -vxf\b/, "tar -xvf")
    .trim();

  // Normalize all forms of "go home" to cd ~
  if (result === "cd" || result === "cd ~" || result === "cd /home/student" || result === "cd ~/") {
    return "cd ~";
  }

  return result;
}

/* ---------------------------------------------------------------------------
 * Persistent XP toast notifications.
 * Dropped into the bottom-right corner so finishing a Linux task gives the
 * same visible feedback as the network / web / crypto / ethics / pentest
 * courses. Mirrors the implementation in those labs intentionally.
 * ------------------------------------------------------------------------- */
function linuxXpToastHost() {
  let host = document.getElementById("xpToastStack");
  if (!host) {
    host = document.createElement("div");
    host.id = "xpToastStack";
    document.body.appendChild(host);
  }
  return host;
}

function showLinuxXpToast(task, moduleId, kindLabel) {
  const host = linuxXpToastHost();
  const toast = document.createElement("div");
  toast.className = "xp-toast";
  const safe = (s) => String(s == null ? "" : s).replace(/[<>&]/g, c => (
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  ));
  const title = safe(task.title || "Task complete");
  const xp    = task.xp || 0;
  const label = kindLabel || "Module";
  const head  = (xp > 0 ? `+${xp} XP \u00b7 ` : "") +
                (moduleId ? `${label} ${moduleId}` : label);
  toast.innerHTML = `
    <div class="head">
      <span>${head}</span>
      <button type="button" class="close" aria-label="Dismiss">\u2715</button>
    </div>
    <div class="body">${title}</div>
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

function moduleOfLinuxTask(taskId) {
  for (let i = 0; i < modules.length; i += 1) {
    const m = modules[i];
    if ((m.tasks || []).some(t => t.id === taskId)) return m.id;
  }
  return null;
}

function findMatchingTask(command) {
  const normalized = normalizeCommand(command);
  if (!normalized) return null;

  // First: search current module
  const currentModuleData = modules.find(module => module.id === currentModule);
  if (currentModuleData) {
    for (let i = 0; i < currentModuleData.tasks.length; i += 1) {
      const task = currentModuleData.tasks[i];
      if (task.command && !completedTasks.includes(task.id) && normalizeCommand(task.command) === normalized) {
        return task;
      }
    }
  }

  // Second: search all unlocked modules
  for (let i = 0; i < modules.length; i += 1) {
    const module = modules[i];
    if (!isModuleUnlocked(module.id)) continue;
    for (let j = 0; j < module.tasks.length; j += 1) {
      const task = module.tasks[j];
      if (task.command && !completedTasks.includes(task.id) && normalizeCommand(task.command) === normalized) {
        return task;
      }
    }
  }

  // Third: check if it matches a task in a LOCKED module and warn the user
  for (let i = 0; i < modules.length; i += 1) {
    const module = modules[i];
    if (isModuleUnlocked(module.id)) continue; // skip unlocked (already searched)
    for (let j = 0; j < module.tasks.length; j += 1) {
      const task = module.tasks[j];
      if (task.command && normalizeCommand(task.command) === normalized) {
        // Found the task but its module is locked
        const prevModule = modules.find(m => m.id === module.id - 1);
        const prevName = prevModule ? prevModule.name : "the previous module";
        if (term) {
          term.writeln(`\r\n\x1b[33m[!] This command matches a task in "${module.name}" but that module is locked.`);
          term.writeln(`    Complete all tasks in "${prevName}" first to unlock it.\x1b[0m`);
        }
        return null;
      }
    }
  }

  return null;
}

function checkAndCompleteTask(command) {
  const task = findMatchingTask(command);
  if (!task) return null;

  completedTasks.push(task.id);
  totalXP += task.points || 0;
  saveUserData();
  updateProgress();
  renderCurrentModule();
  renderOutline();

  // Persistent corner toast — same visual feedback the network/web/crypto/
  // ethics/pentest courses give when a task is completed.
  const moduleId = moduleOfLinuxTask(task.id);
  showLinuxXpToast({
    title: task.title || "Task complete",
    xp:    task.points || 0,
  }, moduleId, "Module");

  return `Task ${task.id} completed! You earned +${task.points || 0} XP.`;
}

// Accepted commands that mark each lab objective complete (students figure these out themselves)
const labObjectiveCommands = {
  "lab-1": ["cd /home/student/challenges/final-lab", "cat readme.txt", "cat /home/student/challenges/final-lab/readme.txt"],
  "lab-2": ["ls -la", "ls -la ."],
  "lab-3": ["tar -xvf mission.tar", "tar xvf mission.tar"],
  "lab-4": ["cat extracted/incident.log", "find . -name incident.log", "grep -r breach ."],
  "lab-5": ["ls -la extracted", "cat extracted/.evidence/access.log"],
  "lab-6": ["grep -r utb{ .", "grep -r utb{ extracted", "grep -r utb{ extracted/"],
  "lab-7": ["cat extracted/.evidence/.flag/flag.txt"]
};

function findMatchingLabObjective(command) {
  if (!hasCompletedCourse()) return null;
  const normalized = normalizeCommand(command).toLowerCase();
  if (!normalized) return null;

  for (let i = 0; i < finalLab.objectives.length; i += 1) {
    const objective = finalLab.objectives[i];
    if (completedLabObjectives.includes(objective.id)) continue;

    const accepted = labObjectiveCommands[objective.id] || [];
    for (let j = 0; j < accepted.length; j += 1) {
      if (normalizeCommand(accepted[j]).toLowerCase() === normalized) {
        return objective;
      }
    }
  }

  return null;
}

function checkAndCompleteLabObjective(command) {
  if (labCompleted) return null;
  const objective = findMatchingLabObjective(command);
  if (!objective) return null;

  completedLabObjectives.push(objective.id);
  saveLabStateToSession();
  updateProgress();
  renderCurrentModule();
  renderOutline();

  // Capstone objectives don't have a per-step XP value (XP is awarded
  // when the flag is submitted), so show a toast labelled "Capstone".
  showLinuxXpToast({
    title: objective.title || "Objective cleared",
    xp:    0,
  }, null, "Capstone");

  // When all objectives are explored, show flag submission UI (but don't mark complete yet — flag must be submitted)
  if (completedLabObjectives.length === finalLab.objectives.length) {
    updateProgress();
    renderCurrentModule();
    renderOutline();
    return `All objectives cleared! Now submit the flag you found using the submission form below.`;
  }

  const remaining = finalLab.objectives.length - completedLabObjectives.length;
  return `${objective.title} — cleared! (${remaining} objective${remaining !== 1 ? "s" : ""} remaining)`;
}

async function submitFlag(flag) {
  const submitBtn = document.getElementById("flagSubmitBtn");
  const flagResult = document.getElementById("flagResult");
  if (submitBtn) submitBtn.disabled = true;
  if (flagResult) flagResult.innerHTML = '<span style="color:#888;">Verifying flag...</span>';

  // Try API first (authenticated users)
  if (isLoggedIn) {
    const result = await apiFetch("/progress/flag", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ flag: flag.trim() })
    });

    if (result.ok && result.data.correct) {
      labCompleted = true;
      completedLabObjectives = finalLab.objectives.map(item => item.id);
      await saveUserData();
      updateProgress();
      renderCurrentModule();
      renderOutline();
      if (flagResult) flagResult.innerHTML = '<span style="color:#27c93f;">✅ Flag accepted! +50 XP earned. Certificate unlocked!</span>';
      if (submitBtn) submitBtn.disabled = false;
      return;
    } else if (result.ok && !result.data.correct) {
      if (flagResult) flagResult.innerHTML = '<span style="color:#ff5f56;">❌ ' + (result.data.message || "Incorrect flag. Keep investigating!") + '</span>';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
  }

  // Fallback: validate locally (simulation / offline)
  if (flag.trim() === COURSE_CONFIG.flag) {
    labCompleted = true;
    completedLabObjectives = finalLab.objectives.map(item => item.id);
    await saveUserData();
    updateProgress();
    renderCurrentModule();
    renderOutline();
    if (flagResult) flagResult.innerHTML = '<span style="color:#27c93f;">✅ Flag accepted! +50 XP earned. Certificate unlocked!</span>';
  } else {
    if (flagResult) flagResult.innerHTML = '<span style="color:#ff5f56;">❌ Incorrect flag. Keep investigating!</span>';
  }
  if (submitBtn) submitBtn.disabled = false;
}

function handleCommandCompletion(command) {
  return isLabMode ? checkAndCompleteLabObjective(command) : checkAndCompleteTask(command);
}

// ============================================
// TERMINAL
// ============================================
let term;
let fitAddon;
let commandBuffer = "";
let _ws = null;
let _wsReady = false;
let _inputBuffer = "";

function initTerminal() {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Courier New', 'Lucida Console', monospace",
    theme: {
      background: "#0a0a0d",
      foreground: "#e8e8e8",
      cursor: "#ff2f4f",
      cursorAccent: "#0a0a0d",
      selection: "rgba(255,47,79,0.25)",
      black: "#0a0a0d",
      green: "#27c93f",
      yellow: "#ffbd2e",
      red: "#ff5f56",
      cyan: "#64d8ff",
      blue: "#6ea6ff",
      magenta: "#c792ea",
      white: "#e8e8e8"
    },
    scrollback: 10000,
    convertEol: false
  });

  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById("terminal"));
  fitAddon.fit();

  term.onData(data => {
    if (_wsReady && _ws) {
      const code = data.charCodeAt(0);

      // Handle bracketed paste: \x1b[200~...\x1b[201~
      if (data.indexOf("\x1b[200~") !== -1) {
        // Strip the bracketed paste markers and get the inner text
        var inner = data.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
        // Take first line only (in case of multi-line paste)
        var pastedLines = inner.split(/[\r\n]/).filter(function(l){ return l.trim().length > 0; });
        if (pastedLines.length > 0) {
          _inputBuffer = pastedLines[0];
        }
        // If paste itself included a newline, treat as immediate submission
        if (/[\r\n]/.test(inner)) {
          var pasteCmd = _inputBuffer.trim();
          _inputBuffer = "";
          if (pasteCmd) _handleRealTaskCheck(pasteCmd);
        }
      } else if (code === 13) {
        // Enter key pressed — submit whatever is buffered
        var enterCmd = _inputBuffer.trim();
        _inputBuffer = "";
        if (enterCmd) _handleRealTaskCheck(enterCmd);
      } else if (code === 127) {
        // Backspace
        if (_inputBuffer.length > 0) _inputBuffer = _inputBuffer.slice(0, -1);
      } else if (code === 3 || code === 21) {
        // Ctrl+C / Ctrl+U — clear buffer
        _inputBuffer = "";
      } else if (code >= 32 && !data.startsWith("\x1b")) {
        // Printable characters (not escape sequences)
        _inputBuffer += data;
      }

      _ws.send(JSON.stringify({ type: "input", data: data }));
    } else {
      _handleSimInput(data);
    }
  });

  window.addEventListener("resize", () => {
    fitAddon.fit();
    if (_wsReady && _ws) {
      _ws.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
    }
  });

  _connectRealTerminal();
}

function _connectRealTerminal() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  _ws = new WebSocket(`${protocol}//localhost:5001/api/terminal`);

  _ws.onopen = () => {
    const token = getToken();
    _ws.send(JSON.stringify({
      type: "auth",
      token: token || "",
      guestSessionId: getGuestTerminalSessionId()
    }));
    _wsReady = true;
    _ws.send(JSON.stringify({ type: "resize", rows: term.rows, cols: term.cols }));
    term.writeln("\x1b[32m✔ Connected to your personal Linux terminal\x1b[0m");
    term.writeln("\x1b[90m  This session is backed by a Docker container prepared for your account.\x1b[0m\r\n");
  };

  _ws.onmessage = evt => term.write(evt.data);

  _ws.onerror = () => {
    _wsReady = false;
    _ws = null;
    _startSimulation();
  };

  _ws.onclose = () => {
    if (_wsReady) {
      term.writeln("\r\n\x1b[33m[!] Terminal session ended. Refresh to reconnect.\x1b[0m");
    }
    _wsReady = false;
  };
}

function _handleRealTaskCheck(cmd) {
  console.log('[DEBUG] _handleRealTaskCheck called with:', JSON.stringify(cmd));
  console.log('[DEBUG] currentModule:', currentModule, '| completedTasks:', JSON.stringify(completedTasks));
  console.log('[DEBUG] Modules unlocked:', modules.map(m => m.id + ':' + (isModuleUnlocked(m.id) ? 'YES' : 'NO')).join(', '));
  console.log('[DEBUG] normalizeCommand result:', JSON.stringify(normalizeCommand(cmd)));
  setTimeout(() => {
    const result = handleCommandCompletion(cmd);
    console.log('[DEBUG] handleCommandCompletion result:', result);
    if (result) {
      setTimeout(() => {
        term.writeln(`\r\n\x1b[32m[+] ${result}\x1b[0m`);
      }, 120);
    }
  }, 80);
}

function _startSimulation() {
  term.writeln("\x1b[33m⚠  Backend unreachable — running in simulation mode.\x1b[0m");
  term.writeln("\x1b[33m   The academy tasks and capstone logic still work here.\x1b[0m");
  term.writeln("\x1b[90m   Start the backend to use the real Docker terminal.\x1b[0m\r\n");
  term.writeln("Type \x1b[33mhelp\x1b[0m to see available commands.\r\n");
  term.write("student@linux:~$ ");
}

function _handleSimInput(data) {
  const code = data.charCodeAt(0);

  // Handle bracketed paste in simulation mode
  if (data.indexOf("\x1b[200~") !== -1) {
    var inner = data.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
    var pastedLines = inner.split(/[\r\n]/).filter(function(l){ return l.trim().length > 0; });
    if (pastedLines.length > 0) {
      // Set buffer and display the pasted text
      commandBuffer = pastedLines[0];
      term.write(commandBuffer);
    }
    // If paste contained newline, auto-submit
    if (/[\r\n]/.test(inner) && commandBuffer.trim()) {
      _simRunCommand();
    }
    return;
  }

  if (code === 13) {
    _simRunCommand();
    return;
  }

  if (code === 127) {
    if (commandBuffer.length > 0) {
      commandBuffer = commandBuffer.slice(0, -1);
      term.write("\b \b");
    }
    return;
  }

  if (data === "\x03") {
    commandBuffer = "";
    term.write("^C");
    term.writeln("");
    term.write("student@linux:" + getPromptPath() + "$ ");
    return;
  }

  if (code >= 32 && code <= 126) {
    commandBuffer += data;
    term.write(data);
  }
}

function _simRunCommand() {
  term.writeln("");
  if (commandBuffer.trim()) {
    const output = executeCommand(commandBuffer.trim());
    if (output === "__CLEAR__") {
      term.clear();
    } else if (output) {
      term.writeln(output);
    }
    const result = handleCommandCompletion(commandBuffer.trim());
    if (result) {
      term.writeln("\x1b[32m[+] " + result + "\x1b[0m");
    }
  }
  commandBuffer = "";
  term.write("student@linux:" + getPromptPath() + "$ ");
}

// ============================================
// CERTIFICATE
// ============================================
function generateCertificate() {
  if (!labCompleted) return;

  const userName = getCurrentUser()?.name || "Student";
  const date = new Date().toLocaleDateString();
  const certificateHtml = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 2000; display: flex; align-items: center; justify-content: center;">
      <div style="background: linear-gradient(135deg, #fff, #f0f0f0); color: #333; padding: 40px; border-radius: 20px; text-align: center; max-width: 680px; margin: 20px;">
        <div style="font-size: 60px;">🏆</div>
        <h1 style="color: #ff2f4f;">CERTIFICATE OF COMPLETION</h1>
        <p style="font-size: 18px;">This certificate is proudly presented to</p>
        <h2 style="font-size: 28px; margin: 20px 0;">${userName}</h2>
        <p>For successfully completing the Linux Fundamentals academy path and Docker capstone lab.</p>
        <p>Course progress: ${completedTasks.length}/${COURSE_CONFIG.totalTasks} tasks</p>
        <p>Flag captured: <strong>${COURSE_CONFIG.flag}</strong></p>
        <p>Total score: <strong>${totalXP + COURSE_CONFIG.labBonusXP} XP</strong></p>
        <p style="margin-top: 30px;">Date: ${date}</p>
        <p style="margin-top: 20px;">Cybersecurity Club - University of Technology Bahrain</p>
        <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 30px; padding: 10px 30px; background: #ff2f4f; color: white; border: none; border-radius: 30px; cursor: pointer;">Close</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", certificateHtml);
}

// ============================================
// INIT
// ============================================
document.addEventListener("DOMContentLoaded", async function () {
  initMenu();
  setActiveNav();
  updateHeroForMode();
  await loadUserData();
  updateUserDisplay();
  updateProgress();
  initTerminal();
  renderCurrentModule();
  renderOutline();

  document.getElementById("prevBtn").addEventListener("click", handlePrevAction);
  document.getElementById("nextBtn").addEventListener("click", handleNextAction);

  window.goToModule = goToModule;
  window.generateCertificate = generateCertificate;
  window.enterFinalLab = enterFinalLab;
  window.returnToCourse = returnToCourse;
  window.submitFlag = submitFlag;

  setTimeout(() => {
    const user = getCurrentUser();
    if (user) {
      term.writeln(`\x1b[90m[+] Welcome back, ${user.name}. ${completedTasks.length} course tasks completed.\x1b[0m`);
    } else {
      term.writeln("\x1b[90m[+] Guest mode — progress is stored only for this session.\x1b[0m");
    }

    if (isLabMode) {
      term.writeln(`\x1b[90m[+] Final lab status: ${labCompleted ? "completed" : "ready"}.\x1b[0m\r\n`);
    } else {
      const module = modules.find(item => item.id === currentModule);
      term.writeln(`\x1b[90m[+] Current level: ${module.level} · ${module.name}\x1b[0m\r\n`);
    }
  }, 600);
});

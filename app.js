 // app.js
// Works with: #stat-open, #stat-upcoming, #stat-risk, #stat-avg
// and filters: #filter-status, #filter-risk, #search
// and list: #decisions-list

const els = {
  statOpen: document.getElementById("stat-open"),
  statUpcoming: document.getElementById("stat-upcoming"),
  statRisk: document.getElementById("stat-risk"),
  statAvg: document.getElementById("stat-avg"),
  list: document.getElementById("decisions-list"),
  filterStatus: document.getElementById("filter-status"),
  filterRisk: document.getElementById("filter-risk"),
  search: document.getElementById("search"),
};

const STORAGE_KEY = "fourlevels_decisions_v1";

// ---- Data shape (expected)
// {
//   id: "D-001",
//   title: "Hire SDR",
//   status: "Proposed" | "Approved" | "Rejected" | "Reviewed",
//   owner: "Mo",
//   risk: "high" | "ok",
//   confidence: 0..100,          // number
//   reviewDate: "2026-01-10",    // ISO date string
//   createdAt: "2026-01-02",     // ISO date string
//   notes: "optional"
// }

// ---------- Helpers
function daysFromNow(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  // Strip time
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function safeText(s) {
  return (s ?? "").toString();
}

function normalize(s) {
  return safeText(s).trim().toLowerCase();
}

function getBasePath() {
  // GitHub Pages fix:
  // If hosted at https://user.github.io/repo/, basePath is "/repo"
  const parts = window.location.pathname.split("/").filter(Boolean);
  // For project pages, first segment is repo name.
  // For user/organization pages, there may be no repo segment.
  // We'll attempt to detect by checking if we're on *.github.io and have at least 1 segment.
  const isGitHubPages = window.location.hostname.endsWith("github.io");
  if (!isGitHubPages) return "";
  if (parts.length === 0) return "";
  return `/${parts[0]}`;
}

async function loadDecisions() {
  // 1) Try localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  // 2) Try decisions.json (recommended for MVP)
  // Put decisions.json in your /public or repo root and fetch with base path support
  const base = getBasePath();
  const url = `${base}/decisions.json`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.warn("No decisions.json found or fetch failed:", e);
  }

  // 3) Fallback: empty
  return [];
}

function saveDecisions(decisions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
}

// ---------- Rendering
function computeStats(decisions) {
  // Open decisions: anything not Rejected AND not Reviewed (tweak if you want)
  const open = decisions.filter(d => !["Rejected", "Reviewed"].includes(d.status));

  const upcoming = open.filter(d => {
    const diff = daysFromNow(d.reviewDate);
    return diff !== null && diff >= 0 && diff <= 14;
  });

  const highRisk = open.filter(d => normalize(d.risk) === "high");

  const confidences = open
    .map(d => Number(d.confidence))
    .filter(n => Number.isFinite(n));

  const avg = confidences.length
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : null;

  return {
    openCount: open.length,
    upcomingCount: upcoming.length,
    highRiskCount: highRisk.length,
    avgConfidence: avg, // number or null
  };
}

function applyFilters(decisions) {
  const status = els.filterStatus?.value || "";
  const risk = els.filterRisk?.value || "";
  const q = normalize(els.search?.value || "");

  return decisions.filter(d => {
    const matchesStatus = status ? d.status === status : true;
    const matchesRisk = risk ? normalize(d.risk) === risk : true;

    if (!q) return matchesStatus && matchesRisk;

    const haystack = normalize(
      `${d.id} ${d.title} ${d.owner} ${d.status} ${d.risk} ${d.notes}`
    );
    const matchesQuery = haystack.includes(q);

    return matchesStatus && matchesRisk && matchesQuery;
  });
}

function renderStats(stats) {
  els.statOpen.textContent = String(stats.openCount);
  els.statUpcoming.textContent = String(stats.upcomingCount);
  els.statRisk.textContent = String(stats.highRiskCount);
  els.statAvg.textContent = stats.avgConfidence === null ? "—" : `${stats.avgConfidence}%`;
}

function badge(label, kind) {
  return `<span class="badge badge-${kind}">${label}</span>`;
}

function renderList(decisions) {
  if (!els.list) return;

  if (!decisions.length) {
    els.list.innerHTML = `
      <div class="empty">
        <div class="empty-title">No decisions found</div>
        <div class="empty-sub">Adjust filters or add your first decision.</div>
      </div>
    `;
    return;
  }

  els.list.innerHTML = decisions
    .sort((a, b) => {
      // Upcoming review first
      const da = daysFromNow(a.reviewDate);
      const db = daysFromNow(b.reviewDate);
      const va = da === null ? 9999 : da;
      const vb = db === null ? 9999 : db;
      return va - vb;
    })
    .map(d => {
      const diff = daysFromNow(d.reviewDate);
      const reviewTxt =
        diff === null ? "No review date" :
        diff === 0 ? "Review today" :
        diff > 0 ? `Review in ${diff}d` :
        `Overdue ${Math.abs(diff)}d`;

      const riskKind = normalize(d.risk) === "high" ? "danger" : "ok";
      const conf = Number(d.confidence);
      const confTxt = Number.isFinite(conf) ? `${conf}%` : "—";

      return `
        <article class="decision">
          <div class="decision-main">
            <div class="decision-title">
              <span class="decision-id">${safeText(d.id || "")}</span>
              <span>${safeText(d.title || "Untitled decision")}</span>
            </div>
            <div class="decision-meta">
              ${badge(safeText(d.status || "Proposed"), "neutral")}
              ${badge(normalize(d.risk) === "high" ? "High risk" : "OK", riskKind)}
              <span class="meta-dot">•</span>
              <span class="meta-item">${reviewTxt}</span>
              <span class="meta-dot">•</span>
              <span class="meta-item">Confidence: ${confTxt}</span>
            </div>
          </div>
          <div class="decision-side">
            <div class="owner">${safeText(d.owner || "")}</div>
          </div>
        </article>
      `;
    })
    .join("");
}

function wireEvents(state) {
  const rerender = () => {
    const filtered = applyFilters(state.decisions);
    renderStats(computeStats(state.decisions));
    renderList(filtered);
  };

  ["change", "input"].forEach(evt => {
    els.filterStatus?.addEventListener(evt, rerender);
    els.filterRisk?.addEventListener(evt, rerender);
    els.search?.addEventListener(evt, rerender);
  });

  rerender();
}

async function init() {
  const decisions = await loadDecisions();

  // Optional: if you want a visible demo when empty, uncomment:
  // if (!decisions.length) {
  //   decisions.push(
  //     { id:"D-001", title:"Launch Level 1 free access", status:"Approved", owner:"Mo", risk:"ok", confidence:85, reviewDate:"2026-01-10", createdAt:"2026-01-02" },
  //     { id:"D-002", title:"Switch onboarding flow", status:"Proposed", owner:"Mo", risk:"high", confidence:55, reviewDate:"2026-01-05", createdAt:"2026-01-02" }
  //   );
  //   saveDecisions(decisions);
  // }

  const state = { decisions };
  wireEvents(state);
}

document.addEventListener("DOMContentLoaded", init);


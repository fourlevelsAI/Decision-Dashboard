// app.js (FULL REPLACEMENT)

const STORAGE_KEY = "v432_decisions";
const THEME_KEY = "v432_theme";

// ---------- HELPERS ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp(n, a, b) {
  const x = Number(n);
  if (Number.isNaN(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODate(iso) {
  // iso expected: YYYY-MM-DD
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return new Date("Invalid");
  return new Date(y, m - 1, d);
}

function daysDiff(a, b) {
  // difference in days between dates a and b (a - b)
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function loadDecisions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveDecisions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Risk logic (simple and deterministic)
function computeRisk(d) {
  const conf = Number(d.confidence ?? 0);
  const impact = (d.impact || "Medium").toLowerCase();
  const hasGuardrails = Boolean((d.guardrails || "").trim());
  const runway = Number(d.runway ?? 0);

  // Scoring: lower confidence + high impact + low runway + no guardrails => high risk
  let score = 0;
  if (conf < 60) score += 2;
  else if (conf < 75) score += 1;

  if (impact === "high") score += 2;
  else if (impact === "medium") score += 1;

  if (runway > 0 && runway < 4) score += 2;
  else if (runway > 0 && runway < 7) score += 1;

  if (!hasGuardrails) score += 1;

  return score >= 5 ? "high" : "ok";
}

// ---------- THEME ----------
const themeBtn = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

function renderThemeIcon(theme) {
  const sun = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  const moon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M21 13.5A7.5 7.5 0 0 1 10.5 3 9 9 0 1 0 21 13.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
  themeIcon.innerHTML = theme === "dark" ? sun : moon;
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  renderThemeIcon(theme);
}

setTheme(localStorage.getItem(THEME_KEY) || "light");

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    setTheme(current === "dark" ? "light" : "dark");
  });
}

// ---------- ELEMENTS ----------
const els = {
  // KPIs
  kpiOpen: document.getElementById("kpiOpen"),
  kpiOpenSub: document.getElementById("kpiOpenSub"),
  kpiUpcoming: document.getElementById("kpiUpcoming"),
  kpiHighRisk: document.getElementById("kpiHighRisk"),
  kpiAvg: document.getElementById("kpiAvg"),

  // Chart
  reviewChart: document.getElementById("reviewChart"),

  // Form
  type: document.getElementById("type"),
  status: document.getElementById("status"),
  impact: document.getElementById("impact"),
  question: document.getElementById("question"),
  recommendation: document.getElementById("recommendation"),
  confidence: document.getElementById("confidence"),
  reviewDate: document.getElementById("reviewDate"),
  reason: document.getElementById("reason"),
  runway: document.getElementById("runway"),
  growth: document.getElementById("growth"),
  ltvcac: document.getElementById("ltvcac"),
  guardrails: document.getElementById("guardrails"),

  addDecision: document.getElementById("addDecision"),
  clearAll: document.getElementById("clearAll"),

  // Filters
  filterStatus: document.getElementById("filterStatus"),
  filterRisk: document.getElementById("filterRisk"),
  search: document.getElementById("search"),

  // List
  decisions: document.getElementById("decisions"),
  empty: document.getElementById("emptyState"),
};

// Default date
if (els.reviewDate) els.reviewDate.value = todayISO();

// ---------- STATE ----------
let decisions = loadDecisions();

// ---------- RENDER: KPIs ----------
function setKPIs(list) {
  const active = list.filter(d => d.status !== "Reviewed");
  const open = active.length;

  // upcoming reviews within 14 days (for not reviewed)
  const now = parseISODate(todayISO());
  const upcoming = active.filter(d => {
    const rd = parseISODate(d.reviewDate);
    if (Number.isNaN(rd.getTime())) return false;
    const diff = daysDiff(rd, now);
    return diff >= 0 && diff <= 13;
  }).length;

  const highRisk = active.filter(d => computeRisk(d) === "high").length;

  const avg = list.length
    ? Math.round(list.reduce((sum, d) => sum + (Number(d.confidence) || 0), 0) / list.length)
    : null;

  els.kpiOpen.textContent = String(open);
  els.kpiOpenSub.textContent = open === 0 ? "Not reviewed yet" : "Active decisions";

  els.kpiUpcoming.textContent = String(upcoming);
  els.kpiHighRisk.textContent = String(highRisk);

  els.kpiAvg.textContent = avg === null ? "—" : `${avg}%`;
}

// ---------- RENDER: CHART ----------
function renderReviewChart(list) {
  const chart = els.reviewChart;
  if (!chart) return;

  const now = parseISODate(todayISO());

  // count reviews per day for next 14 days for non-reviewed decisions
  const counts = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() + i);

    return list.filter(x => {
      if (x.status === "Reviewed") return false;
      const rd = parseISODate(x.reviewDate);
      return rd.getFullYear() === day.getFullYear() &&
        rd.getMonth() === day.getMonth() &&
        rd.getDate() === day.getDate();
    }).length;
  });

  const max = Math.max(1, ...counts);
  chart.innerHTML = "";

  counts.forEach((count, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const label = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;

    const bar = document.createElement("div");
    bar.className = "bar";
    const h = Math.round((count / max) * 100);
    bar.style.height = `${Math.max(8, h)}%`;
    bar.setAttribute("data-tip", `${label}: ${count} review${count === 1 ? "" : "s"}`);
    chart.appendChild(bar);
  });
}

// ---------- FILTERING ----------
function getFilteredList() {
  const status = (els.filterStatus.value || "").trim();
  const risk = (els.filterRisk.value || "").trim();
  const q = (els.search.value || "").trim().toLowerCase();

  return decisions.filter(d => {
    if (status && d.status !== status) return false;

    const r = computeRisk(d);
    if (risk && r !== risk) return false;

    if (q) {
      const blob = [
        d.type, d.status, d.impact, d.question, d.recommendation, d.reason, d.guardrails
      ].join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

// ---------- RENDER: LIST ----------
function formatMetaLine(d) {
  const parts = [];
  if (d.runway !== "" && d.runway != null && Number(d.runway) > 0) parts.push(`Runway: ${d.runway}m`);
  if (d.growth !== "" && d.growth != null && !Number.isNaN(Number(d.growth))) parts.push(`MoM: ${d.growth}%`);
  if (d.ltvcac !== "" && d.ltvcac != null && !Number.isNaN(Number(d.ltvcac))) parts.push(`LTV/CAC: ${d.ltvcac}`);
  if ((d.guardrails || "").trim()) parts.push(`Guardrails: ${d.guardrails.trim()}`);
  return parts.join(" · ");
}

function renderList(list) {
  els.decisions.innerHTML = "";

  if (!list.length) {
    els.empty.style.display = "block";
    return;
  }
  els.empty.style.display = "none";

  list
    .slice()
    .sort((a, b) => {
      // sort by review date ascending, then by created desc
      const ad = parseISODate(a.reviewDate);
      const bd = parseISODate(b.reviewDate);
      const at = Number.isNaN(ad.getTime()) ? 9e15 : ad.getTime();
      const bt = Number.isNaN(bd.getTime()) ? 9e15 : bd.getTime();
      if (at !== bt) return at - bt;
      return (b.createdAt || 0) - (a.createdAt || 0);
    })
    .forEach(d => {
      const risk = computeRisk(d);
      const conf = clamp(d.confidence ?? 0, 0, 100);

      const el = document.createElement("div");
      el.className = "card decision-card";

      const tags = `
        <span class="tag">${escapeHtml(d.type)}</span>
        <span class="tag">${escapeHtml(d.status)}</span>
        <span class="tag">Impact: ${escapeHtml(d.impact)}</span>
        <span class="tag ${risk === "high" ? "risk" : "ok"}">${risk === "high" ? "HIGH RISK" : "OK"}</span>
      `;

      const metaLine = formatMetaLine(d);

      el.innerHTML = `
        <div class="decision-top">
          <div>
            <div class="kpi-title">DECISION</div>
            <h3 class="decision-title">${escapeHtml(d.question || "—")}</h3>
          </div>
          <div class="meta">${tags}</div>
        </div>

        <div class="decision-body">
          <div class="box">
            <div class="box-title">RECOMMENDATION</div>
            <div class="box-main">${escapeHtml(d.recommendation || "—")}</div>
            <div class="reason">${escapeHtml(d.reason || "—")}</div>
            <div class="smallrow">
              <span><b>Review:</b> ${formatDateForUI(d.reviewDate)}</span>
              ${metaLine ? `<span>${escapeHtml(metaLine)}</span>` : ""}
            </div>
          </div>

          <div class="box">
            <div class="box-title">CONFIDENCE</div>
            <div class="kpi-value" style="font-size:30px">${conf}%</div>
            <div class="kpi-sub">Score stored per decision</div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn small ghost" data-action="reviewed" data-id="${d.id}">Mark reviewed</button>
          <button class="btn small ghost" data-action="delete" data-id="${d.id}">Delete</button>
        </div>
      `;

      els.decisions.appendChild(el);
    });
}

// ---------- ESCAPE ----------
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateForUI(iso) {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ---------- MAIN RENDER ----------
function render() {
  saveDecisions(decisions);
  setKPIs(decisions);
  renderReviewChart(decisions);
  const filtered = getFilteredList();
  renderList(filtered);
}

render();

// ---------- ADD DECISION ----------
function readForm() {
  const decision = {
    id: uid(),
    createdAt: Date.now(),

    type: els.type.value,
    status: els.status.value,
    impact: els.impact.value,

    question: els.question.value.trim(),
    recommendation: els.recommendation.value.trim(),

    confidence: clamp(els.confidence.value, 0, 100),
    reviewDate: els.reviewDate.value || todayISO(),

    reason: els.reason.value.trim(),

    runway: els.runway.value === "" ? "" : clamp(els.runway.value, 0, 999),
    growth: els.growth.value === "" ? "" : Number(els.growth.value),
    ltvcac: els.ltvcac.value === "" ? "" : Number(els.ltvcac.value),
    guardrails: (els.guardrails.value || "").trim(),
  };

  return decision;
}

function validateDecision(d) {
  if (!d.question) return "Decision question is required.";
  if (!d.recommendation) return "Recommendation is required.";
  if (d.confidence === "" || d.confidence == null || Number.isNaN(Number(d.confidence))) return "Confidence is required (0–100).";
  return null;
}

function clearForm() {
  els.type.value = "Hiring";
  els.status.value = "Proposed";
  els.impact.value = "Medium";

  els.question.value = "";
  els.recommendation.value = "";
  els.confidence.value = "";
  els.reviewDate.value = todayISO();
  els.reason.value = "";

  els.runway.value = "";
  els.growth.value = "";
  els.ltvcac.value = "";
  els.guardrails.value = "";
}

els.addDecision.addEventListener("click", () => {
  const d = readForm();
  const err = validateDecision(d);
  if (err) {
    alert(err);
    return;
  }

  decisions.unshift(d);
  clearForm();
  render();
});

// ---------- CLEAR ALL ----------
els.clearAll.addEventListener("click", () => {
  const ok = confirm("Clear all decisions? This cannot be undone.");
  if (!ok) return;
  decisions = [];
  saveDecisions(decisions);
  render();
});

// ---------- LIST ACTIONS (delete / mark reviewed) ----------
els.decisions.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");

  if (action === "delete") {
    const ok = confirm("Delete this decision?");
    if (!ok) return;
    decisions = decisions.filter(x => x.id !== id);
    render();
    return;
  }

  if (action === "reviewed") {
    decisions = decisions.map(x => x.id === id ? { ...x, status: "Reviewed" } : x);
    render();
    return;
  }
});

// ---------- FILTERS ----------
[els.filterStatus, els.filterRisk, els.search].forEach(el => {
  el.addEventListener("input", () => render());
});

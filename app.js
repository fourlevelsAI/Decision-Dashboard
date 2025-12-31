// Decision Dashboard — V.4.3.2 (Founder)
// Storage: localStorage (client-side)

const STORAGE_KEY = "decisions_v432";

// Helpers
const $ = (id) => document.getElementById(id);

function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
}

function parseISODate(s) {
  // Expect "YYYY-MM-DD"
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  // b - a in days
  const ms = (b.getTime() - a.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function computeRisk({ confidence, runway, ltvcac, growth }) {
  // Simple heuristic (adjust anytime)
  const c = Number(confidence ?? 0);
  const r = Number(runway ?? 0);
  const l = Number(ltvcac ?? 0);
  const g = Number(growth ?? 0);

  // High risk if confidence low OR runway tight OR LTV/CAC weak (for paid growth decisions)
  if (c && c < 55) return "High";
  if (r && r > 0 && r < 3) return "High";
  if (l && l > 0 && l < 2) return "High";
  if (g && g < 0) return "High";

  // Medium if borderline
  if ((c && c < 70) || (r && r > 0 && r < 6) || (l && l > 0 && l < 3)) return "Medium";

  return "Low";
}

// Data
function loadDecisions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDecisions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function addDecision(decision) {
  const list = loadDecisions();
  list.unshift(decision);
  saveDecisions(list);
  render();
}

function deleteDecision(id) {
  const list = loadDecisions().filter((d) => d.id !== id);
  saveDecisions(list);
  render();
}

function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
  render();
}

// UI: KPIs
function updateKPIs(decisions) {
  const open = decisions.filter((d) => d.status !== "Reviewed").length;

  const now = new Date();
  const upcoming = decisions.filter((d) => {
    if (!d.reviewDate) return false;
    const rd = parseISODate(d.reviewDate);
    if (!rd) return false;
    const delta = daysBetween(now, rd);
    return delta >= 0 && delta <= 14;
  }).length;

  const highRisk = decisions.filter((d) => d.risk === "High").length;

  const confVals = decisions
    .map((d) => Number(d.confidence))
    .filter((n) => Number.isFinite(n));

  const avg = confVals.length
    ? Math.round(confVals.reduce((a, b) => a + b, 0) / confVals.length)
    : null;

  $("kpi-open").textContent = String(open);
  $("kpi-upcoming").textContent = String(upcoming);
  $("kpi-risk").textContent = String(highRisk);
  $("kpi-avg").textContent = avg === null ? "—" : `${avg}%`;

  $("kpi-open-sub").textContent = open === 0 ? "Not reviewed yet" : "Needs review";
}

// UI: List
function matchesSearch(d, q) {
  if (!q) return true;
  const hay = `${d.type} ${d.status} ${d.impact} ${d.question} ${d.recommendation} ${d.reason}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderList(decisions) {
  const statusFilter = $("filter-status").value;
  const riskFilter = $("filter-risk").value;
  const query = $("search").value.trim();

  const filtered = decisions.filter((d) => {
    const okStatus = statusFilter === "all" ? true : d.status === statusFilter;
    const okRisk = riskFilter === "all" ? true : d.risk === riskFilter;
    const okSearch = matchesSearch(d, query);
    return okStatus && okRisk && okSearch;
  });

  const root = $("decisions");
  root.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "meta";
    empty.textContent = "No decisions match your filters yet.";
    root.appendChild(empty);
    return;
  }

  filtered.forEach((d) => {
    const el = document.createElement("div");
    el.className = "decision";

    el.innerHTML = `
      <div class="decision-top">
        <div>
          <div class="badges">
            <span class="badge">${d.type}</span>
            <span class="badge">${d.status}</span>
            <span class="badge">${d.impact} impact</span>
            <span class="badge">${d.risk} risk</span>
            ${d.reviewDate ? `<span class="badge mono">Review: ${d.reviewDate}</span>` : ""}
          </div>

          <div class="meta" style="margin-top:10px;">
            <strong>Decision:</strong> ${escapeHTML(d.question || "—")}<br/>
            <strong>Recommendation:</strong> ${escapeHTML(d.recommendation || "—")}<br/>
            <strong>Confidence:</strong> <span class="mono">${formatNum(d.confidence)}%</span>
            ${d.runway !== "" && d.runway !== null && d.runway !== undefined ? ` • <strong>Runway:</strong> <span class="mono">${formatNum(d.runway)} mo</span>` : ""}
            ${d.growth !== "" && d.growth !== null && d.growth !== undefined ? ` • <strong>Growth:</strong> <span class="mono">${formatNum(d.growth)}%</span>` : ""}
            ${d.ltvcac !== "" && d.ltvcac !== null && d.ltvcac !== undefined ? ` • <strong>LTV/CAC:</strong> <span class="mono">${formatNum(d.ltvcac)}</span>` : ""}
            <br/>
            <strong>Reason:</strong> ${escapeHTML(d.reason || "—")}
          </div>
        </div>

        <div class="small-actions">
          <button data-del="${d.id}" title="Delete">Delete</button>
        </div>
      </div>
    `;

    root.appendChild(el);
  });

  // Bind delete
  root.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => deleteDecision(btn.getAttribute("data-del")));
  });
}

function escapeHTML(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(v) : "—";
}

// Render all
function render() {
  const decisions = loadDecisions();
  updateKPIs(decisions);
  renderList(decisions);
}

// Init + events
function init() {
  // Default review date = today
  $("reviewDate").value = todayISO();

  // Form submit
  $("decision-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const decision = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      createdAt: new Date().toISOString(),

      type: $("type").value,
      status: $("status").value,
      impact: $("impact").value,

      question: $("question").value.trim(),
      recommendation: $("recommendation").value.trim(),

      confidence: $("confidence").value === "" ? null : Number($("confidence").value),
      runway: $("runway").value === "" ? null : Number($("runway").value),
      growth: $("growth").value === "" ? null : Number($("growth").value),
      ltvcac: $("ltvcac").value === "" ? null : Number($("ltvcac").value),

      reviewDate: $("reviewDate").value || null,
      reason: $("reason").value.trim()
    };

    decision.risk = computeRisk(decision);

    // Minimal validation
    if (!decision.question) {
      alert("Add a Decision question.");
      return;
    }
    if (decision.confidence !== null && (decision.confidence < 0 || decision.confidence > 100)) {
      alert("Confidence must be between 0 and 100.");
      return;
    }

    addDecision(decision);

    // Clear form (keep review date)
    $("question").value = "";
    $("recommendation").value = "";
    $("confidence").value = "";
    $("runway").value = "";
    $("growth").value = "";
    $("ltvcac").value = "";
    $("reason").value = "";
  });

  // Filters
  ["filter-status", "filter-risk", "search"].forEach((id) => {
    $(id).addEventListener("input", render);
    $(id).addEventListener("change", render);
  });

  // Clear all
  $("clear-all").addEventListener("click", () => {
    if (confirm("Clear all saved decisions?")) clearAll();
  });

  render();
}

init();

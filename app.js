/* Founder v1 — Decision Dashboard (localStorage MVP) */

const STORAGE_KEY = "decisions_v1_founder";

const $ = (id) => document.getElementById(id);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function toISODate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const A = new Date(a);
  const B = new Date(b);
  const ms = B - A;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function riskFrom({ confidence, runway }) {
  // Simple founder heuristic:
  // - High risk if confidence < 60 OR runway < 4
  // - Medium risk if confidence < 75 OR runway < 7
  // - Else low
  const c = Number(confidence ?? 0);
  const r = runway === "" || runway === null || runway === undefined ? null : Number(runway);

  if (c < 60) return "High";
  if (r !== null && !Number.isNaN(r) && r < 4) return "High";

  if (c < 75) return "Medium";
  if (r !== null && !Number.isNaN(r) && r < 7) return "Medium";

  return "Low";
}

function barColor(confidence) {
  const c = Number(confidence);
  if (c >= 80) return "var(--good)";
  if (c >= 65) return "var(--warn)";
  return "var(--bad)";
}

function fmtNum(n, suffix = "") {
  if (n === "" || n === null || n === undefined) return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return `${x}${suffix}`;
}

function computeKPIs(items) {
  const open = items.filter((d) => d.status !== "Reviewed").length;

  const today = toISODate(new Date());
  const upcoming = items.filter((d) => {
    if (!d.reviewDate) return false;
    const diff = daysBetween(today, d.reviewDate);
    return diff >= 0 && diff <= 14;
  }).length;

  const highRisk = items.filter((d) => d.risk === "High").length;

  const avg = items.length
    ? Math.round(items.reduce((s, d) => s + (Number(d.confidence) || 0), 0) / items.length)
    : null;

  return { open, upcoming, highRisk, avg };
}

function render() {
  const list = load();

  // Filters
  const statusFilter = $("filterStatus")?.value || "All";
  const riskFilter = $("filterRisk")?.value || "All";
  const q = ($("search")?.value || "").trim().toLowerCase();

  const filtered = list.filter((d) => {
    const okStatus = statusFilter === "All" ? true : d.status === statusFilter;
    const okRisk = riskFilter === "All" ? true : d.risk === riskFilter;
    const text = `${d.type} ${d.question} ${d.recommendation} ${d.reason}`.toLowerCase();
    const okSearch = q ? text.includes(q) : true;
    return okStatus && okRisk && okSearch;
  });

  // KPIs
  const kpis = computeKPIs(list);
  $("kpi-open").textContent = String(kpis.open);
  $("kpi-upcoming").textContent = String(kpis.upcoming);
  $("kpi-highrisk").textContent = String(kpis.highRisk);
  $("kpi-avgconf").textContent = kpis.avg === null ? "—" : `${kpis.avg}%`;

  // Render list
  const container = $("decisions");
  container.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.color = "var(--muted)";
    empty.style.padding = "10px 2px";
    empty.textContent = "No decisions match your filters.";
    container.appendChild(empty);
    return;
  }

  filtered
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((d) => container.appendChild(card(d)));
}

function card(d) {
  const el = document.createElement("div");
  el.className = "card decision-card";

  const riskClass =
    d.risk === "High" ? "pill-risk-high" : d.risk === "Medium" ? "pill-risk-med" : "pill-risk-low";

  const reviewLabel = d.reviewDate ? `Review: ${d.reviewDate}` : "Review: —";

  el.innerHTML = `
    <div class="decision-top">
      <div class="decision-title">
        <h3>${escapeHtml(d.type)} — Decision</h3>
        <p class="decision-q">${escapeHtml(d.question)}</p>
      </div>

      <div class="badges">
        <span class="pill pill-status">Status: <b>${escapeHtml(d.status)}</b></span>
        <span class="pill pill-impact">Impact: <b>${escapeHtml(d.impact)}</b></span>
        <span class="pill ${riskClass}">Risk: <b>${escapeHtml(d.risk)}</b></span>
      </div>
    </div>

    <div class="section">
      <div class="kv">
        <div class="k">Recommendation</div>
        <div class="v">${escapeHtml(d.recommendation)}</div>
      </div>

      <div class="conf">
        <div class="kv">
          <div class="k">Confidence</div>
          <div class="v"><b>${escapeHtml(String(d.confidence))}%</b></div>
        </div>
        <div class="bar"><div style="width:${Number(d.confidence) || 0}%; background:${barColor(d.confidence)}"></div></div>
      </div>

      <div class="kv">
        <div class="k">Reason</div>
        <div class="v">${escapeHtml(d.reason)}</div>
      </div>

      <div class="meta">
        <span>${escapeHtml(reviewLabel)}</span>
        <span>Runway: <b>${escapeHtml(fmtNum(d.runway, " mo"))}</b></span>
        <span>Growth: <b>${escapeHtml(fmtNum(d.growth, "%"))}</b></span>
        <span>LTV/CAC: <b>${escapeHtml(fmtNum(d.ratio))}</b></span>
      </div>
    </div>

    <div class="card-actions-row">
      <button class="small-btn" data-action="review">Mark Reviewed</button>
      <button class="small-btn" data-action="approve">Approve</button>
      <button class="small-btn" data-action="execute">Mark Executed</button>
      <button class="small-btn small-danger" data-action="delete">Delete</button>
    </div>
  `;

  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => handleAction(d.id, btn.dataset.action));
  });

  return el;
}

function handleAction(id, action) {
  const items = load();
  const i = items.findIndex((x) => x.id === id);
  if (i === -1) return;

  if (action === "delete") {
    items.splice(i, 1);
    save(items);
    render();
    return;
  }

  if (action === "review") items[i].status = "Reviewed";
  if (action === "approve") items[i].status = "Approved";
  if (action === "execute") items[i].status = "Executed";

  save(items);
  render();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addDecision(e) {
  e.preventDefault();

  const type = $("type").value;
  const status = $("status").value;
  const impact = $("impact").value;

  const question = $("q").value.trim();
  const recommendation = $("rec").value.trim();
  const confidence = clamp($("conf").value, 0, 100);

  const runway = $("runway").value === "" ? "" : clamp($("runway").value, 0, 120);
  const growth = $("growth").value === "" ? "" : Number($("growth").value);
  const ratio = $("ratio").value === "" ? "" : clamp($("ratio").value, 0, 999);

  const reviewDate = $("review").value ? $("review").value : "";
  const reason = $("why").value.trim();

  if (!question || !recommendation || confidence === null || !reason) return;

  const decision = {
    id: uid(),
    createdAt: Date.now(),
    type,
    status,
    impact,
    question,
    recommendation,
    confidence,
    runway,
    growth,
    ratio,
    reviewDate,
    reason,
  };

  decision.risk = riskFrom(decision);

  const items = load();
  items.push(decision);
  save(items);

  $("decisionForm").reset();
  // Keep sensible defaults after reset
  $("impact").value = "Medium";
  $("status").value = "Proposed";
  $("type").value = "Hiring";

  render();
}

function clearAll() {
  const ok = confirm("Clear all saved decisions? This cannot be undone.");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function exportJSON() {
  const items = load();
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "decisions-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

function bind() {
  $("decisionForm").addEventListener("submit", addDecision);

  $("clearAll").addEventListener("click", clearAll);
  $("export").addEventListener("click", exportJSON);

  ["filterStatus", "filterRisk", "search"].forEach((id) => {
    const el = $(id);
    el.addEventListener(id === "search" ? "input" : "change", render);
  });
}

bind();
render();

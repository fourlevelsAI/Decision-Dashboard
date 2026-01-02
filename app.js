/* V.4.3.2 — Decision Dashboard (Vanilla JS)
   - Stores decisions in localStorage
   - Renders decision cards
   - Computes KPI stats (Open, Upcoming 14d, High Risk, Avg Confidence)
   - Filters: status + risk + search
*/

const STORAGE_KEY = "v432_decisions";

const els = {
  form: document.getElementById("decisionForm"),
  clearAll: document.getElementById("clearAll"),

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
  ltvCac: document.getElementById("ltvCac"),
  guardrails: document.getElementById("guardrails"),

  filterStatus: document.getElementById("filterStatus"),
  filterRisk: document.getElementById("filterRisk"),
  search: document.getElementById("search"),

  list: document.getElementById("decisions"),

  kpiOpen: document.getElementById("kpi-open"),
  kpiOpenSub: document.getElementById("kpi-open-sub"),
  kpiUpcoming: document.getElementById("kpi-upcoming"),
  kpiUpcomingSub: document.getElementById("kpi-upcoming-sub"),
  kpiRisk: document.getElementById("kpi-risk"),
  kpiRiskSub: document.getElementById("kpi-risk-sub"),
  kpiAvg: document.getElementById("kpi-avg"),
  kpiAvgSub: document.getElementById("kpi-avg-sub"),
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(decisions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
}

function isUpcomingWithinDays(isoDate, days) {
  if (!isoDate) return false;
  const d = new Date(isoDate + "T00:00:00");
  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + days);

  // compare date-only
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ee = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  return dd >= nn && dd <= ee;
}

// Risk rule (simple + predictable):
// - confidence < 60 => high risk
// - OR impact=High AND confidence < 70 => high risk
// - OR recommendation/guardrails missing when impact=High => high risk
function isHighRisk(decision) {
  const c = Number(decision.confidence ?? 0);
  const impact = decision.impact;

  if (c < 60) return true;
  if (impact === "High" && c < 70) return true;
  if (impact === "High") {
    const hasGuardrails = (decision.guardrails || "").trim().length > 0;
    const rec = (decision.recommendation || "").toLowerCase();
    if (!hasGuardrails && !rec.includes("guard")) return true;
  }
  return false;
}

function computeKPIs(decisions) {
  const open = decisions.filter(d => d.status !== "Reviewed").length;

  const upcoming = decisions.filter(d => d.status !== "Reviewed" && isUpcomingWithinDays(d.reviewDate, 14)).length;

  const highRisk = decisions.filter(d => d.status !== "Reviewed" && isHighRisk(d)).length;

  const confidences = decisions.map(d => Number(d.confidence)).filter(n => Number.isFinite(n));
  const avg = confidences.length ? Math.round(confidences.reduce((a,b)=>a+b,0) / confidences.length) : null;

  return { open, upcoming, highRisk, avg };
}

function setKPIs(kpis) {
  els.kpiOpen.textContent = String(kpis.open);
  els.kpiUpcoming.textContent = String(kpis.upcoming);
  els.kpiRisk.textContent = String(kpis.highRisk);
  els.kpiAvg.textContent = kpis.avg === null ? "—" : `${kpis.avg}%`;

  els.kpiOpenSub.textContent = kpis.open === 0 ? "Not reviewed yet" : "Active decisions";
  els.kpiUpcomingSub.textContent = "Next 14 days";
  els.kpiRiskSub.textContent = "Needs guardrails";
  els.kpiAvgSub.textContent = "Across all decisions";
}

function matchesSearch(d, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    (d.question || "").toLowerCase().includes(s) ||
    (d.recommendation || "").toLowerCase().includes(s) ||
    (d.reason || "").toLowerCase().includes(s) ||
    (d.type || "").toLowerCase().includes(s) ||
    (d.status || "").toLowerCase().includes(s)
  );
}

function applyFilters(decisions) {
  const status = els.filterStatus.value;
  const risk = els.filterRisk.value;
  const q = (els.search.value || "").trim();

  return decisions.filter(d => {
    if (status !== "ALL" && d.status !== status) return false;

    const hr = isHighRisk(d);
    if (risk === "HIGH" && !hr) return false;
    if (risk === "OK" && hr) return false;

    if (!matchesSearch(d, q)) return false;

    return true;
  });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function render(decisions) {
  // KPIs from ALL decisions (not filtered) — this is what dashboards normally do
  setKPIs(computeKPIs(decisions));

  // List view from filtered decisions
  const filtered = applyFilters(decisions);

  els.list.innerHTML = "";
  if (!filtered.length) {
    const empty = el("div", "card decision-card");
    empty.appendChild(el("div", "decision-title", "No decisions match your filters."));
    empty.appendChild(el("div", "reason", "Add a decision above or adjust filters."));
    els.list.appendChild(empty);
    return;
  }

  // Sort: soonest review first, then newest
  filtered.sort((a, b) => {
    const ad = a.reviewDate ? new Date(a.reviewDate).getTime() : Infinity;
    const bd = b.reviewDate ? new Date(b.reviewDate).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  filtered.forEach(d => {
    const card = el("div", "card decision-card");

    const top = el("div", "decision-top");
    const left = el("div");

    const title = el("h3", "decision-title", "Decision");
    const question = el("div", "", d.question || "—");
    question.style.marginTop = "6px";
    question.style.fontWeight = "800";

    left.appendChild(title);
    left.appendChild(question);

    const meta = el("div", "meta");
    meta.appendChild(el("span", "chip", d.type));
    meta.appendChild(el("span", "chip", d.status));
    meta.appendChild(el("span", "chip", `Impact: ${d.impact}`));

    const riskChip = el("span", `chip ${isHighRisk(d) ? "high" : "ok"}`, isHighRisk(d) ? "High Risk" : "OK");
    meta.appendChild(riskChip);

    top.appendChild(left);
    top.appendChild(meta);

    const body = el("div", "decision-body");

    const b1 = el("div", "block");
    b1.appendChild(el("div", "label", "RECOMMENDATION"));
    b1.appendChild(el("div", "value", d.recommendation || "—"));

    const b2 = el("div", "block");
    b2.appendChild(el("div", "label", "CONFIDENCE"));
    b2.appendChild(el("div", "value", `${d.confidence ?? "—"}${d.confidence !== null && d.confidence !== undefined ? "%" : ""}`));

    body.appendChild(b1);
    body.appendChild(b2);

    const reason = el("div", "reason", `Reason: ${d.reason || "—"}`);

    const row = el("div", "row");
    row.appendChild(el("div", "", `Review: `));
    const rb = el("b", "", fmtDate(d.reviewDate));
    row.lastChild.appendChild(rb);

    const extras = [];
    if (d.runwayMonths !== null) extras.push(`Runway: ${d.runwayMonths}m`);
    if (d.growthMoM !== null) extras.push(`MoM: ${d.growthMoM}%`);
    if (d.ltvCac !== null) extras.push(`LTV/CAC: ${d.ltvCac}`);
    if ((d.guardrails || "").trim()) extras.push(`Guardrails: ${d.guardrails}`);

    if (extras.length) {
      const extraLine = el("div", "row");
      extraLine.appendChild(el("div", "", extras.join(" • ")));
      card.appendChild(top);
      card.appendChild(body);
      card.appendChild(reason);
      card.appendChild(row);
      card.appendChild(extraLine);
    } else {
      card.appendChild(top);
      card.appendChild(body);
      card.appendChild(reason);
      card.appendChild(row);
    }

    const actions = el("div", "actions");
    const del = el("button", "btn small", "Delete");
    del.type = "button";
    del.addEventListener("click", () => {
      const next = load().filter(x => x.id !== d.id);
      save(next);
      render(next);
    });

    const markReviewed = el("button", "btn small", d.status === "Reviewed" ? "Mark active" : "Mark reviewed");
    markReviewed.type = "button";
    markReviewed.addEventListener("click", () => {
      const all = load();
      const idx = all.findIndex(x => x.id === d.id);
      if (idx === -1) return;

      all[idx].status = all[idx].status === "Reviewed" ? "Proposed" : "Reviewed";
      save(all);
      render(all);
    });

    actions.appendChild(markReviewed);
    actions.appendChild(del);
    card.appendChild(actions);

    els.list.appendChild(card);
  });
}

function resetFormKeepDefaults() {
  els.question.value = "";
  els.recommendation.value = "";
  els.confidence.value = "";
  els.reason.value = "";

  els.runway.value = "";
  els.growth.value = "";
  els.ltvCac.value = "";
  els.guardrails.value = "";

  els.reviewDate.value = todayISO();
  els.question.focus();
}

function init() {
  // default review date = today
  els.reviewDate.value = todayISO();

  // Load initial
  const decisions = load();
  render(decisions);

  // Add decision
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const d = {
      id: uid(),
      type: els.type.value,
      status: els.status.value,
      impact: els.impact.value,
      question: els.question.value.trim(),
      recommendation: els.recommendation.value.trim(),
      confidence: parseNum(els.confidence.value),
      reviewDate: els.reviewDate.value,
      reason: els.reason.value.trim(),

      runwayMonths: parseNum(els.runway.value),
      growthMoM: parseNum(els.growth.value),
      ltvCac: parseNum(els.ltvCac.value),
      guardrails: (els.guardrails.value || "").trim(),

      createdAt: Date.now(),
    };

    const all = load();
    all.push(d);
    save(all);

    render(all);
    resetFormKeepDefaults();
  });

  // Clear all
  els.clearAll.addEventListener("click", () => {
    if (!confirm("Clear all decisions? This cannot be undone.")) return;
    save([]);
    render([]);
  });

  // Filters
  [els.filterStatus, els.filterRisk, els.search].forEach(x => {
    x.addEventListener("input", () => render(load()));
    x.addEventListener("change", () => render(load()));
  });
}

init();

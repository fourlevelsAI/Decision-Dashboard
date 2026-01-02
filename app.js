/* Decision Dashboard — V.4.3.2 (localStorage MVP)
   - Add decision
   - Persist
   - Stats (Open, Upcoming 14 days, High risk, Avg confidence)
   - Filters + search
   - Mark reviewed / delete / clear all
*/

const STORAGE_KEY = "decision_dashboard_v432";

const $ = (id) => document.getElementById(id);

const els = {
  // KPI
  kpiOpen: $("kpi-open"),
  kpiUpcoming: $("kpi-upcoming"),
  kpiRisk: $("kpi-risk"),
  kpiAvg: $("kpi-avg"),
  kpiOpenSub: $("kpi-open-sub"),

  // Form
  form: $("decisionForm"),
  clearAll: $("clearAll"),

  type: $("type"),
  status: $("status"),
  impact: $("impact"),
  question: $("question"),
  recommendation: $("recommendation"),
  confidence: $("confidence"),
  reviewDate: $("reviewDate"),
  risk: $("risk"),
  reason: $("reason"),
  guardrails: $("guardrails"),
  runway: $("runway"),
  mom: $("mom"),
  ltvCAC: $("ltvCAC"),
  metricNote: $("metricNote"),

  // List
  decisions: $("decisions"),
  empty: $("decisionsEmpty"),
  filterStatus: $("filterStatus"),
  filterRisk: $("filterRisk"),
  search: $("search"),
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODate(iso) {
  // safe parse in local time
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / ms);
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

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

let decisions = load();

// Default review date = today
els.reviewDate.value = todayISO();

function normalizeDecision(d) {
  const confidence = Number(d.confidence);
  return {
    id: d.id ?? uid(),
    createdAt: d.createdAt ?? new Date().toISOString(),
    type: d.type ?? "Strategy",
    status: d.status ?? "Proposed",
    impact: d.impact ?? "Medium",
    risk: d.risk ?? "none",
    question: (d.question ?? "").trim(),
    recommendation: (d.recommendation ?? "").trim(),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 0,
    reviewDate: d.reviewDate ?? todayISO(),
    reason: (d.reason ?? "").trim(),
    guardrails: (d.guardrails ?? "").trim(),
    runway: d.runway === "" || d.runway == null ? null : Number(d.runway),
    mom: d.mom === "" || d.mom == null ? null : Number(d.mom),
    ltvCAC: d.ltvCAC === "" || d.ltvCAC == null ? null : Number(d.ltvCAC),
    metricNote: (d.metricNote ?? "").trim(),
  };
}

function computeKPIs(list) {
  const now = parseISODate(todayISO());

  // "Open" = not Reviewed
  const open = list.filter((d) => d.status !== "Reviewed").length;

  // Upcoming reviews = review date within next 14 days (including today), excluding already reviewed
  const upcoming = list.filter((d) => {
    if (d.status === "Reviewed") return false;
    const rd = parseISODate(d.reviewDate);
    const delta = daysBetween(now, rd);
    return delta >= 0 && delta <= 14;
  }).length;

  // High risk = risk = high OR impact high with low confidence (<60) OR guardrails empty while status approved
  const highRisk = list.filter((d) => {
    const lowConf = d.confidence < 60;
    const approved = d.status === "Approved";
    const noGuardrails = !d.guardrails || d.guardrails.trim().length === 0;
    return d.risk === "high" || (d.impact === "High" && lowConf) || (approved && noGuardrails);
  }).length;

  // Avg confidence = across all decisions
  const avg =
    list.length === 0
      ? null
      : Math.round(list.reduce((sum, d) => sum + (Number(d.confidence) || 0), 0) / list.length);

  return { open, upcoming, highRisk, avg };
}

function setKPIs() {
  const { open, upcoming, highRisk, avg } = computeKPIs(decisions);

  els.kpiOpen.textContent = String(open);
  els.kpiUpcoming.textContent = String(upcoming);
  els.kpiRisk.textContent = String(highRisk);
  els.kpiAvg.textContent = avg == null ? "—" : `${avg}%`;

  els.kpiOpenSub.textContent = open === 1 ? "Active decision" : "Active decisions";
}

function getFilteredList() {
  const statusVal = els.filterStatus.value;
  const riskVal = els.filterRisk.value;
  const q = (els.search.value || "").trim().toLowerCase();

  return decisions
    .slice()
    .sort((a, b) => (a.reviewDate < b.reviewDate ? -1 : 1))
    .filter((d) => {
      if (statusVal !== "all" && d.status !== statusVal) return false;
      if (riskVal !== "all" && d.risk !== riskVal) return false;

      if (!q) return true;
      const hay = `${d.type} ${d.status} ${d.impact} ${d.risk} ${d.question} ${d.recommendation} ${d.reason} ${d.guardrails}`.toLowerCase();
      return hay.includes(q);
    });
}

function tagForStatus(status) {
  if (status === "Reviewed") return { text: "Reviewed", cls: "ok" };
  if (status === "Approved") return { text: "Approved", cls: "ok" };
  if (status === "In progress") return { text: "In progress", cls: "warn" };
  return { text: status, cls: "" };
}

function tagForImpact(impact) {
  if (impact === "High") return { text: "Impact: High", cls: "warn" };
  if (impact === "Low") return { text: "Impact: Low", cls: "" };
  return { text: "Impact: Medium", cls: "" };
}

function tagForRisk(risk) {
  if (risk === "high") return { text: "High risk", cls: "risk" };
  if (risk === "watch") return { text: "Watch", cls: "warn" };
  return { text: "OK", cls: "ok" };
}

function render() {
  setKPIs();

  const list = getFilteredList();
  els.decisions.innerHTML = "";

  els.empty.style.display = list.length === 0 ? "block" : "none";

  for (const d of list) {
    const statusTag = tagForStatus(d.status);
    const impactTag = tagForImpact(d.impact);
    const riskTag = tagForRisk(d.risk);

    const card = document.createElement("div");
    card.className = "dcard";

    const advancedBits = [];
    if (Number.isFinite(d.runway)) advancedBits.push(`Runway: ${d.runway}m`);
    if (Number.isFinite(d.mom)) advancedBits.push(`MoM: ${d.mom}%`);
    if (Number.isFinite(d.ltvCAC)) advancedBits.push(`LTV/CAC: ${d.ltvCAC}`);
    if (d.guardrails) advancedBits.push(`Guardrails: ${d.guardrails}`);
    if (d.metricNote) advancedBits.push(`Note: ${d.metricNote}`);

    card.innerHTML = `
      <div class="dtop">
        <div>
          <div class="dtitle">Decision</div>
          <div style="font-weight:900; font-size:16px; margin-top:-4px;">${escapeHtml(d.question)}</div>
        </div>
        <div class="dmeta">
          <span class="tag">${escapeHtml(d.type)}</span>
          <span class="tag ${statusTag.cls}">${escapeHtml(statusTag.text)}</span>
          <span class="tag">${escapeHtml(impactTag.text)}</span>
          <span class="tag ${riskTag.cls}">${escapeHtml(riskTag.text)}</span>
        </div>
      </div>

      <div class="dgrid">
        <div class="box">
          <h4>RECOMMENDATION</h4>
          <p>${escapeHtml(d.recommendation)}</p>
        </div>

        <div class="box">
          <h4>CONFIDENCE</h4>
          <p>${escapeHtml(String(d.confidence))}%</p>
        </div>
      </div>

      <div class="dtext"><strong>Reason:</strong> ${escapeHtml(d.reason)}</div>
      <div class="dline"><strong>Review:</strong> ${formatDate(d.reviewDate)}</div>
      ${
        advancedBits.length
          ? `<div class="dline">${escapeHtml(advancedBits.join(" · "))}</div>`
          : ""
      }

      <div class="dactions">
        ${
          d.status !== "Reviewed"
            ? `<button class="btn small" data-action="review" data-id="${d.id}">Mark reviewed</button>`
            : `<button class="btn small ghost" data-action="unreview" data-id="${d.id}">Un-review</button>`
        }
        <button class="btn small ghost" data-action="delete" data-id="${d.id}">Delete</button>
      </div>
    `;

    els.decisions.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  // Keep it simple: show as DD/MM/YYYY
  const d = parseISODate(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// EVENTS
els.form.addEventListener("submit", (e) => {
  e.preventDefault();

  const d = normalizeDecision({
    type: els.type.value,
    status: els.status.value,
    impact: els.impact.value,
    risk: els.risk.value,
    question: els.question.value,
    recommendation: els.recommendation.value,
    confidence: els.confidence.value,
    reviewDate: els.reviewDate.value,
    reason: els.reason.value,
    guardrails: els.guardrails.value,
    runway: els.runway.value,
    mom: els.mom.value,
    ltvCAC: els.ltvCAC.value,
    metricNote: els.metricNote.value,
  });

  decisions.unshift(d);
  save(decisions);

  // reset form (keep date = today)
  els.form.reset();
  els.reviewDate.value = todayISO();
  els.impact.value = "Medium";
  els.status.value = "Proposed";
  els.risk.value = "none";

  render();
});

els.clearAll.addEventListener("click", () => {
  const ok = confirm("Clear all saved decisions?");
  if (!ok) return;
  decisions = [];
  save(decisions);
  render();
});

els.decisions.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  const idx = decisions.findIndex((d) => d.id === id);
  if (idx === -1) return;

  if (action === "delete") {
    const ok = confirm("Delete this decision?");
    if (!ok) return;
    decisions.splice(idx, 1);
  }

  if (action === "review") {
    decisions[idx].status = "Reviewed";
  }

  if (action === "unreview") {
    decisions[idx].status = "Proposed";
  }

  save(decisions);
  render();
});

["change", "input"].forEach((evt) => {
  els.filterStatus.addEventListener(evt, render);
  els.filterRisk.addEventListener(evt, render);
  els.search.addEventListener(evt, render);
});

// Boot
render();

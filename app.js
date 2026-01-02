 /* ====== Decision Dashboard V.4.3.2 ====== */

const STORAGE_KEY = "v432_decisions";

const $ = (id) => document.getElementById(id);

const els = {
  // stats
  statOpen: $("stat-open"),
  statUpcoming: $("stat-upcoming"),
  statRisk: $("stat-risk"),
  statAvg: $("stat-avg"),

  // filters
  filterStatus: $("filter-status"),
  filterRisk: $("filter-risk"),
  search: $("search"),

  // list
  list: $("decisions-list"),

  // form (match these IDs to your form inputs)
  type: $("type"),
  status: $("status"),
  impact: $("impact"),
  question: $("question"),
  recommendation: $("recommendation"),
  confidence: $("confidence"),
  reviewDate: $("reviewDate"),
  reason: $("reason"),
  runway: $("runway"),
  growth: $("growth"),
  ltvCac: $("ltvCac"),
  guardrails: $("guardrails"),

  addBtn: $("add"),
  clearAllBtn: $("clearAll"),
};

let decisions = load();

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseDate(value) {
  // supports yyyy-mm-dd or dd/mm/yyyy
  if (!value) return null;

  // yyyy-mm-dd (native date input)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/").map(Number);
    return new Date(y, m - 1, d);
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysFromNow(date) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ms = target - start;
  return Math.round(ms / 86400000);
}

function clampInt(n, min, max) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return null;
  return Math.min(max, Math.max(min, x));
}

function toNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

/* ---------- storage ---------- */

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/* ---------- business rules ---------- */

function isClosed(d) {
  return d.status === "Reviewed" || d.status === "Rejected";
}

function isOpen(d) {
  return !isClosed(d);
}

function isHighRisk(d) {
  const conf = typeof d.confidence === "number" ? d.confidence : 0;
  const noGuardrails = !d.guardrails || d.guardrails.trim().length < 3;

  if (!isOpen(d)) return false;

  if (conf < 50) return true;
  if (d.impact === "High" && conf < 70) return true;
  if (noGuardrails && d.impact !== "Low") return true;

  return false;
}

function riskLabel(d) {
  return isHighRisk(d) ? "High risk" : "OK";
}

function riskClass(d) {
  return isHighRisk(d) ? "risk-high" : "risk-ok";
}

/* ---------- stats ---------- */

function computeStats() {
  const open = decisions.filter(isOpen);

  const upcoming = open.filter((d) => {
    const dt = parseDate(d.reviewDate);
    if (!dt) return false;
    const diff = daysFromNow(dt);
    return diff >= 0 && diff <= 14;
  });

  const highRisk = open.filter(isHighRisk);

  const avg = (() => {
    const nums = open
      .map((d) => (typeof d.confidence === "number" ? d.confidence : null))
      .filter((x) => x !== null);

    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return Math.round(sum / nums.length);
  })();

  return {
    openCount: open.length,
    upcomingCount: upcoming.length,
    riskCount: highRisk.length,
    avgConfidence: avg,
  };
}

function renderStats() {
  const s = computeStats();
  if (els.statOpen) els.statOpen.textContent = String(s.openCount);
  if (els.statUpcoming) els.statUpcoming.textContent = String(s.upcomingCount);
  if (els.statRisk) els.statRisk.textContent = String(s.riskCount);
  if (els.statAvg) els.statAvg.textContent = s.avgConfidence === null ? "—" : `${s.avgConfidence}%`;
}

/* ---------- filtering ---------- */

function getFiltered() {
  const status = els.filterStatus?.value?.trim() || "";
  const risk = els.filterRisk?.value?.trim() || "";
  const q = (els.search?.value || "").trim().toLowerCase();

  return decisions.filter((d) => {
    if (status && d.status !== status) return false;

    if (risk === "high" && !isHighRisk(d)) return false;
    if (risk === "ok" && isHighRisk(d)) return false;

    if (q) {
      const hay = [
        d.type, d.status, d.impact, d.question, d.recommendation, d.reason, d.guardrails,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

/* ---------- rendering list ---------- */

function renderList() {
  if (!els.list) return;

  const rows = getFiltered();

  if (!rows.length) {
    els.list.innerHTML = `
      <div class="empty">
        <strong>No decisions match your filters.</strong>
        <div class="muted">Add a decision above or adjust filters.</div>
      </div>
    `;
    return;
  }

  els.list.innerHTML = rows
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((d) => {
      const conf = typeof d.confidence === "number" ? `${d.confidence}%` : "—";
      const review = d.reviewDate ? d.reviewDate : "—";
      const meta = [
        d.runway != null ? `Runway: ${d.runway}m` : null,
        d.growth != null ? `MoM: ${d.growth}%` : null,
        d.ltvCac != null ? `LTV/CAC: ${d.ltvCac}` : null,
        d.guardrails ? `Guardrails: ${d.guardrails}` : null,
      ].filter(Boolean).join(" · ");

      return `
        <article class="decision-card">
          <div class="decision-top">
            <div>
              <div class="decision-title">Decision</div>
              <div class="decision-q">${escapeHtml(d.question || "—")}</div>
            </div>

            <div class="badges">
              <span class="badge">${escapeHtml(d.type || "—")}</span>
              <span class="badge">${escapeHtml(d.status || "—")}</span>
              <span class="badge">Impact: ${escapeHtml(d.impact || "—")}</span>
              <span class="badge ${riskClass(d)}">${riskLabel(d)}</span>
            </div>
          </div>

          <div class="decision-grid">
            <div class="box">
              <div class="k">RECOMMENDATION</div>
              <div class="v">${escapeHtml(d.recommendation || "—")}</div>
            </div>
            <div class="box">
              <div class="k">CONFIDENCE</div>
              <div class="v">${conf}</div>
            </div>
          </div>

          <div class="reason">
            <div><span class="muted">Reason:</span> ${escapeHtml(d.reason || "—")}</div>
            <div><span class="muted">Review:</span> ${escapeHtml(review)}</div>
            ${meta ? `<div class="muted small">${escapeHtml(meta)}</div>` : ""}
          </div>

          <div class="actions">
            <button class="btn" data-action="review" data-id="${d.id}">Mark reviewed</button>
            <button class="btn danger" data-action="delete" data-id="${d.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- events ---------- */

function addDecisionFromForm() {
  const confidence = clampInt(els.confidence?.value, 0, 100);
  const runway = clampInt(els.runway?.value, 0, 120);
  const growth = clampInt(els.growth?.value, -100, 1000);
  const ltvCac = toNum(els.ltvCac?.value);

  const d = {
    id: uid(),
    createdAt: Date.now(),

    type: els.type?.value || "General",
    status: els.status?.value || "Proposed",
    impact: els.impact?.value || "Medium",

    question: (els.question?.value || "").trim(),
    recommendation: (els.recommendation?.value || "").trim(),
    confidence: confidence ?? null,
    reviewDate: (els.reviewDate?.value || "").trim(),

    reason: (els.reason?.value || "").trim(),

    runway: runway ?? null,
    growth: growth ?? null,
    ltvCac: ltvCac ?? null,
    guardrails: (els.guardrails?.value || "").trim(),
  };

  // minimal validation
  if (!d.question) {
    alert("Decision question is required.");
    return;
  }

  decisions.unshift(d);
  save();
  renderAll();
  clearForm();
}

function clearForm() {
  ["question", "recommendation", "confidence", "reason", "runway", "growth", "ltvCac", "guardrails"].forEach((k) => {
    if (els[k]) els[k].value = "";
  });
}

function handleListClick(e) {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  const idx = decisions.findIndex((d) => d.id === id);
  if (idx === -1) return;

  if (action === "delete") {
    decisions.splice(idx, 1);
    save();
    renderAll();
    return;
  }

  if (action === "review") {
    decisions[idx].status = "Reviewed";
    decisions[idx].reviewedAt = Date.now();
    save();
    renderAll();
    return;
  }
}

function clearAll() {
  if (!confirm("Clear all decisions?")) return;
  decisions = [];
  save();
  renderAll();
}

function renderAll() {
  renderStats();
  renderList();
}

/* ---------- init ---------- */

function bind() {
  els.addBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    addDecisionFromForm();
  });

  els.clearAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    clearAll();
  });

  els.list?.addEventListener("click", handleListClick);

  [els.filterStatus, els.filterRisk, els.search].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });
}

bind();
renderAll();


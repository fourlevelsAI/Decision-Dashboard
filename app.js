/* V.4.3.2 – app.js (Dashboard + Overview + Review + Queue + Cover)
   Core principle: decision accountability (pre-commitment + post-review).
*/

const STORAGE_KEY = "v432_decisions";
const THEME_KEY = "v432_theme";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function safeJSONParse(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = new Date(aISO);
  const b = new Date(bISO);
  const ms = b - a;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function getQueryParam(name) {
  const sp = new URLSearchParams(window.location.search);
  return sp.get(name);
}

// ---------- Escape ----------
function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- Domain / Status semantics ----------
const STATUS = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IGNORED: "Ignored / Not Reviewed"
};

function isIgnoredStatus(status) {
  return String(status || "").trim() === STATUS.IGNORED;
}

function isRejectedStatus(status) {
  return String(status || "").trim() === STATUS.REJECTED;
}

function isHighImpact(d) {
  return String(d.impact || "").toLowerCase() === "high";
}

function isOverdue(d) {
  if (d.reviewed) return false;
  if (!d.reviewDate) return false;
  const diff = daysBetween(d.reviewDate, todayISO()); // positive => today after review date
  return diff !== null && diff > 0;
}

function computeUpcoming(d) {
  if (d.reviewed) return false;
  if (!d.reviewDate) return false;
  const diff = daysBetween(todayISO(), d.reviewDate);
  return diff !== null && diff >= 0 && diff <= 14;
}

function computeHighRisk(d) {
  const conf = Number(d.confidence ?? NaN);
  const impactHigh = isHighImpact(d);

  const guardrailsDefined = Boolean(d.guardrailsDefined);
  const missingGuardrails = impactHigh && !guardrailsDefined;

  const lowConfidence = Number.isFinite(conf) && conf >= 0 && conf < 60;

  return impactHigh || lowConfidence || missingGuardrails;
}

function computeRiskSignal(d) {
  // System risk = inherent risk + overdue + ignored
  return computeHighRisk(d) || isOverdue(d) || isIgnoredStatus(d.status);
}

function avgConfidence(list) {
  const nums = list
    .map(x => Number(x.confidence))
    .filter(n => Number.isFinite(n) && n >= 0);

  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round(sum / nums.length);
}

// ---------- Storage + migration ----------
function normalizeDecision(raw) {
  const d = { ...(raw || {}) };

  // Backward compatibility: older UI uses `type` (treat as domain)
  d.domain = d.domain || d.type || d.decisionDomain || "";
  d.type = d.type || d.domain || "";

  d.status = d.status || STATUS.PROPOSED;
  d.impact = d.impact || "Medium";

  d.reviewed = Boolean(d.reviewed);

  d.question = d.question || "";
  d.recommendation = d.recommendation || "";
  d.reason = d.reason || "";

  // Normalize confidence into number/null
  if (d.confidence === "" || d.confidence == null) d.confidence = null;
  if (d.confidence != null) {
    const n = Number(d.confidence);
    d.confidence = Number.isFinite(n) ? n : null;
  }

  d.reviewDate = d.reviewDate || "";

  d.runway = d.runway === "" || d.runway == null ? null : Number(d.runway);
  if (d.runway != null && !Number.isFinite(d.runway)) d.runway = null;

  d.growth = d.growth === "" || d.growth == null ? null : Number(d.growth);
  if (d.growth != null && !Number.isFinite(d.growth)) d.growth = null;

  d.ltv = d.ltv === "" || d.ltv == null ? null : Number(d.ltv);
  if (d.ltv != null && !Number.isFinite(d.ltv)) d.ltv = null;

  d.guardrails = d.guardrails || "";
  d.guardrailsDefined = Boolean(d.guardrailsDefined);

  d.outcome = d.outcome || "";
  d.outcomeNotes = d.outcomeNotes || "";
  d.learning = d.learning || "";

  d.createdAt = Number.isFinite(Number(d.createdAt)) ? Number(d.createdAt) : Date.now();
  d.id = d.id || uid();

  return d;
}

function loadDecisions() {
  const raw = safeJSONParse(localStorage.getItem(STORAGE_KEY), []);
  const list = Array.isArray(raw) ? raw.map(normalizeDecision) : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

function saveDecisions(list) {
  const normalized = (Array.isArray(list) ? list : []).map(normalizeDecision);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

// ---------- Theme ----------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") {
    document.documentElement.setAttribute("data-theme", saved);
  }
  const btn = $("themeToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      const next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
    });
  }
}

// ---------- Stats ----------
function setTextIfExists(idList, value) {
  for (const id of idList) {
    const el = $(id);
    if (el) { el.textContent = value; return; }
  }
}

function updateStats() {
  const list = loadDecisions();

  const open = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status)
  ).length;

  const upcoming = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status) &&
    computeUpcoming(d)
  ).length;

  const risk = list.filter(d => !d.reviewed && computeRiskSignal(d)).length;
  const avg = avgConfidence(list);

  setTextIfExists(["stat-open", "openCount"], String(open));
  setTextIfExists(["stat-upcoming", "dueSoonCount", "stat-due"], String(upcoming));
  setTextIfExists(["stat-risk", "highRiskCount"], String(risk));
  setTextIfExists(["stat-avg", "avgConfidence"], avg === null ? "—" : `${avg}%`);
}

// ---------- Filters ----------
function populateFilters(list) {
  const statusEl = $("filterStatus");
  const riskEl = $("filterRisk");

  if (statusEl) {
    const current = statusEl.value || "All statuses";
    const known = [STATUS.PROPOSED, STATUS.APPROVED, STATUS.REJECTED, STATUS.IGNORED];
    const fromData = [...new Set(list.map(d => String(d.status || "").trim()).filter(Boolean))];
    const merged = [...known, ...fromData.filter(s => !known.includes(s))].filter(Boolean);

    if (statusEl.options.length <= 1) {
      statusEl.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "All statuses";
      optAll.textContent = "All statuses";
      statusEl.appendChild(optAll);

      merged.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        statusEl.appendChild(opt);
      });
    }

    statusEl.value = [...statusEl.options].some(o => o.value === current)
      ? current
      : "All statuses";
  }

  if (riskEl) {
    const current = riskEl.value || "All risk";
    if (riskEl.options.length <= 1) {
      riskEl.innerHTML = "";
      const all = document.createElement("option");
      all.value = "All risk";
      all.textContent = "All risk";
      riskEl.appendChild(all);

      const hi = document.createElement("option");
      hi.value = "High";
      hi.textContent = "High";
      riskEl.appendChild(hi);
    }

    riskEl.value = [...riskEl.options].some(o => o.value === current)
      ? current
      : "All risk";
  }
}

// ---------- Render decisions (Dashboard) ----------
function getDecisionsMount() {
  return $("decisions") || $("decisionList");
}

function renderDecisions() {
  const mount = getDecisionsMount();
  if (!mount) return;

  const list = loadDecisions();
  populateFilters(list);

  const filterStatus = $("filterStatus")?.value || "All statuses";
  const filterRisk = $("filterRisk")?.value || "All risk";
  const q = ($("search")?.value || "").toLowerCase().trim();

  let filtered = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (filterStatus !== "All statuses") filtered = filtered.filter(d => d.status === filterStatus);
  if (filterRisk === "High") filtered = filtered.filter(d => computeRiskSignal(d));

  if (q) {
    filtered = filtered.filter(d => {
      const blob = [
        d.domain, d.type, d.status, d.impact, d.question, d.recommendation, d.reason,
        d.guardrails, d.reviewDate, d.outcome, d.learning,
        d.guardrailsDefined ? "guardrails-defined" : "guardrails-missing"
      ].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  if (!filtered.length) {
    mount.innerHTML = `<p class="empty">No decisions match your filters.</p>`;
    return;
  }

  mount.innerHTML = filtered.map(d => {
    const conf = Number(d.confidence ?? NaN);
    const overdue = isOverdue(d);
    const ignored = isIgnoredStatus(d.status);
    const riskSignal = computeRiskSignal(d);

    const badges = [];
    badges.push(`<span class="badge">${escapeHTML(d.domain || d.type || "—")}</span>`);
    badges.push(`<span class="badge">${escapeHTML(d.status || "—")}</span>`);
    badges.push(`<span class="badge">Impact: ${escapeHTML(d.impact || "—")}</span>`);

    if (ignored) badges.push(`<span class="badge risk">IGNORED</span>`);
    if (overdue) badges.push(`<span class="badge risk">OVERDUE</span>`);
    if (!ignored && !overdue) badges.push(riskSignal ? `<span class="badge risk">RISK</span>` : `<span class="badge ok">OK</span>`);

    if (d.reviewed) badges.push(`<span class="badge ok">REVIEWED</span>`);
    if (d.reviewed && d.outcome) badges.push(`<span class="badge">${escapeHTML(d.outcome)}</span>`);

    const runway = d.runway != null ? `Runway: ${d.runway}m` : "";
    const growth = d.growth != null ? `MoM: ${d.growth}%` : "";
    const ltv = d.ltv != null ? `LTV/CAC: ${d.ltv}` : "";
    const guardrailsBinary = isHighImpact(d) ? (d.guardrailsDefined ? "Guardrails: Defined" : "Guardrails: Missing") : "";
    const guardsFree = d.guardrails ? `Guardrails: ${d.guardrails}` : "";
    const meta = [runway, growth, ltv, guardrailsBinary, guardsFree].filter(Boolean).join(" · ");

    return `
      <div class="decision">
        <div class="decision-top">
          <div>
            <div class="muted" style="font-weight:900; letter-spacing:.08em; font-size:12px;">DECISION</div>
            <h3 class="decision-title">${escapeHTML(d.question || "(No question)")}</h3>
          </div>
          <div class="badges">${badges.join("")}</div>
        </div>

        <div class="decision-grid">
          <div class="k">
            <div class="klabel">RECOMMENDATION</div>
            <div class="kvalue">${escapeHTML(d.recommendation || "—")}</div>
          </div>
          <div class="k">
            <div class="klabel">CONFIDENCE AT COMMIT</div>
            <div class="kvalue">${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</div>
          </div>
        </div>

        <div class="decision-meta">
          <span><b>Reason:</b> ${escapeHTML(d.reason || "—")}</span>
          ${d.reviewDate ? `<span><b>Review:</b> ${escapeHTML(d.reviewDate)}</span>` : ""}
          ${meta ? `<span>${escapeHTML(meta)}</span>` : ""}
          ${d.reviewed && d.learning ? `<span><b>Learning:</b> ${escapeHTML(d.learning)}</span>` : ""}
        </div>

        <div class="decision-actions">
          <a class="btn ghost" href="review.html?id=${encodeURIComponent(d.id)}" ${d.reviewed ? 'aria-disabled="true"' : ""}>
            ${d.reviewed ? "Reviewed" : "Review decision"}
          </a>
          <button class="btn ghost" data-action="delete" data-id="${d.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  mount.querySelectorAll("button[data-action='delete']").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const all = loadDecisions();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return;

      all.splice(idx, 1);
      saveDecisions(all);

      updateStats();
      renderDecisions();
      renderOverview();
      renderQueuePage();
      renderCoverPage();
    });
  });
}

// ---------- Form handling ----------
function readNumber(id) {
  const v = $(id)?.value;
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readValueFirst(ids) {
  for (const id of ids) {
    const el = $(id);
    if (el && typeof el.value !== "undefined") return el.value;
  }
  return "";
}

function wireForm() {
  const form = $("decisionForm");
  const addBtn = $("addDecision"); // optional alternative UI

  const handler = (e) => {
    if (e) e.preventDefault();

    // accept both `type` and `domain` fields
    const domainVal = readValueFirst(["type", "domain"]) || "";
    const statusVal = readValueFirst(["status"]) || STATUS.PROPOSED;

    const d = normalizeDecision({
      id: uid(),
      createdAt: Date.now(),
      reviewed: false,

      domain: domainVal,
      type: domainVal,

      status: statusVal,
      impact: readValueFirst(["impact"]) || "Medium",

      question: readValueFirst(["question"]) || "",
      recommendation: readValueFirst(["recommendation"]) || "",
      confidence: readValueFirst(["confidence"]) !== "" ? Number(readValueFirst(["confidence"])) : null,
      reviewDate: readValueFirst(["reviewDate"]) || "",

      reason: readValueFirst(["reason"]) || "",

      runway: readNumber("runway"),
      growth: readNumber("growth"),
      ltv: readNumber("ltv"),

      guardrails: readValueFirst(["guardrails"]) || "",
      guardrailsDefined: Boolean($("guardrailsDefined")?.checked),

      outcome: "",
      outcomeNotes: "",
      learning: ""
    });

    if (!d.question.trim()) {
      alert("Add a decision question.");
      return;
    }

    if (isIgnoredStatus(d.status)) {
      d.ignoredAt = Date.now();
      d.reviewed = false;
    }

    if (isRejectedStatus(d.status)) {
      d.reviewed = true;
      d.reviewedAt = Date.now();
      d.outcome = "As expected";
      d.learning = "Rejected decision (closed).";
    }

    const list = loadDecisions();
    list.push(d);
    saveDecisions(list);

    // minimal reset
    ["question","recommendation","confidence","reason","runway","growth","ltv","guardrails"].forEach(id => {
      const el = $(id);
      if (el) el.value = "";
    });
    if ($("guardrailsDefined")) $("guardrailsDefined").checked = false;
    if ($("reviewDate")) $("reviewDate").value = todayISO();

    updateStats();
    renderDecisions();
    renderOverview();
    renderQueuePage();
    renderCoverPage();
  };

  if (form) form.addEventListener("submit", handler);
  if (addBtn) addBtn.addEventListener("click", handler);

  const clearBtn = $("clearAll");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!confirm("Clear all decisions?")) return;
      saveDecisions([]);
      updateStats();
      renderDecisions();
      renderOverview();
      renderQueuePage();
      renderCoverPage();
    });
  }

  if ($("reviewDate") && !$("reviewDate").value) $("reviewDate").value = todayISO();

  ["filterStatus", "filterRisk", "search"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => renderDecisions());
    el.addEventListener("change", () => renderDecisions());
  });
}

// ---------- Overview page ----------
async function incrementTesterCount() {
  const el = $("testerCount") || $("cover-testers");
  if (!el) return;

  const seenKey = "v432_seen";
  const already = localStorage.getItem(seenKey) === "1";
  const counterName = "fourlevelsai-v432-testers";

  try {
    const url = already
      ? `https://api.countapi.xyz/get/${counterName}/visitors`
      : `https://api.countapi.xyz/hit/${counterName}/visitors`;

    if (!already) localStorage.setItem(seenKey, "1");

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    el.textContent = typeof data.value === "number" ? String(data.value) : "—";
  } catch {
    el.textContent = "—";
  }
}

function renderOverview() {
  const totalEl = $("ov-total");
  const openEl = $("ov-open");
  const dueEl = $("ov-due");
  const recentMount = $("ov-recent");

  if (!totalEl && !openEl && !dueEl && !recentMount) return;

  const list = loadDecisions();
  const total = list.length;

  const open = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status)
  ).length;

  const due = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status) &&
    computeUpcoming(d)
  ).length;

  if (totalEl) totalEl.textContent = String(total);
  if (openEl) openEl.textContent = String(open);
  if (dueEl) dueEl.textContent = String(due);

  if (recentMount) {
    const recent = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);

    if (!recent.length) {
      recentMount.innerHTML = `<p class="empty">No decisions yet. Go to Dashboard and add one.</p>`;
    } else {
      recentMount.innerHTML = recent.map(d => {
        const overdue = isOverdue(d);
        const ignored = isIgnoredStatus(d.status);
        const riskSignal = computeRiskSignal(d);
        const conf = Number(d.confidence ?? NaN);

        const extraBadge = ignored
          ? `<span class="badge risk">IGNORED</span>`
          : overdue
            ? `<span class="badge risk">OVERDUE</span>`
            : riskSignal
              ? `<span class="badge risk">RISK</span>`
              : `<span class="badge ok">OK</span>`;

        const reviewLink = !d.reviewed
          ? `<a class="btn ghost" style="margin-left:auto" href="review.html?id=${encodeURIComponent(d.id)}">Review</a>`
          : "";

        return `
          <div class="decision">
            <div class="decision-top">
              <div>
                <div class="muted" style="font-weight:900; letter-spacing:.08em; font-size:12px;">RECENT</div>
                <h3 class="decision-title">${escapeHTML(d.question || "(No question)")}</h3>
              </div>
              <div class="badges">
                <span class="badge">${escapeHTML(d.domain || d.type || "—")}</span>
                <span class="badge">${escapeHTML(d.status || "—")}</span>
                ${extraBadge}
              </div>
            </div>
            <div class="decision-meta">
              <span><b>Confidence:</b> ${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</span>
              ${d.reviewDate ? `<span><b>Review:</b> ${escapeHTML(d.reviewDate)}</span>` : ""}
              ${d.outcome ? `<span><b>Outcome:</b> ${escapeHTML(d.outcome)}</span>` : ""}
              ${reviewLink}
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

// ---------- Cover page ----------
function renderCoverPage() {
  const hasCover =
    $("cover-total") || $("cover-open") || $("cover-due") || $("cover-risk") || $("cover-avg");

  if (!hasCover) return;

  const list = loadDecisions();

  const open = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status)
  );

  const dueSoon = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status) &&
    computeUpcoming(d)
  );

  const riskOpen = list.filter(d =>
    !d.reviewed &&
    !isRejectedStatus(d.status) &&
    computeRiskSignal(d)
  );

  const avg = avgConfidence(open);

  if ($("cover-total")) $("cover-total").textContent = String(list.length);
  if ($("cover-open")) $("cover-open").textContent = String(open.length);
  if ($("cover-due")) $("cover-due").textContent = String(dueSoon.length);
  if ($("cover-risk")) $("cover-risk").textContent = String(riskOpen.length);
  if ($("cover-avg")) $("cover-avg").textContent = avg === null ? "—" : `${avg}%`;
}

// ---------- Review page ----------
function renderReviewPage() {
  const submitBtn = $("submitReview");
  const qEl = $("review-question");
  const metaEl = $("review-meta");

  if (!submitBtn || !qEl || !metaEl) return;

  const id = getQueryParam("id");
  if (!id) {
    qEl.innerHTML = `<span class="empty">Missing decision id. Go back to Dashboard and open a decision from there.</span>`;
    submitBtn.disabled = true;
    return;
  }

  const list = loadDecisions();
  const idx = list.findIndex(d => d.id === id);
  if (idx === -1) {
    qEl.innerHTML = `<span class="empty">Decision not found. It may have been deleted.</span>`;
    submitBtn.disabled = true;
    return;
  }

  const d = list[idx];

  qEl.innerHTML = `<strong>${escapeHTML(d.question || "(No question)")}</strong>`;

  const conf = Number(d.confidence ?? NaN);
  const overdue = isOverdue(d);
  const ignored = isIgnoredStatus(d.status);

  const badges = [];
  badges.push(`<span class="badge">${escapeHTML(d.domain || d.type || "—")}</span>`);
  badges.push(`<span class="badge">${escapeHTML(d.status || "—")}</span>`);
  badges.push(`<span class="badge">Impact: ${escapeHTML(d.impact || "—")}</span>`);
  if (ignored) badges.push(`<span class="badge risk">IGNORED</span>`);
  if (overdue) badges.push(`<span class="badge risk">OVERDUE</span>`);

  metaEl.innerHTML = `
    <span><b>Recommendation:</b> ${escapeHTML(d.recommendation || "—")}</span>
    <span><b>Confidence at commit:</b> ${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</span>
    ${d.reviewDate ? `<span><b>Review date:</b> ${escapeHTML(d.reviewDate)}</span>` : ""}
    <span style="width:100%; display:block; margin-top:8px;">${badges.join(" ")}</span>
  `;

  if (d.reviewed && d.outcome) {
    if ($("outcome")) $("outcome").value = d.outcome;
    if ($("outcomeNotes")) $("outcomeNotes").value = d.outcomeNotes || "";
    if ($("learning")) $("learning").value = d.learning || "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Review closed";
    return;
  }

  submitBtn.addEventListener("click", () => {
    const outcome = ($("outcome")?.value || "").trim();
    const outcomeNotes = ($("outcomeNotes")?.value || "").trim();
    const learning = ($("learning")?.value || "").trim();

    if (!outcome) {
      alert("Select an outcome. No outcome = no review.");
      return;
    }
    if (!learning) {
      alert("Add one learning. No learning = no review.");
      return;
    }

    list[idx].outcome = outcome;
    list[idx].outcomeNotes = outcomeNotes;
    list[idx].learning = learning;

    list[idx].reviewed = true;
    list[idx].reviewedAt = Date.now();

    saveDecisions(list);
    window.location.href = "queue.html";
  });
}

// ---------- Review Queue page ----------
function renderQueueSection(mountId, items) {
  const mount = $(mountId);
  if (!mount) return;

  if (!items.length) {
    mount.innerHTML = `<p class="empty">Nothing here.</p>`;
    return;
  }

  mount.innerHTML = items.map(d => {
    const conf = Number(d.confidence ?? NaN);
    const overdue = isOverdue(d);
    const ignored = isIgnoredStatus(d.status);
    const riskSignal = computeRiskSignal(d);

    const badges = [];
    badges.push(`<span class="badge">${escapeHTML(d.domain || d.type || "—")}</span>`);
    badges.push(`<span class="badge">${escapeHTML(d.status || "—")}</span>`);
    if (d.reviewDate) badges.push(`<span class="badge">Review: ${escapeHTML(d.reviewDate)}</span>`);
    if (ignored) badges.push(`<span class="badge risk">IGNORED</span>`);
    if (overdue) badges.push(`<span class="badge risk">OVERDUE</span>`);
    if (!ignored && !overdue) badges.push(riskSignal ? `<span class="badge risk">RISK</span>` : `<span class="badge ok">OK</span>`);

    const guardrailsBinary = isHighImpact(d)
      ? (d.guardrailsDefined ? "Guardrails: Defined" : "Guardrails: Missing")
      : "";

    return `
      <div class="decision">
        <div class="decision-top">
          <div>
            <div class="muted" style="font-weight:900; letter-spacing:.08em; font-size:12px;">QUEUE ITEM</div>
            <h3 class="decision-title">${escapeHTML(d.question || "(No question)")}</h3>
          </div>
          <div class="badges">${badges.join("")}</div>
        </div>

        <div class="decision-meta">
          <span><b>Recommendation:</b> ${escapeHTML(d.recommendation || "—")}</span>
          <span><b>Confidence:</b> ${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</span>
          ${guardrailsBinary ? `<span>${escapeHTML(guardrailsBinary)}</span>` : ""}
          ${d.reason ? `<span><b>Reason:</b> ${escapeHTML(d.reason)}</span>` : ""}
        </div>

        <div class="decision-actions">
          <a class="btn primary" href="review.html?id=${encodeURIComponent(d.id)}">Review now</a>
        </div>
      </div>
    `;
  }).join("");
}

function renderQueuePage() {
  const hasQueue =
    $("q-overdue") || $("q-due") || $("q-risk") || $("q-ignored") ||
    $("q-stat-overdue") || $("q-stat-due") || $("q-stat-risk") || $("q-stat-ignored");

  if (!hasQueue) return;

  const list = loadDecisions();

  const overdue = list
    .filter(d => !d.reviewed && !isRejectedStatus(d.status) && isOverdue(d))
    .sort((a, b) => (a.reviewDate || "").localeCompare(b.reviewDate || ""));

  const dueSoon = list
    .filter(d => !d.reviewed && !isRejectedStatus(d.status) && !isIgnoredStatus(d.status) && computeUpcoming(d))
    .sort((a, b) => (a.reviewDate || "").localeCompare(b.reviewDate || ""));

  const riskOpen = list
    .filter(d =>
      !d.reviewed &&
      !isRejectedStatus(d.status) &&
      !isIgnoredStatus(d.status) &&
      computeRiskSignal(d)
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const ignored = list
    .filter(d => !d.reviewed && isIgnoredStatus(d.status))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Stats
  if ($("q-stat-overdue")) $("q-stat-overdue").textContent = String(overdue.length);
  if ($("q-stat-due")) $("q-stat-due").textContent = String(dueSoon.length);
  if ($("q-stat-risk")) $("q-stat-risk").textContent = String(riskOpen.length);
  if ($("q-stat-ignored")) $("q-stat-ignored").textContent = String(ignored.length);

  // Sections
  renderQueueSection("q-overdue", overdue);
  renderQueueSection("q-due", dueSoon);
  renderQueueSection("q-risk", riskOpen);
  renderQueueSection("q-ignored", ignored);
}

// ---------- Boot ----------
(function init() {
  initTheme();

  updateStats();
  wireForm();

  renderDecisions();
  renderOverview();
  renderReviewPage();
  renderQueuePage();
  renderCoverPage();

  incrementTesterCount();
})();

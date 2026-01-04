 /* V.4.3.2 – app.js (shared by index.html + overview.html + review.html)
   Core mechanics:
   - Overdue mechanic: review date passed + not reviewed => "OVERDUE" badge + counted as risk signal
   - "Ignored / Not Reviewed" treated as failure state => counted as risk signal + explicit badge
   - Binary guardrails (guardrailsDefined) used for High Impact decisions
   - Review flow is REAL: Review button routes to review.html?id=... and closes loop only on submission
*/

const STORAGE_KEY = "v432_decisions";
const THEME_KEY = "v432_theme";

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function safeJSONParse(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

function loadDecisions() {
  return safeJSONParse(localStorage.getItem(STORAGE_KEY), []);
}

function saveDecisions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

function isIgnoredStatus(status) {
  return String(status || "").trim() === "Ignored / Not Reviewed";
}

function isRejectedStatus(status) {
  return String(status || "").trim() === "Rejected";
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

function computeHighRisk(d) {
  const conf = Number(d.confidence ?? NaN);
  const impactHigh = isHighImpact(d);

  // Binary guardrails: for High impact, missing guardrailsDefined is a risk
  const guardrailsDefined = Boolean(d.guardrailsDefined);
  const missingGuardrails = impactHigh && !guardrailsDefined;

  // Confidence risk only if a valid number exists
  const lowConfidence = Number.isFinite(conf) && conf >= 0 && conf < 60;

  // High impact is inherently higher risk
  return impactHigh || lowConfidence || missingGuardrails;
}

function computeUpcoming(d) {
  if (d.reviewed) return false;
  if (!d.reviewDate) return false;
  const diff = daysBetween(todayISO(), d.reviewDate);
  return diff !== null && diff >= 0 && diff <= 14;
}

function computeRiskSignal(d) {
  // “Risk” is a SYSTEM signal:
  // - inherent risk (high impact / low confidence / missing guardrails)
  // - overdue reviews (loop not closed)
  // - ignored decisions (explicit failure state)
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

// ---------- Stats (dashboard) ----------
function setTextIfExists(idList, value) {
  for (const id of idList) {
    const el = $(id);
    if (el) {
      el.textContent = value;
      return;
    }
  }
}

function updateStats() {
  const list = loadDecisions();

  // Open = decisions that are not reviewed AND not ignored/rejected
  const open = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status)
  ).length;

  // Due Soon = not reviewed, not ignored/rejected, review date within 14 days
  const upcoming = list.filter(d =>
    !d.reviewed &&
    !isIgnoredStatus(d.status) &&
    !isRejectedStatus(d.status) &&
    computeUpcoming(d)
  ).length;

  // High Risk = system signal (includes overdue + ignored)
  const risk = list.filter(d =>
    !d.reviewed && computeRiskSignal(d)
  ).length;

  const avg = avgConfidence(list);

  // Supports both your current IDs and future renames without breaking
  setTextIfExists(["stat-open", "openCount"], String(open));
  setTextIfExists(["stat-upcoming", "dueSoonCount"], String(upcoming));
  setTextIfExists(["stat-risk", "highRiskCount"], String(risk));
  setTextIfExists(["stat-avg", "avgConfidence"], avg === null ? "—" : `${avg}%`);
}

// ---------- Filters: populate from data (prevents dead dropdowns) ----------
function populateFilters(list) {
  const statusEl = $("filterStatus");
  const riskEl = $("filterRisk");

  if (statusEl) {
    const current = statusEl.value || "All statuses";

    // Collect statuses from data + enforce known order
    const known = ["Proposed", "Approved", "Rejected", "Ignored / Not Reviewed"];
    const fromData = [...new Set(list.map(d => String(d.status || "").trim()).filter(Boolean))];

    const merged = [
      ...known,
      ...fromData.filter(s => !known.includes(s))
    ].filter(Boolean);

    // If the select is empty or only has one option, repopulate safely
    if (statusEl.options.length <= 1) {
      statusEl.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.textContent = "All statuses";
      statusEl.appendChild(optAll);

      merged.forEach(s => {
        const opt = document.createElement("option");
        opt.textContent = s;
        statusEl.appendChild(opt);
      });
    }

    // restore selection if still valid
    statusEl.value = [...statusEl.options].some(o => o.value === current || o.textContent === current)
      ? current
      : "All statuses";
  }

  if (riskEl) {
    const current = riskEl.value || "All risk";
    if (riskEl.options.length <= 1) {
      riskEl.innerHTML = "";
      const all = document.createElement("option");
      all.textContent = "All risk";
      riskEl.appendChild(all);

      const hi = document.createElement("option");
      hi.textContent = "High";
      riskEl.appendChild(hi);
    }
    riskEl.value = [...riskEl.options].some(o => o.value === current || o.textContent === current)
      ? current
      : "All risk";
  }
}

// ---------- Render decisions list (dashboard) ----------
function renderDecisions() {
  const mount = $("decisions");
  if (!mount) return;

  const list = loadDecisions();
  populateFilters(list);

  const filterStatus = $("filterStatus")?.value || "All statuses";
  const filterRisk = $("filterRisk")?.value || "All risk";
  const q = ($("search")?.value || "").toLowerCase().trim();

  let filtered = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (filterStatus !== "All statuses") {
    filtered = filtered.filter(d => d.status === filterStatus);
  }

  if (filterRisk === "High") {
    filtered = filtered.filter(d => computeRiskSignal(d));
  }

  if (q) {
    filtered = filtered.filter(d => {
      const blob = [
        d.type, d.status, d.impact, d.question, d.recommendation, d.reason,
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
    badges.push(`<span class="badge">${escapeHTML(d.type || "—")}</span>`);
    badges.push(`<span class="badge">${escapeHTML(d.status || "—")}</span>`);
    badges.push(`<span class="badge">Impact: ${escapeHTML(d.impact || "—")}</span>`);

    if (ignored) badges.push(`<span class="badge risk">IGNORED</span>`);
    if (overdue) badges.push(`<span class="badge risk">OVERDUE</span>`);
    if (!ignored && !overdue) badges.push(riskSignal ? `<span class="badge risk">RISK</span>` : `<span class="badge ok">OK</span>`);

    if (d.reviewed) badges.push(`<span class="badge ok">REVIEWED</span>`);
    if (d.reviewed && d.outcome) badges.push(`<span class="badge">${escapeHTML(d.outcome)}</span>`);

    const runway = d.runway ? `Runway: ${d.runway}m` : "";
    const growth = (d.growth || d.growth === 0) ? `MoM: ${d.growth}%` : "";
    const ltv = (d.ltv || d.ltv === 0) ? `LTV/CAC: ${d.ltv}` : "";
    const guards = d.guardrails ? `Guardrails: ${d.guardrails}` : "";
    const guardrailsBinary = isHighImpact(d)
      ? (d.guardrailsDefined ? "Guardrails: Defined" : "Guardrails: Missing")
      : (d.guardrailsDefined ? "Guardrails: Defined" : "");
    const meta = [runway, growth, ltv, guardrailsBinary, guards].filter(Boolean).join(" · ");

    const reviewBtnLabel = d.reviewed ? "Reviewed" : "Review decision";

    return `
      <div class="decision">
        <div class="decision-top">
          <div>
            <div class="muted" style="font-weight:900; letter-spacing:.08em; font-size:12px;">DECISION</div>
            <h3 class="decision-title">${escapeHTML(d.question || "(No question)")}</h3>
          </div>
          <div class="badges">
            ${badges.join("")}
          </div>
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
          <button class="btn ghost" data-action="review" data-id="${d.id}" ${d.reviewed ? "disabled" : ""}>
            ${reviewBtnLabel}
          </button>
          <button class="btn ghost" data-action="delete" data-id="${d.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  mount.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (action === "review") {
        window.location.href = `review.html?id=${encodeURIComponent(id)}`;
        return;
      }

      const all = loadDecisions();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return;

      if (action === "delete") {
        all.splice(idx, 1);
        saveDecisions(all);
      }

      updateStats();
      renderDecisions();
      renderOverview();
    });
  });
}

// ---------- Form handling (dashboard) ----------
function wireForm() {
  const addBtn = $("addDecision");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const statusVal = $("status")?.value || "";

      const d = {
        id: uid(),
        createdAt: Date.now(),
        reviewed: false,

        type: $("type")?.value || "",
        status: statusVal,
        impact: $("impact")?.value || "",

        question: $("question")?.value || "",
        recommendation: $("recommendation")?.value || "",
        confidence: $("confidence")?.value !== "" && $("confidence")?.value != null
          ? Number($("confidence").value)
          : null,
        reviewDate: $("reviewDate")?.value || "",

        reason: $("reason")?.value || "",

        runway: $("runway")?.value ? Number($("runway").value) : null,
        growth: $("growth")?.value ? Number($("growth").value) : null,
        ltv: $("ltv")?.value ? Number($("ltv").value) : null,
        guardrails: $("guardrails")?.value || "",
        guardrailsDefined: Boolean($("guardrailsDefined")?.checked),

        // Review fields (filled only on review.html)
        outcome: "",
        outcomeNotes: "",
        learning: ""
      };

      if (!d.question.trim()) {
        alert("Add a decision question.");
        return;
      }

      // Failure semantics:
      if (isIgnoredStatus(d.status)) {
        d.ignoredAt = Date.now();
        d.reviewed = false;
      }

      // Optional: treat Rejected as closed (no need for review loop)
      if (isRejectedStatus(d.status)) {
        d.reviewed = true;
        d.reviewedAt = Date.now();
        d.outcome = "As expected";
        d.learning = "Rejected decision (closed).";
      }

      const list = loadDecisions();
      list.push(d);
      saveDecisions(list);

      // reset minimal fields
      if ($("question")) $("question").value = "";
      if ($("recommendation")) $("recommendation").value = "";
      if ($("confidence")) $("confidence").value = "";
      if ($("reason")) $("reason").value = "";
      if ($("runway")) $("runway").value = "";
      if ($("growth")) $("growth").value = "";
      if ($("ltv")) $("ltv").value = "";
      if ($("guardrails")) $("guardrails").value = "";
      if ($("guardrailsDefined")) $("guardrailsDefined").checked = false;

      if ($("reviewDate")) $("reviewDate").value = todayISO();

      updateStats();
      renderDecisions();
      renderOverview();
    });
  }

  const clearBtn = $("clearAll");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (!confirm("Clear all decisions?")) return;
      saveDecisions([]);
      updateStats();
      renderDecisions();
      renderOverview();
    });
  }

  // defaults
  if ($("reviewDate") && !$("reviewDate").value) $("reviewDate").value = todayISO();

  // filter/search re-render
  ["filterStatus", "filterRisk", "search"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => renderDecisions());
    el.addEventListener("change", () => renderDecisions());
  });
}

// ---------- Overview page ----------
async function incrementTesterCount() {
  const el = $("testerCount");
  if (!el) return;

  const seenKey = "v432_seen";
  const already = localStorage.getItem(seenKey) === "1";
  const counterName = "fourlevelsai-v432-testers";

  try {
    let url;
    if (!already) {
      url = `https://api.countapi.xyz/hit/${counterName}/visitors`;
      localStorage.setItem(seenKey, "1");
    } else {
      url = `https://api.countapi.xyz/get/${counterName}/visitors`;
    }
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (typeof data.value === "number") el.textContent = String(data.value);
    else el.textContent = "—";
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
                <span class="badge">${escapeHTML(d.type || "—")}</span>
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
  badges.push(`<span class="badge">${escapeHTML(d.type || "—")}</span>`);
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

    list[idx].outcome = outcome;
    list[idx].outcomeNotes = outcomeNotes;
    list[idx].learning = learning;

    list[idx].reviewed = true;
    list[idx].reviewedAt = Date.now();

    saveDecisions(list);

    window.location.href = "index.html";
  });
}

// ---------- Boot ----------
(function init() {
  initTheme();

  updateStats();
  wireForm();
  renderDecisions();
  renderOverview();
  renderReviewPage();
  incrementTesterCount();
})();


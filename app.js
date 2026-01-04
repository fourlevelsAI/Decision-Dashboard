 /* V.4.3.2 – app.js (shared by index.html + overview.html) */

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

function computeHighRisk(d) {
  const conf = Number(d.confidence ?? 0);
  const impactHigh = (d.impact || "").toLowerCase() === "high";
  const noGuardrails = impactHigh && (!d.guardrails || String(d.guardrails).trim().length === 0);
  const lowConfidence = conf > 0 && conf < 60;
  return impactHigh || lowConfidence || noGuardrails;
}

function computeUpcoming(d) {
  const diff = daysBetween(todayISO(), d.reviewDate);
  return diff !== null && diff >= 0 && diff <= 14;
}

function avgConfidence(list) {
  const nums = list.map(x => Number(x.confidence)).filter(n => Number.isFinite(n) && n >= 0);
  if (!nums.length) return null;
  const sum = nums.reduce((a,b)=>a+b,0);
  return Math.round(sum / nums.length);
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
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
function updateStats() {
  const list = loadDecisions();

  const open = list.filter(d => !d.reviewed).length;
  const upcoming = list.filter(d => !d.reviewed && computeUpcoming(d)).length;
  const risk = list.filter(d => !d.reviewed && computeHighRisk(d)).length;
  const avg = avgConfidence(list);

  if ($("stat-open")) $("stat-open").textContent = String(open);
  if ($("stat-upcoming")) $("stat-upcoming").textContent = String(upcoming);
  if ($("stat-risk")) $("stat-risk").textContent = String(risk);
  if ($("stat-avg")) $("stat-avg").textContent = avg === null ? "—" : `${avg}%`;
}

// ---------- Render decisions list (dashboard) ----------
function renderDecisions() {
  const mount = $("decisions");
  if (!mount) return;

  const list = loadDecisions();

  const filterStatus = $("filterStatus")?.value || "All statuses";
  const filterRisk = $("filterRisk")?.value || "All risk";
  const q = ($("search")?.value || "").toLowerCase().trim();

  let filtered = [...list].sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));

  if (filterStatus !== "All statuses") {
    filtered = filtered.filter(d => d.status === filterStatus);
  }

  if (filterRisk === "High") {
    filtered = filtered.filter(d => computeHighRisk(d));
  }

  if (q) {
    filtered = filtered.filter(d => {
      const blob = [
        d.type, d.status, d.impact, d.question, d.recommendation, d.reason,
        d.guardrails, d.reviewDate
      ].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  if (!filtered.length) {
    mount.innerHTML = `<p class="empty">No decisions match your filters.</p>`;
    return;
  }

  mount.innerHTML = filtered.map(d => {
    const risk = computeHighRisk(d);
    const conf = Number(d.confidence ?? 0);
    const tag = risk ? `<span class="badge risk">RISK</span>` : `<span class="badge ok">OK</span>`;

    const runway = d.runway ? `Runway: ${d.runway}m` : "";
    const growth = (d.growth || d.growth === 0) ? `MoM: ${d.growth}%` : "";
    const ltv = (d.ltv || d.ltv === 0) ? `LTV/CAC: ${d.ltv}` : "";
    const guards = d.guardrails ? `Guardrails: ${d.guardrails}` : "";
    const meta = [runway, growth, ltv, guards].filter(Boolean).join(" · ");

    return `
      <div class="decision">
        <div class="decision-top">
          <div>
            <div class="muted" style="font-weight:900; letter-spacing:.08em; font-size:12px;">DECISION</div>
            <h3 class="decision-title">${escapeHTML(d.question || "(No question)")}</h3>
          </div>
          <div class="badges">
            <span class="badge">${escapeHTML(d.type || "—")}</span>
            <span class="badge">${escapeHTML(d.status || "—")}</span>
            <span class="badge">Impact: ${escapeHTML(d.impact || "—")}</span>
            ${tag}
          </div>
        </div>

        <div class="decision-grid">
          <div class="k">
            <div class="klabel">RECOMMENDATION</div>
            <div class="kvalue">${escapeHTML(d.recommendation || "—")}</div>
          </div>
          <div class="k">
            <div class="klabel">CONFIDENCE</div>
            <div class="kvalue">${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</div>
          </div>
        </div>

        <div class="decision-meta">
          <span><b>Reason:</b> ${escapeHTML(d.reason || "—")}</span>
          ${d.reviewDate ? `<span><b>Review:</b> ${escapeHTML(d.reviewDate)}</span>` : ""}
          ${meta ? `<span>${escapeHTML(meta)}</span>` : ""}
        </div>

        <div class="decision-actions">
          <button class="btn ghost" data-action="review" data-id="${d.id}">${d.reviewed ? "Reviewed" : "Mark reviewed"}</button>
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

      const all = loadDecisions();
      const idx = all.findIndex(x => x.id === id);
      if (idx === -1) return;

      if (action === "delete") {
        all.splice(idx, 1);
        saveDecisions(all);
      }

      if (action === "review") {
        all[idx].reviewed = true;
        all[idx].reviewedAt = Date.now();
        saveDecisions(all);
      }

      updateStats();
      renderDecisions();
      renderOverview(); // in case we're on overview page
    });
  });
}

// ---------- Form handling (dashboard) ----------
function wireForm() {
  const addBtn = $("addDecision");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const d = {
        id: uid(),
        createdAt: Date.now(),
        reviewed: false,

        type: $("type")?.value || "",
        status: $("status")?.value || "",
        impact: $("impact")?.value || "",

        question: $("question")?.value || "",
        recommendation: $("recommendation")?.value || "",
        confidence: $("confidence")?.value ? Number($("confidence").value) : null,
        reviewDate: $("reviewDate")?.value || "",

        reason: $("reason")?.value || "",

        runway: $("runway")?.value ? Number($("runway").value) : null,
        growth: $("growth")?.value ? Number($("growth").value) : null,
        ltv: $("ltv")?.value ? Number($("ltv").value) : null,
        guardrails: $("guardrails")?.value || ""
      };

      if (!d.question.trim()) {
        alert("Add a decision question.");
        return;
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
  ["filterStatus","filterRisk","search"].forEach(id => {
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

  // Count “unique browsers” roughly: only increment once per browser via local flag.
  const seenKey = "v432_seen";
  const already = localStorage.getItem(seenKey) === "1";

  // Public counter API (no backend needed). Namespace it to your product.
  // If the API fails, we just show "—".
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
  // Only runs if elements exist (overview page)
  const totalEl = $("ov-total");
  const openEl = $("ov-open");
  const dueEl = $("ov-due");
  const recentMount = $("ov-recent");

  if (!totalEl && !openEl && !dueEl && !recentMount) return;

  const list = loadDecisions();
  const total = list.length;
  const open = list.filter(d => !d.reviewed).length;
  const due = list.filter(d => !d.reviewed && computeUpcoming(d)).length;

  if (totalEl) totalEl.textContent = String(total);
  if (openEl) openEl.textContent = String(open);
  if (dueEl) dueEl.textContent = String(due);

  if (recentMount) {
    const recent = [...list].sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)).slice(0,5);
    if (!recent.length) {
      recentMount.innerHTML = `<p class="empty">No decisions yet. Go to Dashboard and add one.</p>`;
    } else {
      recentMount.innerHTML = recent.map(d => {
        const risk = computeHighRisk(d);
        const conf = Number(d.confidence ?? 0);
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
                ${risk ? `<span class="badge risk">RISK</span>` : `<span class="badge ok">OK</span>`}
              </div>
            </div>
            <div class="decision-meta">
              <span><b>Confidence:</b> ${Number.isFinite(conf) && conf >= 0 ? `${conf}%` : "—"}</span>
              ${d.reviewDate ? `<span><b>Review:</b> ${escapeHTML(d.reviewDate)}</span>` : ""}
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

// ---------- Escape ----------
function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---------- Boot ----------
(function init() {
  initTheme();
  updateStats();
  wireForm();
  renderDecisions();
  renderOverview();
  incrementTesterCount(); // only shows on overview page
})();


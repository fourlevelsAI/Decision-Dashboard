 // app.js

const STORAGE_KEY = "decisions_v1";

let decisions = load();

// Elements
const qEl = document.getElementById("q");
const recEl = document.getElementById("rec");
const confEl = document.getElementById("conf");
const whyEl = document.getElementById("why");
const tagEl = document.getElementById("tag");

const addBtn = document.getElementById("add");
const clearBtn = document.getElementById("clear");

const listEl = document.getElementById("decisions");

const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");

const mTotalEl = document.getElementById("m-total");
const mAvgEl = document.getElementById("m-avg");

const exportBtn = document.getElementById("export");
const importBtn = document.getElementById("import-btn");
const importFileEl = document.getElementById("import");

// Init
render();

addBtn.addEventListener("click", onAdd);
clearBtn.addEventListener("click", onClearAll);

searchEl.addEventListener("input", render);
sortEl.addEventListener("change", render);

exportBtn.addEventListener("click", onExport);
importBtn.addEventListener("click", () => importFileEl.click());
importFileEl.addEventListener("change", onImportFile);

listEl.addEventListener("click", onListClick);

function onAdd() {
  const q = qEl.value.trim();
  const rec = recEl.value.trim();
  const why = whyEl.value.trim();
  const tag = tagEl.value.trim();

  const confRaw = confEl.value.trim();
  const conf = confRaw === "" ? null : clampInt(confRaw, 0, 100);

  if (!q) return alert("Add a decision question.");
  if (!rec) return alert("Add a recommendation.");
  if (conf === null) return alert("Add confidence (0–100).");
  if (!why) return alert("Add a reason (what data supports this?).");

  const item = {
    id: cryptoId(),
    q,
    rec,
    conf,
    why,
    tag,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  decisions.unshift(item);
  save();
  resetForm();
  render();
}

function onClearAll() {
  if (!decisions.length) return;
  const ok = confirm("Clear all decisions? This cannot be undone.");
  if (!ok) return;
  decisions = [];
  save();
  render();
}

function onListClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  const action = btn.dataset.action;

  if (action === "delete") {
    const ok = confirm("Delete this decision?");
    if (!ok) return;
    decisions = decisions.filter((d) => d.id !== id);
    save();
    render();
    return;
  }

  if (action === "edit") {
    startInlineEdit(id);
    return;
  }

  if (action === "cancelEdit") {
    render();
    return;
  }

  if (action === "saveEdit") {
    saveInlineEdit(id);
    return;
  }
}

function startInlineEdit(id) {
  const card = document.querySelector(`[data-card="${id}"]`);
  if (!card) return;

  const d = decisions.find((x) => x.id === id);
  if (!d) return;

  card.innerHTML = `
    <h3>Edit decision</h3>

    <div class="inline-grid">
      <div class="field">
        <label>Decision question</label>
        <input data-edit="q" type="text" value="${escapeHtml(d.q)}" />
      </div>

      <div class="field">
        <label>Recommendation</label>
        <input data-edit="rec" type="text" value="${escapeHtml(d.rec)}" />
      </div>

      <div class="field">
        <label>Confidence (0–100)</label>
        <input data-edit="conf" type="number" min="0" max="100" value="${d.conf}" />
      </div>

      <div class="field">
        <label>Tag (optional)</label>
        <input data-edit="tag" type="text" value="${escapeHtml(d.tag || "")}" />
      </div>

      <div class="field field-wide">
        <label>Reason</label>
        <textarea data-edit="why" rows="3">${escapeHtml(d.why)}</textarea>
      </div>
    </div>

    <div class="card-actions">
      <button class="btn btn-ghost" data-action="cancelEdit" data-id="${id}">Cancel</button>
      <button class="btn btn-primary" data-action="saveEdit" data-id="${id}">Save</button>
    </div>
  `;
}

function saveInlineEdit(id) {
  const card = document.querySelector(`[data-card="${id}"]`);
  if (!card) return;

  const q = card.querySelector(`[data-edit="q"]`)?.value.trim();
  const rec = card.querySelector(`[data-edit="rec"]`)?.value.trim();
  const why = card.querySelector(`[data-edit="why"]`)?.value.trim();
  const tag = card.querySelector(`[data-edit="tag"]`)?.value.trim();
  const confRaw = card.querySelector(`[data-edit="conf"]`)?.value.trim();
  const conf = confRaw === "" ? null : clampInt(confRaw, 0, 100);

  if (!q) return alert("Decision question is required.");
  if (!rec) return alert("Recommendation is required.");
  if (conf === null) return alert("Confidence is required (0–100).");
  if (!why) return alert("Reason is required.");

  const idx = decisions.findIndex((x) => x.id === id);
  if (idx === -1) return;

  decisions[idx] = {
    ...decisions[idx],
    q,
    rec,
    conf,
    why,
    tag,
    updatedAt: new Date().toISOString(),
  };

  save();
  render();
}

function onExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    decisions,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `decision-dashboard-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    const incoming = Array.isArray(parsed?.decisions) ? parsed.decisions : null;
    if (!incoming) throw new Error("Invalid file. Expected { decisions: [...] }.");

    const ok = confirm("Import will REPLACE your current decisions. Continue?");
    if (!ok) return;

    // Basic sanitize
    decisions = incoming
      .filter(Boolean)
      .map((d) => ({
        id: String(d.id || cryptoId()),
        q: String(d.q || "").trim(),
        rec: String(d.rec || "").trim(),
        conf: clampInt(d.conf ?? 0, 0, 100),
        why: String(d.why || "").trim(),
        tag: String(d.tag || "").trim(),
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      }))
      .filter((d) => d.q && d.rec && d.why);

    save();
    render();
  } catch (err) {
    alert(`Import failed: ${err.message || err}`);
  } finally {
    importFileEl.value = "";
  }
}

function render() {
  // filter + sort
  const query = (searchEl.value || "").trim().toLowerCase();
  const sortMode = sortEl.value;

  let items = [...decisions];

  if (query) {
    items = items.filter((d) => {
      const hay = `${d.q} ${d.rec} ${d.why} ${d.tag || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }

  items.sort((a, b) => {
    if (sortMode === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortMode === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortMode === "conf_high") return (b.conf ?? 0) - (a.conf ?? 0);
    if (sortMode === "conf_low") return (a.conf ?? 0) - (b.conf ?? 0);
    return 0;
  });

  // metrics (based on all decisions, not filtered)
  mTotalEl.textContent = String(decisions.length);
  if (!decisions.length) {
    mAvgEl.textContent = "—";
  } else {
    const avg = Math.round(decisions.reduce((sum, d) => sum + (d.conf ?? 0), 0) / decisions.length);
    mAvgEl.textContent = `${avg}%`;
  }

  // list
  if (!items.length) {
    listEl.innerHTML = `
      <section class="card">
        <p style="margin:0;color:var(--muted);">No decisions yet. Add one above.</p>
      </section>
    `;
    return;
  }

  listEl.innerHTML = items.map(renderCard).join("");
}

function renderCard(d) {
  const created = new Date(d.createdAt);
  const dateLabel = isFinite(created) ? created.toLocaleString() : "";

  const tag = d.tag ? `<span class="badge">Tag: ${escapeHtml(d.tag)}</span>` : "";
  const confBadge = `<span class="badge">Confidence: ${escapeHtml(String(d.conf))}%</span>`;

  return `
    <section class="card decision-card" data-card="${d.id}">
      <h3>Decision</h3>
      <div class="value">${escapeHtml(d.q)}</div>

      <div class="meta">
        ${confBadge}
        ${tag}
        <span class="badge">Created: ${escapeHtml(dateLabel)}</span>
      </div>

      <div class="section-label">Recommendation</div>
      <div class="value">${escapeHtml(d.rec)}</div>

      <div class="section-label">Reason</div>
      <div class="reason">Reason: ${escapeHtml(d.why)}</div>

      <div class="card-actions">
        <button class="btn btn-ghost" data-action="edit" data-id="${d.id}">Edit</button>
        <button class="btn btn-ghost" data-action="delete" data-id="${d.id}">Delete</button>
      </div>
    </section>
  `;
}

function resetForm() {
  qEl.value = "";
  recEl.value = "";
  confEl.value = "";
  whyEl.value = "";
  tagEl.value = "";
  qEl.focus();
}

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

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cryptoId() {
  // Safari supports crypto.getRandomValues; uuid may not be universal depending on version
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16)).join("-");
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


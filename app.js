// Simple MVP: stores decisions in localStorage and renders a list

const STORAGE_KEY = "decisions_v1";

function loadDecisions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveDecisions(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function priorityScore({ impact, effort, confidence }) {
  // simple: higher impact & confidence, lower effort
  return (impact * confidence) / Math.max(1, effort);
}

function render() {
  const list = document.querySelector("#list");
  const stats = document.querySelector("#stats");

  const items = loadDecisions()
    .map(d => ({ ...d, score: priorityScore(d) }))
    .sort((a, b) => b.score - a.score);

  stats.textContent = `Total: ${items.length}`;

  list.innerHTML = items
    .map(
      d => `
      <div class="row">
        <div>
          <div class="title">${escapeHtml(d.title)}</div>
          <div class="meta">Impact ${d.impact} • Effort ${d.effort} • Confidence ${d.confidence} • Score ${d.score.toFixed(2)}</div>
        </div>
        <button data-del="${d.id}">Delete</button>
      </div>
    `
    )
    .join("");

  list.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      const next = loadDecisions().filter(x => x.id !== id);
      saveDecisions(next);
      render();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function init() {
  const form = document.querySelector("#form");

  form.addEventListener("submit", e => {
    e.preventDefault();

    const title = form.title.value.trim();
    const impact = Number(form.impact.value);
    const effort = Number(form.effort.value);
    const confidence = Number(form.confidence.value);

    if (!title) return;

    const items = loadDecisions();
    items.push({ id: uid(), title, impact, effort, confidence, createdAt: Date.now() });
    saveDecisions(items);

    form.reset();
    form.impact.value = 5;
    form.effort.value = 5;
    form.confidence.value = 5;

    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);

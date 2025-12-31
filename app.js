const STORAGE_KEY = "decision_dashboard_v1";

// Inputs
const qEl = document.getElementById("q");
const recEl = document.getElementById("rec");
const confEl = document.getElementById("conf");
const whyEl = document.getElementById("why");

// Buttons / UI
const addBtn = document.getElementById("add");
const clearBtn = document.getElementById("clear");
const errorEl = document.getElementById("error");
const decisionsHost = document.getElementById("decisions");

// State
let decisions = loadDecisions();

// Seed (only if empty)
if (decisions.length === 0) {
  decisions = [
    {
      id: crypto.randomUUID(),
      question: "Hire a senior engineer this quarter?",
      recommendation: "Proceed cautiously",
      confidence: 68,
      reason: "Cash runway supports 6 months. Risk is manageable if revenue holds.",
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      question: "Increase marketing spend by 30%?",
      recommendation: "Yes, with guardrails",
      confidence: 74,
      reason: "CAC is stable and LTV justifies controlled scaling.",
      createdAt: Date.now(),
    },
  ];
  saveDecisions();
}

render();

// --- Events ---
addBtn.addEventListener("click", () => {
  errorEl.textContent = "";

  const question = (qEl.value || "").trim();
  const recommendation = (recEl.value || "").trim();
  const confidenceRaw = (confEl.value || "").trim();
  const reason = (whyEl.value || "").trim();

  const confidence = Number(confidenceRaw);

  if (!question) return fail("Enter a decision question.");
  if (!recommendation) return fail("Enter a recommendation.");
  if (confidenceRaw === "" || Number.isNaN(confidence)) return fail("Enter a confidence number (0–100).");
  if (confidence < 0 || confidence > 100) return fail("Confidence must be between 0 and 100.");
  if (!reason) return fail("Add a short reason.");

  decisions.unshift({
    id: crypto.randomUUID(),
    question,
    recommendation,
    confidence,
    reason,
    createdAt: Date.now(),
  });

  saveDecisions();
  render();
  clearForm();
});

clearBtn.addEventListener("click", () => {
  const ok = confirm("Clear all decisions? This cannot be undone.");
  if (!ok) return;
  decisions = [];
  saveDecisions();
  render();
});

// Enter-to-add (nice UX)
[qEl, recEl, confEl].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
});

// --- Functions ---
function render() {
  if (!decisionsHost) return;

  if (decisions.length === 0) {
    decisionsHost.innerHTML = `
      <section class="card">
        <p class="reason">No decisions yet. Add one above.</p>
      </section>
    `;
    return;
  }

  decisionsHost.innerHTML = decisions
    .map((d) => {
      return `
        <section class="card" data-id="${d.id}">
          <div class="decision-row">
            <div>
              <h3 class="decision-title">Decision</h3>
              <p class="decision-question">${escapeHtml(d.question)}</p>
            </div>

            <div class="small-actions">
              <span class="badge">Confidence: <strong>${d.confidence}%</strong></span>
              <button class="link-btn" data-action="delete">Delete</button>
            </div>
          </div>

          <h4>Recommendation</h4>
          <p>${escapeHtml(d.recommendation)}</p>

          <h4>Reason</h4>
          <p class="reason">${escapeHtml(d.reason)}</p>
        </section>
      `;
    })
    .join("");

  // Wire delete buttons after render
  decisionsHost.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      const id = card?.getAttribute("data-id");
      if (!id) return;

      decisions = decisions.filter((x) => x.id !== id);
      saveDecisions();
      render();
    });
  });
}

function clearForm() {
  qEl.value = "";
  recEl.value = "";
  confEl.value = "";
  whyEl.value = "";
  qEl.focus();
}

function fail(msg) {
  errorEl.textContent = msg;
}

function loadDecisions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveDecisions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

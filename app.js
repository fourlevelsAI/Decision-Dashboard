// Simple MVP: store one decision object and render it into the page.
// Later, we can replace this with real inputs + multiple decisions + charts.

const decision = {
  text: "Hire a senior engineer this quarter?",
  recommendation: "Proceed cautiously",
  confidence: "68%",
  reason: "Cash runway supports 6 months. Risk is manageable if revenue holds."
};

function renderDecision(d) {
  const decisionTextEl = document.getElementById("decision-text");
  const recommendationEl = document.getElementById("recommendation");
  const confidenceEl = document.getElementById("confidence");
  const reasonEl = document.getElementById("reason");

  if (!decisionTextEl || !recommendationEl || !confidenceEl || !reasonEl) {
    console.warn("Missing DOM elements. Check index.html IDs.");
    return;
  }

  decisionTextEl.textContent = d.text;
  recommendationEl.textContent = d.recommendation;
  confidenceEl.textContent = d.confidence;
  reasonEl.textContent = `Reason: ${d.reason}`;
}

// Render when DOM is ready (safe even if script is at bottom)
document.addEventListener("DOMContentLoaded", () => {
  renderDecision(decision);
});

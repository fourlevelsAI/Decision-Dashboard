const decisions = [
  {
    question: "Hire a senior engineer this quarter?",
    recommendation: "Proceed cautiously",
    confidence: 68,
    reason: "Cash runway supports 6 months. Risk is manageable if revenue holds."
  },
  {
    question: "Increase marketing spend by 30%?",
    recommendation: "Yes, with guardrails",
    confidence: 74,
    reason: "CAC is stable and LTV justifies controlled scaling."
  }
];

const container = document.getElementById("decisions");

decisions.forEach((d) => {
  const card = document.createElement("section");
  card.className = "card";

  card.innerHTML = `
    <h3>Decision</h3>
    <p>${d.question}</p>

    <h4>Recommendation</h4>
    <p>${d.recommendation}</p>

    <h4>Confidence</h4>
    <p>${d.confidence}%</p>

    <p class="reason">Reason: ${d.reason}</p>
  `;

  container.appendChild(card);
});

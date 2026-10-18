(() => {
  "use strict";

  const toggle = document.getElementById("billing-toggle");
  const labelMonthly = document.getElementById("label-monthly");
  const labelYearly = document.getElementById("label-yearly");
  const cards = document.querySelectorAll(".card");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let yearly = false;

  /** Smoothly count a number from its current value to a target. */
  function animateNumber(el, to) {
    const from = Number(el.textContent) || 0;
    if (reduceMotion || from === to) {
      el.textContent = to;
      return;
    }
    const duration = 450;
    const start = performance.now();

    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function render() {
    toggle.setAttribute("aria-checked", String(yearly));
    labelMonthly.classList.toggle("is-active", !yearly);
    labelYearly.classList.toggle("is-active", yearly);

    cards.forEach((card) => {
      const price = yearly ? Number(card.dataset.yearly) : Number(card.dataset.monthly);
      animateNumber(card.querySelector("[data-price]"), price);
      card.querySelector("[data-period]").textContent = "/ month";
      card.querySelector("[data-note]").textContent = yearly
        ? `Billed $${card.dataset.total} yearly`
        : "Billed monthly";
    });
  }

  toggle.addEventListener("click", () => {
    yearly = !yearly;
    render();
  });

  // Clicking the text labels also sets the cycle
  labelMonthly.addEventListener("click", () => { yearly = false; render(); });
  labelYearly.addEventListener("click", () => { yearly = true; render(); });

  render();
})();

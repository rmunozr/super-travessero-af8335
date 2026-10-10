
/*
  DFL Liquid Glass interaction runtime.
  No external dependencies, no content mutation, no routing/form/chatbot changes.
*/
(() => {
  "use strict";

  const SELECTOR = [
    ".card",
    ".button",
    ".skill-chip",
    ".modal-content",
    ".hero-image"
  ].join(",");

  const surfaces = Array.from(document.querySelectorAll(SELECTOR));
  surfaces.forEach((el) => el.classList.add("liquid-glass-surface"));

  const finePointer = window.matchMedia("(pointer:fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (finePointer) {
    const updateSpecular = (el, ev) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100));
      el.style.setProperty("--dfl-glass-x", x.toFixed(1) + "%");
      el.style.setProperty("--dfl-glass-y", y.toFixed(1) + "%");
    };

    surfaces.forEach((el) => {
      el.addEventListener("pointermove", (ev) => updateSpecular(el, ev), {passive:true});
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--dfl-glass-x", "50%");
        el.style.setProperty("--dfl-glass-y", "20%");
      }, {passive:true});
    });
  }

  /* Small parallax only on the logo lens. It does not move page geometry. */
  if (finePointer && !reducedMotion) {
    const hero = document.querySelector(".hero-image");
    if (hero) {
      hero.addEventListener("pointermove", (ev) => {
        const r = hero.getBoundingClientRect();
        const nx = ((ev.clientX - r.left) / r.width) - .5;
        const ny = ((ev.clientY - r.top) / r.height) - .5;
        hero.style.transform =
          "perspective(900px) rotateX(" + (-ny * 2.6).toFixed(2) +
          "deg) rotateY(" + (nx * 2.6).toFixed(2) + "deg) scale(1.012)";
      }, {passive:true});

      hero.addEventListener("pointerleave", () => {
        hero.style.transform = "";
      }, {passive:true});
    }
  }

  document.documentElement.classList.add("dfl-liquid-glass-ready");
})();


/*
  DFL Liquid Glass runtime.
  Layer 1: local CSS fallback / material system.
  Layer 2: pinned optical refraction engine on compact functional surfaces.
  The original site content, navigation, forms, chatbot and section structure
  remain untouched.
*/
(() => {
  "use strict";

  const MATERIAL_SELECTOR = [
    ".card",
    ".button",
    ".skill-chip",
    ".modal-content",
    ".hero-image"
  ].join(",");

  const surfaces = Array.from(document.querySelectorAll(MATERIAL_SELECTOR));
  surfaces.forEach((el) => el.classList.add("liquid-glass-surface"));

  const finePointer = window.matchMedia("(pointer:fine)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Pointer-tracked specular response.
     Pure enhancement: does not change layout or content. */
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
      el.addEventListener("pointermove", (ev) => updateSpecular(el, ev), { passive: true });
      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--dfl-glass-x", "50%");
        el.style.setProperty("--dfl-glass-y", "20%");
      }, { passive: true });
    });
  }

  /* Subtle physical response only for the existing DFL hero image. */
  if (finePointer && !reducedMotion) {
    const hero = document.querySelector(".hero-image");
    if (hero) {
      hero.addEventListener("pointermove", (ev) => {
        const r = hero.getBoundingClientRect();
        const nx = ((ev.clientX - r.left) / r.width) - 0.5;
        const ny = ((ev.clientY - r.top) / r.height) - 0.5;
        hero.style.transform =
          "perspective(900px) rotateX(" + (-ny * 2.4).toFixed(2) +
          "deg) rotateY(" + (nx * 2.4).toFixed(2) + "deg) scale(1.01)";
      }, { passive: true });
      hero.addEventListener("pointerleave", () => {
        hero.style.transform = "";
      }, { passive: true });
    }
  }

  /*
    True optical refraction.
    Deliberately limited to the functional/top layer (navigation + buttons).
    We do NOT put expensive displacement filters on every content card.
    The pinned library automatically falls back to CSS blur/saturate on
    unsupported engines.
  */
  const LG = window.LiquidGlass;
  const controllers = [];

  if (LG && typeof LG.create === "function") {
    try {
      const nav = document.querySelector(".navbar");
      if (nav) {
        controllers.push(LG.create(nav, {
          surface: "lens",
          bezel: 22,
          thickness: 20,
          scale: 0.52,
          blur: 4,
          smooth: 0.18,
          saturate: 1.18,
          tint: 0.025,
          dispersion: 0.025,
          specular: {
            angle: 72,
            saturation: 4,
            opacity: 0.30,
            width: 1.25,
            ambient: 0.08,
            glow: 0.10,
            innerOpacity: 0.08
          },
          fallback: "blur(26px) saturate(1.65)",
          supportedClass: "dfl-refraction-on",
          fallbackClass: "dfl-refraction-fallback"
        }));
      }

      document.querySelectorAll(".button").forEach((button) => {
        controllers.push(LG.create(button, {
          surface: "convex-squircle",
          bezel: 18,
          thickness: 16,
          scale: 0.68,
          blur: 3,
          smooth: 0.16,
          saturate: 1.20,
          tint: 0.02,
          dispersion: 0.035,
          specular: {
            angle: 66,
            saturation: 4.5,
            opacity: 0.34,
            width: 1.2,
            ambient: 0.08,
            glow: 0.10,
            innerOpacity: 0.08
          },
          fallback: "blur(18px) saturate(1.55)",
          supportedClass: "dfl-refraction-on",
          fallbackClass: "dfl-refraction-fallback"
        }));
      });
    } catch (err) {
      console.warn("[DFL Liquid Glass] optical layer unavailable; CSS fallback remains active.", err);
    }
  }

  /* Keep controller references alive and inspectable without exposing app state. */
  Object.defineProperty(window, "__DFL_LIQUID_GLASS__", {
    value: Object.freeze({
      version: "industry-v1",
      opticalControllers: controllers
    }),
    configurable: false,
    enumerable: false,
    writable: false
  });

  document.documentElement.classList.add("dfl-liquid-glass-ready");
})();

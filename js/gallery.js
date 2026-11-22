// Arrows for the photo gallery on property pages (swipe works on phones by itself).
function dnGallery(root) {
  const g = (root || document).querySelector(".gallery:not(.empty)");
  if (!g) return;
  const imgs = g.querySelectorAll("img");
  const counter = document.querySelector(".swipe");
  if (imgs.length < 2) return;
  const hero = g.closest(".hero");
  const idx = () => Math.round(Math.abs(g.scrollLeft) / g.clientWidth);
  const go = i => {
    i = (i + imgs.length) % imgs.length;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("a11y-stop");
    g.scrollTo({ left: -i * g.clientWidth, behavior: still ? "auto" : "smooth" }); // RTL: later photos are to the left
  };
  const btn = (cls, label, d) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "gnav " + cls; b.setAttribute("aria-label", label);
    b.innerHTML = d === 1 ? "&#8249;" : "&#8250;";
    b.addEventListener("click", () => go(idx() + d));
    hero.appendChild(b);
  };
  btn("next", "לתמונה הבאה", 1);
  btn("prev", "לתמונה הקודמת", -1);
  const update = () => { if (counter) counter.textContent = `${idx() + 1} / ${imgs.length}`; };
  g.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  document.addEventListener("keydown", e => {
    const t = e.target;
    if (t.closest && t.closest("input, textarea, select, [contenteditable], .a11y-panel")) return;
    if (e.key === "ArrowLeft") go(idx() + 1);
    if (e.key === "ArrowRight") go(idx() - 1);
  });
  update();
}

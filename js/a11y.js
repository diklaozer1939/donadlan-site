// Accessibility menu: text size, high contrast, underlined links, readable font, stop animations.
// The choice is kept in this browser only (localStorage), nothing is sent anywhere.
(function () {
  const KEY = "dn-a11y";
  const root = document.documentElement;
  const OPTS = [
    { id: "contrast", label: "ניגודיות גבוהה" },
    { id: "links", label: "הדגשת קישורים" },
    { id: "font", label: "גופן קריא" },
    { id: "stop", label: "עצירת אנימציות" },
  ];
  let state = { text: 0 };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) {}

  function apply() {
    root.classList.remove("a11y-text-1", "a11y-text-2");
    if (state.text > 0) root.classList.add("a11y-text-" + state.text);
    OPTS.forEach(o => root.classList.toggle("a11y-" + o.id, !!state[o.id]));
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  }
  apply();

  function build() {
    const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="4" r="2.2"/><path d="M4.5 7.6l5.2 1.2v3.8L7.3 21a1.2 1.2 0 0 0 2.3.7L12 15l2.4 6.7a1.2 1.2 0 0 0 2.3-.7l-2.4-8.4V8.8l5.2-1.2a1.1 1.1 0 0 0-.5-2.2L12 7 5 5.4a1.1 1.1 0 0 0-.5 2.2z"/></svg>';
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "a11y-btn";
    btn.setAttribute("aria-label", "תפריט נגישות");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "a11y-panel");
    btn.innerHTML = icon;

    const panel = document.createElement("div");
    panel.className = "a11y-panel";
    panel.id = "a11y-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "a11y-title");
    panel.hidden = true;
    panel.innerHTML = `
      <h2 id="a11y-title">נגישות</h2>
      <button type="button" class="a11y-close" aria-label="סגירת תפריט הנגישות">×</button>
      <ul>
        <li><button type="button" data-text="1">הגדלת טקסט</button></li>
        <li><button type="button" data-text="-1">הקטנת טקסט</button></li>
        ${OPTS.map(o => `<li><button type="button" data-opt="${o.id}" aria-pressed="false">${o.label}</button></li>`).join("")}
        <li><button type="button" class="a11y-reset" data-reset="1">איפוס הגדרות</button></li>
      </ul>
      <p class="sr-only" aria-live="polite" id="a11y-status"></p>
      <a href="/accessibility/">הצהרת נגישות</a>`;

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    if (document.querySelector(".sticky-wa")) document.body.classList.add("has-sticky");

    const status = panel.querySelector("#a11y-status");
    const sync = () => panel.querySelectorAll("[data-opt]").forEach(b => b.setAttribute("aria-pressed", String(!!state[b.dataset.opt])));
    sync();

    const open = () => { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); panel.querySelector("[data-text]").focus(); };
    const close = (focusBtn) => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); if (focusBtn) btn.focus(); };
    btn.addEventListener("click", () => (panel.hidden ? open() : close(true)));
    panel.querySelector(".a11y-close").addEventListener("click", () => close(true));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) close(true); });
    document.addEventListener("click", e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) close(false); });

    panel.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b || b.classList.contains("a11y-close")) return;
      if (b.dataset.text) {
        state.text = Math.max(0, Math.min(2, state.text + Number(b.dataset.text)));
        status.textContent = ["גודל טקסט רגיל", "טקסט מוגדל", "טקסט מוגדל מאוד"][state.text];
      } else if (b.dataset.opt) {
        state[b.dataset.opt] = !state[b.dataset.opt];
        status.textContent = b.textContent.trim() + (state[b.dataset.opt] ? " הופעל" : " בוטל");
      } else if (b.dataset.reset) {
        state = { text: 0 };
        status.textContent = "ההגדרות אופסו";
      }
      apply();
      sync();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();

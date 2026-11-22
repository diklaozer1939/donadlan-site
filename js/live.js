// Reads the listings straight from the Google Sheet, so a new row shows on the site right away.
// The ids match scripts/build.mjs, which later adds the full static page (photos + Facebook preview).
(function () {
  const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSoWGeFXmnMHRdnt4sISqdjkbRIPvYDV0vaq-Df3z4oAhW30ox0u8e-dgt0jwFmfBAa1laWnlmTWb7R/pub?single=true&output=csv&gid=";
  const GID_PROPS = "1893179336";
  const GID_REVIEWS = "1223992990";
  const SITE = "https://donadlan.co.il";
  const WA = "972558836333";
  const PHONE = "055-8836333";

  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
      else if (c !== "\r") f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const clean = s => String(s == null ? "" : s).trim();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function sheet(gid) {
    const r = await fetch(SHEET + gid + "&t=" + Date.now());
    if (!r.ok) throw new Error(r.status);
    return parseCSV(await r.text()).slice(1).filter(r => r.some(c => clean(c)));
  }
  async function json(file) {
    const r = await fetch(file + "?t=" + Date.now());
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function sha1(s) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function kind(st) {
    if (st.includes("נמכר") || st.includes("הושכר")) return "closed";
    if (st.includes("השכר")) return "rent";
    if (st.includes("מכיר")) return "sale";
    return "other";
  }
  function parseDate(s) {
    const m = clean(s).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (m) return new Date(+(m[3].length === 2 ? "20" + m[3] : m[3]), m[2] - 1, +m[1]).getTime();
    const t = Date.parse(s); return isNaN(t) ? 0 : t;
  }

  async function toListing(r, i) {
    const [status, city, hood, street, rooms, floor, sqm, balcony, parking, elevator, mamad, storage, desc, photoCell, date] =
      Array.from({ length: 15 }, (_, k) => clean(r[k]));
    const k = kind(status);
    if (k === "other") return null;
    const feat = [];
    if (balcony !== "אין") feat.push("מרפסת");
    if (mamad !== "אין") feat.push('ממ"ד');
    if (storage !== "אין") feat.push("מחסן");
    if (elevator === "יש") feat.push("מעלית");
    const pk = parking === "" ? "1" : parking;
    if (pk === "1") feat.push("חניה"); else if (pk !== "0") feat.push(`${pk} חניות`);
    const key = `${city}|${street}|${floor}|${rooms}`;
    let h = 5381;
    for (let j = 0; j < key.length; j++) h = (h * 33 + key.charCodeAt(j)) % 2147483647;
    const id = h.toString(36);
    const oldId = (await sha1(key)).slice(0, 6);
    const title = (rooms ? `${rooms} חדרים${street ? ` ברחוב ${street}` : ""}` : (street ? `רחוב ${street}` : "")) + (city ? (rooms || street ? `, ${city}` : city) : "");
    const folder = (photoCell.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([\w-]{10,})/) || [])[1] || "";
    return { id, oldId, kind: k, status, city, hood, street, rooms, floor, sqm, features: feat, desc, photos: [], folder, date, order: i, title: title || city };
  }

  // Live rows from the sheet, with photos taken from the last build where it has them.
  async function loadListings() {
    const builtP = json("/data/listings.json").catch(() => []);
    let rows;
    try { rows = await sheet(GID_PROPS); } catch (e) { return builtP; }
    let list = (await Promise.all(rows.map(toListing))).filter(Boolean);
    const seen = new Map();
    for (const l of list) { const n = (seen.get(l.id) || 0) + 1; seen.set(l.id, n); if (n > 1) { l.id += "-" + n; l.oldId += "-" + n; } }
    list.sort((a, b) => (a.kind === "closed") - (b.kind === "closed") || parseDate(b.date) - parseDate(a.date) || b.order - a.order);
    const built = new Map((await builtP).map(b => [b.id, b]));
    return list.map(({ order, ...l }) => {
      const b = built.get(l.id);
      return { ...l, photos: b ? b.photos : [], built: !!b };
    });
  }
  async function loadReviews() {
    try {
      return (await sheet(GID_REVIEWS)).map(r => {
        const [name, city, hood, type, text, date] = r.map(clean);
        return { name, city, hood, type, text, date };
      }).filter(r => r.text);
    } catch (e) { return json("/data/reviews.json"); }
  }

  const pageUrl = l => `${SITE}/n/${l.id}/`;
  const waLink = text => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
  const factsList = l => [l.sqm && `${l.sqm} מ"ר`, l.floor && `קומה ${l.floor}`, ...l.features].filter(Boolean);
  const waText = l => l.kind === "closed"
    ? `היי דקלה, ראיתי באתר שמכרת/השכרת דירה ב${l.city}. יש לי דירה דומה ואשמח לשמוע ממך`
    : `היי דקלה, ראיתי באתר את הנכס: ${l.title} (${l.status}). אשמח לפרטים ${pageUrl(l)}`;
  function postText(l) {
    return [
      `${l.status} | ${l.title}`,
      [l.hood, l.city].filter(Boolean).join(", "),
      factsList(l).join(" · "),
      l.desc,
      "",
      `לתמונות ופרטים: ${pageUrl(l)}`,
      `דקלה עוזר, דו נדל"ן · ${PHONE}`,
    ].filter((x, i) => x !== "" || i === 4).join("\n");
  }

  // Same markup as the static page that scripts/build.mjs writes, for listings it has not built yet.
  function renderProperty(l, others) {
    const closed = l.kind === "closed";
    const loc = [l.hood, l.city].filter(Boolean).join(", ");
    const label = closed ? "יש לכם דירה דומה? דברו איתי" : "לפרטים ומחיר בוואטסאפ";
    let gallery;
    if (l.photos.length) {
      gallery = `<div class="gallery">${l.photos.map((p, i) => `<img referrerpolicy="no-referrer" src="${esc(p)}" alt="${esc(l.title)}, תמונה ${i + 1}">`).join("")}</div>
        ${l.photos.length > 1 ? `<p class="swipe">${l.photos.length} תמונות · החליקו לצד</p>` : ""}`;
    } else if (l.folder) {
      gallery = `<iframe class="folder" src="https://drive.google.com/embeddedfolderview?id=${esc(l.folder)}#grid" title="תמונות הנכס" loading="lazy"></iframe>`;
    } else {
      gallery = `<div class="gallery empty"><div class="ph"><img src="/img/mono.png" alt=""><b>${esc(l.city)}</b>${l.hood ? `<small>${esc(l.hood)}</small>` : ""}</div></div>`;
    }
    const more = others.slice(0, 3).map(o => `<a class="mini" href="/n/${o.id}/">
      <span class="mini-pic">${o.photos[0] ? `<img referrerpolicy="no-referrer" src="${esc(o.photos[0].replace(/=w1600$/, "=w600"))}" alt="" loading="lazy">` : `<img class="mono" src="/img/mono.png" alt="">`}</span>
      <span class="mini-t"><b>${esc(o.title)}</b><small>${esc(o.status)}</small></span></a>`).join("");
    return `
  <section class="hero${closed ? " closed" : ""}">${gallery}${closed ? `<span class="ribbon">${esc(l.status)}</span>` : ""}</section>
  <section class="info">
    <span class="badge ${l.kind}">${esc(l.status)}</span>
    <h1>${esc(l.title)}</h1>
    ${loc ? `<p class="loc">${esc(loc)}</p>` : ""}
    <div class="facts">
      ${l.rooms ? `<div><b>${esc(l.rooms)}</b><span>חדרים</span></div>` : ""}
      ${l.sqm ? `<div><b>${esc(l.sqm)}</b><span>מ"ר</span></div>` : ""}
      ${l.floor ? `<div><b>${esc(l.floor)}</b><span>קומה</span></div>` : ""}
    </div>
    ${l.features.length ? `<div class="feat">${l.features.map(f => `<span>${esc(f)}</span>`).join("")}</div>` : ""}
    ${l.desc ? `<p class="desc">${esc(l.desc)}</p>` : ""}
    <div class="cta">
      <a class="btn wa" href="${esc(waLink(waText(l)))}">${label}</a>
      <a class="btn ghost" href="tel:+972558836333">חיוג</a>
      <button class="btn ghost share" type="button" data-url="${pageUrl(l)}" data-title="${esc(`${l.status}: ${l.title}`)}">שיתוף</button>
    </div>
  </section>
  <section class="agent">
    <img src="/img/dikla.jpg" alt="דקלה עוזר" width="720" height="1079" loading="lazy">
    <div>
      <b>דקלה עוזר</b>
      <p>בעלת Do nadlan, משרד תיווך בוטיק. מלווה מכירה, קנייה והשכרה בפתח תקווה, בקעת אונו והסביבה, עם הקשבה, אמינות והבנה אמיתית של מה שחשוב לכם.</p>
      <small>מתווכת מוסמכת · רישיון 30675094</small>
    </div>
  </section>
  ${more ? `<section class="more"><h2>עוד נכסים</h2><div class="minis">${more}</div><a class="all" href="/#properties">לכל הנכסים</a></section>` : ""}`;
  }

  window.DN = { loadListings, loadReviews, renderProperty, postText, pageUrl, waLink, waText, esc, WA, SITE };
})();

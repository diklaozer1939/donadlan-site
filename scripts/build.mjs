// Builds a page per property from the Google Sheet, so every listing has its own link
// (for Facebook posts) with a WhatsApp button. Runs in GitHub Actions on a schedule.
// Output: data/listings.json, data/reviews.json, n/<id>/index.html, sitemap.xml, links.html
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSoWGeFXmnMHRdnt4sISqdjkbRIPvYDV0vaq-Df3z4oAhW30ox0u8e-dgt0jwFmfBAa1laWnlmTWb7R/pub?single=true&output=csv&gid=";
const GID_PROPS = "1893179336";
const GID_REVIEWS = "1223992990";
const SITE = "https://donadlan.co.il";
const WA = "972558836333";
const PHONE = "055-8836333";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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
const clean = s => String(s ?? "").trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sheet(gid) {
  const r = await fetch(SHEET + gid + "&t=" + Date.now(), { redirect: "follow" });
  if (!r.ok) throw new Error(`sheet ${gid}: HTTP ${r.status}`);
  return parseCSV(await r.text()).slice(1).filter(r => r.some(c => clean(c)));
}

function kind(st) {
  if (st.includes("נמכר") || st.includes("הושכר")) return "closed";
  if (st.includes("השכר")) return "rent";
  if (st.includes("מכיר")) return "sale";
  return "other";
}

// Photos: a public Drive folder, Drive file links, or direct image links (space/comma/newline separated)
const driveImg = id => `https://lh3.googleusercontent.com/d/${id}=w1600`;
async function photos(cell) {
  const out = [];
  for (const tok of clean(cell).split(/[\s,]+/).filter(Boolean)) {
    const folder = tok.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([\w-]{10,})/);
    const file = tok.match(/drive\.google\.com\/(?:file\/d\/|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
    if (folder) {
      try {
        const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${folder[1]}`);
        const html = await r.text();
        const items = [...html.matchAll(/id="entry-([\w-]{10,})"[\s\S]*?class="flip-entry-title">([^<]*)</g)]
          .map(m => ({ id: m[1], name: m[2] }))
          .filter(x => !x.name || /\.(jpe?g|png|webp|heic)$/i.test(x.name))
          .sort((a, b) => a.name.localeCompare(b.name, "he", { numeric: true }));
        if (!items.length) console.warn(`  no images found in folder ${folder[1]} (is it shared "anyone with the link"?)`);
        out.push(...items.map(x => driveImg(x.id)));
      } catch (e) { console.warn(`  folder ${folder[1]} failed: ${e.message}`); }
    } else if (file) out.push(driveImg(file[1]));
    else if (/^https?:\/\/\S+\.(jpe?g|png|webp)(\?\S*)?$/i.test(tok)) out.push(tok);
  }
  return out.slice(0, 24);
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
  const id = crypto.createHash("sha1").update(`${city}|${street}|${floor}|${rooms}`).digest("hex").slice(0, 6);
  const title = [rooms && `${rooms} חדרים`, street && `ברחוב ${street}`].filter(Boolean).join(" ") + (city ? `, ${city}` : "");
  return {
    id, kind: k, status, city, hood, street, rooms, floor, sqm, features: feat, desc,
    photos: await photos(photoCell), date, order: i, title: title || city,
  };
}

const waLink = text => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const pageUrl = l => `${SITE}/n/${l.id}/`;
const factsList = l => [l.sqm && `${l.sqm} מ"ר`, l.floor && `קומה ${l.floor}`, ...l.features];

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

function propertyPage(l, others) {
  const closed = l.kind === "closed";
  const loc = [l.hood, l.city].filter(Boolean).join(", ");
  const desc = [l.status, loc, ...factsList(l), l.desc].filter(Boolean).join(" · ");
  const og = l.photos[0] || `${SITE}/img/og.jpg`;
  const waText = closed
    ? `היי דקלה, ראיתי באתר שמכרת/השכרת דירה ב${l.city}. יש לי דירה דומה ואשמח לשמוע ממך`
    : `היי דקלה, ראיתי באתר את הדירה: ${l.title} (${l.status}). אשמח לפרטים ${pageUrl(l)}`;
  const waLabel = closed ? "יש לכם דירה דומה? דברו איתי" : "לפרטים ומחיר בוואטסאפ";
  const gallery = l.photos.length
    ? `<div class="gallery">${l.photos.map((p, i) => `<img src="${esc(p)}" alt="${esc(l.title)}, תמונה ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join("")}</div>
       ${l.photos.length > 1 ? `<p class="swipe">${l.photos.length} תמונות · החליקו לצד</p>` : ""}`
    : `<div class="gallery empty"><div class="ph"><img src="/img/mono.png" alt=""><b>${esc(l.city)}</b>${l.hood ? `<small>${esc(l.hood)}</small>` : ""}</div></div>`;
  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: `${l.status}: ${l.title}`,
    url: pageUrl(l), image: l.photos.length ? l.photos : [og], description: desc,
    ...(l.date ? { datePosted: l.date } : {}),
    offers: { "@type": "Offer", businessFunction: l.kind === "rent" ? "http://purl.org/goodrelations/v1#LeaseOut" : "http://purl.org/goodrelations/v1#Sell", availability: closed ? "https://schema.org/SoldOut" : "https://schema.org/InStock" },
    provider: { "@type": "RealEstateAgent", name: 'דו נדל"ן – דקלה עוזר', telephone: "+972-55-883-6333", url: `${SITE}/` },
  };
  const more = others.slice(0, 3).map(o => `<a class="mini" href="/n/${o.id}/">
      <span class="mini-pic">${o.photos[0] ? `<img src="${esc(o.photos[0].replace(/=w1600$/, "=w600"))}" alt="" loading="lazy">` : `<img class="mono" src="/img/mono.png" alt="">`}</span>
      <span class="mini-t"><b>${esc(o.title)}</b><small>${esc(o.status)}</small></span></a>`).join("");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${l.status}: ${l.title}`)} | דו נדל"ן</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${pageUrl(l)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(`${l.status}: ${l.title}`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${pageUrl(l)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/img/icon-32.png">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/property.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header><div class="wrap bar">
  <a class="brand" href="/"><img src="/img/logo.png" alt="דו נדל&quot;ן" width="260" height="162"></a>
  <a class="all" href="/#properties">לכל הנכסים</a>
</div></header>

<main class="wrap">
  <section class="hero${closed ? " closed" : ""}">
    ${gallery}
    ${closed ? `<span class="ribbon">${esc(l.status)}</span>` : ""}
  </section>

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
      <a class="btn wa" href="${esc(waLink(waText))}">${waLabel}</a>
      <a class="btn ghost" href="tel:+972558836333">חיוג</a>
      <button class="btn ghost share" type="button" data-url="${pageUrl(l)}" data-title="${esc(`${l.status}: ${l.title}`)}">שיתוף</button>
    </div>
  </section>

  <section class="agent">
    <img src="/img/dikla.jpg" alt="דקלה עוזר" width="720" height="1079" loading="lazy">
    <div>
      <b>דקלה עוזר</b>
      <p>גרה בכפר גנים ומלווה מכירה, קנייה והשכרה בשכונה ובבקעת אונו. כל שלב נסגר בכתב, מראש. אני עונה בעצמי.</p>
      <small>מתווכת מוסמכת · רישיון 30675094</small>
    </div>
  </section>

  ${more ? `<section class="more"><h2>עוד נכסים</h2><div class="minis">${more}</div><a class="all" href="/#properties">לכל הנכסים</a></section>` : ""}
</main>

<footer><div class="wrap">© דו נדל"ן – דקלה עוזר · ${PHONE}</div></footer>
<a class="sticky-wa" href="${esc(waLink(waText))}">${waLabel}</a>
<script>
document.querySelector(".share").addEventListener("click", async e => {
  const b = e.currentTarget, url = b.dataset.url, title = b.dataset.title;
  try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(url); b.textContent = "הקישור הועתק"; } catch (_) { prompt("העתיקו את הקישור:", url); }
});
</script>
</body>
</html>
`;
}

function linksPage(list) {
  const rows = list.map(l => `<article>
    <div><b>${esc(l.status)} · ${esc(l.title)}</b><a href="/n/${l.id}/">${pageUrl(l)}</a></div>
    <textarea readonly rows="7">${esc(postText(l))}</textarea>
    <div class="b"><button data-copy="${esc(pageUrl(l))}">העתקת קישור</button><button data-post>העתקת פוסט מוכן</button></div>
  </article>`).join("\n");
  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>קישורים לפרסום | דו נדל"ן</title>
<style>
body{margin:0;font-family:Arial,sans-serif;background:#FBF8F2;color:#2B2620}
main{max-width:760px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:24px;margin:0 0 4px}p.s{color:#6E655A;margin:0 0 20px}
article{background:#fff;border:1px solid #E7DFCF;border-radius:14px;padding:16px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px}
article a{display:block;color:#8A6A22;font-size:14px;direction:ltr;text-align:right;word-break:break-all}
textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;border:1px solid #E7DFCF;border-radius:8px;padding:8px;resize:vertical}
.b{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;font-size:15px;border:0;border-radius:999px;padding:10px 18px;background:#1F8A4C;color:#fff;cursor:pointer}
button+button{background:#8A6A22}
</style></head><body><main>
<h1>קישורים לפרסום בפייסבוק</h1>
<p class="s">הדף הזה לא מופיע באתר ולא בגוגל. הוא מתעדכן לבד מהגיליון.</p>
${rows || "<p>אין כרגע נכסים פעילים.</p>"}
</main>
<script>
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const text = b.dataset.copy || b.closest("article").querySelector("textarea").value;
  try { await navigator.clipboard.writeText(text); } catch (_) { const t = b.closest("article").querySelector("textarea"); t.select(); document.execCommand("copy"); }
  const old = b.textContent; b.textContent = "הועתק ✓"; setTimeout(() => b.textContent = old, 1500);
});
</script></body></html>
`;
}

async function writeIfChanged(file, content) {
  const full = path.join(ROOT, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  try { if (await fs.readFile(full, "utf8") === content) return; } catch (_) {}
  await fs.writeFile(full, content);
  console.log("  wrote", file);
}

async function main() {
  const [propRows, reviewRows] = await Promise.all([sheet(GID_PROPS), sheet(GID_REVIEWS)]);
  let list = (await Promise.all(propRows.map(toListing))).filter(Boolean);
  const seen = new Map();
  for (const l of list) { const n = (seen.get(l.id) || 0) + 1; seen.set(l.id, n); if (n > 1) l.id += "-" + n; }
  // open listings first, newest first (by date, else lower in the sheet = newer)
  list.sort((a, b) => (a.kind === "closed") - (b.kind === "closed") || parseDate(b.date) - parseDate(a.date) || b.order - a.order);
  list = list.map(({ order, ...l }) => l);

  const reviews = reviewRows.map(r => {
    const [name, city, hood, type, text, date] = r.map(clean);
    return { name, city, hood, type, text, date };
  }).filter(r => r.text);

  await writeIfChanged("data/listings.json", JSON.stringify(list, null, 1) + "\n");
  await writeIfChanged("data/reviews.json", JSON.stringify(reviews, null, 1) + "\n");

  // property pages: rewrite all, remove pages of listings that were deleted from the sheet
  const ids = new Set(list.map(l => l.id));
  try {
    for (const d of await fs.readdir(path.join(ROOT, "n"))) {
      if (!ids.has(d)) { await fs.rm(path.join(ROOT, "n", d), { recursive: true, force: true }); console.log("  removed n/" + d); }
    }
  } catch (_) {}
  for (const l of list) {
    const others = list.filter(o => o.id !== l.id && o.kind !== "closed");
    await writeIfChanged(`n/${l.id}/index.html`, propertyPage(l, others));
  }

  const urls = [`${SITE}/`, ...list.map(pageUrl)];
  await writeIfChanged("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  await writeIfChanged("links.html", linksPage(list.filter(l => l.kind !== "closed")));
  console.log(`done: ${list.length} listings, ${reviews.length} reviews`);
}

main().catch(e => { console.error(e); process.exit(1); });

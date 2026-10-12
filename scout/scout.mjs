// obv-scout: twice-daily gig radar. Runs on GitHub Actions (free 2000 min/mo).
// Public reads only, zero secrets. Writes scout/latest.json; exits 0 always.
import { writeFileSync, mkdirSync } from "node:fs";

const FIT = /contract|freelance|freelancer|gig|part-time|part time|fractional|consult|bounty/i;
const STACK = /wordpress|wp |woocommerce|bot|telegram|scrap|automation|zapier|chrome extension|node\.?js|typescript|rust|api integration|dashboard|landing page/i;
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").slice(0, 600);
const jget = async (u) => (await fetch(u, { headers: { "User-Agent": "obv-scout/1.0" } })).json();

const out = { ran_at: new Date().toISOString(), fits: [], notes: [] };

// 1. Latest "Who is hiring?" thread (Algolia, newest story by whoishiring)
try {
  const s = await jget("https://hn.algolia.com/api/v1/search?query=Who%20is%20hiring&tags=story,author_whoishiring&hitsPerPage=1");
  const id = s.hits[0].objectID;
  const c = await jget(`https://hn.algolia.com/api/v1/search?tags=comment,story_${id}&hitsPerPage=100`);
  for (const h of c.hits) {
    const t = strip(h.comment_text || "");
    if (t.length > 200 && FIT.test(t) && (STACK.test(t) || /remote/i.test(t)))
      out.fits.push({ src: "hn-hiring", author: h.author, text: t.slice(0, 300) });
  }
  out.notes.push(`hn-hiring story ${id}: ${c.hits.length} comments scanned`);
} catch (e) { out.notes.push("hn-hiring failed: " + String(e).slice(0, 120)); }

// 2. Truelancer front page (best effort, may block bots)
try {
  const html = await (await fetch("https://www.truelancer.com/", { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)" } })).text();
  const titles = [...html.matchAll(/<a[^>]*class="[^"]*job[^"]*"[^>]*>([^<]{10,120})</gi)].map((m) => m[1].trim());
  const keywords = titles.filter((t) => STACK.test(t));
  if (keywords.length) out.fits.push({ src: "truelancer", author: "frontpage", text: keywords.slice(0, 8).join(" | ") });
  out.notes.push(`truelancer: ${titles.length} titles, ${keywords.length} keyword hits`);
} catch (e) { out.notes.push("truelancer failed: " + String(e).slice(0, 120)); }

// 3. Our crates shelf (vanity metric, proves shelf alive)
try {
  for (const c of ["left-pad-rs", "q-promise-rs", "brain-nn-rs"]) {
    const d = await jget(`https://crates.io/api/v1/crates/${c}`);
    out.notes.push(`${c}: ${d.crate.downloads} downloads`);
  }
} catch (e) { out.notes.push("crates failed: " + String(e).slice(0, 120)); }

mkdirSync("scout", { recursive: true });
writeFileSync("scout/latest.json", JSON.stringify(out, null, 1));
console.log(`fits=${out.fits.length} notes=${out.notes.length}`);

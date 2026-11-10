// Shared by the four gates in --url mode (headless Next.js sites: no dist/, pages come over HTTP). GET requests only.
import { decode } from "./html.mjs";

// Guess a page type from the first path segment (no site.json to say).
const TYPE_BY_SEGMENT = { services: "service", "areas-served": "area", areas: "area", locations: "area", blog: "blog" };
export function pagesFromSitemap(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => {
    const loc = decode(m[1].trim());
    const u = new URL(loc), url = u.pathname;
    const parts = url.split("/").filter(Boolean);
    const type = parts.length === 0 ? "home" : TYPE_BY_SEGMENT[parts[0]] ? (parts.length === 1 ? "hub" : TYPE_BY_SEGMENT[parts[0]]) : parts[0];
    return { url, fetch: url + u.search, type, loc }; // url (pathname) drives type logic; fetch keeps the query string
  });
}

const MAX_REDIRECTS = 5;
// "" when `to` is the same site as `from` (same origin, or an http -> https upgrade on the same hostname), else why not.
export function offSiteReason(from, to) {
  const a = new URL(from), b = new URL(to);
  if (b.username || b.password || b.hostname !== a.hostname) return b.host;
  if (a.protocol === b.protocol) return a.port === b.port ? "" : b.host;
  return a.protocol === "http:" && b.protocol === "https:" ? "" : `downgrade to ${b.protocol.slice(0, -1)}`;
}
export async function get(url, { body = true } = {}) {
  let cur = url;
  try {
    for (let hop = 0; ; hop++) {
      const r = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(20000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; 99-website-gate)", accept: "text/html,application/xml,text/plain,*/*" } });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!loc) {
        const text = body ? await r.text() : (await r.body?.cancel(), "");
        return { status: r.status, ctype: r.headers.get("content-type") ?? "", text, finalUrl: cur };
      }
      await r.body?.cancel();
      // Checked before the next request: a redirect to another host (or port) is not this site and is never fetched.
      const next = new URL(loc, cur);
      const why = offSiteReason(url, next.href);
      if (why) return { status: 0, ctype: "", text: "", finalUrl: next.href, error: `redirected off-site: ${why}` };
      if (hop >= MAX_REDIRECTS) return { status: 0, ctype: "", text: "", finalUrl: next.href, error: "too many redirects" };
      cur = next.href;
    }
  } catch (e) { return { status: 0, ctype: "", text: "", finalUrl: cur, error: e.cause?.code ?? e.message }; }
}

// Run fn over items, n at a time.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// One page per type first, then the rest, so a small --max-pages still covers the site.
export function samplePages(pages, n) {
  const seen = new Set(), first = [], rest = [];
  for (const p of pages) { (seen.has(p.type) ? rest : first).push(p); seen.add(p.type); }
  return [...first, ...rest].slice(0, n);
}

export const trimBase = (b) => b.replace(/\/+$/, "");

// The page list: <base>/sitemap.xml (one level of sitemap index followed).
const MAX_CHILD_SITEMAPS = 20;
export async function sitemapPages(base) {
  const sm = await get(`${base}/sitemap.xml`);
  if (sm.status !== 200) return { pages: [], error: `sitemap.xml unreachable (${sm.status || sm.error})` };
  let xml = sm.text;
  if (/<sitemapindex/i.test(xml)) {
    const kids = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => { const u = new URL(decode(m[1].trim())); return `${base}${u.pathname}${u.search}`; });
    if (kids.length > MAX_CHILD_SITEMAPS) return { pages: [], error: `sitemap index lists ${kids.length} child sitemaps (this gate reads at most ${MAX_CHILD_SITEMAPS})` };
    const res = await pool(kids, 4, (u) => get(u));
    const bad = res.map((r, i) => (r.status >= 200 && r.status < 300 ? "" : `${kids[i].slice(base.length)} (${r.status || r.error})`)).filter(Boolean);
    if (bad.length) return { pages: [], error: `child sitemap(s) failed: ${bad.join(", ")}` };
    xml = res.map((r) => r.text).join("\n");
  }
  const pages = pagesFromSitemap(xml);
  return pages.length ? { pages } : { pages, error: "sitemap.xml lists no pages" };
}

// Fetch the (sampled) pages. Each result is the page plus status, type, text (the HTML) and problem ("" when fine).
export async function crawl(base, maxPages = 50) {
  const { pages: all, error } = await sitemapPages(base);
  if (error) return { pages: [], total: 0, error };
  const chosen = samplePages(all, maxPages);
  const pages = await pool(chosen, 4, async (p) => {
    const r = await get(`${base}${p.fetch}`);
    const problem = r.status !== 200 ? `HTTP ${r.status || r.error}` : /html/i.test(r.ctype) ? "" : `not HTML (${r.ctype || "no content-type"})`;
    return { ...p, status: r.status, html: r.text, problem };
  });
  return { pages, total: all.length };
}

// robots.txt, sitemap.xml and llms.txt must exist and not be an HTML catch-all page.
export async function siteFileFailures(base) {
  const f = [];
  for (const name of ["robots.txt", "sitemap.xml", "llms.txt"]) {
    const r = await get(`${base}/${name}`);
    if (r.status !== 200) f.push(`site: missing ${name} (${r.status || r.error})`);
    else if (!r.text.trim()) f.push(`site: ${name} is empty`);
    else if (name === "sitemap.xml" ? !/<(urlset|sitemapindex)/i.test(r.text) : /html/i.test(r.ctype)) f.push(`site: ${name} is not the expected file type`);
  }
  return f;
}

export function urlArgs(argv) {
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const maxPages = Number(opt("--max-pages", 50));
  if (!Number.isInteger(maxPages) || maxPages < 1) { console.log(`FAIL --max-pages must be a positive integer (got "${opt("--max-pages")}")`); process.exit(1); }
  return { base: trimBase(opt("--url", "")), maxPages, opt };
}

export const crawlSummary = ({ pages, total }) => `${pages.length} of ${total} sitemap pages fetched`;

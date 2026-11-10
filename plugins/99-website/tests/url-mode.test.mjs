import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { verifyUrlSite } from "../scripts/verify-seo.mjs";
import { validateJsonLdUrl } from "../scripts/validate-jsonld.mjs";
import { checkLinksUrl } from "../scripts/check-links.mjs";
import { pagesFromSitemap, samplePages } from "../scripts/lib/url-mode.mjs";

const scripts = path.resolve("scripts");
const run = (file, args, env = {}) => promisify(execFile)(process.execPath, [path.join(scripts, file), ...args], { env: { ...process.env, ...env } })
  .then((r) => ({ code: 0, out: r.stdout }), (e) => ({ code: e.code, out: e.stdout + e.stderr }));

const graph = (url, types) => JSON.stringify({ "@context": "https://schema.org", "@graph": types.map((t) => ({ "@type": t, url, ...(t === "Article" ? { author: { "@type": "Person", name: "A" } } : {}) })) });
const BASE_TYPES = ["WebSite", "WebPage", "LocalBusiness"];
const page = ({ origin, url, h1 = "<h1>Paver patios</h1>", canon, ld, links = "" }) => `<!doctype html><html><head><title>Paver Patios | Cedar &amp; Stone</title>
<meta name="description" content="Paver patios built to last, with free on-site estimates from the owner. Walkways and fire pits too.">
<link rel="canonical" href="${canon ?? origin + url}"/><meta name="robots" content="index, follow"/>
<script type="application/ld+json">${ld}</script></head>
<body>${h1}<img src="/_next/image?url=%2Fa.jpg&amp;w=640&amp;q=75" width="640" height="480" alt="patio"/>${links}</body></html>`;

// Good site: home, service, blog; all linked, all with the right schema.
const goodPages = (o) => ({
  "/": page({ origin: o, url: "/", ld: graph(o + "/", BASE_TYPES), links: '<a href="/services/patios/">Patios</a><a href="/blog/post/">Post</a><a href="mailto:a@b.co">mail</a><a href="#top">top</a>' }),
  "/services/patios/": page({ origin: o, url: "/services/patios/", ld: graph(o + "/services/patios/", [...BASE_TYPES, "BreadcrumbList", "Service"]), links: '<a href="/">Home</a>' }),
  "/blog/post/": page({ origin: o, url: "/blog/post/", ld: graph(o + "/blog/post/", [...BASE_TYPES, "BreadcrumbList", "Article"]), links: `<a href="${o}/services/patios/">Patios</a>` }),
});
// Bad site: home has no h1, a canonical for another page, broken JSON-LD and a dead internal link; no robots.txt.
const badPages = (o) => ({
  "/": page({ origin: o, url: "/", h1: "", canon: o + "/elsewhere/", ld: "{broken", links: '<a href="/gone/">Gone</a><a href="/services/patios/">Patios</a>' }),
  "/services/patios/": goodPages(o)["/services/patios/"],
});

const hits = [];
function site(pages, { robots = true } = {}) {
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const o = `http://${req.headers.host}`;
    const p = pages(o);
    const send = (status, type, body) => res.writeHead(status, { "content-type": type }).end(body);
    if (req.url === "/sitemap.xml") return send(200, "application/xml", `<urlset>${Object.keys(p).map((u) => `<url><loc>${o}${u}</loc></url>`).join("")}</urlset>`);
    if (req.url === "/robots.txt" && robots) return send(200, "text/plain", "User-agent: *\nAllow: /\n");
    if (req.url === "/llms.txt") return send(200, "text/plain", "# Cedar & Stone\n");
    if (p[req.url]) return send(200, "text/html; charset=utf-8", p[req.url]);
    send(404, "text/html", "<h1>Not found</h1>");
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

let good, bad;
before(async () => { good = await site(goodPages); bad = await site(badPages, { robots: false }); });
after(() => { good.srv.close(); bad.srv.close(); });

test("verify-seo --url: a good site passes and says what it skipped", async () => {
  const r = await verifyUrlSite({ base: good.base });
  assert.deepEqual(r.failures, []);
  assert.equal(r.pages, 3);
  const cli = await run("verify-seo.mjs", ["--url", good.base]);
  assert.equal(cli.code, 0);
  assert.match(cli.out, /skipped: needs site\.json: keyword/);
  assert.match(cli.out, /all SEO gates pass/);
});

test("verify-seo --url: missing h1, wrong canonical, missing robots.txt fail", async () => {
  const m = (await verifyUrlSite({ base: bad.base })).failures.join("\n");
  assert.match(m, /^\/: 0 <h1> elements/m);
  assert.match(m, /^\/: canonical .*\/elsewhere\/.* should be/m);
  assert.match(m, /site: missing robots\.txt/);
  assert.doesNotMatch(m, /services\/patios/);
  assert.equal((await run("verify-seo.mjs", ["--url", bad.base])).code, 1);
});

test("verify-seo --url: --noindex flips the robots expectation", async () => {
  const m = (await verifyUrlSite({ base: good.base, expectNoindex: true })).failures.join("\n");
  assert.match(m, /noindex missing on a noindex build/);
});

test("verify-seo --url: unreachable sitemap fails instead of passing on zero pages", async () => {
  const r = await verifyUrlSite({ base: "http://127.0.0.1:9" });
  assert.match(r.failures[0], /sitemap\.xml unreachable/);
  assert.equal((await run("verify-seo.mjs", ["--url", "http://127.0.0.1:9"])).code, 1);
});

test("validate-jsonld --url: good graphs pass; broken JSON-LD fails", async () => {
  assert.deepEqual((await validateJsonLdUrl({ base: good.base })).failures, []);
  const cli = await run("validate-jsonld.mjs", ["--url", good.base]);
  assert.equal(cli.code, 0);
  assert.match(cli.out, /skipped: needs site\.json: telephone/);
  const bads = await validateJsonLdUrl({ base: bad.base });
  assert.match(bads.failures.join("\n"), /^\/: JSON-LD does not parse/m);
  assert.equal((await run("validate-jsonld.mjs", ["--url", bad.base])).code, 1);
});

test("validate-jsonld --url: a service page without Service fails", async () => {
  const s = await site((o) => ({ "/": goodPages(o)["/"], "/services/x/": page({ origin: o, url: "/services/x/", ld: graph(o + "/services/x/", [...BASE_TYPES, "BreadcrumbList"]) }) }));
  try { assert.match((await validateJsonLdUrl({ base: s.base })).failures.join(), /missing Service on a service page/); } finally { s.srv.close(); }
});

test("check-links --url: resolving links pass (mailto, fragments and absolute same-site links are handled)", async () => {
  const r = await checkLinksUrl({ base: good.base });
  assert.deepEqual(r.failures, []);
  assert.ok(r.notes.some((n) => /skipped: needs site\.json/.test(n)));
});

test("check-links --url: a dead internal link fails with the linking page", async () => {
  const r = await checkLinksUrl({ base: bad.base });
  assert.deepEqual(r.failures, ["/ links to /gone/, which answers 404"]);
  const cli = await run("check-links.mjs", ["--url", bad.base]);
  assert.equal(cli.code, 1);
  assert.match(cli.out, /FAIL \/ links to \/gone\//);
});

test("--max-pages samples one page per type first", () => {
  const pages = pagesFromSitemap("<urlset><loc>https://x.dev/blog/a/</loc><loc>https://x.dev/blog/b/</loc><loc>https://x.dev/</loc><loc>https://x.dev/services/s/</loc></urlset>");
  assert.deepEqual(samplePages(pages, 3).map((p) => p.url), ["/blog/a/", "/", "/services/s/"]);
});

test("every request the --url gates made was a GET", () => {
  assert.ok(hits.length > 10);
  assert.deepEqual(hits.filter((h) => !h.startsWith("GET ")), []);
});

// lighthouse-gate --url, with a fake Lighthouse executable (no Chrome, no network).
function fakeLighthouse(dir) {
  const f = path.join(dir, "fake-lh.mjs");
  fs.writeFileSync(f, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, a.join(" ") + "\\n");
const cat = (s) => ({ score: s, auditRefs: [] });
const lhr = { ...(process.env.FAKE_FINAL && { finalDisplayedUrl: process.env.FAKE_FINAL }), categories: { performance: cat(+process.env.FAKE_PERF), accessibility: cat(1), "best-practices": cat(1), seo: cat(1) }, audits: {} };
fs.writeFileSync(a.find((x) => x.startsWith("--output-path=")).slice(14), JSON.stringify(lhr));
`);
  fs.chmodSync(f, 0o755);
  return f;
}

test("lighthouse-gate --url: median of 3 on live URLs, 99 gate, no server of its own", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
  const env = { LIGHTHOUSE_CMD: fakeLighthouse(dir), FAKE_LOG: path.join(dir, "calls.log") };
  const before = hits.length;
  const ok = await run("lighthouse-gate.mjs", ["--url", good.base, "--out", path.join(dir, "audits"), "--label", "t"], { ...env, FAKE_PERF: "1" });
  assert.equal(ok.code, 0);
  assert.match(ok.out, /all pages 99\+ on all four categories/);
  const calls = fs.readFileSync(env.FAKE_LOG, "utf8").trim().split("\n");
  assert.equal(calls.length, 9); // home + service + blog, 3 runs each
  assert.ok(calls.every((c) => c.startsWith(good.base + "/") && !c.includes("desktop"))); // mobile is Lighthouse's default
  assert.ok(fs.existsSync(path.join(dir, "audits/lighthouse-t.json")));
  // Besides the sitemap and the home page (noindex detection) the gate asks the site for nothing: it does not crawl or serve.
  assert.deepEqual([...new Set(hits.slice(before))].sort(), ["GET /", "GET /sitemap.xml"]);

  const low = await run("lighthouse-gate.mjs", ["--url", good.base, "--out", path.join(dir, "audits"), "--label", "low"], { ...env, FAKE_PERF: "0.9" });
  assert.equal(low.code, 1);
  assert.match(low.out, /FAIL \/ performance 90 \(need 99\)/);
});

import { verifyPage } from "../scripts/verify-seo.mjs";
test("next/image: fill images need no width/height, and /_next/image URLs are not 'non-WebP'", () => {
  const html = (img) => `<title>T</title><meta name="description" content="${"d".repeat(80)}"><link rel="canonical" href="https://x.dev/"><h1>H</h1>${img}`;
  const f = (img) => verifyPage({ html: html(img), page: { url: "/", type: "home", canonical: "https://x.dev/" }, business: {}, siteUrl: "", expectNoindex: false });
  assert.deepEqual(f('<img alt="a" data-nimg="fill" srcSet="/_next/image?url=%2Fa.jpg&w=640&q=75 1x"/>'), []);
  assert.match(f('<img alt="a" src="/a.jpg"/>').join(), /non-WebP|width\/height/);
});

// ---- Codex review fixes -------------------------------------------------------------------------------------------
import { lighthouseCommand } from "../scripts/lighthouse-gate.mjs";

// A tiny server from a route table: path (with query) -> [status, content-type, body] | [302, location].
function routes(table) {
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const o = `http://${req.headers.host}`;
    const t = typeof table === "function" ? table(o) : table;
    const r = t[req.url];
    if (!r) return res.writeHead(404, { "content-type": "text/html" }).end("nf");
    if (r[0] === 302) return res.writeHead(302, { location: r[1] }).end();
    res.writeHead(r[0], { "content-type": r[1] }).end(r[2]);
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}
const urlset = (...locs) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;
const HTML = "text/html";

test("fix 1: a redirect to another host is a failed fetch; a same-host redirect is followed", async () => {
  const other = await routes({ "/": [200, HTML, "other site"] });
  const s = await routes((o) => ({
    "/sitemap.xml": [200, "application/xml", urlset(o + "/", o + "/off/", o + "/old/")],
    "/": goodPages(o)["/"] && [200, HTML, goodPages(o)["/"]],
    "/off/": [302, other.base.replace("127.0.0.1", "localhost") + "/"],
    "/old/": [302, "/"],
  }));
  try {
    const m = (await verifyUrlSite({ base: s.base })).failures.join("\n");
    assert.match(m, /^\/off\/: HTTP redirected off-site: localhost:\d+/m);
    assert.doesNotMatch(m, /^\/old\/: HTTP/m); // same host: followed to the home page (its canonical then differs from /old/, a real finding)
    assert.match(m, /^\/old\/: canonical/m);
  } finally { s.srv.close(); other.srv.close(); }
});

test("fix 2: a failing or oversized sitemap index fails the gate instead of dropping children", async () => {
  const idx = (o, n) => `<sitemapindex>${Array.from({ length: n }, (_, i) => `<sitemap><loc>${o}/s${i}.xml</loc></sitemap>`).join("")}</sitemapindex>`;
  const s = await routes((o) => ({ "/sitemap.xml": [200, "application/xml", idx(o, 2)], "/s0.xml": [200, "application/xml", urlset(o + "/")], "/s1.xml": [500, HTML, "boom"] }));
  const big = await routes((o) => ({ "/sitemap.xml": [200, "application/xml", idx(o, 21)] }));
  try {
    const a = await verifyUrlSite({ base: s.base });
    assert.match(a.failures[0], /child sitemap\(s\) failed: \/s1\.xml \(500\)/);
    assert.equal((await run("verify-seo.mjs", ["--url", s.base])).code, 1);
    assert.match((await verifyUrlSite({ base: big.base })).failures[0], /21 child sitemaps/);
    assert.match((await checkLinksUrl({ base: big.base })).failures[0], /21 child sitemaps/);
  } finally { s.srv.close(); big.srv.close(); }
});

test("fix 3: query strings are kept for pages and child sitemaps, type logic still uses the path", async () => {
  const pg = (o) => page({ origin: o, url: "/services/a/?id=1", ld: graph(o + "/services/a/?id=1", [...BASE_TYPES, "BreadcrumbList", "Service"]) });
  const s = await routes((o) => ({
    "/sitemap.xml": [200, "application/xml", `<sitemapindex><sitemap><loc>${o}/child.xml?section=x</loc></sitemap></sitemapindex>`],
    "/child.xml?section=x": [200, "application/xml", urlset(o + "/services/a/?id=1")],
    "/services/a/?id=1": [200, HTML, pg(o)],
  }));
  try {
    const p = pagesFromSitemap(urlset("https://x.dev/services/a/?id=1"))[0];
    assert.deepEqual([p.url, p.fetch, p.type], ["/services/a/", "/services/a/?id=1", "service"]);
    const r = await validateJsonLdUrl({ base: s.base });
    assert.deepEqual(r.failures, []); // fetched as written (a bare /services/a/ would 404) and typed "service"
    assert.equal(r.pages, 1);
  } finally { s.srv.close(); }
});

test("fix 4: LIGHTHOUSE_CMD is honored only with --url", () => {
  const env = { LIGHTHOUSE_CMD: "/tmp/fake" };
  assert.deepEqual(lighthouseCommand(env, { url: true }), ["/tmp/fake"]);
  assert.deepEqual(lighthouseCommand(env), ["npx", "-y", "lighthouse@12"]);
  assert.deepEqual(lighthouseCommand({}, { url: true }), ["npx", "-y", "lighthouse@12"]);
});

test("fix 5: lighthouse --url honors --max-pages and times out a hung run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
  const env = { LIGHTHOUSE_CMD: fakeLighthouse(dir), FAKE_LOG: path.join(dir, "calls.log"), FAKE_PERF: "1" };
  const base = ["--url", good.base, "--out", path.join(dir, "audits"), "--runs", "1"];
  const two = await run("lighthouse-gate.mjs", [...base, "--max-pages", "2", "--label", "cap"], env);
  assert.equal(two.code, 0);
  assert.equal(fs.readFileSync(env.FAKE_LOG, "utf8").trim().split("\n").length, 2); // 3 types in the site, capped to 2
  const hung = path.join(dir, "hung.mjs");
  fs.writeFileSync(hung, "#!/usr/bin/env node\nsetTimeout(() => {}, 60000);\n"); fs.chmodSync(hung, 0o755);
  const t = await run("lighthouse-gate.mjs", [...base, "--label", "hung", "--timeout", "400"], { ...env, LIGHTHOUSE_CMD: hung });
  assert.notEqual(t.code, 0);
  assert.match(t.out, /Lighthouse timed out after 0\.4s/);
});

// ---- Codex review round 3 fixes -----------------------------------------------------------------------------------
import { get } from "../scripts/lib/url-mode.mjs";
import { DEFAULT_TIMEOUT_MS } from "../scripts/lighthouse-gate.mjs";

test("round 3 fix 1: off-site redirects are refused before the request; out-and-back and loops fail; same-host works", async () => {
  const dest = await routes({ "/": [200, HTML, "other site"], "/bounce": [302, "/never-reached"] });
  const destHits = []; dest.srv.on("request", (req) => destHits.push(req.url));
  const s = await routes((o) => ({
    "/off": [302, dest.base + "/"],
    "/outback": [302, dest.base + "/bounce"],
    "/loop": [302, "/loop"],
    "/old": [302, "/new"],
    "/new": [200, HTML, "here"],
  }));
  try {
    const off = await get(`${s.base}/off`);
    assert.equal(off.status, 0);
    assert.match(off.error, /^redirected off-site: 127\.0\.0\.1:\d+$/);
    assert.match((await get(`${s.base}/outback`)).error, /redirected off-site/);
    assert.equal((await get(`${s.base}/loop`)).error, "too many redirects");
    assert.deepEqual(destHits, []); // the off-site server (other port) was never asked for anything
    const same = await get(`${s.base}/old`);
    assert.deepEqual([same.status, same.text, same.finalUrl], [200, "here", `${s.base}/new`]);
  } finally { s.srv.close(); dest.srv.close(); }
});

test("round 3 fix 2: a capped --all run says measured N of M and does not claim all pages", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
  const env = { LIGHTHOUSE_CMD: fakeLighthouse(dir), FAKE_LOG: path.join(dir, "calls.log"), FAKE_PERF: "1" };
  const args = ["--url", good.base, "--out", path.join(dir, "audits"), "--runs", "1", "--all"];
  const capped = await run("lighthouse-gate.mjs", [...args, "--max-pages", "2", "--label", "c"], env);
  assert.equal(capped.code, 0);
  assert.match(capped.out, /measured 2 of 3 pages \(capped by --max-pages\)/);
  assert.doesNotMatch(capped.out, /all pages/);
  const full = await run("lighthouse-gate.mjs", [...args, "--label", "f"], env);
  assert.match(full.out, /all pages 99\+ on all four categories/);
  assert.doesNotMatch(full.out, /capped/);
});

test("round 3 fix 3: --max-pages 0, abc and -1 are rejected with a clear message", async () => {
  for (const v of ["0", "abc", "-1"]) for (const gate of ["lighthouse-gate.mjs", "verify-seo.mjs"]) {
    const r = await run(gate, ["--url", good.base, "--out", fs.mkdtempSync(path.join(os.tmpdir(), "lh-")), "--max-pages", v], { LIGHTHOUSE_CMD: "/nonexistent" });
    assert.notEqual(r.code, 0, `${gate} --max-pages ${v}`);
    assert.match(r.out, /--max-pages must be a positive integer/);
  }
});

test("round 3 fix 4: an entity-encoded canonical matches the decoded sitemap URL", () => {
  const html = `<title>T</title><meta name="description" content="${"d".repeat(80)}"><link rel="canonical" href="https://x.dev/s/?a=1&amp;b=2"><h1>H</h1>`;
  const f = verifyPage({ html, page: { url: "/s/", type: "s", canonical: "https://x.dev/s/?a=1&b=2" }, business: {}, siteUrl: "", expectNoindex: false });
  assert.deepEqual(f, []);
});

test("round 3 fix 5: query-only variants get distinct raw files and the fetch URL in the result", async () => {
  const s = await routes((o) => ({ "/sitemap.xml": [200, "application/xml", urlset(o + "/search/?q=a-b", o + "/search/?q=ab")] }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
  const env = { LIGHTHOUSE_CMD: fakeLighthouse(dir), FAKE_LOG: path.join(dir, "calls.log"), FAKE_PERF: "1" };
  try {
    const r = await run("lighthouse-gate.mjs", ["--url", s.base, "--out", path.join(dir, "audits"), "--runs", "1", "--all", "--label", "q"], env);
    assert.equal(r.code, 0);
    assert.equal(fs.readdirSync(path.join(dir, "audits/lh/q")).length, 2);
    assert.match(r.out, /^\/search\/\?q=a-b /m);
    assert.match(r.out, /^\/search\/\?q=ab /m);
    const rep = JSON.parse(fs.readFileSync(path.join(dir, "audits/lighthouse-q.json"), "utf8"));
    assert.deepEqual(rep.pages.map((p) => p.url).sort(), ["/search/?q=a-b", "/search/?q=ab"]);
  } finally { s.srv.close(); }
});

test("Lighthouse runs time out at 180000 ms by default", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 180000);
  const src = fs.readFileSync(path.join(scripts, "lighthouse-gate.mjs"), "utf8");
  assert.match(src, /timeout = DEFAULT_TIMEOUT_MS/); // measure() default
  assert.match(src, /\{ maxBuffer: [^}]*, timeout \}/); // and it reaches execFile
});

// ---- Codex review round 3, last two fixes -------------------------------------------------------------------------
import { offSiteReason } from "../scripts/lib/url-mode.mjs";

test("offSiteReason: same origin and http->https upgrade pass; downgrade, other host, other port, userinfo fail", () => {
  assert.equal(offSiteReason("https://good.example/a", "https://good.example/b"), "");
  assert.equal(offSiteReason("http://good.example/", "https://good.example/"), "");
  assert.equal(offSiteReason("https://good.example/", "http://good.example/"), "downgrade to http");
  assert.equal(offSiteReason("https://good.example/", "https://evil.example/"), "evil.example");
  assert.equal(offSiteReason("http://good.example:8080/", "http://good.example:9090/"), "good.example:9090");
  assert.equal(offSiteReason("http://good/", "http://good@evil/"), "evil");
  assert.equal(offSiteReason("http://good/", "http://user:pw@good/"), "good");
});

test("lighthouse-gate --url: a report that ended on another host fails; same host passes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-"));
  const env = { LIGHTHOUSE_CMD: fakeLighthouse(dir), FAKE_LOG: path.join(dir, "calls.log"), FAKE_PERF: "1" };
  const args = ["--url", good.base, "--out", path.join(dir, "audits"), "--runs", "1", "--max-pages", "1"];
  const off = await run("lighthouse-gate.mjs", [...args, "--label", "off"], { ...env, FAKE_FINAL: "https://evil.example/" });
  assert.equal(off.code, 1);
  assert.match(off.out, /FAIL \/ redirected off-site: evil\.example/);
  const same = await run("lighthouse-gate.mjs", [...args, "--label", "same"], { ...env, FAKE_FINAL: good.base + "/other/" });
  assert.equal(same.code, 0);
  assert.doesNotMatch(same.out, /off-site/);
});

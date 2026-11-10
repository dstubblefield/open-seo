---
name: seo-foundation
description: Use after astro-build, and again after any change to the site. Runs the technical SEO layer on the production build: titles, H1s, descriptions, canonicals, noindex mode, images, schema as a claims layer, internal links, robots.txt, sitemap.xml, llms.txt, _headers and _redirects. Fixes what fails and re-runs until every gate passes.
---

# SEO foundation

Scripts live in `<base>/../../scripts/`. Never check the dev server, and never through WebFetch (it strips JSON-LD).

## Which mode
- **Headless Next.js sites (our client sites): use `--url`.** The site is server-rendered, so there is no `dist/`. Point the gates at the running production server (`next start`) or the live site. Pages come from `<base>/sitemap.xml`, every page is fetched with GET, and the same checks run on the returned HTML.
- **Astro sites only (legacy path): the dist mode** below, which reads `site/dist` plus `site.json` and the content JSON. Do not use it for a Next.js site.

## Step 1: Build fresh
- Next.js: build and start the production server (`npm run build && npm run start`), or use the live URL. Content comes from the platform CMS, so the server needs its env; never print or invent keys.
- Astro: in `site/`, `npm run build`.

## Step 2: Run the gates
Next.js (`<url>` is the site root, for example `http://localhost:3000` or `https://example.com`; add `--max-pages 8` to sample a big site, `--noindex` when a staging site is meant to be noindex):
1. `node "<base>/../../scripts/verify-seo.mjs" --url <url>`
2. `node "<base>/../../scripts/validate-jsonld.mjs" --url <url>` (add `--allow-ratings` only if the client has real reviews)
3. `node "<base>/../../scripts/check-links.mjs" --url <url>`

Checks that need `site.json` (keyword at the front of the title and in the H1, business name and phone on the page, schema telephone, required links, orphan pages) print `skipped: needs site.json`. They did not pass. Say so in the report and check them by hand against `client.md`.

Astro only (dist mode):
1. `node "<base>/../../scripts/verify-seo.mjs" sites/<slug>`
2. `node "<base>/../../scripts/validate-jsonld.mjs" sites/<slug>` (add `--allow-ratings` only if `business/proof.md` has real reviews)
3. `node "<base>/../../scripts/check-links.mjs" sites/<slug>`

## Step 3: Fix and repeat
Fix every FAIL in the content (the platform CMS for Next.js sites, the content JSON for Astro) or the templates (never by removing a page, section, image or link), rebuild or redeploy, and re-run all three until all pass. Never edit live client content without Drew's yes. Common fixes: move the keyword to the front of the title; shorten the description; add the missing link from home or the blog post; put the FAQ text on the page exactly as in schema.

Schema rules (the starter follows them; keep it that way):
- One `@graph` per page. LocalBusiness subtype only if the facts support it (`business.schema_type` in site.json, else LocalBusiness).
- Service per service page, BreadcrumbList on every non-home page, FAQPage only where the FAQ is visible, Article with author on blog posts.
- No rating or review nodes without real reviews. Telephone identical to client.md.

## Step 4: Rebuild mode
If `research/rebuild-redirects.csv` exists, `site/public/_redirects` must hold every 301 row (site-data writes it). Check with `cat site/public/_redirects`.

## Step 5: Report
Print: pages checked, gates passed, and the list of fixes made. Update project-state rows `astro-build` and `seo-foundation` to done.

## House rules
- No em dashes. Never add `noindex` to pass a check, never hide content, never drop a page.

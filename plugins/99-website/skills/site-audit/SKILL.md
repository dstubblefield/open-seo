---
name: site-audit
description: Use after seo-foundation, before any deploy, or on any Astro site to get an honest score. First reads the newest OpenSEO site audit for the project, then builds the production site, runs the three SEO gates and Lighthouse mobile (median of 3 per page template), and writes one prioritised fix list to audits/audit-<label>.md. Never changes the site and never starts a new OpenSEO audit without Drew's yes.
---

# Site audit (the honest starting score)

Scripts live in `<base>/../../scripts/`. This skill only measures. Fixing is auto-fix.

## Step 0: Read the newest OpenSEO audit
Read `openseo_project_id` from `.99-website/setup.json`. Call `list_site_audits`, take the newest one, then `get_audit_status` and `get_audit_issues`. Keep its issues for Step 4 and say when it ran. Free reads only.
- No audit yet, or the newest is older than the last big change: say so and offer `run_site_audit`. Never start it without Drew's yes in chat, because it spends credits.
- OpenSEO audits do not run Lighthouse (`ranLighthouse: false`). They do not replace Step 2.
- OpenSEO not connected: write "OpenSEO audit not available" in the report and continue.

## Which mode
- **Headless Next.js sites (our client sites): use `--url`.** There is no `dist/`; measure the running production server (`next start`) or the live site. Pages come from `<base>/sitemap.xml` and the script never starts a server of its own.
- **Astro sites only (legacy path): the dist mode**, which serves `site/dist` itself. Do not use it for a Next.js site.

## Step 1: Build fresh
- Next.js: `npm run build && npm run start` in the site, or use the live URL. Do not run Lighthouse against production without Drew's yes in chat.
- Astro: in `sites/<slug>/site/`, `npm run build`.
Never measure `npm run dev`.

## Step 2: Lighthouse
- Next.js: `node "<base>/../../scripts/lighthouse-gate.mjs" --url <url> --out sites/<slug>/audits --label <label>`
- Astro: `node "<base>/../../scripts/lighthouse-gate.mjs" sites/<slug> --label <label>`
- `<label>`: `draft` for the first audit of a site, `pass-1`, `pass-2`... during auto-fix, `final` before deploy.
- Add `--all` before deploy (every page once is enough there: `--all --runs 1`).
- It takes about 40 seconds per page per run. Say so before starting.

## Step 3: One list
- Astro: `node "<base>/../../scripts/audit-report.mjs" sites/<slug> --label <label>`
- Next.js: `audit-report.mjs` reads `dist/` and does not support `--url`. Run `verify-seo.mjs --url`, `validate-jsonld.mjs --url` and `check-links.mjs --url` (see seo-foundation), then write the list by hand from their FAIL lines plus `audits/lighthouse-<label>.json`. Keep every `skipped: needs site.json` line in the report.

## Step 4: Report
Show the score table and the P1 items, then the OpenSEO audit issues from Step 0 as a separate list so the two sources are not mixed. Say plainly if everything passes. Never round a 98 up to 99 and never call a noindex SEO score "100" without the note the report prints.
Update project-state row `site-audit` with the label and the lowest score.

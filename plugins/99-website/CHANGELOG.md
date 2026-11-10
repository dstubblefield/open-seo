# Changelog

## 0.2.0 (2026-11-10, OpenSEO)

Local copy in `open-seo-main/plugins/99-website`. Replaces DataWise and DataForSEO with the self-hosted OpenSEO as the data layer.

- **setup-check**: checks the OpenSEO MCP (`whoami`, `list_projects`) and that a project exists for the client domain; records `openseo_project_id` in `.99-website/setup.json`. Drops the DataWise, DataForSEO and treg probes and the `keyword_path` choice. Node, Lighthouse, Chrome and fal checks stay.
- **business-intake**: reads `get_project_context` first and asks the owner only for what is missing; with no project, `create_project` then `research_project_website`. Search Console now comes from OpenSEO. All claim-checking rules and Checkpoint 1 are unchanged.
- **keyword-sitemap**: starts from saved keywords, the rank tracker, Search Console and the research log; new research only for gaps, after an estimate and Drew's yes (ask before any batch over 2,000 credits); People Also Ask via `get_serp_results`, else the `dataforseo` MCP. Writes back with `save_keywords` and `update_project_context`. The 4-part publication gate and Checkpoint 2 are unchanged.
- **site-audit**: reads the newest OpenSEO audit first (`list_site_audits`, `get_audit_status`, `get_audit_issues`), then runs the Lighthouse gate, which OpenSEO audits do not run. `run_site_audit` needs Drew's yes.
- README: promo and affiliate links and the Skool install line removed.
- Scripts, templates and tests are unchanged in this release, except these `--url` mode review fixes: redirects are followed by hand (same host and port only, at most 5, checked before each request), a capped Lighthouse run says "measured N of M pages", `--max-pages` must be a positive integer, canonical entities are decoded before comparing, and Lighthouse raw files for query-only variants no longer overwrite each other.
- `--url` round 3 fixes: an https to http redirect counts as off-site (http to https on the same hostname is still allowed), and a Lighthouse report whose final URL is on another site fails the gate instead of counting its scores; `audit-report` lists such a page as P1 (no all-clear line), and `compare-audits` counts it as a regression in the after run and ignores it as a baseline.

## 0.1.0 (2026-09-29, Stage 1)

Tested end to end on two sites: a real rebuild (myinclusion.com.au, NDIS, Australia) and a fictional new build (Cedar & Stone Landscapes, Charlotte NC).

- **setup-check**: local checks (Node, Cloudflare login, Lighthouse, Chrome, keys, design skills) plus DataWise, DataForSEO, fal and treg connection checks. Picks the keyword data path (DataWise, DataForSEO or manual) and saves `.99-website/setup.json`.
- **business-intake**: new build (one-question-at-a-time interview) or rebuild (crawl the old site, pull Search Console through DataWise, ask only the gaps in one list). Treats old site copy and notes as claims, flags testimonials, ratings and years claims, sensitive-niche rules (NDIS), demo-business mode. Ends at Checkpoint 1.
- **keyword-sitemap**: seeds from services and GSC queries, DataWise `suggestions` + metrics, live SERP reads, a 4-part publication gate, one keyword per page, rebuilds keep URLs that already rank, blog plan, redirect map. Ends at Checkpoint 2.
- Scripts (zero dependencies, `node:test`): `doctor.mjs`, `site-init.mjs`, `confirm-count.mjs`, `crawl.mjs`, `validate-sitemap.mjs` (with `--crawl` for rebuilds), `validate-redirects.mjs`, `lib/csv.mjs`.

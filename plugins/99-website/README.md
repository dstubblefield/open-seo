# 99 Website

Repeatable Claude Code skills that build SEO websites scoring 99 on Lighthouse (Astro + Cloudflare).

This copy lives in `open-seo-main/plugins/99-website` and reads our self-hosted OpenSEO (`openseo.creativemarketing.ai`) for keyword, rank, Search Console and audit data. Upstream pack: AI Ranking `99-website` 0.1.0, MIT.

Status: setup check, business intake, keyword site map and site audit read OpenSEO first. Design, build and deploy skills from the upstream pack are kept in the folder but not used here.

## Skills

| Skill | What it does |
|---|---|
| `/99-website:setup-check` | Checks local tools and the OpenSEO connection, finds the client's OpenSEO project |
| `/99-website:business-intake` | Reads the OpenSEO project context, then learns the rest (interview, or crawl of the old site) into `sites/<slug>/business/` |
| `/99-website:keyword-sitemap` | Turns OpenSEO keyword data into an approved page plan (`site-map.csv`) and saves findings back |
| `/99-website:site-audit` | Reads the newest OpenSEO audit, then runs the Lighthouse gate |

## Keyword data

OpenSEO is the data source. Saved keywords, the rank tracker, Search Console and the project research log are read first. New research spends OpenSEO credits only for gaps, after an estimate and Drew's yes. With no OpenSEO connection, paste your own keywords (volumes stay blank).

## Known limits (URL mode)

`--url` on `verify-seo`, `validate-jsonld`, `check-links` and `lighthouse-gate`:

- Response bodies are buffered whole, so point it at your own sites only, not hostile sitemaps.
- Lighthouse loads pages like a real visitor, so page scripts (analytics, form beacons) run during the audit.
- The HTML attribute regexes expect double-quoted attributes in the usual order (what Next.js emits), so single-quoted or reordered attributes can give a false pass, such as `<meta content="noindex" name="robots">` or `<a href='/x'>`.
- Chrome itself follows redirects during Lighthouse, so an off-site redirect is only detected after the visit (the page then fails), not prevented.

## Tests

    npm test

MIT licence.

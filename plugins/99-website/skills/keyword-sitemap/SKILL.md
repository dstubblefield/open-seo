---
name: keyword-sitemap
description: Use after business-intake is approved, to turn real keyword data into the site's page plan. Starts from what the client's OpenSEO project already holds (saved keywords, rank tracker, Search Console, research log), buys new research only for gaps after an estimate and Drew's yes, checks the live search results, decides how many service pages the business needs, plans 3 to 5 blog posts, maps old URLs for rebuilds, writes research/site-map.csv, and saves what it learned back to OpenSEO. Ends at Checkpoint 2 (page plan approved).
---

# Keyword research that becomes the site map

The page plan is the most important decision in the whole build. Every page must earn its place with real demand, a real service, and something unique to say.

Scripts live in `<base>/../../scripts/` (`<base>` = the "Base directory for this skill" shown above).

## Step 0: Preflight

1. Find the site folder `sites/<slug>/` (ask if there is more than one).
2. `logs/approval-log.md` must contain "Checkpoint 1". If not, say "Run /99-website:business-intake first" and stop.
3. Read `.99-website/setup.json` for `openseo_project_id`. If the file or the id is missing, stop and ask for `/99-website:setup-check` (and `/99-website:business-intake` if no project exists yet).
4. Read all of `business/` (including `notes/`). Take `location_code` and `language_code` from `client.md` front matter. Never default to the US for a non-US business.

## Step 0b: Read what OpenSEO already holds

Free reads first. MCP tool names differ by install; use whichever exists. Nothing in this step spends credits.

1. `list_saved_keywords` for the project: keywords already researched, with their metrics.
2. `get_rank_tracker`: the keywords already tracked and where the site ranks.
3. `get_search_console_performance` (last 90 days), only if the site is connected to Search Console. If it is not, say so and carry on.
4. `get_project_context`: read the research log so you know what was already bought. Do not research it again.

Start `research/keywords.csv` from these rows (`source_tool` = the tool that supplied them). The gaps are the services, towns and customer phrasings from Step 1 that these rows do not cover. Only the gaps get new research.

## Step 1: Seeds

From `services.md` and `areas.md`: each service in the customer's words, each service plus the home city, and obvious customer phrasings ("<service> near me", "<service> cost"). Keep it to 50 seeds or fewer. For a sensitive niche, use the niche's real search terms (for NDIS: "ndis <service>", "<service> provider").

Rebuild mode: the site's own Search Console queries are the best seeds there are, because they are what Google already tests the site for. If the Search Console read in Step 0b worked, take its queries (up to 200) and add the relevant ones as seeds. Skip brand queries, addresses and junk (number strings). Never seed a phrase for something `services.md` says they do not do (My Inclusion: no "cleaning" keywords, even though the old site ranked for them).

## Step 2: Expand and measure

Only for the gaps from Step 0b. MCP tool names may carry a prefix; match on the ending.

| Job | OpenSEO tool |
|---|---|
| Find keywords from seeds | `research_keywords` |
| Find keywords a competitor or the site already ranks for | `get_domain_keyword_suggestions` |
| Volume, CPC, KD, intent | `get_keyword_metrics` |
| Who ranks | `find_serp_competitors` |
| Live results | `get_serp_results` |
| Questions for FAQs and blog posts (People Also Ask) | try `get_serp_results` and look for People Also Ask items; if it returns none, use the existing `dataforseo` MCP (`api_request`, SERP organic live advanced) |
| No OpenSEO connection | Ask the owner to paste keywords (from Keyword Planner, GSC, a client list); volumes stay blank |

Spend rules:
- Every tool above spends credits. Before each one, get the matching estimate (the tool's own cost preview or estimate call), show Drew the number, and wait for a yes. Ask before any batch over 2,000 credits, and say the total of the whole step, not only the next call.
- Never loop. One call per batch, and stop when the gaps are filled.

Rules:
- Niche and local seeds: prefer `get_domain_keyword_suggestions` or phrase-containing results from `research_keywords` over loose related matches ("seek", "red light therapy" for NDIS seeds), which waste credits. For a small niche, the best keyword list is usually GSC queries plus suggestions, then one `get_keyword_metrics` pass to measure them.
- Batch: at most 50 keywords per `get_keyword_metrics` call, or the tool's own limit if lower. Stop expanding at about 300 keywords.
- Search-volume APIs reject keywords over 10 words or with punctuation: clean them first.
- Save every keyword to `research/keywords.csv` with `keyword,volume,cpc,kd,intent,seed,source_tool`. Blank stays blank; `0` stays `0`.
- Write new keywords back to OpenSEO with `save_keywords` so the next build does not re-buy them.
- Small markets (for example Australian suburbs) often show 0. That is normal, not a failure.
- "<service> near me" volumes are national totals (e.g. "landscapers near me" 90,500 for the whole US). Record them, but never make one a page's target keyword.

## Step 3: Cluster

Group keywords that describe the same job and would be answered by the same page. Name each cluster by the highest-volume phrasing a customer uses. Variations of one idea (plural, word order, "near me") are one cluster, never separate pages.

## Step 4: Read the live results

Always read the live results for any keyword with notable volume that sits next to a service word but might mean something else (My Inclusion: "ndis gardening services", 720/mo, turned out to be lawn mowing, not therapeutic gardening). Volume alone never decides a page. Then, for the top 15 clusters by importance to the business, read the live Google results (`get_serp_results` for the business's location, otherwise the WebSearch tool, searching as a user in the business's country; it spends credits, so estimate it with Drew first). For each, note in `research/serp-notes.md`: do the top results show dedicated service pages from local businesses (a separate page is justified), directories and aggregators, or articles (a blog post, not a service page)?

## Step 5: Publication gate

A cluster gets its own page only if ALL are true:
1. **Demand:** volume above 0, OR it is a money-maker service in `services.md` and the results show service pages ranking (small markets).
2. **Results support it:** the live results show pages about exactly this, not one page covering everything.
3. **They do it:** it is in `services.md` (never plan a page for a service they do not offer).
4. **Unique content:** there is enough real, different information (process, scope, price signal, proof) to make it at least 50% different from sibling pages.

Record each decision (kept, merged into another page as a section, turned into an FAQ, dropped) in the `notes` column or `serp-notes.md`.

## Step 6: Intent to page type

- Transactional: service page. Commercial: comparison blog post. Informational: blog post, or an FAQ on the related service page when the answer is short. Navigational: existing page (home, contact). Question variations: FAQ block, never a page per variation.
- Home page targets "<main service> <home city>". There is no area page for the home city. If that phrase belongs to a service page (the business has several services and the main one has its own page), the home page takes the umbrella term instead (My Inclusion: home = "ndis registered provider melbourne", support coordination page = "support coordination melbourne"). One keyword per page still applies.
- Area pages (`/areas-served/<town>-<state>/`) only when `areas.md` lists at least two towns beyond the home city AND there is demand or the results support local pages. No service times town matrix.
- Rebuild mode: **pages that already exist keep their URL**, even when it breaks the pattern above (My Inclusion keeps `/locations/<suburb>/` and the `/locations/` hub). A page that ranks or earns impressions is not moved to match our pattern. Only brand-new pages follow the pattern. Existing blog posts with clicks or impressions are kept (`keep`), each with its own target keyword from its best GSC query; they count toward the blog, so plan only the new posts on top.
- Blog: in rebuild mode, count the kept posts first and plan only new posts on top. Plan 3 to 5 posts, each answering a real question from Step 2 and each linking up to one service page. The first 2 are `phase=now`, the rest `later`.
- Always include: `/` (home), `/services/` (hub), `/about/`, `/contact/`, `/privacy-policy/` (legal). Add `/areas-served/` and `/blog/` hubs only if they have children.

## Step 7: Write `research/site-map.csv`

Header, exactly: `url,slug,page_name,title_tag,page_type,parent,target_keyword,volume,kd,intent,primary_cta,phase,data_source,notes`

- `page_type`: home, hub, service, area, blog, about, contact, legal.
- `url`: `/services/<slug>/`, `/areas-served/<town>-<state>/`, `/blog/<question-slug>/`, `/<slug>/` for about, contact, legal. Lowercase, hyphens, trailing slash, keyword only (no filler, no dates).
- `title_tag`: 60 characters or fewer, keyword first, then a differentiator, then the brand. Unique. For a sensitive niche, no promises.
- `target_keyword`: one per page, never repeated. Blank for hub, about, contact, legal.
- `volume`, `kd`: straight from the tool, or blank. Never estimated.
- `primary_cta`: from `client.md` (`call`, `form`, `booking`).
- `data_source`: `openseo` (or `manual` when keywords were pasted), same on every row.
- Quote any field that contains a comma.

## Step 8: Write `research/blog-plan.md`

For each post: title, the question it answers, target keyword with volume and source, the service page it links to, why it is a post and not an FAQ (the results show full articles, or the AI Overview splits the answer into 2 or more sections), and phase.

## Step 9 (rebuild mode): Map the old URLs

Write `research/rebuild-redirects.csv` with `old_url,new_url,status,notes`. Every path in `research/crawl/pages.jsonl` gets a row:
- `keep`: same URL exists in the new plan.
- `301`: points straight to the closest new page (no chains).
- `410`: removed with no equivalent (write why in `notes`).
A page listed in `research/gsc-top-pages.csv` with clicks is never `410` without a `> CONFIRM:` for the owner.
The crawl only sees pages in the sitemap. Also check `gsc-top-pages.csv` for URLs the crawl missed (for example the same path without a trailing slash) and give them a `301` row to the slash version.

## Step 10: Validate

Run `node "<base>/../../scripts/validate-sitemap.mjs" sites/<slug>/research/site-map.csv` (rebuild mode: add `--crawl sites/<slug>/research/crawl/pages.jsonl` so existing URLs may keep their path) and, in rebuild mode, `node "<base>/../../scripts/validate-redirects.mjs" --crawl sites/<slug>/research/crawl/pages.jsonl --redirects sites/<slug>/research/rebuild-redirects.csv --sitemap sites/<slug>/research/site-map.csv`. Fix every ERROR and re-run until both pass. Read the WARN lines and act on them.

## Step 11: Checkpoint 2 (page plan)

Show the owner:
1. A table: url, target keyword, volume, intent, phase.
2. Page count by type, and one paragraph: "Why this many service pages" (which clusters passed the gate, which were merged, dropped or turned into FAQs, and why).
3. The blog plan titles.
4. Rebuild: redirect counts (keep, 301, 410) and any CONFIRM items.
5. Data source line: "Keyword data: <openseo|manual>, <country>", plus the credits spent this run and what was reused from the project.

Wait for approval. Apply changes, re-validate, show again. Then:
- Call `update_project_context` to add a research log entry: date, what was researched (seeds, tools, location), credits spent, and where the files are. Add the approved key pages. This is what stops the next run buying the same data again.
- Append to `logs/approval-log.md`: `| <YYYY-MM-DD> | Checkpoint 2: page plan | <who approved> | <n> pages (<n> service, <n> blog now) |`
- Update the `keyword-sitemap` row in `logs/project-state.md` to `done`.
- Say: "Page plan approved. Next stage: design and build."

## House rules

- No em dashes.
- Never estimate a number. Never plan a page for a service they do not offer.
- Fewer, stronger pages beat many thin ones.

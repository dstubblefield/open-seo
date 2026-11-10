---
name: setup-check
description: Use first, before building any site with the 99-website pack, or when any 99-website step fails with a connection or login error. Checks Node, Cloudflare login, Lighthouse, Chrome, keys, the design skills, the OpenSEO connection (and that a project exists for the client domain) and the fal connection, then saves .99-website/setup.json with the OpenSEO project id.
---

# Setup check

One screen that says what works, what does not, and the one-line fix for each problem. Run it once per machine and again whenever something breaks. It changes nothing except `.99-website/setup.json` in the current folder.

Scripts live in `<base>/../../scripts/`, where `<base>` is the "Base directory for this skill" shown when this skill loaded.

## Step 1: Local checks

Run `node "<base>/../../scripts/doctor.mjs" --json` and keep the JSON. Do not re-run the individual commands yourself.

## Step 2: Connection checks

One cheap call each, in this order. MCP tool names differ by install (for example `mcp__openseo__whoami` for a project server, `mcp__claude_ai_OpenSEO__whoami` through a claude.ai connector). Use whichever exists. Never print API keys or tokens. Never call a tool that spends OpenSEO credits here.

1. **OpenSEO.** Call `whoami`, then `list_projects`.
   - Both succeed: `ok`.
   - No OpenSEO tool exists, or `whoami` fails to authenticate: `not_connected`.
   - Any other error: `error` with the message.
   - Find the project for the client domain: take the domain from the user, else from `sites/*/business/client.md`, else ask once. Match it against the domains in `list_projects`.
     - One match: record its `projectId`.
     - No match: `no_project` (a WARN, not a blocker). Do not create one here; `business-intake` does that after the owner agrees.
     - Several matches: list them and ask which one.
2. **fal.** Call the fal tool whose name contains `get_pricing` for `fal-ai/flux-2-pro` (if there is no pricing tool, call the one containing `search_models` with query `flux 2 pro`). `ok` with the price if returned, else `not_connected`.

## Step 3: Save `.99-website/setup.json`

Create the `.99-website/` folder in the current working folder if needed and write (overwrite):

    {
      "checked_at": "<ISO timestamp>",
      "openseo_project_id": "<projectId, or null when none>",
      "openseo_project_domain": "<domain, or null>",
      "connections": {
        "openseo": { "status": "ok | not_connected | no_project | error", "detail": "..." },
        "fal":     { "status": "...", "detail": "..." }
      },
      "local": <the doctor JSON>
    }

## Step 4: Show the screen

A table with columns Check, Status (OK, MISSING, WARN), Needed for (now, build, deploy), Fix. Use these fixes:

| Problem | Fix |
|---|---|
| OpenSEO not connected | Add the OpenSEO MCP server (`openseo.creativemarketing.ai`, path `/mcp`) in Claude Code or as a claude.ai connector, authenticate, restart `claude`, type `/mcp` to confirm it is connected |
| OpenSEO has no project for this domain | Nothing to fix now. `business-intake` creates one once the owner agrees |
| fal not connected | Put `export FAL_KEY=...` in `~/.zshrc`, open a new terminal, restart `claude` (this plugin already declares the fal server) |
| Anything from the doctor JSON | Use its `fix` text |

Then one line: `Keyword data: OpenSEO project <projectId or none>`.

Finish with "Ready for business-intake" when `node` is OK and OpenSEO is `ok` or `no_project` (everything else is needed later and shows as WARN, not a blocker). If OpenSEO is `not_connected`, say keyword research will not run until it is fixed, but intake can still start. Suggest the next command: `/99-website:business-intake`.

## House rules

- No em dashes.
- Report honestly. A check you could not run is MISSING or WARN, never OK.

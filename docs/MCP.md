# Staff AI assistant (MCP)

Petwealth staff can use Claude (claude.ai or the Claude desktop app) as an assistant over the admin's data, and to upload lab results, through an MCP connector.

- Endpoint: `https://admin-v2.petwealth.com/api/mcp` (also served on the older `petwealth-admin.perfectlaunch.ai` address, and on `admin.petwealth.com` once that domain is live)
- Sign-in: Clerk OAuth with the same staff login as the admin. Each tool runs with that person's role and permissions; the role also needs **Use the API docs & MCP** (`api.access`) on the Permissions page.
- Code: tools in `packages/api/src/mcp/tools.ts` (thin wrappers over the services); route in `apps/admin/src/app/api/mcp/route.ts`; OAuth discovery in `apps/admin/src/app/.well-known/`.

## Tools

| Tool | What it does |
|---|---|
| `whoami` | Your staff account, role and permissions |
| `get_pipeline` | Dashboard numbers: orders, revenue, kits at each stage |
| `search_customers`, `get_customer` | Find a customer; their pets, kits, orders, addresses |
| `search_pets`, `get_pet` | Find a pet; its owner and kits |
| `search_kits`, `get_kit` | Find kits by code, customer or pet; status, shipping, lab results, timeline |
| `search_orders`, `get_order` | Find orders; items, kits, shipping, timeline |
| `list_lab_runs`, `get_lab_run` | Lab uploads; per kit what was detected, review notes, summary status |
| `upload_lab_results` | Ingest a WellResult CSV exactly like the Lab Results upload. Nothing is released: review and release stay on the Lab Results page |

Everything except `upload_lab_results` only reads.

## One-time setup

1. **Clerk dashboard** (the staff Clerk application, Production instance):
   - **Agents → MCP servers → Add MCP server** with the endpoint URL. Use `https://admin-v2.petwealth.com/api/mcp`. Add another entry only if you also connect through a different admin domain.
   - **OAuth applications → Settings**: make sure **Include Audience** is on (adding the MCP server turns it on) and **Allow public clients to connect** is on, so Claude can register itself.
   - Make sure the `profile` and `email` scopes are enabled.
2. **Vercel** (admin project): nothing new is required. The endpoint accepts the domains in `apps/admin/src/lib/mcp.ts`; set `MCP_RESOURCE_URLS` (comma separated, full `/api/mcp` URLs) to change them.
3. **Permissions page**: give **Use the API docs & MCP** to the roles that should use the assistant.

## Connecting in Claude

Claude → **Settings → Connectors → Add custom connector** → paste the endpoint URL → **Connect**, then sign in with your Petwealth staff login. Ask things like:

- "How many kits are at the lab right now?"
- "Find Jane Smith and show her kits."
- "What did kit FFEC-002-703 show?"
- "Upload this lab file" (attach the WellResult CSV), then "which kits have review notes?"

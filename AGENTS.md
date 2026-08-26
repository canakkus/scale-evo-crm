<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vercel-deployment-rules -->

# Vercel Deployment — Know This Before You Push

- **`main` branch** → wird **automatisch auf Production deployed** (`https://scale-evo-crm.vercel.app`). Jeder Merge/Push auf `main` löst sofort einen Vercel-Build aus (~20-25 Sekunden).
- **Feature- / Fix-Branches** → bekommen eine **Preview-URL**, aber **kein Production-Deployment**. Das ist gewollt und soll so bleiben.
- **Workflow**: Fixes immer auf einem eigenen Branch entwickeln → testen → erst nach erfolgreichem Test auf `main` mergen.
- Es gibt keine `vercel.json` im Repo — die Deployment-Konfiguration liegt im Vercel Dashboard (Projekt: `scale-evo-crm`, Org: `can-akkus-projects`).

<!-- END:vercel-deployment-rules -->

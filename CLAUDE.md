# CLAUDE.md — Developer Guide & Project Log

This file contains the guidelines, build commands, recent changes, and troubleshooting history for **Scale Evo CRM 3.0**. Update this file after making changes so future developers/agents have a clear context.

---

## 🛠 Build & Development Commands

* **Install dependencies:** `npm install`
* **Run development server:** `npm run dev`
* **Build production build:** `npm run build`
* **Start production server:** `npm run start`
* **Run TypeScript type checks:** `npm run typecheck` (or `npx tsc --noEmit`)
* **Push database schema changes:** `npx prisma db push`
* **Generate Prisma client:** `npx prisma generate`
* **Run user provisioning script:** `npm run users:provision`

---

## 🎨 Tech Stack & Architecture

* **Framework:** Next.js 16 (App Router, Turbopack, Tailwind CSS v4)
* **Database & ORM:** Prisma ORM, PostgreSQL (hosted on Supabase)
* **Auth:** Supabase Auth (`@supabase/ssr` server-side cookies)
* **Integrations:**
  * **Google Places API** (Category scout searches & place data enrichment)
  * **Google Generative AI SDK (Gemini)** (Transcriptions, sentiment analysis, AI assistant chat)

---

## 📌 Coding Guidelines

1. **Imports:** Use absolute path aliases starting with `@/` (e.g. `@/components/leads/...` or `@/lib/prisma`).
2. **Styles:** Use Tailwind v4 along with custom theme CSS variables (`var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--accent)`) to ensure consistency across views.
3. **Database Changes:** Always check `prisma/schema.prisma` and sync with `npx prisma db push` to keep the database aligned.
4. **Vercel Deployments:** To avoid flooding chat outputs, run Vercel builds using the quiet deployment script:
   `python3 "/Users/can/.gemini/antigravity/brain/<conv-id>/scratch/deploy_quietly.py"`

---

## 🚀 Recent Changes (Log)

### August 2026

* **Rhetorik- & Sprechstil-Coaching für Calls:**
  * Added `aiFeedback` Json field to `CallRecording` schema and synced database.
  * Configured Gemini Prompt in `transcribeAndAnalyzeCall` to evaluate pace (speed), stuttering/filler words, and emotional tone (calmness), giving concrete coaching tips.
  * Added a dedicated visual card showing speaking style feedback in the expanded Call Recording UI.
* **KI-Assistent Supercharged (Function Calling):**
  * Configured Gemini Function Calling (Tool Use) on `/api/ai/chat`.
  * Gemini can now dynamically execute backend functions: `searchLeads`, `getLeadDetails`, `updateLeadStatus`, `createTask`, `addLeadInteraction`, and `runScoutSession`.
  * Implemented an inline Markdown parser in the chat bubble UI to render headings, bolding, lists, and code snippets correctly.
* **Multi-Select Branchen-Filter:**
  * Replaced the standard industry select dropdown in `LeadsTable` with a custom React popover containing checkboxes, filter search, and reset capabilities.
  * Added query logic to dynamically fetch all distinct custom industries currently present in the database.
* **Inline Audio Player & Storage:**
  * Added the `AudioFile` relation model in Prisma to store call recordings as binary data (`Bytes`) directly in PostgreSQL.
  * Created streaming API endpoint `/api/cold-calls/recordings/[id]/audio` to serve audio buffers as streaming responses.
  * Rendered an HTML5 `<audio controls>` player within each expanded call transcript card.
* **HTML5 Drag & Drop Uploads:**
  * Added drag-and-drop file upload capabilities for audio files (supporting `.mp3`, `.wav`, `.m4a`, `.ogg`) inside the Lead Details modal and general Cold Calls modal.
* **Google Maps Link Enrichment:**
  * Programmed automatic Places API enrichment in the lead PATCH route. Pasting a Google Maps link (including `maps.app.goo.gl` redirects) parses the location name and retrieves missing details (phone, website, address, stars rating, and reviews counts).
  * Automatically overwrites outdated fields unless the user manually inputs a override in the form.

---

## ⚠️ Troubleshooting & Error History

* **TypeScript Compilation Failures (`LeadScoutOptions` match):**
  * *Error:* `"any"` is not assignable to type `"all" | "no" | "yes" | undefined` on filter parameters in `gemini.ts`.
  * *Fix:* Changed the default filter arguments in `gemini.ts` from `"any"` to `"all"`.
* **Zsh Glob matching errors during Git commits:**
  * *Error:* `no matches found: src/app/api/leads/[id]/route.ts` when adding files to Git.
  * *Fix:* Escaped or wrapped bracket paths in double quotes: `git add "src/app/api/leads/[id]/route.ts"`.

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
4. **Vercel Deployments & Branching Workflow:**
   * **`main` branch** → automatically triggers a production deployment to `https://scale-evo-crm.vercel.app` on every push/merge.
   * **Feature/Fix Branches** → generate preview URLs only (never production). This is intended and should remain this way.
   * **Rule of Thumb:** Always develop and test on dedicated feature/fix branches before merging into `main`.

---

## 🚀 Recent Changes (Log)

### August 2026

* **Google Places API & Region Code Trimming Fix:**
  * Added `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACES_REGION` environment variables to Vercel production & development.
  * Added defensive `.trim()` for `GOOGLE_PLACES_REGION` across `/api/places`, `lead-scout.ts`, and `/api/leads/[id]` to prevent `Invalid region code 'AT '` Unicode CLDR errors caused by trailing whitespaces.
  * Enhanced error handling and timeout propagation with `AbortSignal.timeout(8000)` in `/api/places` to surface actionable Google Places API error messages.
* **Lead Scout Engine & Treatwell Fallback:**
  * Updated Treatwell scraping endpoints and added automatic Google Places fallback when Treatwell returns 0 results.
* **Gemini Function Calling (Role 'function' 400 Fix):**
  * Fixed 400 Bad Request error `Role 'function' is not supported` during tool execution (`runScoutSession`, etc.) in `chatWithAssistant`.
  * Replaced `startChat` / `sendMessage` pattern with direct `model.generateContent({ contents })` to manually manage history turns, sending function response parts under role `"user"` as required by the Gemini API.
* **Rhetorik- & Sprechstil-Coaching für Calls:**
  * Added `aiFeedback` Json field to `CallRecording` schema and synced database.
  * Configured Gemini Prompt in `transcribeAndAnalyzeCall` to evaluate pace (speed), stuttering/filler words, and emotional tone (calmness), giving concrete coaching tips.
  * Added a dedicated visual card showing speaking style feedback in the expanded Call Recording UI.
* **KI-Assistent Supercharged (Function Calling):**
  * Configured Gemini Function Calling (Tool Use) on `/api/ai/chat`.
  * Gemini can now dynamically execute backend functions: `searchLeads`, `getLeadDetails`, `updateLeadStatus`, `createTask`, `addLeadInteraction`, and `runScoutSession`.
  * Implemented an inline Markdown parser in the chat bubble UI to render headings, bolding, lists, and code snippets correctly.
  * **Bugfix:** When Gemini/Groq calls `createTask` with category `FOLLOW_UP` and a `leadId`, it now automatically updates the lead's `status` to `FOLLOW_UP` and sets `nextFollowUpAt` to the task's due date, ensuring the lead appears in the filtered pipeline/table correctly.
* **Lead Filterung nach Arbeitstag (Zuletzt geändert):**
  * Added `updatedDate` query parameter filter to the GET `/api/leads` route. Supports presets (`today`, `yesterday`, `thisWeek`) as well as custom dates (`YYYY-MM-DD`).
  * Updated `LeadsTable` component with UI controls for filtering leads by update date. Included presets and a custom date picker.
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

* **Interactions & Timeline Improvements:**
  * Added inline editing capabilities for past interactions directly inside the `LeadDetailModal` timeline, backed by a new `PATCH /api/interactions/[id]` API route.
  * Added visual feedback (loading spinners and state changes) for adding new interactions to prevent duplicate submissions and clarify network delays.

---

## ⚠️ Troubleshooting & Error History

* **Gemini SDK Function Response 400 Bad Request (`Role 'function' is not supported`):**
  * *Error:* ChatSession in `@google/generative-ai` sends function response parts with role `'function'` or `'tool'`, which the API rejects with 400.
  * *Fix:* Call `model.generateContent({ contents })` directly and append function response parts as a turn with `role: "user"`.
* **Google Places Invalid Region Code (`Invalid region code 'AT '`):**
  * *Error:* Trailing whitespace in `GOOGLE_PLACES_REGION` env var caused CLDR validation failure in Google Places API.
  * *Fix:* Applied `.trim()` in code and re-saved the environment variable without whitespace.
* **TypeScript Compilation Failures (`LeadScoutOptions` match):**
  * *Error:* `"any"` is not assignable to type `"all" | "no" | "yes" | undefined` on filter parameters in `gemini.ts`.
  * *Fix:* Changed the default filter arguments in `gemini.ts` from `"any"` to `"all"`.
* **Zsh Glob matching errors during Git commits:**
  * *Error:* `no matches found: src/app/api/leads/[id]/route.ts` when adding files to Git.
  * *Fix:* Escaped or wrapped bracket paths in double quotes: `git add "src/app/api/leads/[id]/route.ts"`.


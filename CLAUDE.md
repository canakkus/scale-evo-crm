# Scale Evo CRM 3.0 — Developer & Architecture Guide

## 🛠 Commands

- **Dev Server:** `npm run dev` (running on `http://localhost:3000`)
- **Typecheck:** `npx tsc --noEmit`
- **Production Build:** `npm run build`
- **Database Push:** `npx prisma db push`
- **Prisma Client Generate:** `npx prisma generate`

---

## 🎨 Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack, Tailwind CSS v4)
- **Database & ORM:** PostgreSQL (Supabase) + Prisma ORM
- **Authentication:** Dual-Auth System:
  - Custom Web Crypto HMAC-SHA256 session cookies (`crm_user_session`)
  - Supabase Auth (`@supabase/ssr`)
- **Gatekeeping:** `src/proxy.ts` (strict Next.js 16 Proxy interceptor)
- **External APIs:**
  - Google Places API (Places Search & Address/Phone Enrichment)
  - Groq SDK (Whisper `whisper-large-v3` for <2s speech-to-text, `openai/gpt-oss-120b` for AI Chat, Tool Calling, Task Prioritization & Call Analysis)
  - Google Generative AI (Gemini 1.5 Flash SDK fallback for Menu Detection & Assistant)

---

## 📌 Architecture & Rules

### 1. Vercel Deployment & Git Workflow
- **`main` branch:** Automatically deploys to Production (`https://scale-evo-crm.vercel.app`) on every push (~20-25s build).
- **Feature branches:** Deploy to preview URLs only. Always develop/test on feature branches first.

### 2. Multi-Tenancy & Workspace Isolation
- Leads, pipeline stages, dashboard metrics, tasks, scout sessions, and AI context are scoped per user (`createdById: user.id` or `assignedToId: user.id`).
- When a new user logs in, they start with a clean isolated workspace.

### 3. Groq AI & Automatic Key Rotation (`src/lib/groq-key-manager.ts` & `src/services/groq.ts`)
- **Key Rotation System:** Supports `GROQ_API_KEY_1` through `GROQ_API_KEY_10` (or single `GROQ_API_KEY`).
- **429 Rate-Limit Handling:** `withGroqClient()` catches HTTP 429 rate-limits, puts the key into a 65s cooldown, and rotates immediately to the next available key across attempts.
- **Robust `<think>` Token & JSON Extraction:** Uses `extractFirstJsonObject()` and `cleanAndParseJson()` to strip `<think>...</think>` reasoning tokens and markdown fences, preventing JSON parse failures.

### 4. Sidebar Customization & Feature-Toggles
- **Custom Tab Reordering & Visibility:** `sidebarConfig` is stored on the `User` model in Prisma. Users can freely sort/reorder tabs (Up/Down) and toggle tab visibility in `/settings`.
- **Dynamic Real-Time Sync:** Sidebar reacts to `user-settings-updated` custom events and renders the custom order and visibility instantly without page reloads.
- **Per-User Modules:** `restaurantScoutEnabled` controls access to Restaurant Scout and is toggleable in Settings.

### 5. Styling & Responsive Design
- Tailwind v4 with CSS variables: `var(--bg)`, `var(--surface)`, `var(--surface-2)`, `var(--surface-3)`, `var(--border)`, `var(--text)`, `var(--accent)`.
- iPad & Tablet friendly: touch momentum scrolling (`-webkit-overflow-scrolling: touch`), min 44px tap targets, collapsible panels, and floating mobile/tablet drawer.

---

## 🚀 Key Modules

### 1. Cold Calls, Automatic Dialogue Formatting & Sales Coaching (`/cold-calls`, `src/services/groq.ts`)
- **Transcription (Step 1):** Groq `whisper-large-v3` converts audio into raw text in ~1-2 seconds.
- **Dialogue & Diarization Formatting (Step 2):** `openai/gpt-oss-120b` (with native `response_format: { type: "json_object" }`) formats continuous raw transcripts into clean speaker-separated dialogue (`[Anrufer]` vs. `[Kunde]`).
- **Analysis:** Automatically extracts structured `summary`, `nextSteps`, `sentiment`, `extractedData` (contact, appointment date, objections, interest level) and `aiFeedback` (pace, stuttering/fillers, tone, rhetoric tips).
- **Reprocessing Utility:** `scripts/reprocess-call-recordings.ts` to re-analyze and re-format historical recordings.

### 2. AI Assistant Chat & Tooling (`/ai-assistant`, `src/services/groq.ts`)
- **Model:** Groq `openai/gpt-oss-120b` with Function/Tool Calling.
- **Available Tools:**
  - `listLeads`: Flexible lead querying with sorting (e.g. `sortBy="createdAt"`, `sortOrder="asc"` for oldest leads), date filtering (`olderThanDays`), status, and pagination.
  - `bulkUpdateLeadStatus`: Batch-updates lead status (e.g. bulk-setting stale/uncontacted leads to `NOT_RELEVANT` or `LOST`).
  - `searchLeads`, `getLeadDetails`, `updateLeadStatus`, `createTask`, `addLeadInteraction`, `runScoutSession`, `scoutRestaurants`.
- **Leads API Sorting:** `GET /api/leads` supports dynamic `sortBy` (`createdAt`, `updatedAt`, `score`, `companyName`, `status`, `lastContactAt`) and `sortOrder` (`asc`/`desc`).

### 3. Sidebar Configurator (`/settings` & `src/lib/nav-config.ts`)
- **Helper:** `resolveNavConfig(savedConfig, restaurantScoutEnabled)`
- **Features:** Visual card in Settings with tab icons, numbering (1..12), move up/down controls, eye toggle to show/hide tabs, and "Standard wiederherstellen" button.

### 4. Lead Scout (`/lead-scout`) & Restaurant Scout (`/restaurant-scout`)
- **Service:** `src/services/lead-scout.ts`, `src/services/restaurant-scout.ts` + `src/lib/menu-detector.ts`
- **Haversine Distance Calculator (`src/lib/distance.ts`):** Calculates distance in km from base coordinates (defaults to Stephansplatz, 1010 Wien). Displays distance badges (`X.X km entfernt`) on result cards.
- **Proximity Sorting:** Supports `sortBy: "distance"` for optimal walk-in route scouting in addition to `sortBy: "rating"`.
- **Direct Status Assignment & Walk-In Flagging:** Category dropdown for all pipeline statuses + checkbox **"Als Walk-In Vormerken"** (`acquisitionType: "WALK_IN"`, defaults to `WALK_IN_PLANNED` with optional `nfcDemoUrl`).
- **Menu Radar:** Automatically verifies digital menus (HTML/PDF/Lieferando/Wolt) from Google Places results.

### 5. Walk-In Acquisition System & Dual-Pipeline (`/pipeline`, `/leads`, `src/lib/constants.ts`)
- **Schema & Enums:** `AcquisitionType` (`CALL`, `WALK_IN`), `nfcDemoUrl` string, and specialized Walk-In statuses:
  - `WALK_IN_PLANNED`: Vor-Ort-Besuch geplant
  - `DEMO_DISPATCHED`: Vor-Ort-Demo übergeben / hinterlassen
  - `VISITED_INTERESTED`: Besucht — Interesse signalisiert
  - `VISITED_NO_INTEREST`: Besucht — Kein Interesse
- **Dual-Pipeline View Switcher:** Toggle between **Cold Call Pipeline** (11 stages) and **Walk-In Pipeline** (11 stages) with custom stage transitions (`CALL_NEXT_STATUS`, `WALK_IN_NEXT_STATUS`).
- **Acquisition Filter & Badges:** Leads table filtering by `acquisitionType` (`Alle`, `Nur Cold Calls`, `Nur Walk-Ins`), visual Walk-In badges (`🚶 Walk-In`), and 1-click NFC Demo URL copying.

### 6. Auth, Session Management & User Badging
- **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`
- **Helpers:** `src/lib/session.ts` (Web Crypto HMAC-SHA256), `src/lib/auth.ts` (`requireAuth`, `getOptionalUser`)
- **Credentials Security:** Server-side verification with salted SHA-256 hashes.
- **User Status:** Subtle avatar badge and user indicator at the bottom of the sidebar and settings profile card.

### 6. Walk-In Akquise, NFC Demos & Proximity Scouting (`/pipeline`, `/lead-scout`, `src/lib/distance.ts`)
- **Acquisition Channel Separation:** Leads are typed via `acquisitionType` (`CALL` vs. `WALK_IN`, default `CALL`).
- **Dedicated Walk-In Pipeline:**
  - Instant Tab Switcher in `/pipeline` between Cold Call and Walk-In kanban boards.
  - Dedicated stages: `WALK_IN_PLANNED` (Walk-In geplant), `DEMO_DISPATCHED` (Demo versendet), `VISITED_INTERESTED` (Besucht - Interessiert), `VISITED_NO_INTEREST` (Besucht - Kein Interesse).
  - Channel-specific advancement mappings (`CALL_NEXT_STATUS` vs. `WALK_IN_NEXT_STATUS`).
- **NFC Demo URLs & Fast Actions:**
  - Dynamic `nfcDemoUrl` per lead with 1-click clipboard copy, external demo opening, and direct Google Maps route opening.
- **Distance & Proximity Calculation:**
  - `src/lib/distance.ts`: Haversine formula calculation against customizable/default base coords (Stephansplatz, 1010 Wien).
  - Lead Scout & Restaurant Scout support distance sorting and direct Walk-In import.

---

## ⚠️ Important Gotchas

1. **Groq Models & JSON Output:** Use `openai/gpt-oss-120b` with `response_format: { type: "json_object" }` for structured outputs (call analysis, task prioritization). Reasoning models (like `qwen3.6-27b`) can get caught in `<think>` token loops that exhaust the token budget before outputting JSON.
2. **Key Rotation & Cooldown:** Always wrap Groq calls with `withGroqClient()` to leverage automatic 429 rate-limit rotation and 65-second cooldown management.
3. **Gemini Function Calling:** Function response turns must use `role: "user"` (the API rejects `role: "function"` with a 400 error).
4. **Google Places Region Code:** Always use `.trim()` on `GOOGLE_PLACES_REGION` to avoid CLDR trailing whitespace errors (e.g. `'AT '`).
5. **App Router Middleware:** Next.js 16 uses `src/proxy.ts` (with `export async function proxy`) rather than `middleware.ts`.


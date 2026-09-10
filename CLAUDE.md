# Scale Evo CRM 3.0 — Developer & Architecture Guide

## 🛠 Commands

- **Dev Server:** `npm run dev` (running on `http://localhost:3000`)
- **Typecheck:** `npx tsc --noEmit`
- **Production Build:** `npm run build`
- **Database Push:** `npx prisma db push`
- **Prisma Client Generate:** `npx prisma generate`
- **Lint:** `npm run lint`
- **User anlegen:** `npm run users:provision` (braucht `SUPABASE_SERVICE_ROLE_KEY`)
- **Instagram-Anbindung prüfen:** `npm run instagram:check`
- **Instagram-Token einrichten:** `npm run instagram:setup -- <kurzlebiges-Token>`

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
  - Instagram Graph API (Business Discovery für Profildaten — siehe Modul 8)

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
- **Schema & Enums:** `AcquisitionType` (`CALL`, `WALK_IN`, `DM` — siehe Modul 8), optional `nfcDemoUrl`, and specialized Walk-In statuses:
  - `WALK_IN_PLANNED`: Vor-Ort-Besuch geplant
  - `DEMO_DISPATCHED`: Vor-Ort-Demo übergeben / hinterlassen
  - `VISITED_INTERESTED`: Besucht — Interesse signalisiert
  - `VISITED_NO_INTEREST`: Besucht — Kein Interesse
- **Pipeline View Switcher:** Instant segmented toggle in `/pipeline` zwischen **Cold Call**, **Walk-In** und **Instagram DM** mit eigener Stufenlogik (`CALL_NEXT_STATUS`, `WALK_IN_NEXT_STATUS`, `DM_NEXT_STATUS`).
- **Card & Table Quick-Actions:**
  - 🗺️ **Google/Apple Maps Navigation:** Direct 1-click route link constructed from lead address/place coordinates.
  - 📡 **NFC Demo URL:** 1-click copy with instant visual "Kopiert!" feedback + external demo preview.
  - 📞 **Direct Call:** Instant dialer link (`tel:`).
- **Leads Filter & Detail Modals:** Filter bar in `/leads` (`[ Alle ] [ 📞 Cold Calls ] [ 🚶‍♂️ Walk-Ins ] [ 💬 Instagram DM ]`), acquisition channel badges, and full viewing/editing in `LeadDetailModal` (Tabs: Timeline, Gemini, Outreach) and `LeadFormModal`.

### 6. Distance & Proximity Scouting (`/lead-scout`, `/restaurant-scout`, `src/lib/distance.ts`)
- **Haversine Distance Calculator (`src/lib/distance.ts`):** Computes distances from base coordinates (defaults to Stephansplatz, 1010 Wien). Displays distance badges (`X.X km entfernt`) on scout cards.
- **Proximity Sorting:** Supports `sortBy: "distance"` for optimal route planning in addition to rating-based sorting.
- **Direct Walk-In Lead Creation:** "Als Walk-In Vormerken" checkbox automatically assigns `acquisitionType: "WALK_IN"`, default status `WALK_IN_PLANNED`, and saves optional `nfcDemoUrl`.

### 7. Auth, Session Management & User Badging
- **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`
- **Helpers:** `src/lib/session.ts` (Web Crypto HMAC-SHA256), `src/lib/auth.ts` (`requireAuth`, `getOptionalUser`)
- **Credentials Security:** Server-side verification with salted SHA-256 hashes.
- **User Status:** Subtle avatar badge and user indicator at the bottom of the sidebar and settings profile card.

---

### 8. Instagram-Outreach (`/outreach`, `src/services/instagram/`, `src/services/outreach-generator.ts`)
- **Zweck:** Instagram als Lead-Quelle und Ansprachekanal. Erzeugt personalisierte Erstansprachen — wahlweise als Instagram-DM oder als Telefon-/Walk-In-Gesprächseinstieg.
- **Discovery (`searchInstagramProfiles` in `src/services/web-search.ts`):** Sucht Profile über die bestehende DuckDuckGo/Bing-Pipeline (`site:instagram.com`), **nicht** über Instagram selbst. Mehrdeutige Treffer werden zur Auswahl gestellt, nie geraten. Im Lead Scout als 5. Kachel der Ergebniskarte sichtbar.
- **Anreicherung (`src/services/instagram/resolve-provider.ts`):** Wählt automatisch die beste Quelle — Graph API wenn konfiguriert, sonst öffentlicher Seitenabruf. **Wichtig:** Der öffentliche Abruf liefert ausgeloggt nur Followerzahl und Namen; `biography`, `external_url` und Post-Datum fehlen. Deshalb unterscheidet `InstagramProfile.externalUrlKnown` zwischen *unbekannt* und *nicht vorhanden* — fehlende Daten dürfen **niemals** Score-Punkte erzeugen.
- **Scoring (`src/services/instagram/score.ts`):** Befüllt erstmals die zuvor ungenutzten Prisma-Felder `score`, `scoreReasons`, `opportunityTags`, `interestingReason`. Signale u. a.: kein Link in Bio (+25), Termine per DM (+20), nur Linktree (+20), aktiv (+15), eigene Website (−30). Schwellen: ≥70 heiß, 40–69 lauwarm, <40 kalt.
- **Generator (`src/services/outreach-generator.ts`):** Drei editierbare Varianten, drei Tonalitäten, Groq primär mit Gemini als Rückfall. **Ohne konkreten Aufhänger wird nichts generiert** — eine Nachricht ohne Profilbezug ist ein Serienbrief. Der Prompt verbietet ausdrücklich erfundene Zahlen und Behauptungen über nicht übergebene Fakten.
- **Senden ist strikt Human-in-the-Loop:** Kopieren → Deep-Link `ig.me/m/<handle>` → manuelle Bestätigung. Erst die Bestätigung schreibt `Interaction(INSTAGRAM)` mit vollem Wortlaut, setzt `CONTACTED` + `lastContactAt` und legt den Tag-3-Follow-up-Task an. Kein Auto-Versand — Instagram bietet dafür keine API und sperrt Accounts.
- **Warm-up & Tagesbudget:** Vor der DM folgen + liken, dann 2 Tage reifen lassen (`WARMUP_TASK_PREFIX` in `src/lib/outreach-shared.ts`, abgebildet über das Task-Modell). Tagesbudget startet bei 5, konfigurierbar bis 20 — warnt, sperrt aber nie.
- **Dritte Pipeline:** `AcquisitionType.DM` neben `CALL` und `WALK_IN`, mit `DM_PIPELINE_STATUSES` und `DM_NEXT_STATUS`. Bewusst **keine** neuen `LeadStatus`-Werte — `TO_CONTACT`/`CONTACTED`/`REPLIED` bilden den Flow bereits ab.
- **Fokus-Modus:** Vollbild mit Tastaturkürzeln (C kopieren, Enter bestätigen, S überspringen, 1–3 Variante, D/T Kanal, G neu generieren, W Warm-up, Pfeile navigieren, ? Übersicht).

### 9. Instagram Graph API — Einrichtung & aktueller Stand
- **Konfiguration:** `INSTAGRAM_GRAPH_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, optional `INSTAGRAM_GRAPH_VERSION` (Standard `v21.0`). Für die Einrichtung zusätzlich `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET`.
- **Was funktioniert:** Direkte Feldabfrage auf den **eigenen** Account liefert vollständige Daten (username, followers_count, media_count, website, biography).
- **Was blockiert ist:** `business_discovery` — also das Auslesen **fremder** Profile — scheitert mit `(#10) Application does not have permission for this action`. Das braucht **Advanced Access für `instagram_basic`** über Metas App Review inklusive Business-Verifizierung. Bis dahin greift automatisch der Rückfall auf den öffentlichen Seitenabruf; **am Code muss dafür nichts geändert werden**.
- **Stolperfalle:** Ein Instagram-Konto kann einem **Business-Portfolio** gehören („Owned by: …") und trotzdem **nicht mit der Facebook-Seite verbunden** sein. Die Graph API greift ausschließlich über die Seite zu. Verbinden über *Business Suite → Instagram-Konto → Connect assets*.
- **Token-Lebensdauer:** Kurzlebige Tokens aus dem Graph API Explorer halten ~1 Stunde, langlebige ~60 Tage. Läuft die Anreicherung still aus, ist meist das Token abgelaufen — `npm run instagram:check` zeigt es sofort.

## ⚠️ Important Gotchas

1. **Groq Models & JSON Output:** Use `openai/gpt-oss-120b` with `response_format: { type: "json_object" }` for structured outputs (call analysis, task prioritization). Reasoning models (like `qwen3.6-27b`) can get caught in `<think>` token loops that exhaust the token budget before outputting JSON.
2. **Key Rotation & Cooldown:** Always wrap Groq calls with `withGroqClient()` to leverage automatic 429 rate-limit rotation and 65-second cooldown management.
3. **Gemini Function Calling:** Function response turns must use `role: "user"` (the API rejects `role: "function"` with a 400 error).
4. **Google Places Region Code:** Always use `.trim()` on `GOOGLE_PLACES_REGION` to avoid CLDR trailing whitespace errors (e.g. `'AT '`).
5. **App Router Middleware:** Next.js 16 uses `src/proxy.ts` (with `export async function proxy`) rather than `middleware.ts`.
6. **`tsx` lädt die `.env` NICHT von selbst.** Anders als Next.js und Prisma. Alle Skripte in `package.json` laufen deshalb über `tsx --env-file-if-exists=.env`. Wer ein neues Skript ergänzt und das vergisst, bekommt scheinbar leere Umgebungsvariablen.
7. **TypeScript ist bewusst auf `^6.0.3` gepinnt.** `typescript-eslint` bricht bei TS 7 hart ab (`typescript-eslint does not support TS 7.0`), wodurch `npm run lint` projektweit unbenutzbar war. Erst wieder hochziehen, wenn typescript-eslint TS 7 unterstützt.
8. **Instagram-Handles immer über `normalizeInstagramHandle()`** aus `src/lib/utils.ts` normalisieren. Das Feld `Lead.instagram` enthält historisch mal ein nacktes Handle, mal eine volle URL, mal mit `?igshid=`-Anhang. Die Funktion fängt alle Formen ab und weist Fremd-Hosts zurück — ohne sie feuerte das 80-Punkte-Duplikat-Signal in `dedup.ts` nie, und Fremd-URLs wurden fälschlich als gleiches Profil gewertet.
9. **Lokale Entwicklung gegen eine Kopie:** Statt direkt auf die Supabase-Produktivdaten zu entwickeln, empfiehlt sich ein lokaler Postgres-Container mit einem `pg_dump` der Produktion. Die Supabase-Direktverbindung (`db.<ref>.supabase.co`) löst nur auf **IPv6** auf — ohne IPv6 muss `DIRECT_URL` lokal auf den Session-Pooler (Port 5432) zeigen, sonst schlägt jede Prisma-Operation mit `P1001` fehl.

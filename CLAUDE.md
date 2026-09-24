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
  - Groq SDK (Whisper `whisper-large-v3` for speech-to-text with `verbose_json` timestamps, `openai/gpt-oss-120b` for AI Chat, Tool Calling, Task Prioritization & Call Analysis)
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
- **Geteilte Arbeitsbereiche (`src/lib/workspace.ts`):** `SHARED_WORKSPACE_EMAILS` verknüpft Accounts (Mitglieder mit `,`, Gruppen mit `;`), die gegenseitig **alle** Leads sehen und bearbeiten — inklusive Interaktionen, Aufnahmen und Audits. Tasks, Scout-Sessions und DM-Entwürfe bleiben persönlich.
- **Lead-Zugriff ausschließlich über `leadScope()` / `findAccessibleLead()`** — nie selbst `OR: [{ createdById }, { assignedToId }]` bauen, nie `findUnique({ where: { id } })` auf einen Lead ohne Scope. Routen mit Lead-ID antworten bei fremden Leads mit 404. Achtung beim Spreaden: `leadScope()` liefert ein Top-Level-`OR`; ein zweites `OR` im selben Objekt überschreibt es still — dann in `AND: [...]` kapseln.
- Die Gruppe gilt nur, wenn Session-E-Mail und DB-E-Mail des Accounts übereinstimmen. `SESSION_SECRET` hat **keinen** Rückfall auf öffentliche Keys; fehlt es in Produktion, schlägt der Login fehl (gewollt).

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
- **Transcription (Step 1):** Groq `whisper-large-v3` converts audio into timestamped segments (`verbose_json`).
- **Dialogue & Role Disambiguation (Step 2):** Groq `openai/gpt-oss-120b` (with native `response_format: { type: "json_object" }`) formats continuous timestamped raw transcripts into clean speaker-separated dialogue (`[Anrufer / Verkäufer]` vs. `[Kunde / Ansprechpartner]`).
- **Strict Role Rules:** Enforces cold-call greeting logic (the person answering phone is `[Kunde / Ansprechpartner]`, the person introducing/pitching is `[Anrufer / Verkäufer]`), prohibiting mid-call role swaps and centering `aiFeedback` exclusively on the seller.
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
- **City Autocomplete:** Saves past searched cities per user session and provides an HTML `<datalist>` for fast location input, combining major default cities with user history.
- **Broad Discovery Mode:** A special category option that parallel-fetches multiple categories at once (restaurants, barbers, retail, etc.), deduplicates results, and uses a weighted scoring algorithm (`rating * log10(reviewCount)`) to rank quality regardless of category limits (supports up to 100 max results).

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

### 8. Scrapling Scraper Backend (`scrapers/scrapling_scrapers.py`, `src/services/scrapling.ts`)
- **Architecture:** Replaces legacy Node.js/Cheerio scrapers with an undetected Python **Scrapling** backend to bypass Cloudflare & antibot protections.
- **Node-to-Python Bridge:** `src/services/scrapling.ts` spawns the Python wrapper and communicates via JSON over stdin/stdout. (Paths are interpolated to bypass Next.js Turbopack tracing).
- **Modules Covered:** DuckDuckGo/Bing web searches (`web-search.ts`), Treatwell JSON-LD extraction (`treatwell.ts`), and Website HTML auditing (`website-provider.ts`).

### 9. Apple Reminders & Calendar Bridge (`src/services/apple-bridge.ts`, `src/app/api/leads/[id]/reminder`)
- **Target User Exclusivity:** Exclusively enabled for `canakkus378@gmail.com`.
- **Double-Sync Targets:**
  - **Apple Reminders:** Pushes to list `WORKSHIT` (VTODO via CalDAV / AppleScript).
  - **Apple Calendar:** Pushes to calendar `Privat` (VEVENT with 10-minute blocker).
- **Triggers:**
  - **1. Fixed Follow-Up Setting:** Triggered automatically whenever a lead follow-up date (`nextFollowUpAt`) is created or updated in `PATCH /api/leads/[id]`, `POST /api/leads`, or via AI copilot tool calling (`createTask` with category `FOLLOW_UP`).
  - **2. Custom Reminder in Lead View:** Inline widget in `LeadDetailModal` allowing Can to book custom date/time + note reminders directly from any lead with quick presets (+1h, Morgen 10:00, Mo 10:00), optional sync to lead follow-up, and timeline logging.
- **Transports:**
  - **Cloud (Production / Vercel):** Native CalDAV over HTTPS to `caldav.icloud.com` with App-Specific Password (`ICLOUD_APP_PASSWORD`), auto-discovering principals, calendar-home-sets, and collections via Cheerio XML parsing with 12h in-memory caching.
  - **Local Development:** Automatic macOS AppleScript (`osascript`) fallback on Mac if `ICLOUD_APP_PASSWORD` is not configured locally.

---

### 8. Instagram-Outreach (`/outreach`, `src/services/instagram/`, `src/services/outreach-generator.ts`)
- **Zweck:** Instagram als Lead-Quelle und Ansprachekanal. Erzeugt personalisierte Erstansprachen — wahlweise als Instagram-DM oder als Telefon-/Walk-In-Gesprächseinstieg.
- **Discovery (`searchInstagramProfiles` in `src/services/web-search.ts`):** Sucht Profile über die bestehende DuckDuckGo/Bing-Pipeline (`site:instagram.com`), **nicht** über Instagram selbst. Mehrdeutige Treffer werden zur Auswahl gestellt, nie geraten. Im Lead Scout als 5. Kachel der Ergebniskarte sichtbar.
- **Anreicherung (`src/services/instagram/resolve-provider.ts`):** Wählt automatisch die beste Quelle — Graph API, sonst Apify, sonst öffentlicher Seitenabruf (siehe Modul 9). **Wichtig:** Der öffentliche Abruf liefert ausgeloggt nur Followerzahl und Namen; `biography`, `external_url` und Post-Datum fehlen. Deshalb unterscheidet `InstagramProfile.externalUrlKnown` zwischen *unbekannt* und *nicht vorhanden* — fehlende Daten dürfen **niemals** Score-Punkte erzeugen.
- **Scoring (`src/services/instagram/score.ts`):** Befüllt erstmals die zuvor ungenutzten Prisma-Felder `score`, `scoreReasons`, `opportunityTags`, `interestingReason`. Signale u. a.: kein Link in Bio (+25), Termine per DM (+20), nur Linktree (+20), aktiv (+15), eigene Website (−30). Schwellen: ≥70 heiß, 40–69 lauwarm, <40 kalt.
- **Generator (`src/services/outreach-generator.ts`):** Drei editierbare Varianten, drei Tonalitäten, Groq primär mit Gemini als Rückfall. **Ohne konkreten Aufhänger wird nichts generiert** — eine Nachricht ohne Profilbezug ist ein Serienbrief. Der Prompt verbietet ausdrücklich erfundene Zahlen und Behauptungen über nicht übergebene Fakten.
- **Senden ist strikt Human-in-the-Loop:** Kopieren → Deep-Link `ig.me/m/<handle>` → manuelle Bestätigung. Erst die Bestätigung schreibt `Interaction(INSTAGRAM)` mit vollem Wortlaut, setzt `CONTACTED` + `lastContactAt` und legt den Tag-3-Follow-up-Task an. Kein Auto-Versand — Instagram bietet dafür keine API und sperrt Accounts.
- **Warm-up & Tagesbudget:** Vor der DM folgen + liken, dann 2 Tage reifen lassen (`WARMUP_TASK_PREFIX` in `src/lib/outreach-shared.ts`, abgebildet über das Task-Modell). Tagesbudget startet bei 5, konfigurierbar bis 20 — warnt, sperrt aber nie.
- **Dritte Pipeline:** `AcquisitionType.DM` neben `CALL` und `WALK_IN`, mit `DM_PIPELINE_STATUSES` und `DM_NEXT_STATUS`. Bewusst **keine** neuen `LeadStatus`-Werte — `TO_CONTACT`/`CONTACTED`/`REPLIED` bilden den Flow bereits ab.
- **Fokus-Modus:** Vollbild mit Tastaturkürzeln (C kopieren, Enter bestätigen, S überspringen, 1–3 Variante, D/T Kanal, G neu generieren, W Warm-up, Pfeile navigieren, ? Übersicht).

### 9. Instagram-Datenquellen — Kette, Kosten & Cache (`src/services/instagram/`)
**Quellenkette (`resolve-provider.ts`): Graph API → Apify → öffentlicher Seitenabruf.** Jede Stufe greift nur, wenn die vorige kein vollständiges Profil liefert. Status aller drei Stufen auf einen Blick: `npm run instagram:check`.

**Stufe 1 — Instagram Graph API (offiziell, gratis):**
- **Konfiguration:** `INSTAGRAM_GRAPH_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, optional `INSTAGRAM_GRAPH_VERSION` (Standard `v21.0`). Für die Einrichtung zusätzlich `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET`.
- **Was funktioniert:** Direkte Feldabfrage auf den **eigenen** Account liefert vollständige Daten.
- **Was blockiert ist:** `business_discovery` für **fremde** Profile scheitert mit `(#10) Application does not have permission for this action`. Das braucht **Advanced Access für `instagram_basic`** über Metas App Review inkl. Business-Verifizierung. Sobald Meta das gewährt, bekommt die Graph API **automatisch wieder Vorrang** — am Code ist dafür nichts zu ändern.
- **Stolperfalle:** Ein Instagram-Konto kann einem Business-Portfolio gehören und trotzdem **nicht mit der Facebook-Seite verbunden** sein. Die Graph API greift ausschließlich über die Seite zu (*Business Suite → Instagram-Konto → Connect assets*).
- **Token-Lebensdauer:** kurzlebig ~1 Stunde, langlebig ~60 Tage. Läuft die Anreicherung still aus, ist meist das Token abgelaufen.

**Stufe 2 — Apify (`apify-provider.ts`, kostenpflichtig):**
- **Konfiguration:** `APIFY_TOKEN`, optional `APIFY_INSTAGRAM_ACTOR` (Standard `apify~instagram-profile-scraper`) und `APIFY_TIMEOUT_MS` (Standard 90 s, serverseitiges Limit 300 s). **Kein Token → Provider ist schlicht inaktiv**, exakt wie die Graph API.
- **Endpunkt:** `POST https://api.apify.com/v2/acts/<actor>/run-sync-get-dataset-items`, Body `{ usernames: string[] }`, Antwort ist direkt das Dataset-Array. **Ein Run pro Aufruf, mehrere Handles gleichzeitig.**
- **KOSTEN ca. $1,60 / 1.000 Profile.** Jeder Call ist echtes Geld — deshalb Vorfilter, Sammel-Run und Cache (siehe unten).
- **Kein automatischer Retry.** Ein HTTP 408 heißt **nicht**, dass der Run gestoppt wurde — er läuft weiter und wird abgerechnet. Ein Retry zahlt doppelt. Stattdessen kleinere Blöcke (`APIFY_MAX_BATCH`, aktuell 25).
- **401/402/403 sind ein eigener, sichtbarer Zustand** (`ApifyHealth.outage`), kein stiller Rückfall. Sonst produziert ein abgelaufenes Token wochenlang „unbekannt“, und niemand versteht, warum alle Scores flach sind. Die UI zeigt dann: *„Apify nicht verfügbar — es wird ohne Bio-Daten weitergearbeitet."*
- **Schema-Guard (`hasLinkField`, pro Item):** `externalUrlKnown` wird **nur** gesetzt, wenn das Item das Link-Feld als **Schlüssel** trägt (`externalUrl` / `external_url` / `externalUrls` / `website` / `bioLink`) — der Actor liefert für Profile ohne Link `externalUrl: null`, die Schlüssel-Präsenz unterscheidet also „geprüft, es gibt keinen" von „das Feld existiert nicht mehr". Bewusst **pro Item** und nicht per `.some()` über den Batch: ein vollständiger Datensatz darf 24 kaputte daneben nicht legitimieren. Benennt Apify das Feld um (`externalUrls[]` kam historisch genau so dazu), fällt das betroffene Item auf „unbekannt" zurück, statt jedem Lead „kein Link in Bio +25“ und den Tag `NO_WEBSITE` zu verpassen — der einzige Failure Mode, der aktiv **falsche** statt nur fehlende Daten erzeugt.
- **`latestPosts[]`** wird nach Zeitstempel **sortiert** ausgewertet; Index 0 ist nicht verlässlich der neueste Post.

**Stufe 3 — öffentlicher Seitenabruf (`profile-provider.ts`, gratis):** liefert ausgeloggt nur Followerzahl und Namen. `biography`, `external_url` und Post-Datum fehlen — deshalb unterscheidet `externalUrlKnown` zwischen *unbekannt* und *nicht vorhanden*.

**Snapshot-Cache (`snapshot-cache.ts`, Prisma-Modell `InstagramProfileSnapshot`):**
- Key ist das **normalisierte Handle**, nicht die `leadId` — ein Profil wird über alle Leads und Scout-Sessions hinweg nur einmal bezahlt.
- **TTL 30 Tage** (`SNAPSHOT_TTL_DAYS`), unvollständige Abrufe 3 Tage (`INCOMPLETE_TTL_DAYS`).
- Gespeichert wird **`lastPostAt` als absoluter Timestamp, niemals `daysSinceLastPost`.** Ein relativer Wert würde im Cache täglich verrotten und kostenpflichtige Re-Fetches erzwingen; `daysSinceLastPost` wird beim Lesen neu berechnet.
- `raw` hält das unveränderte Quell-Item — nur damit lässt sich später nachvollziehen, ob sich Feldnamen geändert haben.
- **`richSourceAttemptedAt`** hält fest, ob Graph API oder Apify für dieses Handle **tatsächlich befragt** wurden — unabhängig vom Ergebnis. Liefert Apify nichts (gelöscht, umbenannt, gesperrt) oder fällt es mit 402/Timeout aus, landet das Ergebnis als `public-page` mit unbekanntem Link im Cache; ohne diesen Merker wäre so ein Handle dauerhaft „nachholbar" und damit TTL-frei — also bei **jedem** Klick erneut kostenpflichtig.

**Wer darf anreichern (Kostenschutz):**
- **Anreicherung ausschließlich** über `enrichment.ts` → `POST /api/leads/[id]/instagram` (einzeln) und `POST /api/instagram/enrich` (Sammel-Lauf, `preview: true` zeigt vorab „X Profile werden geprüft“, ohne etwas zu kosten).
- **`POST /api/outreach/generate` löst NIE einen Abruf aus.** Die Route feuert bei jedem Tonalitäts- und Kanalwechsel, jedem „G“ im Fokus-Modus und jedem Sequenzschritt; sie liest deshalb ausschließlich aus dem Snapshot-Cache und den Lead-Feldern (`score`, `scoreReasons`, `opportunityTags`, `interestingReason`).
- **Vorfilter vor jedem Abruf** (`planEnrichment`), alles aus bereits gratis vorhandenen Daten: belastbare eigene Website laut `hasSolidWebsite()` → überspringen (denselben Helper nutzt auch das Scoring — `Boolean(lead.website)` würde einen Linktree als eigene Website werten und den Lead um ~50 Punkte zu kalt einstufen); Handle-Konfidenz `low`/`medium` → nicht auf Verdacht scrapen; Snapshot jünger als TTL → überspringen; `isPrivate: true` → dauerhaft überspringen.
- Bewusst **nicht** gebaut: Queue-Worker, Cron, Credit-Budget pro Nutzer.

**Post-Caption als Aufhänger (`outreach-generator.ts`):** Die Caption des **neuesten** Posts ist der stärkste Anchor (`LATEST_POST`) — aber nur, solange der Beitrag höchstens `LATEST_POST_MAX_AGE_DAYS` (60) alt ist; eine DM zu einem zwei Jahre alten Post wirkt schlechter als gar keine Personalisierung. Captions sind **fremder Nutzertext** und landen in einem Prompt, dessen Ergebnis halb-automatisch verschickt wird. Deshalb: `sanitizeCaption()` kürzt auf 300 Zeichen und entfernt Steuer-/Zaun-Zeichen — **inklusive Zeilenumbrüche, und das ist keine Kosmetik:** die Terminatoren des Zitatblocks stehen auf eigenen Zeilen, eine garantiert einzeilige Caption kann die Blockgrenze also gar nicht nachbauen; und der Prompt übergibt sie als klar markiertes Zitat mit der ausdrücklichen Anweisung, Anweisungen darin zu ignorieren. Dasselbe gilt für den Bio-Text.

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
10. **Instagram-Profildaten kosten ab jetzt Geld.** Ein `fetchInstagramProfile()` in einer Route, die häufig feuert (Generierung, Vorschau, Listen), löst pro Aufruf einen Apify-Run aus. Lesende Pfade gehen ausnahmslos über `readSnapshot()`/`readSnapshots()` aus `snapshot-cache.ts`; anreichern darf nur `enrichment.ts` hinter dem Vorfilter. Wer eine neue Route baut, prüft zuerst, auf welcher Seite dieser Grenze sie steht.

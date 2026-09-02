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
  - Google Generative AI (Gemini 1.5 Flash SDK for Transcripts, Sentiment, Menu Detection & AI Assistant)
  - Groq SDK (Llama 3.3 for ultra-fast task prioritization & fallback chat)

---

## 📌 Architecture & Rules

### 1. Vercel Deployment & Git Workflow
- **`main` branch:** Automatically deploys to Production (`https://scale-evo-crm.vercel.app`) on every push (~20-25s build).
- **Feature branches (e.g. `Lucas-crm`):** Deploy to preview URLs only. Always develop/test on feature branches first.

### 2. Multi-Tenancy & Workspace Isolation
- Leads, pipeline stages, dashboard metrics, tasks, scout sessions, and AI context are scoped per user (`createdById: user.id` or `assignedToId: user.id`).
- When a new or second user (e.g. `Lucario`) logs in, they start with a clean isolated workspace (0 leads, 0 pipeline items).

### 3. Sidebar Customization & Feature-Toggles
- **Custom Tab Reordering & Visibility:** `sidebarConfig` is stored on the `User` model in Prisma. Users can freely sort/reorder tabs (Up/Down) and toggle tab visibility in `/settings`.
- **Dynamic Real-Time Sync:** Sidebar reacts to `user-settings-updated` custom events and renders the custom order and visibility instantly without page reloads.
- **Per-User Modules:** `restaurantScoutEnabled` controls access to Restaurant Scout and is toggleable in Settings.

### 4. Styling & Responsive Design
- Tailwind v4 with CSS variables: `var(--bg)`, `var(--surface)`, `var(--surface-2)`, `var(--surface-3)`, `var(--border)`, `var(--text)`, `var(--accent)`.
- iPad & Tablet friendly: touch momentum scrolling (`-webkit-overflow-scrolling: touch`), min 44px tap targets, collapsible panels, and floating mobile/tablet drawer.

---

## 🚀 Key Modules

### 1. Sidebar Configurator (`/settings` & `src/lib/nav-config.ts`)
- **Helper:** `resolveNavConfig(savedConfig, restaurantScoutEnabled)`
- **Features:** Visual card in Settings with tab icons, numbering (1..12), move up/down controls, eye toggle to show/hide tabs, and "Standard wiederherstellen" (reset to default) button.

### 2. Lead Scout (`/lead-scout`) & Restaurant Scout (`/restaurant-scout`)
- **Service:** `src/services/lead-scout.ts`, `src/services/restaurant-scout.ts` + `src/lib/menu-detector.ts`
- **Direct Status Assignment:** Both scout modules feature a category dropdown with all 12 pipeline statuses (`NEW`, `RESEARCHED`, `TO_CONTACT`, `CONTACTED`, `REPLIED`, `INTERESTED`, `APPOINTMENT`, `OFFER_SENT`, `FOLLOW_UP`, `WON`, `LOST`, `NOT_RELEVANT`) to import candidates directly into the right CRM stage.
- **Menu Radar:** Gemini 1.5 Flash automatically verifies digital menus (HTML/PDF/Lieferando/Wolt) from Google Places results.

### 3. Auth, Session Management & User Badging
- **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`
- **Helpers:** `src/lib/session.ts` (Web Crypto HMAC-SHA256), `src/lib/auth.ts` (`requireAuth`, `getOptionalUser`)
- **Credentials Security:** Server-side verification with salted SHA-256 hashes (never exposed in client bundles).
- **Sidebar User Status:** Subtle avatar badge and user indicator (`currentUser.displayName` / `currentUser.email` with active online dot) at the bottom of the sidebar and settings profile card.
- **Sidebar Logout:** Dedicated red logout button under *Einstellungen* with a confirmation modal before sign-out.

### 4. Dashboard Performance (`/`)
- **Page:** `src/app/page.tsx`
- **Optimization:** Direct server-side parallel fetching of metrics via `Promise.all`, passed as `initialData` to `DashboardComponent` for 0ms load times and no client-side spinner.

### 5. Cold Calls & Speech Coaching (`/cold-calls`)
- **Storage:** Binary audio stored in PostgreSQL `AudioFile` and streamed via `/api/cold-calls/recordings/[id]/audio`.
- **AI Feedback:** Gemini evaluates pace, stuttering/filler words, and emotional tone, providing actionable sales tips.

---

## ⚠️ Important Gotchas

1. **Gemini Function Calling:** Function response turns must use `role: "user"` (the API rejects `role: "function"` with a 400 error).
2. **Google Places Region Code:** Always use `.trim()` on `GOOGLE_PLACES_REGION` to avoid CLDR trailing whitespace errors (e.g. `'AT '`).
3. **App Router Middleware:** Next.js 16 uses `src/proxy.ts` (with `export async function proxy`) rather than `middleware.ts`.

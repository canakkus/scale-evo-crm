This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Recent Updates (Auto-Documented)
- **Emoji-Purge im CRM**: Emojis in der UI (z.B. Leads-Tabelle) wurden durch saubere `lucide-react`-Icons ersetzt.
- **UI & Build Fixes**: Build-Fehler und redundante Variablen bereinigt.
- **ScaleEvo-Schreibregel**: Systemregeln aktualisiert, damit "ScaleEvo" durchgängig zusammengeschrieben wird.
- **Vault Cleanup**: `node_modules` und `auth_info` (WhatsApp Bridge, Amoeba) wurden für eine sauberere Indizierung über `.obsidian/app.json` ignoriert.
- **UI & Mobile Optimization**: Pipeline Buttons überarbeitet (Flex-Layout statt Absolute, größere Touch-Targets für iPad) und Suchfeld für Custom Categories (wie 'Shisha Bar') inkl. Google Places Fallback im Lead-Scout hinzugefügt.
- **Analytics Lead-Creator Aufschlüsselung (`feature/analytics-leads-by-user`)**: Team-Performance-Übersicht im Analytics-Fenster (`/analytics`) integriert. Zeigt Leads aufgeschlüsselt nach Ersteller (`createdBy`), prozentualen Anteil, Abschlusszahlen sowie eine Detail-Liste der zuletzt erstellten Leads pro Benutzer mit Lead-Modal-Vorschau.
- **Lead Scout 4.0 Beta (`Lead Scout 4.0 Beta`)**: Multi-Stage Funnel für ganz Wien (23 Bezirke). Beinhaltet Google Places Mass Gathering, CRM-Duplikatsfilter, Fast-Check für Website-Mängel (3.5s Timeout, Chunks von 6) und heuristische Berechnung bester Besuchszeiten (Popular Times Slots). Läuft vollständig im asynchronen Server-Hintergrund mit reaktivem Polling (bricht beim Tab-Wechsel oder Navigieren nicht ab). Bietet Umschalter zwischen "Hot Walk-In Fokus" und "Gesamter Wien-Pool" mit Suchleiste, Pagination und 1-Click-Bulk-Import.
- **Lead Scout Multi-Run Batching & Nacht-Scheduler**: Unterstützung für Multi-Runs (1x Sofort, 3x Batch, 5x Deep Scan) mit Tranchen-Partitionierung ausgewählter Bezirke und konfigurierbarem Schrittmaß (Top 20, 30, 50 Leads). Integrierter Nacht-Scheduler mit Uhrzeit-Einstellung (z. B. 03:00 Uhr) und Cron-Trigger `/api/scout/night-run/schedule`.


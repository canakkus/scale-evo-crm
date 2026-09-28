# Feature-Plan: Website-Schwachstellen Screenshot-Karussell & 2014-Style Detector

**Projekt:** Scale Evo CRM 3.0  
**Datum:** 2026-09-26  
**Status:** Geplant / Bereit zur Umsetzung  

---

## 1. Übersicht & Ziel

Beim Cold Outreach und vor Walk-Ins ist der stärkste Hebel die visuelle Demonstration konkreter Fehler auf der Kunden-Website. 

Dieses Feature ermöglicht es:
1. **Website Screenshot-Karussell im Lead-Modal:**
   - Direkt im `LeadDetailModal` Screenshots der aktuellen Kunden-Website einzufügen (per `CMD+V` Paste aus der Zwischenablage oder Drag & Drop).
   - Jedem Screenshot eine Notiz/Schwachstelle zuzuordnen (z. B. *"Mobil nicht lesbar / kein Viewport"*, *"Impressum fehlt"*, *"Speisekarte nur als PDF"*).
   - Die Screenshots in einem interaktiven Karussell mit Vor-/Zurück-Steuerung, Badges und Fullscreen-Lightbox darzustellen.
2. **2014-Style Retro Detector im Lead Scout:**
   - Automatischer Scan im Scout-Lauf auf Uralt-Websites (kein Viewport, HTTP statt HTTPS, altes Copyright, Tabellen-Layout).
   - Filter im Lead Scout: "Nur veraltete Websites".

---

## 2. Technische Architektur

### A. Datenmodell (Prisma)
Neues Modell `LeadScreenshot` oder Erweiterung von `Lead`:
```prisma
model LeadScreenshot {
  id          String   @id @default(cuid())
  leadId      String
  imageUrl    String
  caption     String?  // Was ist hier falsch? (z.B. "Header mobil verzerrt")
  source      String?  @default("manual") // "manual" | "scout"
  order       Int      @default(0)
  createdAt   DateTime @default(now())

  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId])
}
```

### B. Storage & Upload Route
- Route: `POST /api/leads/[id]/screenshots` (Multipart Form-Data oder Base64 Upload).
- Speicherort: Supabase Storage Bucket `lead-screenshots` (mit lokalem Filesystem-Fallback für Offline-Entwicklung).
- Lösch-Route: `DELETE /api/leads/[id]/screenshots/[screenshotId]`.

### C. Frontend / UI (`LeadDetailModal`)
- **Paste-Listener:** Wenn das Lead-Modal aktiv ist, fängt `CMD+V` Bilddaten aus der Zwischenablage ab und öffnet einen Schnell-Dialog: *"Screenshot hinzufügen: Was ist hier fehlerhaft?"*.
- **Karussell-Komponente:**
  - Thumbnails / Slides mit Navigationspfeilen und Zähler (`1 von 3`).
  - Text-Badge mit der Schwachstellen-Notiz am unteren Bildrand.
  - Klick öffnet Fullscreen-Modal (Lightbox) zum genauen Betrachten während des Telefonats.
- **Platzierung:** Direkt im `LeadDetailModal` unter Notizen oder als eigene Box "Website-Schwachstellen (Audit)".

---

## 3. Umsetzungs-Phasen

### Phase 1: DB & API-Layer
- [ ] Prisma-Schema um `LeadScreenshot` ergänzen & Migration generieren.
- [ ] API-Routen für Upload, Listen und Löschen von Lead-Screenshots implementieren.
- [ ] Storage-Anbindung (Supabase Storage / lokaler Dev-Fallback).

### Phase 2: Screenshot-Karussell UI & Paste-Support
- [ ] `LeadScreenshotCarousel`-Komponente bauen (Slides, Pfeile, Thumbnails, Lightbox).
- [ ] `CMD+V` Paste-Handler und Datei-Upload-Zone im `LeadDetailModal` integrieren.
- [ ] Schnelleingabe für Fehler-Beschreibung / Caption beim Einfügen.

### Phase 3: Lead Scout 2014-Style Detector
- [ ] `WebsiteAuditProvider` um Heuristiken für veraltete Websites erweitern (Viewport, SSL, Copyright-Regex, Generator-Tags).
- [ ] Filter `"outdatedOnly"` im Lead Scout Backend und Frontend-Toggle.
- [ ] Badge auf Scout-Ergebniskarten: *"2014-Website erkannt"*.

---

## 4. Verifiable Gates (Akzeptanzkriterien)
1. Ein Screenshot kann per `CMD+V` oder Datei-Upload in jeden Lead eingefügt werden.
2. Mehrere Screenshots lassen sich im Karussell mit Notizen durchklicken.
3. Klick auf ein Bild öffnet eine Fullscreen-Lightbox.
4. Lead Scout filtert zuverlässig Websites ohne Viewport / mit Uralt-HTML.
5. `npm run build` und `npx tsc --noEmit` laufen fehlerfrei durch.

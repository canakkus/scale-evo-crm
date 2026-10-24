import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCustomOutreachScript,
  upsertOutreachScriptInNotes,
  buildOutreachScriptBlock,
} from "./outreach-script";

test("extractCustomOutreachScript returns null for empty or notes without script", () => {
  assert.equal(extractCustomOutreachScript(null), null);
  assert.equal(extractCustomOutreachScript(""), null);
  assert.equal(extractCustomOutreachScript("Nur eine normale Kundennotiz ohne Skript"), null);
});

test("extractCustomOutreachScript extracts from canonical block with delimiters", () => {
  const notes = `Chef angerufen, war sehr nett.
  
<!-- outreach-script:start -->
📞 Ausgewähltes Kaltakquise-Skript (Telefon · 25.10.2026):

Hallo Martin, ich hab gesehen eure Website lädt mobil langsam.
<!-- outreach-script:end -->

Wiedervorlage nächste Woche.`;

  const script = extractCustomOutreachScript(notes);
  assert.equal(script, "Hallo Martin, ich hab gesehen eure Website lädt mobil langsam.");
});

test("extractCustomOutreachScript extracts from legacy block without markers", () => {
  const notes = `Vorherige Notiz

---
📞 Ausgewähltes Kaltakquise-Skript (Telefon · 24.10.2026, 14:00 Uhr):
Servus, ich rufe kurz an wegen eurer Online-Buchung.

---
Spätere Notiz`;

  const script = extractCustomOutreachScript(notes);
  assert.equal(script, "Servus, ich rufe kurz an wegen eurer Online-Buchung.");
});

test("upsertOutreachScriptInNotes creates canonical block on empty notes", () => {
  const res = upsertOutreachScriptInNotes("", "Mein Kaltakquise Pitch", "Telefon · Test");
  assert.match(res, /<!-- outreach-script:start -->/);
  assert.match(res, /Mein Kaltakquise Pitch/);
  assert.match(res, /<!-- outreach-script:end -->/);
  assert.equal(extractCustomOutreachScript(res), "Mein Kaltakquise Pitch");
});

test("upsertOutreachScriptInNotes replaces existing canonical block in-place", () => {
  const initial = `Wichtige Notiz vorab.

<!-- outreach-script:start -->
📞 Ausgewähltes Kaltakquise-Skript (Alt):

Altes Skript 123
<!-- outreach-script:end -->

Manuelle Nachbearbeitung bleibt erhalten.`;

  const updated = upsertOutreachScriptInNotes(initial, "Neues verbessertes Skript", "Neu");
  assert.match(updated, /Wichtige Notiz vorab\./);
  assert.match(updated, /Manuelle Nachbearbeitung bleibt erhalten\./);
  assert.match(updated, /Neues verbessertes Skript/);
  assert.ok(!updated.includes("Altes Skript 123"));
  assert.equal(extractCustomOutreachScript(updated), "Neues verbessertes Skript");
});

test("upsertOutreachScriptInNotes consolidates multiple legacy duplicate blocks into one canonical block", () => {
  const notesWithDuplicates = `Notiz 1

---
📞 Ausgewähltes Kaltakquise-Skript (1):
Skript Version 1

---
📞 Ausgewähltes Kaltakquise-Skript (2):
Skript Version 2

Ende`;

  const cleaned = upsertOutreachScriptInNotes(notesWithDuplicates, "Finales Skript", "Final");
  assert.match(cleaned, /Finales Skript/);
  assert.ok(!cleaned.includes("Skript Version 1"));
  assert.ok(!cleaned.includes("Skript Version 2"));
  assert.equal(extractCustomOutreachScript(cleaned), "Finales Skript");
  const matches = [...cleaned.matchAll(/📞 Ausgewähltes Kaltakquise-Skript/g)];
  assert.equal(matches.length, 1);
});

import { prisma } from '../src/lib/prisma';
import { withGroqClient } from '../src/lib/groq-key-manager';

function extractFirstJsonObject(str: string): string | null {
  const start = str.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}

function cleanAndParseJson<T>(rawText: string, fallback: T): T {
  try {
    let content = rawText;
    if (content.includes('</think>')) {
      content = content.split('</think>').pop() || '';
    } else {
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');
    }
    content = content.trim();

    const withoutMarkdown = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const jsonCandidate = extractFirstJsonObject(withoutMarkdown);
    if (jsonCandidate) {
      return JSON.parse(jsonCandidate) as T;
    }

    return JSON.parse(withoutMarkdown) as T;
  } catch (err) {
    console.error('JSON Parse Error:', err);
    return fallback;
  }
}

async function reprocessCallRecordings() {
  console.log('Starte Nachbearbeitung aller Call Recordings...');

  const recordings = await prisma.callRecording.findMany({
    include: {
      lead: true,
      interactions: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Gefunden: ${recordings.length} Recordings.`);

  let updatedCount = 0;

  for (const recording of recordings) {
    const isFailed = recording.aiSummary?.includes('Zusammenfassung konnte nicht automatisch');
    const isUnformatted = !recording.transcription?.includes('\n') || recording.transcription.startsWith('Wir gehen jetzt') || recording.transcription.startsWith('Hallo, guten Tag') || recording.transcription.startsWith('Test, Test');

    console.log(`\nPrüfe Recording ID: ${recording.id} (${recording.fileName})... isFailed: ${isFailed}, isUnformatted: ${isUnformatted}`);

    if (!isFailed && !isUnformatted) {
      console.log(`-> Überspringe, bereits gut formatiert.`);
      continue;
    }

    const companyName = recording.lead?.companyName || recording.fileName;
    const context = `Der Call war mit dem Lead / Unternehmen "${companyName}".`;

    const analysisPrompt = `Du bist ein hochpräziser Vertriebsassistent und Call-Analyst für B2B Cold Calls. ${context}

STRIKTE ROLLEN- UND SPRECHERERKENNUNG (CRITICAL - ROLE DISAMBIGUATION):
In jedem Verkaufs-/Telefon-Call gibt es ZWEI fest definierte Parteien. Verwechsle deren Rollen NIEMALS:

1. **[Anrufer / Verkäufer]** (z.B. Can / Scale Evo Vertrieb):
   - Der Anrufer startet den Pitch, stellt sich namentlich vor ("Hier ist Can...", "Ich rufe an von..."), pitched Produkte/Software/Dienstleistungen, stellt Qualifizierungsfragen, behandelt Einwände und schlägt Termine vor.
2. **[Kunde / Ansprechpartner]** (z.B. Inhaber/Mitarbeiter bei "${companyName || 'dem angerufenen Unternehmen'}"):
   - Der Angerufene hebt ab (oft mit Firmennamen z.B. "${companyName || 'Firma XYZ'}, Guten Tag" oder "Ja bitte?"), antwortet auf Fragen, äußert Einwände ("keine Zeit", "haben schon eine Agentur", "schicken Sie Unterlagen") oder nimmt Termine an.

CHRONOLOGISCHE REGELN FÜR SPRECHERWECHSEL:
- REGEL 1 (ABHEBEN): Wer das Telefon abhebt (erste 1-2 Sätze), ist ZWINGEND der **[Kunde / Ansprechpartner]**.
- REGEL 2 (INTRO & PITCH): Wer danach grüßt, seinen Namen/Firma nennt ("Guten Tag, hier ist Can von Scale Evo...") und das Thema anspricht, ist ZWINGEND der **[Anrufer / Verkäufer]**.
- REGEL 3 (KONSISTENZ): Ändere die Sprecherbezeichnung NIEMALS mitten im Gespräch. Wer einmal Anrufer ist, bleibt das ganze Gespräch lang Anrufer.
- REGEL 4 (RHETORIK-FEEDBACK): Das "aiFeedback" (Redegeschwindigkeit, Füllwörter, Tonfall, Tipps) analysiert AUSSCHLIESSLICH die Rhetorik des **[Anrufer / Verkäufer]** (den Vertriebler), NICHT die des Kunden!

AUFGABEN:
1. Wandle die folgende Transkription in ein sauberes, strukturiertes DIALOG-PROTOKOLL um:
   - Nutze exakt: '[Anrufer / Verkäufer]: ...' und '[Kunde / Ansprechpartner]: ...'.
   - Korrigiere Interpunktion und Grammatik sinnvoll, ohne den Inhalt zu verändern. Falls Vorgespräche oder Setup-Notizen vor dem Call im Text sind (wie z.B. 'Test, Test' oder 'Wir rufen da jetzt an'), trenne diese sauber ab.
2. Analysiere das Gespräch detailliert (Zusammenfassung, nächste Schritte, Stimmung, extrahierte Kontaktdaten/Einwände und Rhetorik-Coaching-Feedback).

Transkription:
"""
${recording.transcription}
"""

Antworte AUSSCHLIESSLICH im folgenden JSON-Format ohne weiteren Fließtext:
{
  "dialogueTranscription": "[Anrufer / Verkäufer]: Hallo Herr Schmidt, Can von Scale Evo hier...\n\n[Kunde / Ansprechpartner]: Guten Tag, worum geht es?",
  "summary": "Prägnante Zusammenfassung des Gesprächs in 2-3 Sätzen",
  "nextSteps": ["Konkrete nächste Schritte als Liste"],
  "sentiment": "POSITIVE|NEUTRAL|NEGATIVE|MIXED",
  "extractedData": {
    "contactName": "Name des Ansprechpartners wenn genannt oder null",
    "appointmentDate": "Konkreter vereinbarter Termin oder null",
    "objections": ["Vom Kunden geäußerte Einwände als Liste"],
    "interestLevel": "HIGH|MEDIUM|LOW|NONE"
  },
  "aiFeedback": {
    "pace": "Redegeschwindigkeit und Rhythmus des Verkäufers",
    "stuttering": "Verwendung von Füllwörtern wie äh, öhm oder Stottern beim Verkäufer",
    "tone": "Tonfall, Souveränität und Gelassenheit des Verkäufers",
    "tips": ["Konkrete Rhetorik-Tipps zur Verbesserung als Liste"]
  }
}`;

    try {
      console.log(`-> Sende an Groq AI...`);
      const analysisText = await withGroqClient(async (client) => {
        const response = await client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: analysisPrompt }],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 4096,
        });
        return (response.choices[0]?.message?.content || '').trim();
      });

      const parsed = cleanAndParseJson<any>(analysisText, {});

      if (!parsed.summary || parsed.summary.includes('Zusammenfassung konnte nicht automatisch')) {
        console.warn(`-> Warnung: Konnte keine valide Zusammenfassung parsen. Raw: ${analysisText.slice(0, 100)}`);
        continue;
      }

      const finalTranscription = parsed.dialogueTranscription?.trim() || recording.transcription;

      await prisma.callRecording.update({
        where: { id: recording.id },
        data: {
          transcription: finalTranscription,
          aiSummary: parsed.summary,
          aiNextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
          aiSentiment: parsed.sentiment || 'NEUTRAL',
          aiExtractedData: parsed.extractedData || {},
          aiFeedback: parsed.aiFeedback ? JSON.parse(JSON.stringify(parsed.aiFeedback)) : null,
          status: 'DONE',
        },
      });

      if (recording.interactions.length > 0) {
        const nextStepsStr = Array.isArray(parsed.nextSteps) ? parsed.nextSteps.join(', ') : '';
        const summaryText = `📞 **Groq Call-Transkription**: ${parsed.summary}\n\n**Nächste Schritte:** ${nextStepsStr}`;
        for (const inter of recording.interactions) {
          await prisma.interaction.update({
            where: { id: inter.id },
            data: { note: summaryText },
          });
        }
      }

      console.log(`-> ERFOLGREICH aktualisiert! Neue Summary: ${parsed.summary.slice(0, 80)}...`);
      updatedCount++;
    } catch (err) {
      console.error(`-> FEHLER bei ID ${recording.id}:`, err);
    }
  }

  console.log(`\nFertig! Insgesamt ${updatedCount} Recordings repariert und neu formatiert.`);
}

reprocessCallRecordings()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

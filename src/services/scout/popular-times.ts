export type PopularTimeSlot = {
  dayName: string;
  recommendedWindow: string;
  avoidWindow: string;
  reason: string;
  confidence: "high" | "medium";
};

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/**
 * Ermittelt das optimale Walk-In-Besuchsfenster und Stoßzeiten
 * basierend auf Branche, Wochentag und betriebswirtschaftlichen Abläufen.
 */
export function calculateBestVisitSlot(
  industry: string | null | undefined,
  types: string[] = [],
  dayIndex: number = new Date().getDay()
): PopularTimeSlot {
  const currentDay = DAY_NAMES[dayIndex] || "Heute";
  const ind = (industry || "").toLowerCase();
  const typesStr = types.join(" ").toLowerCase();

  // 1. Gastronomie / Restaurants / Pizzerien / Cafés
  if (
    ind.includes("restaurant") ||
    ind.includes("pizz") ||
    ind.includes("gastro") ||
    ind.includes("caf") ||
    ind.includes("bar") ||
    ind.includes("imbiss") ||
    typesStr.includes("restaurant") ||
    typesStr.includes("cafe")
  ) {
    if (dayIndex === 0 || dayIndex === 6) {
      // Wochenende: Samstag/Sonntag sehr ungünstig für Kaltakquise
      return {
        dayName: currentDay,
        recommendedWindow: `${currentDay} 15:00 – 16:30 Uhr`,
        avoidWindow: "12:00 – 14:30 & ab 18:00 Uhr (Wochenend-Stress)",
        reason: "Am Wochenende hat der Gastronom selten Zeit. Wenn überhaupt, nur in der Nachmittags-Ruhepause.",
        confidence: "medium",
      };
    }

    return {
      dayName: currentDay,
      recommendedWindow: `${currentDay} 14:30 – 16:15 Uhr`,
      avoidWindow: "11:45 – 14:00 Uhr (Mittagsrush) & ab 18:00 Uhr",
      reason: "Perfektes Zeitfenster: Das Mittagsgeschäft ist vorbei, Tische werden abgeräumt, der Chef ist vor Ort und hat Zeit für ein persönliches Gespräch.",
      confidence: "high",
    };
  }

  // 2. Beauty / Friseur / Barber / Nagelstudio / Kosmetik
  if (
    ind.includes("barber") ||
    ind.includes("friseur") ||
    ind.includes("hair") ||
    ind.includes("beauty") ||
    ind.includes("nagel") ||
    ind.includes("kosmetik") ||
    ind.includes("spa") ||
    ind.includes("massage") ||
    typesStr.includes("hair_care") ||
    typesStr.includes("beauty_salon")
  ) {
    if (dayIndex === 1) {
      // Montag haben viele Friseure/Barber Ruhetag
      return {
        dayName: currentDay,
        recommendedWindow: "Dienstag 10:00 – 11:30 Uhr (Montag oft Ruhetag)",
        avoidWindow: "Montag ganztägig (häufig Ruhetag)",
        reason: "Viele Salons haben montags geschlossen. Besser ab Dienstag vormittags hingehen.",
        confidence: "high",
      };
    }

    if (dayIndex === 5 || dayIndex === 6) {
      // Freitag Nachmittag & Samstag
      return {
        dayName: currentDay,
        recommendedWindow: `${currentDay} 09:30 – 10:30 Uhr`,
        avoidWindow: "Ab 11:00 Uhr ganztägig (Wochenend-Termine ausgebucht)",
        reason: "Freitags und samstags sind Friseure und Nagelstudios im Dauereinsatz. Nur früh morgens ansprechbar.",
        confidence: "medium",
      };
    }

    return {
      dayName: currentDay,
      recommendedWindow: `${currentDay} 10:00 – 11:30 Uhr oder 14:00 – 15:30 Uhr`,
      avoidWindow: "12:00 – 13:30 Uhr & ab 17:00 Uhr (Feierabend-Kunden)",
      reason: "Dienstag bis Donnerstag vormittags ist die Termindichte am geringsten. Salon-Inhaber sind entspannt ansprechbar.",
      confidence: "high",
    };
  }

  // 3. Handwerk, Einzelhandel & sonstige lokale KMU
  return {
    dayName: currentDay,
    recommendedWindow: `${currentDay} 09:00 – 10:30 Uhr oder 15:00 – 16:30 Uhr`,
    avoidWindow: "12:00 – 13:30 Uhr (Mittagspause) & Stoßzeiten",
    reason: "Geschäftsführung ist nach dem Morgen-Setup und vor dem Nachmittags-Abschluss am besten erreichbar.",
    confidence: "high",
  };
}

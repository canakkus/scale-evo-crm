export type PopularTimeSlot = {
  dayName: string;
  recommendedWindow: string;
  avoidWindow: string;
  reason: string;
  confidence: "high" | "medium";
};

export type PlacesOpeningHoursInput = {
  periods?: Array<{
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }>;
  weekdayDescriptions?: string[];
} | null;

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function formatTime(hour: number, minute: number = 0): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Ermittelt das optimale Walk-In-Besuchsfenster und Stoßzeiten
 * basierend auf echten Google-Öffnungszeiten (falls vorhanden), Branche, Wochentag
 * und betriebswirtschaftlichen Abläufen.
 */
export function calculateBestVisitSlot(
  industry: string | null | undefined,
  types: string[] = [],
  dayIndex: number = new Date().getDay(),
  openingHours?: PlacesOpeningHoursInput
): PopularTimeSlot {
  const currentDay = DAY_NAMES[dayIndex] || "Heute";
  const ind = (industry || "").toLowerCase();
  const typesStr = types.join(" ").toLowerCase();

  const isGastro =
    ind.includes("restaurant") ||
    ind.includes("pizz") ||
    ind.includes("gastro") ||
    ind.includes("caf") ||
    ind.includes("bar") ||
    ind.includes("imbiss") ||
    typesStr.includes("restaurant") ||
    typesStr.includes("cafe") ||
    typesStr.includes("bar");

  const isBeauty =
    ind.includes("barber") ||
    ind.includes("friseur") ||
    ind.includes("hair") ||
    ind.includes("beauty") ||
    ind.includes("nagel") ||
    ind.includes("kosmetik") ||
    ind.includes("spa") ||
    ind.includes("massage") ||
    typesStr.includes("hair_care") ||
    typesStr.includes("beauty_salon");

  // 0. Echte Google-Öffnungszeiten auswerten, falls vorhanden
  if (openingHours?.periods && openingHours.periods.length > 0) {
    const todayPeriods = openingHours.periods.filter((p) => p.open?.day === dayIndex);

    // Heute komplett geschlossen (Ruhetag laut Google Places)
    if (todayPeriods.length === 0) {
      // Nächsten offenen Werktag suchen
      let nextOpenDayIdx = (dayIndex + 1) % 7;
      let nextOpenPeriod = openingHours.periods.find((p) => p.open?.day === nextOpenDayIdx);
      for (let offset = 1; offset <= 7; offset++) {
        const candidateDay = (dayIndex + offset) % 7;
        const found = openingHours.periods.find((p) => p.open?.day === candidateDay);
        if (found) {
          nextOpenDayIdx = candidateDay;
          nextOpenPeriod = found;
          break;
        }
      }
      const nextDayName = DAY_NAMES[nextOpenDayIdx] || "Nächster Werktag";
      const openHour = nextOpenPeriod?.open?.hour ?? (isGastro ? 14 : 10);

      if (isGastro && openHour >= 16) {
        return {
          dayName: nextDayName,
          recommendedWindow: `${nextDayName} ${formatTime(openHour)} – ${formatTime(openHour + 1, 30)} Uhr (Heute Ruhetag)`,
          avoidWindow: `${currentDay} ganztägig geschlossen & ab ${formatTime(openHour + 2)} Uhr Abendgeschäft`,
          reason: `Laut Google heute geschlossen. Reiner Abendbetrieb – am besten direkt zur Öffnung um ${formatTime(openHour)} Uhr vor dem Gästeansturm vorbeigehen.`,
          confidence: "high",
        };
      }

      return {
        dayName: nextDayName,
        recommendedWindow: isGastro
          ? `${nextDayName} 14:30 – 16:15 Uhr (Heute Ruhetag)`
          : `${nextDayName} 10:00 – 11:30 Uhr (Heute Ruhetag)`,
        avoidWindow: `${currentDay} ganztägig geschlossen (laut Google Öffnungszeiten)`,
        reason: `Betrieb hat heute (${currentDay}) laut Google Ruhetag. Besuch auf ${nextDayName} legen.`,
        confidence: "high",
      };
    }

    // Heute geöffnet: Prüfen, ob reiner Abendbetrieb (öffnet erst ab 16:00 Uhr)
    const earliestOpenHour = Math.min(...todayPeriods.map((p) => p.open?.hour ?? 9));
    if (earliestOpenHour >= 16) {
      return {
        dayName: currentDay,
        recommendedWindow: `${currentDay} ${formatTime(earliestOpenHour)} – ${formatTime(earliestOpenHour + 1, 15)} Uhr`,
        avoidWindow: `Vor ${formatTime(earliestOpenHour)} Uhr (geschlossen) & ab ${formatTime(earliestOpenHour + 2)} Uhr (Abend-Stoßzeit)`,
        reason: `Abendlokal (öffnet erst um ${formatTime(earliestOpenHour)} Uhr). Direkt beim Aufsperren hat die Leitung noch Ruhe für ein kurzes Gespräch.`,
        confidence: "high",
      };
    }
  }

  // 1. Gastronomie / Restaurants / Pizzerien / Cafés
  if (isGastro) {
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
  if (isBeauty) {
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


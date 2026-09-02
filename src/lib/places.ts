export type PlaceSuggestion = {
  name: string;
  address: string;
  city: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUri: string | null;
  industry: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type RawPlace = {
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

export function mapPlaceToSuggestion(place: RawPlace): PlaceSuggestion {
  const { address, city } = splitAddress(place.formattedAddress ?? "");
  return {
    name: place.displayName?.text ?? "",
    address,
    city,
    phone: place.internationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    googleMapsUri: place.googleMapsUri ?? null,
    industry: mapIndustry(place.types ?? [], place.primaryTypeDisplayName?.text),
    latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
    longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
  };
}

export function splitAddress(formatted: string): { address: string; city: string } {
  const parts = formatted
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) parts.pop();
  const city = parts.pop() ?? "";
  return { address: parts.join(", "), city };
}

export function mapIndustry(types: string[], displayName?: string): string | null {
  const keywords: Array<[RegExp, string]> = [
    [/barber/, "Barber"],
    [/hair_salon/, "Friseur"],
    [/spa|beauty_salon|beauty|nail|waxing|massage|skin_care/, "Kosmetik & Beauty"],
    [/personal_trainer/, "Fitness & PT"],
    [/gym|fitness|yoga|pilates|gymnastics/, "Fitness & PT"],
    [/photographer/, "Fotografie"],
    [/cleaning|dry_cleaning|janitorial|laundry/, "Sonstige"],
    [/restaurant|cafe|bakery|food|bar|bistro/, "Gastronomie"],
    [/car_wash|car_clean|auto_detailing/, "Autopflege"],
    [/driving_school/, "Fahrschule"],
    [/real_estate|property/, "Immobilien"],
    [/contractor|plumber|electrician|handyman|painter|roofing|hvac|locksmith/, "Handwerk"],
  ];
  const haystack = [...types, displayName ?? ""].join(" ").toLowerCase();
  for (const [pattern, industry] of keywords) {
    if (pattern.test(haystack)) return industry;
  }
  return displayName ?? null;
}

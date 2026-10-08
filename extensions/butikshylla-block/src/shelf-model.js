// START: DL BUTIKSHYLLA - DATAREGLER
// Ren JavaScript utan Shopify- eller UI-beroenden. Testas med node --test.
export const MAX_SHELF_NAME_LENGTH = 120;

export function normalizeShelfName(value) {
  return String(value ?? "")
    .replace(/\s*\(uppdaterad\s+\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\)\s*$/i, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function uniqueShelves(values) {
  const seen = new Set();
  return values
    .map(normalizeShelfName)
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLocaleLowerCase("sv-SE");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseSectionList(value) {
  if (typeof value !== "string") {
    throw new Error("Hyllistan saknar ett giltigt textvärde.");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Hyllistan innehåller ogiltig JSON. Inga ändringar har gjorts.");
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("Hyllistan har oväntat format. Inga ändringar har gjorts.");
  }
  return uniqueShelves(parsed);
}

export function parseLegacyReadableShelf(value) {
  if (!value) return [];
  return uniqueShelves(String(value).split(/[,;\n]|\s+\/\s+/));
}

export function readShelfState(product) {
  if (!product) throw new Error("Produkten kunde inte hittas.");
  // Om listfältet finns är det alltid master, även om det innehåller [].
  const hasList = product.shelfSections != null;
  const shelves = hasList
    ? parseSectionList(product.shelfSections.value)
    : parseLegacyReadableShelf(product.readableShelf?.value);
  return {
    shelves,
    legacyFallback: !hasList && shelves.length > 0,
    updatedAt:
      product.shelfUpdated?.value ??
      product.shelfSections?.updatedAt ??
      product.readableShelf?.updatedAt ??
      "",
    digests: snapshotDigests(product),
  };
}

export function snapshotDigests(product) {
  return {
    sections: product.shelfSections?.compareDigest ?? null,
    readable: product.readableShelf?.compareDigest ?? null,
    updated: product.shelfUpdated?.compareDigest ?? null,
  };
}

export function digestsMatch(left, right) {
  return left.sections === right.sections &&
    left.readable === right.readable &&
    left.updated === right.updated;
}

export function validateShelfName(value) {
  const name = normalizeShelfName(value);
  if (!name) throw new Error("Skriv ett hyllnamn först.");
  if (name.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error("Hyllnamnet får vara högst " + MAX_SHELF_NAME_LENGTH + " tecken.");
  }
  return name;
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
// Kort sammanfattning för Shopifys 300px-begränsade produktblock.
// Fullständig lista finns alltid kvar i det redigerbara fältet.
export function summarizeShelves(shelves, visibleCount = 2) {
  const count = Math.max(0, Math.floor(Number(visibleCount) || 0));
  return {
    visible: shelves.slice(0, count),
    remaining: Math.max(0, shelves.length - count),
  };
}

// END: DL BUTIKSHYLLA - DATAREGLER

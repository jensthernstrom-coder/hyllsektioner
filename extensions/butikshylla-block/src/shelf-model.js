// START: DL HYLLSEKTIONER – GEMENSAM BUTIKSDATAMODELL
// Shopify-produkten äger tre separata metafält per butik.
// Äldre metafält är endast läsbara och aldrig fallback för en namngiven butik.

export const STORE_KEYS = ["sveavagen", "kungsholmen"];
export const MAX_READABLE_LENGTH = 255;
export const MAX_SHELF_NAME_LENGTH = 120;

export const STORE_FIELDS = Object.freeze({
  sveavagen: {
    readable: "butikshylla_sveavagen",
    sections: "butikshylla_sveavagen_sektioner",
    updated: "butikshylla_sveavagen_uppdaterad",
  },
  kungsholmen: {
    readable: "butikshylla_kungsholmen",
    sections: "butikshylla_kungsholmen_sektioner",
    updated: "butikshylla_kungsholmen_uppdaterad",
  },
});

export function normalizeShelfName(value) {
  if (typeof value !== "string") throw new Error("Ogiltigt hyllnamn.");
  return value.trim().replace(/ {2,}/g, " ");
}

export function validateShelfName(value) {
  const name = normalizeShelfName(value);
  if (!name) throw new Error("Skriv ett hyllnamn först.");
  if (name.includes("|")) throw new Error("Hyllnamn får inte innehålla |.");
  if (name.length > MAX_SHELF_NAME_LENGTH) {
    throw new Error("Hyllnamnet får vara högst " + MAX_SHELF_NAME_LENGTH + " tecken.");
  }
  return name;
}

export function uniqueShelves(values) {
  if (!Array.isArray(values)) throw new Error("Ogiltig hyllista.");
  const seen = new Set();
  return values.map(validateShelfName).filter((name) => {
    const key = name.toLocaleLowerCase("sv-SE");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.localeCompare(b, "sv"));
}

export function parseSectionList(value) {
  if (typeof value !== "string") throw new Error("Hyllistan saknar ett giltigt värde.");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Hyllistan innehåller ogiltig JSON. Ingen ändring har gjorts.");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Hyllistan har oväntat format. Ingen ändring har gjorts.");
  }
  return uniqueShelves(parsed);
}

export function toUtcSecond(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Ogiltigt datum.");
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatStockholm(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Ogiltigt uppdateringsdatum.");
  const fields = Object.fromEntries(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return fields.year + "-" + fields.month + "-" + fields.day + " " +
    fields.hour + ":" + fields.minute;
}

export function formatReadable(rawNames, timestamp) {
  const names = uniqueShelves(rawNames);
  const suffix = " (uppdaterad " + formatStockholm(timestamp) + ")";
  const maxNamesLength = MAX_READABLE_LENGTH - suffix.length;
  if (!names.length) return "Ingen hyllplacering registrerad" + suffix;
  const full = names.join(" | ");
  if (full.length <= maxNamesLength) return full + suffix;
  let selected = [];
  for (const name of names) {
    const attempt = [...selected, name].join(" | ");
    if (attempt.length + " m.fl.".length > maxNamesLength) break;
    selected.push(name);
  }
  if (!selected.length) {
    throw new Error("Hyllnamnet är för långt för den läsbara texten.");
  }
  return selected.join(" | ") + " m.fl." + suffix;
}

export function snapshotDigests(fields) {
  return {
    readable: fields?.readable?.compareDigest ?? null,
    sections: fields?.sections?.compareDigest ?? null,
    updated: fields?.updated?.compareDigest ?? null,
  };
}

export function digestsMatch(left, right) {
  return left?.readable === right?.readable &&
    left?.sections === right?.sections &&
    left?.updated === right?.updated;
}

export function readStoreState(product, storeKey) {
  if (!STORE_FIELDS[storeKey]) throw new Error("Okänd butik.");
  const fields = {
    readable: product?.[storeKey + "Readable"],
    sections: product?.[storeKey + "Sections"],
    updated: product?.[storeKey + "Updated"],
  };
  const present = fields.sections != null;
  return {
    present,
    shelves: present ? parseSectionList(fields.sections.value) : [],
    updatedAt: fields.updated?.value || "",
    digests: snapshotDigests(fields),
  };
}

export function readLegacyState(product) {
  return {
    readable: product?.legacyReadable?.value || "",
    updatedAt: product?.legacyUpdated?.value || "",
  };
}

export function parseStoreConfig(connection) {
  if (!connection || !Array.isArray(connection.nodes) || connection.pageInfo?.hasNextPage) {
    throw new Error("Butikskopplingen kunde inte läsas fullständigt.");
  }
  const byKey = new Map();
  const byLocation = new Set();
  for (const node of connection.nodes) {
    const fields = Object.fromEntries((node.fields || []).map((f) => [f.key, f.value]));
    const storeKey = fields.store_key;
    const locationGid = fields.location_gid;
    if (!STORE_FIELDS[storeKey] || !/^gid:\/\/shopify\/Location\/[0-9]+$/.test(locationGid || "")) {
      throw new Error("Butikskopplingen innehåller ogiltiga värden.");
    }
    if (byKey.has(storeKey) || byLocation.has(locationGid)) {
      throw new Error("Butikskopplingen innehåller dubbletter.");
    }
    byKey.set(storeKey, {
      key: storeKey,
      locationGid,
      displayName: fields.display_name?.trim() || storeKey,
    });
    byLocation.add(locationGid);
  }
  return STORE_KEYS.filter((key) => byKey.has(key)).map((key) => byKey.get(key));
}

export function summarizeShelves(shelves, visibleCount = 2) {
  const count = Math.max(0, Math.floor(Number(visibleCount) || 0));
  return {visible: shelves.slice(0, count), remaining: Math.max(0, shelves.length - count)};
}
// END: DL HYLLSEKTIONER – GEMENSAM BUTIKSDATAMODELL

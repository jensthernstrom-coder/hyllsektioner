// START: DL HYLLSEKTIONER – SHOPIFY-DATA
// Alla skrivningar gäller exakt en butik och tre produktfält med compareDigest.
import {
  STORE_FIELDS, formatReadable, parseSectionRegistry, parseStoreConfig, readLegacyState,
  readStoreState, toUtcSecond, uniqueShelves,
} from "./shelf-model.js";

export const CONFLICT_MESSAGE =
  "Hyllplaceringen har ändrats. Läs om produkten innan du sparar igen.";

export const GET_PRODUCT_SHELVES = [
  "query DlGetProductShelves($id: ID!) {",
  "  product(id: $id) {",
  "    id",
  "    sveavagenReadable: metafield(namespace: \"custom\", key: \"butikshylla_sveavagen\") { value compareDigest }",
  "    sveavagenSections: metafield(namespace: \"custom\", key: \"butikshylla_sveavagen_sektioner\") { value compareDigest }",
  "    sveavagenUpdated: metafield(namespace: \"custom\", key: \"butikshylla_sveavagen_uppdaterad\") { value compareDigest }",
  "    kungsholmenReadable: metafield(namespace: \"custom\", key: \"butikshylla_kungsholmen\") { value compareDigest }",
  "    kungsholmenSections: metafield(namespace: \"custom\", key: \"butikshylla_kungsholmen_sektioner\") { value compareDigest }",
  "    kungsholmenUpdated: metafield(namespace: \"custom\", key: \"butikshylla_kungsholmen_uppdaterad\") { value compareDigest }",
  "    legacyReadable: metafield(namespace: \"custom\", key: \"butikshylla\") { value }",
  "    legacySections: metafield(namespace: \"custom\", key: \"butikshylla_sektioner\") { value }",
  "    legacyUpdated: metafield(namespace: \"custom\", key: \"butikshylla_uppdaterad\") { value }",
  "  }",
  "}",
].join("\n");

export const GET_STORES = [
  "query DlGetShelfStoreConfig($after: String) {",
  "  metaobjects(type: \"sidekick_shelf_store\", first: 50, after: $after) {",
  "    nodes { id fields { key value } }",
  "    pageInfo { hasNextPage endCursor }",
  "  }",
  "}",
].join("\n");

export const GET_SECTIONS = [
  "query DlGetShelfSectionRegistry($after: String) {",
  "  metaobjects(type: \"sidekick_inv_section\", first: 250, after: $after) {",
  "    nodes { id fields { key value } }",
  "    pageInfo { hasNextPage endCursor }",
  "  }",
  "}",
].join("\n");

export const SET_METAFIELDS = [
  "mutation DlSetStoreShelfMetafields($metafields: [MetafieldsSetInput!]!) {",
  "  metafieldsSet(metafields: $metafields) {",
  "    metafields { key namespace value compareDigest }",
  "    userErrors { field message code }",
  "  }",
  "}",
].join("\n");

function dataOrThrow(result) {
  if (result?.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join(" | "));
  }
  if (!result?.data) throw new Error("Shopify returnerade inget svar.");
  return result.data;
}

function operationOrThrow(result) {
  const operation = dataOrThrow(result).metafieldsSet;
  if (!operation) throw new Error("Shopify kunde inte spara hyllinformationen.");
  if (operation.userErrors?.length) {
    if (operation.userErrors.some((e) =>
      e.code === "STALE_OBJECT" || /compareDigest|stale/i.test(e.message || "")
    )) throw new Error(CONFLICT_MESSAGE);
    throw new Error(operation.userErrors.map((e) => e.message).join(" | "));
  }
  return operation;
}

async function readAllMetaobjects(query, document) {
  const nodes = [];
  const seenCursors = new Set();
  let after = null;
  // Fungerar även om registret växer över Shopifys sidgräns.
  for (let page = 0; page < 100; page += 1) {
    const connection = dataOrThrow(await query(document, {variables: {after}})).metaobjects;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error("Metaobjekten kunde inte läsas.");
    }
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return nodes;
    const cursor = connection.pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error("Ogiltig sidbläddring i sektionsregistret.");
    }
    seenCursors.add(cursor);
    after = cursor;
  }
  throw new Error("Sektionsregistret är för stort för att läsas fullständigt.");
}

export async function loadStoreConfig(query) {
  const nodes = await readAllMetaobjects(query, GET_STORES);
  return parseStoreConfig({nodes, pageInfo: {hasNextPage: false}});
}

export async function loadSectionRegistry(query, stores) {
  const nodes = await readAllMetaobjects(query, GET_SECTIONS);
  return parseSectionRegistry(nodes, stores);
}

export async function loadShelfBundle(query, productId) {
  const [productResult, stores, sectionNodes] = await Promise.all([
    query(GET_PRODUCT_SHELVES, {variables: {id: productId}}),
    loadStoreConfig(query),
    readAllMetaobjects(query, GET_SECTIONS),
  ]);
  const product = dataOrThrow(productResult).product;
  if (!product) throw new Error("Produkten kunde inte hittas.");
  return {
    stores,
    sectionsByStore: parseSectionRegistry(sectionNodes, stores),
    legacy: readLegacyState(product),
    states: Object.fromEntries(Object.keys(STORE_FIELDS).map((key) =>
      [key, readStoreState(product, key)]
    )),
  };
}

export async function saveStoreShelves(query, productId, store, rawNames, digests) {
  if (!STORE_FIELDS[store?.key] || !store.locationGid) {
    throw new Error("Välj en giltig butik innan du sparar.");
  }
  // Kontrollera kopplingen på nytt vid varje skrivning. Gissa aldrig location.
  const currentStores = await loadStoreConfig(query);
  const matched = currentStores.find((entry) => entry.key === store.key);
  if (!matched || matched.locationGid !== store.locationGid) {
    throw new Error("Butikskopplingen har ändrats. Läs om produkten innan du sparar.");
  }
  if (!digests || !["sections", "readable", "updated"].every((key) =>
    Object.hasOwn(digests, key)
  )) throw new Error("Saknar utgångsvärden. Läs om innan du sparar.");

  const names = uniqueShelves(rawNames);
  const updatedAt = toUtcSecond();
  const readable = formatReadable(names, updatedAt);
  const values = {
    sections: JSON.stringify(names),
    readable,
    updated: updatedAt,
  };
  const types = {
    sections: "list.single_line_text_field",
    readable: "single_line_text_field",
    updated: "date_time",
  };
  const keys = STORE_FIELDS[store.key];
  const metafields = ["sections", "readable", "updated"].map((field) => ({
    ownerId: productId,
    namespace: "custom",
    key: keys[field],
    type: types[field],
    value: values[field],
    compareDigest: digests[field],
  }));
  const operation = operationOrThrow(
    await query(SET_METAFIELDS, {variables: {metafields}}),
  );
  const saved = operation.metafields;
  if (!Array.isArray(saved) || saved.length !== 3) {
    throw new Error("Shopify bekräftade inte alla hyllfält. Läs om produkten.");
  }
  const byKey = Object.fromEntries(saved.map((field) => [field.key, field]));
  for (const field of ["sections", "readable", "updated"]) {
    const received = byKey[keys[field]];
    if (!received || received.namespace !== "custom" ||
      received.value !== values[field] || typeof received.compareDigest !== "string") {
      throw new Error("Shopifys svar avviker från sparningen. Läs om produkten.");
    }
  }
  return {
    present: true,
    shelves: names,
    updatedAt,
    digests: Object.fromEntries(["sections", "readable", "updated"].map((field) =>
      [field, byKey[keys[field]].compareDigest]
    )),
  };
}
// END: DL HYLLSEKTIONER – SHOPIFY-DATA

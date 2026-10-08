// START: DL BUTIKSHYLLA - SHOPIFY GRAPHQL
// En enda plats för Shopify-anrop, med injicerad query för testbarhet.
import {digestsMatch, readShelfState, snapshotDigests, uniqueShelves, validateShelfName} from "./shelf-model.js";

export const CONFLICT_MESSAGE =
  "Hyllplaceringen har ändrats sedan du öppnade produkten. Läs om innan du sparar igen.";

export const GET_PRODUCT_SHELVES = [
  "query DlGetProductShelves($id: ID!) {",
  "  product(id: $id) {",
  "    id",
  "    readableShelf: metafield(namespace: \"custom\", key: \"butikshylla\") { value updatedAt compareDigest }",
  "    shelfSections: metafield(namespace: \"custom\", key: \"butikshylla_sektioner\") { value updatedAt compareDigest }",
  "    shelfUpdated: metafield(namespace: \"custom\", key: \"butikshylla_uppdaterad\") { value updatedAt compareDigest }",
  "  }",
  "}",
].join("\n");

export const SET_METAFIELDS = [
  "mutation DlSetShelfMetafields($metafields: [MetafieldsSetInput!]!) {",
  "  metafieldsSet(metafields: $metafields) {",
  "    metafields { namespace key compareDigest }",
  "    userErrors { field message code }",
  "  }",
  "}",
].join("\n");

export const DELETE_METAFIELDS = [
  "mutation DlDeleteShelfMetafields($metafields: [MetafieldIdentifierInput!]!) {",
  "  metafieldsDelete(metafields: $metafields) {",
  "    deletedMetafields { ownerId namespace key }",
  "    userErrors { field message }",
  "  }",
  "}",
].join("\n");

const DEFS = {
  sections: {key: "butikshylla_sektioner", type: "list.single_line_text_field"},
  readable: {key: "butikshylla", type: "single_line_text_field"},
  updated: {key: "butikshylla_uppdaterad", type: "date_time"},
};

function dataOrThrow(result) {
  if (result?.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join(" | "));
  }
  if (!result?.data) throw new Error("Shopify returnerade inget svar.");
  return result.data;
}

function operationOrThrow(result, name) {
  const data = dataOrThrow(result);
  const operation = data[name];
  if (!operation) throw new Error("Shopify kunde inte slutföra " + name + ".");
  if (operation.userErrors?.length) {
    const isConflict = operation.userErrors.some(
      (e) => e.code === "STALE_OBJECT" || /compareDigest|stale/i.test(e.message ?? ""),
    );
    if (isConflict) throw new Error(CONFLICT_MESSAGE);
    throw new Error(operation.userErrors.map((e) => e.message).join(" | "));
  }
  return operation;
}

async function fetchProduct(query, productId) {
  const data = dataOrThrow(await query(GET_PRODUCT_SHELVES, {variables: {id: productId}}));
  if (!data.product) throw new Error("Produkten kunde inte hittas.");
  return data.product;
}

export async function loadProductShelves(query, productId) {
  return readShelfState(await fetchProduct(query, productId));
}

function input(productId, definition, value, compareDigest) {
  return {
    ownerId: productId,
    namespace: "custom",
    key: definition.key,
    type: definition.type,
    value,
    // null betyder: fältet ska fortfarande saknas när vi skriver.
    compareDigest,
  };
}

export async function saveProductShelves(query, productId, rawShelves, digests) {
  const shelves = uniqueShelves(rawShelves);
  if (shelves.length === 0) {
    throw new Error("Använd removeProductShelves för en tom lista.");
  }
  shelves.forEach(validateShelfName);
  const now = new Date().toISOString();
  const metafields = [
    input(productId, DEFS.sections, JSON.stringify(shelves), digests.sections),
    input(productId, DEFS.readable, shelves.join(", "), digests.readable),
    input(productId, DEFS.updated, now, digests.updated),
  ];
  const operation = operationOrThrow(
    await query(SET_METAFIELDS, {variables: {metafields}}),
    "metafieldsSet",
  );
  const saved = operation.metafields ?? [];
  if (saved.length !== 3) {
    throw new Error("Shopify bekräftade inte alla hyllfält. Läs om produkten.");
  }
  const byKey = Object.fromEntries(saved.map((field) => [field.key, field.compareDigest]));
  return {
    updatedAt: now,
    digests: {
      sections: byKey[DEFS.sections.key],
      readable: byKey[DEFS.readable.key],
      updated: byKey[DEFS.updated.key],
    },
  };
}

export async function removeProductShelves(query, productId, digests) {
  // metafieldsDelete saknar compareDigest. Kontrollera först att inget ändrats.
  // Ett mycket litet racefönster kan finnas mellan kontroll och delete.
  const current = await fetchProduct(query, productId);
  if (!digestsMatch(snapshotDigests(current), digests)) {
    throw new Error(CONFLICT_MESSAGE);
  }
  const metafields = Object.values(DEFS).map((def) => ({
    ownerId: productId, namespace: "custom", key: def.key,
  }));
  operationOrThrow(
    await query(DELETE_METAFIELDS, {variables: {metafields}}),
    "metafieldsDelete",
  );
  return {
    updatedAt: "",
    digests: {sections: null, readable: null, updated: null},
  };
}
// END: DL BUTIKSHYLLA - SHOPIFY GRAPHQL

import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE_FIELDS, formatReadable, formatStockholm, normalizeShelfName, parseSectionList,
  parseStoreConfig, readLegacyState, readStoreState, summarizeShelves, toUtcSecond,
  uniqueShelves, validateShelfName,
} from "../extensions/butikshylla-block/src/shelf-model.js";

test("fältkontraktet innehåller exakt tre fält per butik", () => {
  assert.deepEqual(Object.keys(STORE_FIELDS), ["sveavagen", "kungsholmen"]);
  assert.equal(STORE_FIELDS.sveavagen.sections, "butikshylla_sveavagen_sektioner");
  assert.equal(STORE_FIELDS.kungsholmen.updated, "butikshylla_kungsholmen_uppdaterad");
});

test("normaliserar, deduplicerar och sorterar enligt svenska regler", () => {
  assert.equal(normalizeShelfName("  Familje  spel  "), "Familje spel");
  assert.deepEqual(uniqueShelves(["Övrigt", "Äventyr", "äventyr", "Nyheter", "nyheter"]),
    ["Nyheter", "Äventyr", "Övrigt"]);
  assert.throws(() => validateShelfName("Bakre | lagret"), /\|/);
  assert.throws(() => validateShelfName(" "), /Skriv ett/);
});

test("listan är sanningskälla och tom lista är inte saknad", () => {
  const product = {
    sveavagenSections: {value:"[]",compareDigest:"a"},
    sveavagenReadable: {value:"Gammal text",compareDigest:"b"},
    sveavagenUpdated: {value:"2026-10-08T14:44:00Z",compareDigest:"c"},
    kungsholmenSections: null,
    legacyReadable: {value:"Äldre hylla från okänd butik"},
  };
  const svea = readStoreState(product, "sveavagen");
  assert.equal(svea.present, true);
  assert.deepEqual(svea.shelves, []);
  assert.deepEqual(svea.digests, {sections:"a",readable:"b",updated:"c"});
  const kh = readStoreState(product, "kungsholmen");
  assert.equal(kh.present, false);
  assert.deepEqual(kh.shelves, []);
  assert.equal(readLegacyState(product).readable, "Äldre hylla från okänd butik");
});

test("ogiltig strukturerad lista stoppas", () => {
  assert.throws(() => parseSectionList("{fel"), /ogiltig JSON/);
  assert.throws(() => parseSectionList('{"wrong":"type"}'), /oväntat format/);
  assert.throws(() => parseSectionList('["Familjespel",42]'), /oväntat format/);
});

test("svenskt datum och UTC utan millisekunder", () => {
  assert.equal(formatStockholm("2026-10-08T14:44:00Z"), "2026-10-08 16:44");
  assert.equal(formatStockholm("2026-12-08T14:44:00Z"), "2026-12-08 15:44");
  assert.equal(toUtcSecond(new Date("2026-10-08T14:44:03.987Z")), "2026-10-08T14:44:03Z");
});

test("läsbar text visar datum, håller 255 tecken och skyddar full lista", () => {
  const time = "2026-10-08T14:44:00Z";
  assert.equal(formatReadable(["Strategi","Nyheter"],time),
    "Nyheter | Strategi (uppdaterad 2026-10-08 16:44)");
  assert.equal(formatReadable([], time),
    "Ingen hyllplacering registrerad (uppdaterad 2026-10-08 16:44)");
  const names = Array.from({length:20}, (_,i) => "Hylla " + String(i).padStart(2,"0"));
  const readable = formatReadable(names,time);
  assert.ok(readable.length <= 255);
  assert.match(readable,/ m.fl. \(uppdaterad/);
  assert.equal(uniqueShelves(names).length,20);
});

function config(items) {
  return {nodes: items.map(([location, storeKey, name]) => ({
    fields: [
      {key:"location_gid",value:location},
      {key:"store_key",value:storeKey},
      {key:"display_name",value:name},
    ],
  })),pageInfo:{hasNextPage:false}};
}

test("läser butikskoppling utan hårdkodade location-ID", () => {
  const stores = parseStoreConfig(config([
    ["gid://shopify/Location/1","kungsholmen","Kungsholmen"],
    ["gid://shopify/Location/2","sveavagen","Sveavägen"],
  ]));
  assert.deepEqual(stores.map((s) => s.key),["sveavagen","kungsholmen"]);
  assert.equal(stores[0].locationGid,"gid://shopify/Location/2");
  assert.throws(() => parseStoreConfig(config([
    ["gid://shopify/Location/2","sveavagen","Svea"],
    ["gid://shopify/Location/3","sveavagen","Svea 2"],
  ])), /dubbletter/);
  assert.throws(() => parseStoreConfig(config([
    ["gid://shopify/Location/2","unknown","Okänd"],
  ])), /ogiltiga värden/);
  assert.throws(() => parseStoreConfig({nodes:[],pageInfo:{hasNextPage:true}}),
    /fullständigt/);
});

test("enbart två synliga hyllor i det kompakta blocket", () => {
  assert.deepEqual(summarizeShelves(["Nyheter","Familjespel","Strategi"]),
    {visible:["Nyheter","Familjespel"],remaining:1});
});

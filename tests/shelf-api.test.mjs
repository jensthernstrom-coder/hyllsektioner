import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFLICT_MESSAGE, GET_PRODUCT_SHELVES, GET_STORES, SET_METAFIELDS,
  loadShelfBundle, loadStoreConfig, saveStoreShelves,
} from "../extensions/butikshylla-block/src/shelf-api.js";

const productId = "gid://shopify/Product/123";
const store = {key:"sveavagen",locationGid:"gid://shopify/Location/1",displayName:"Sveavägen"};
const existingDigests = {sections:"a",readable:"b",updated:"c"};
const config = {nodes:[{fields:[
  {key:"store_key",value:"sveavagen"},
  {key:"location_gid",value:"gid://shopify/Location/1"},
  {key:"display_name",value:"Sveavägen"},
]}],pageInfo:{hasNextPage:false}};
const existingProduct = {
  sveavagenSections:{value:'["Familjespel"]',compareDigest:"a"},
  sveavagenReadable:{value:"Familjespel",compareDigest:"b"},
  sveavagenUpdated:{value:"2026-10-08T14:44:00Z",compareDigest:"c"},
  kungsholmenSections:{value:'["Bakre lagret"]',compareDigest:"kh-list"},
  kungsholmenReadable:{value:"Bakre lagret",compareDigest:"kh-text"},
  kungsholmenUpdated:{value:"2026-10-08T10:00:00Z",compareDigest:"kh-date"},
  legacyReadable:{value:"Äldre hylla, butik okänd"},
};

test("läser två butiker och visar legacy separat utan fallback", async () => {
  const query = async (document, options) => {
    if (document === GET_STORES) return {data:{metaobjects:config}};
    assert.equal(document,GET_PRODUCT_SHELVES);
    assert.equal(options.variables.id,productId);
    return {data:{product:existingProduct}};
  };
  const result = await loadShelfBundle(query, productId);
  assert.equal(result.stores.length,1);
  assert.deepEqual(result.states.sveavagen.shelves,["Familjespel"]);
  assert.deepEqual(result.states.kungsholmen.shelves,["Bakre lagret"]);
  assert.equal(result.legacy.readable,"Äldre hylla, butik okänd");
});

test("sparar vald butiks tre fält med CAS, aldrig den andra butikens eller legacy", async () => {
  let calls = [];
  const query = async (document, options) => {
    calls.push(document);
    if (document === GET_STORES) return {data:{metaobjects:config}};
    assert.equal(document,SET_METAFIELDS);
    const fields = options.variables.metafields;
    assert.equal(fields.length,3);
    assert.deepEqual(fields.map((field) => field.key), [
      "butikshylla_sveavagen_sektioner",
      "butikshylla_sveavagen",
      "butikshylla_sveavagen_uppdaterad",
    ]);
    assert.deepEqual(fields.map((field) => field.compareDigest), ["a","b","c"]);
    assert.equal(fields[0].value,'["Familjespel","Nyheter"]');
    return {data:{metafieldsSet:{metafields:fields.map((field,i) => ({
      key:field.key,namespace:field.namespace,value:field.value,compareDigest:"new"+i,
    })),userErrors:[]}}};
  };
  const result = await saveStoreShelves(query,productId,store,
    ["Nyheter","Familjespel"],existingDigests);
  assert.deepEqual(calls,[GET_STORES,SET_METAFIELDS]);
  assert.deepEqual(result.shelves,["Familjespel","Nyheter"]);
  assert.deepEqual(result.digests,{sections:"new0",readable:"new1",updated:"new2"});
});

test("uttrycklig tömning skriver [] och behåller datum och en läsbar text", async () => {
  const query = async (doc, args) => {
    if (doc === GET_STORES) return {data:{metaobjects:config}};
    const fields = args.variables.metafields;
    assert.equal(fields[0].value,"[]");
    assert.match(fields[1].value,/^Ingen hyllplacering registrerad \(uppdaterad /);
    assert.match(fields[2].value,/Z$/);
    return {data:{metafieldsSet:{metafields:fields.map((f,i)=>({
      key:f.key,namespace:"custom",value:f.value,compareDigest:"updated"+i,
    })),userErrors:[]}}};
  };
  const result = await saveStoreShelves(query,productId,store,[],existingDigests);
  assert.deepEqual(result.shelves,[]);
  assert.equal(result.present,true);
});

test("omappad eller ändrad butik stoppar skrivning innan mutation",async () => {
  const query = async (doc) => {
    assert.equal(doc,GET_STORES);
    return {data:{metaobjects:{nodes:[],pageInfo:{hasNextPage:false}}}};
  };
  await assert.rejects(() => saveStoreShelves(query,productId,store,
    ["Nyheter"],existingDigests), /Butikskopplingen har ändrats/);
});

test("CAS-konflikt stoppar utan falskt lyckat resultat",async () => {
  const query = async (doc) => {
    if (doc === GET_STORES) return {data:{metaobjects:config}};
    return {data:{metafieldsSet:{metafields:[],
      userErrors:[{code:"STALE_OBJECT",message:"Stale compareDigest"}]}}};
  };
  await assert.rejects(() => saveStoreShelves(query,productId,store,
    ["Nyheter"],existingDigests), (error) => error.message === CONFLICT_MESSAGE);
});

test("extern textändring i mutationens svar får inte adopteras",async () => {
  const query = async (doc,args) => {
    if (doc === GET_STORES) return {data:{metaobjects:config}};
    const fields = args.variables.metafields;
    return {data:{metafieldsSet:{metafields:fields.map((f,i) => ({
      key:f.key,namespace:"custom",
      value:i === 1 ? "Helt annan text" : f.value,
      compareDigest:"new"+i,
    })),userErrors:[]}}};
  };
  await assert.rejects(() => saveStoreShelves(query,productId,store,
    ["Nyheter"],existingDigests), /avviker från sparningen/);
});

test("GraphQL-fel stoppar både butiksläsning och produktsparning",async () => {
  await assert.rejects(() => loadStoreConfig(async () => ({
    errors:[{message:"Forbidden"}],
  })), /Forbidden/);
});

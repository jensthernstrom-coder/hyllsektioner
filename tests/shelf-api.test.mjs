import test from "node:test";
import assert from "node:assert/strict";
import {
  loadProductShelves, saveProductShelves, removeProductShelves, CONFLICT_MESSAGE,
  GET_PRODUCT_SHELVES, SET_METAFIELDS, DELETE_METAFIELDS,
} from "../extensions/butikshylla-block/src/shelf-api.js";

const productId = "gid://shopify/Product/123";
const snapshot = {sections:"section-hash",readable:"readable-hash",updated:"updated-hash"};
const existing = {
  shelfSections:{value:'["Familjespel"]',compareDigest:snapshot.sections},
  readableShelf:{value:"Familjespel",compareDigest:snapshot.readable},
  shelfUpdated:{value:"2026-10-01T00:00:00Z",compareDigest:snapshot.updated},
};

test("läsning gör ett produktanrop",async()=>{
  const query=async (document,options)=>{
    assert.equal(document,GET_PRODUCT_SHELVES);
    assert.equal(options.variables.id,productId);
    return {data:{product:existing}};
  };
  const state=await loadProductShelves(query,productId);
  assert.deepEqual(state.shelves,["Familjespel"]);
  assert.deepEqual(state.digests,snapshot);
});

test("sparar tre fält atomärt med compareDigest",async()=>{
  let calls=0;
  const query=async (document,options)=>{
    calls++;
    assert.equal(document,SET_METAFIELDS);
    const fields=options.variables.metafields;
    assert.equal(fields.length,3);
    assert.equal(fields[0].compareDigest,"section-hash");
    assert.equal(fields[1].compareDigest,"readable-hash");
    assert.equal(fields[2].compareDigest,"updated-hash");
    assert.equal(fields[0].value,'["Familjespel","Strategi"]');
    return {data:{metafieldsSet:{metafields:fields.map((field,i)=>({
      key:field.key, compareDigest:"new-"+i
    })),userErrors:[]}}};
  };
  const result=await saveProductShelves(query,productId,["Familjespel","Strategi"],snapshot);
  assert.equal(calls,1);
  assert.deepEqual(result.digests,{sections:"new-0",readable:"new-1",updated:"new-2"});
});

test("CAS-konflikt ger mänskligt felmeddelande",async()=>{
  const query=async()=>({data:{metafieldsSet:{metafields:[],
    userErrors:[{code:"STALE_OBJECT",message:"compareDigest did not match"}]}}});
  await assert.rejects(()=>saveProductShelves(query,productId,["Familjespel"],snapshot),
    (error)=>error.message===CONFLICT_MESSAGE);
});

test("tar bort alla tre fält med ett delete-anrop efter konfliktkontroll",async()=>{
  const calls=[];
  const query=async (document,options)=>{
    calls.push(document);
    if(document===GET_PRODUCT_SHELVES) return {data:{product:existing}};
    assert.equal(document,DELETE_METAFIELDS);
    assert.equal(options.variables.metafields.length,3);
    return {data:{metafieldsDelete:{deletedMetafields:[],userErrors:[]}}};
  };
  const result=await removeProductShelves(query,productId,snapshot);
  assert.deepEqual(calls,[GET_PRODUCT_SHELVES,DELETE_METAFIELDS]);
  assert.equal(result.updatedAt,"");
});

test("tar inte bort om någon annan hunnit uppdatera produkten",async()=>{
  const query=async()=>({data:{product:existing}});
  await assert.rejects(()=>removeProductShelves(query,productId,{
    ...snapshot,sections:"old-digest",
  }), (error)=>error.message===CONFLICT_MESSAGE);
});

test("GraphQL-fel får inte bli en falsk sparbekräftelse",async()=>{
  const query=async()=>({errors:[{message:"Unauthorized"}]});
  await assert.rejects(()=>saveProductShelves(query,productId,["Familjespel"],snapshot),/Unauthorized/);
});

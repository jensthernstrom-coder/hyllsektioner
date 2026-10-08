import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeShelfName, uniqueShelves, parseSectionList, parseLegacyReadableShelf,
  readShelfState, digestsMatch, validateShelfName,
} from "../extensions/butikshylla-block/src/shelf-model.js";

test("normaliserar och tar bort gamla datumetiketter", () => {
  assert.equal(normalizeShelfName("  Strategi  (uppdaterad 2026-10-08 10:21)  "), "Strategi");
});
test("tar bort dubbletter med svensk skiftlägesjämförelse", () => {
  assert.deepEqual(uniqueShelves(["Strategi", " strategi ", "Äventyr", "äventyr"]), ["Strategi", "Äventyr"]);
});
test("tolkar äldre läsbart metafält", () => {
  assert.deepEqual(parseLegacyReadableShelf("Familjespel, Strategi; Pussel"), ["Familjespel", "Strategi", "Pussel"]);
});
test("en lagrad tom lista får aldrig migreras från en äldre text", () => {
  const state = readShelfState({
    shelfSections: {value:"[]", compareDigest:"abc"},
    readableShelf: {value:"Gammal hylla",compareDigest:"xyz"},
  });
  assert.deepEqual(state.shelves, []);
  assert.equal(state.legacyFallback, false);
});
test("migrerar äldre värden bara när masterfältet saknas", () => {
  const state = readShelfState({shelfSections:null,readableShelf:{value:"Familjespel"}});
  assert.deepEqual(state.shelves, ["Familjespel"]);
  assert.equal(state.legacyFallback, true);
  assert.equal(state.digests.sections, null);
});
test("trasig masterdata kan inte tyst skrivas över", () => {
  assert.throws(()=>parseSectionList("{trasig"), /ogiltig JSON/);
  assert.throws(()=>parseSectionList('{"foo":"bar"}'), /oväntat format/);
  assert.throws(()=>parseSectionList('["test",42]'), /oväntat format/);
});
test("validerar nya hyllnamn", () => {
  assert.throws(()=>validateShelfName(" "),/Skriv ett/);
  assert.throws(()=>validateShelfName("a".repeat(121)),/120 tecken/);
});
test("samtliga digest-fält måste matcha", () => {
  assert.equal(digestsMatch({sections:null,readable:"a",updated:"b"},
    {sections:null,readable:"a",updated:"b"}),true);
  assert.equal(digestsMatch({sections:"a",readable:"b",updated:"c"},
    {sections:"x",readable:"b",updated:"c"}),false);
});

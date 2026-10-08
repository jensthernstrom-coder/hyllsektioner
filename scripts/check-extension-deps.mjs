// Verifiera att Shopify CLI kan hitta UI extension-bibliotek från arbetsytan.
import {createRequire} from "node:module";

const fromExtension = createRequire(new URL("../extensions/butikshylla-block/package.json", import.meta.url));
for (const name of ["@shopify/ui-extensions/preact", "preact"]) {
  try {
    const path = fromExtension.resolve(name);
    console.log(name + " OK: " + path);
  } catch (error) {
    console.error("Saknar " + name + ". Kör npm install i projektroten först.");
    process.exitCode = 1;
  }
}

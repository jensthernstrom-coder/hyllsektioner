# Hyllsektioner

Shopify-hostad Admin UI Extension för att läsa och redigera en produkts hyllplacering direkt i Shopify Admin.

## Arkitektur (DL Guldstandard)

- Ingen extern server, Netlify, databas eller kundvy behövs.
- Shopify är datakälla. Tre befintliga metafält används utan migration.
- Gränssnitt: extensions/butikshylla-block/src/BlockExtension.jsx
- Domänregler: extensions/butikshylla-block/src/shelf-model.js
- Shopify-anrop: extensions/butikshylla-block/src/shelf-api.js
- Hyllförslag: extensions/butikshylla-block/src/shelves.js (synkas manuellt mot Inventeringsappen).
- Behörighet: endast write_products. Direkt GraphQL Admin API i extensionen.

## Metafält (ändra inte nycklar)

- custom.butikshylla (single_line_text_field) – äldre läsbar representation.
- custom.butikshylla_sektioner (list.single_line_text_field) – master för flera hyllor.
- custom.butikshylla_uppdaterad (date_time) – tidsstämpel när hyllor sparades.

## Kompakt produktblock\n\nShopify begränsar produktblockets höjd till 300px och infogar annars Visa mer.\nDärför visas normalt endast upp till två hyllor och +N till tillsammans med Redigera.\nRedigering har ett fält i taget: lägg till befintlig hylla, skapa ny eller ta bort en hylla.\nAlla hyllor, även de som inte får plats i sammanfattningen, kan tas bort via väljaren.\nÄndringar sparas först vid Spara och kan kastas med Avbryt.\n\n## Driftsäkerhet

- En befintlig tom masterlista migreras inte från en gammal text.
- Felaktig JSON blockerar redigering i stället för att kasta bort data.
- Hyllnamn normaliseras, dubbletter stoppas, maxlängden valideras.
- Alla tre fälten sparas atomärt med metafieldsSet och compareDigest.
- Borttagning görs med ett metafieldsDelete-anrop för tre fält; föregås av konfliktkontroll.
- OBS: metafieldsDelete har inget compareDigest. Ett kort racefönster mellan kontroll och borttagning återstår.
- Begäranden till äldre produktvy får inte skriva över nyare skärmläge.
- Om produkten inte kunde läsas är redigering avstängd.
- 'Läs om' kräver bekräftelse om det finns osparade ändringar.

## Test och release

1. Kör `npm install` från projektroten med Node 22 eller senare. Rotprojektet har en npm-workspace som installerar extensionens beroenden.
2. Kör `npm run check:extension` och `npm test` före `shopify app dev`.
3. Om Shopify CLI säger `Type reference for admin.product-details.block.render could not be found` saknas sannolikt installerade extension-beroenden. Upprepa `npm install` i roten och kontrollera med `npm run check:extension`.
4. Lägg till `package-lock.json` i Git när npm har genererat den för att låsa exakta dependencies.
5. Kör shopify app dev i utvecklingsbutiken. Kontrollera Shopify-blocket manuellt.
6. Prova äldre text, flera hyllor, tom produkt, sparande, borttagning, konflikt och om-läsning.
7. Kör shopify app deploy --no-release. Kontrollera den skapade versionen.
8. Först efter godkänd kontroll: släpp versionen via Shopify Dev Dashboard eller CLI.

Shopify CLI krävs lokalt för dev/deploy. Denna repo-version innehåller inga inloggningsuppgifter.

## Appadress

Appen är extension-only och använder Shopifys officiella standardadress i shopify.app.toml i stället för example.com.
Huvudfunktionen är blocket 'Butikshylla' på en produktsida; det kräver ingen separat App Home-server.

## Built for Shopify

Koden följer flera tekniska principer (inbyggt admin-UI, GraphQL, färre scopes, lättviktig drift).
Detta är en intern/custom-distribution-app och kan inte som sådan garanteras Built for Shopify-badge.
En publik App Store-app skulle kräva en annan distributions-/App Home-lösning och Shopify-granskning.

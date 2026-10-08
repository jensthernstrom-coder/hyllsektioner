# Hyllsektioner – butiksspecifik testgren

Shopify-hostad Admin UI Extension för att visa och manuellt redigera hyllplaceringar per butik på en produkt. Denna gren följer dataförslaget från Inventering v61, men är INTE releasad.

## Separera test och produktion

- Aktiv Inventering är fortfarande v57; v61 är bara sparad och oaktiverad.
- Detta gäller endast GitHub-grenen feature/store-specific-shelves-2026-10 och draft-PR #2.
- Kör inga skrivtester mot skarpa produkter. Inventering-"Testläge" är inte en sandbox.
- Ändra inte Order Printers skarpa mall innan två butiker och riktiga utskrifter har kontrollerats.
- PR #2 bygger på PR #1 (improve/dl-guldstandard-2026-10). Granska i ordning.

## Delat kontrakt: sex butiksspecifika produktmetafält

Namespace custom, ägare Shopify Product (alla varianter delar placering).

| Butik | Läsbar text (single_line_text_field) | Masterlista (list.single_line_text_field) | Tid (date_time) |
| --- | --- | --- | --- |
| Sveavägen | butikshylla_sveavagen | butikshylla_sveavagen_sektioner | butikshylla_sveavagen_uppdaterad |
| Kungsholmen | butikshylla_kungsholmen | butikshylla_kungsholmen_sektioner | butikshylla_kungsholmen_uppdaterad |

- Masterlistan är en JSON-lista, exempelvis ["Familjespel","Nyheter"].
- Hyllnamn trimmas, upprepade vanliga blanksteg normaliseras, dubbletter avlägsnas med sv-SE och namn sorteras med svensk kollation.
- Läsbar text har max 255 tecken; " m.fl." används när texten kortas. Hela strukturerade listan sparas alltid.
- Tider sparas i UTC utan millisekunder och formateras i Europe/Stockholm i den läsbara texten.
- Saknad masterlista = inte registrerad. Sparad [] = avsiktligt tömd.
- Tömning skriver tre fält med metafieldsSet och CAS: [], läsbar text "Ingen hyllplacering registrerad (uppdaterad …)" och datum. Aldrig metafieldsDelete.
- Legacy: custom.butikshylla, custom.butikshylla_sektioner och custom.butikshylla_uppdaterad läses separat som "Äldre placering, butik okänd". Aldrig fallback eller skrivmål.
- Föreslagna hyllnamn finns ännu i src/shelves.js (manuellt synkad gammal lista). Kontrollera mot Inventerings sektioner per butik före release.

## Butikskoppling

Merchant-owned Shopify-metaobjekt av typ sidekick_shelf_store:
location_gid, store_key, display_name.
store_key är exakt sveavagen eller kungsholmen. Inget active-fält.
Endast konfigurerade butiker visas i blocket. Kopplingen hämtas på nytt före varje sparning.
Pickup-location för Sveavägen är omappad tills ett verksamhetsbeslut fattats.

Den här grenen skapar inga metaobjekt, metafältsdefinitioner eller produktvärden.
Behörigheter i shopify.app.toml: read_products, write_products, read_metaobjects.
Scope-ändring kräver Shopify-installations- och behörighetskontroll i isolerad testmiljö.

## UI och säkerhet

- Kompakt produktblock: butiksväljare, högst två synliga hyllor och datum.
- Redigera: Lägg till eller Ta bort, med utkast och Spara/Avbryt.
- Butiksbyte blockeras om det finns osparade ändringar.
- Manuell tömning kräver separat bekräftelse, därefter Spara.
- Alla tre fälten för vald butik skrivs atomärt med compareDigest.
- Konflikt, ogiltig butikskoppling, saknat Shopify-svar eller avvikande skrivsvar är fel.
- Inga automatiska omförsök med blind överskrivning.

## Order Printer – ingen förändring än

Ni använder Shopifys inbyggda plocklista med egen metafältskolumn.
Första testet blir att lägga till custom.butikshylla_sveavagen eller custom.butikshylla_kungsholmen.
Verifiera om den inbyggda plocklistan kan byta kolumn efter utskriftsplats.
Urval av ordrar per location innebär inte automatiskt att fältkolumnen växlar.
Om så inte sker behövs ett explicit mall-/kolumnval för respektive butik.

## Tester som återstår

1. npm install (Node 22+) i roten, npm run check:extension och npm test.
2. Kör shopify app dev mot testbutik med uppdaterade scopes. Kontrollera att metaobjekt kan läsas och Admin 300px-gränsen respekteras.
3. Testa två butiker på testprodukter: samma produkt i båda, saknat vs [], extern CAS-konflikt och manuell tömning.
4. Verifiera att äldre text aldrig används som butiksspecifik hylla.
5. Testa Order Printer-utskrift från vardera butik och att ingen felaktig butik visas.
6. Granska Inventering v61-källkoden. Handoff rapporterar risk för förlorade baseline-/completed-uppdateringar med samtidiga enheter, sen baseline och falsk adoption efter omläsning.
7. Testa Inventering v61:s omgångs- och synkflöden på särskilda testprodukter.
8. Godkänn gemensam releaseplan med rollback för kod och produktdata.

Detta är INTE en produktionsrelease. Blanda inte skarpa skrivningar från v57 och den nya modellen.

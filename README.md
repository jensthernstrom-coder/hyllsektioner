# Hyllsektioner – butiksspecifik Shopify Admin-extension

Det kompakta produktblocket **Butikshylla** använder samma register som Inventering v70, men har en separat vy per butik. Sveavägen är förvald. Kungsholmen nås via en diskret butiksknapp.

## Datakällor

- Inventering äger sektionsregistret `sidekick_inv_section` med `name`, `location_gid`, `area` och `position`.
- Butikskopplingar kommer från `sidekick_shelf_store` med `store_key`, `display_name` och `location_gid`.
- Sektionsregistret hämtas vid öppning/knappen **Läs om** med GraphQL-sidbläddring. Endast sektioner på vald butiks location visas, sorterade på område och sedan position, med standardvärdena `I butiken` och `0`.
- Sektionsval använder metaobjekt-ID i formuläret. Produktens placering lagras fortsatt som **sektionsnamn** i `list.single_line_text_field`. Namnbyten i registret migrerar inte tidigare produktvärden.
- Nya sektioner skapas endast i Inventering. Produktblocket visar och kan ta bort gamla placeringar även om namnen saknas i registret.

## Shopifys produktmetafält

| Butik | Läsbart fält | Strukturerad masterlista | Senast uppdaterad |
| --- | --- | --- | --- |
| Sveavägen | `custom.butikshylla_sveavagen` | `custom.butikshylla_sveavagen_sektioner` | `custom.butikshylla_sveavagen_uppdaterad` |
| Kungsholmen | `custom.butikshylla_kungsholmen` | `custom.butikshylla_kungsholmen_sektioner` | `custom.butikshylla_kungsholmen_uppdaterad` |

- Ingen butik får skriva till den andra butikens produktfält.
- Äldre gemensamma `custom.butikshylla*` är bara läsbara och aldrig skrivmål. Om Sveavägen saknar en butiksspecifik lista visas eventuell äldre läsbar information separat som **Butik okänd**.
- Alla tre butiksspecifika fält skrivs samtidigt med `metafieldsSet` och `compareDigest`, så konkurrerande ändringar inte tyst skrivs över.
- Tömning skriver `[]` och uppdaterad tid, inte radering av fälten.
- Om något metaobjekt inte kan läsas, visas fel och inga ändringar kan sparas.

## UX

- Två butiksknappar ovanför befintliga hyllbadges, Sveavägen förvalt.
- Lägg till, Ta bort, Spara, Avbryt och Läs om är kvar.
- Osparade ändringar förhindrar butiksväxling.
- Sammanfattningen visar högst två hyllor för att passa Shopify-adminblockets höjdgräns.
- Behörigheter: `read_products,write_products,read_metaobjects`. Om Shopify begär nya behörigheter måste appinstallationens åtkomst godkännas.

## Publicera på befintlig butik (utan separat testbutik)

GitHub-ändringar är **inte** automatiskt en Shopify-release. Från det uppdaterade GitHub-repot, med Shopify CLI inloggad på rätt Partnerorganisation och samma app-ID som i `shopify.app.toml`:

```bash
npm install
shopify app deploy
```

Bekräfta att releaseversionen gäller appen **hyllsektioner** och den befintliga Shopify-butiken, inte en ny app. Kommandot publicerar en ny appversion. På vissa installationer krävs ett separat godkännande av de tillagda API-behörigheterna.

Tidigare liveversion kan återaktiveras från Shopify Dev Dashboard om något inte fungerar. Att återaktivera en gammal appversion återställer **inte** produktdata som hunnit skrivas efter publicering.

Ingen massmigrering eller produktskrivning utförs vid driftsättning. Inga nya sektionsregister skapas av den här appen.

# Hyllsektioner

Shopify Admin UI Extension för att visa och redigera en produkts hyllplacering direkt på produktsidan.

## Metafält

Appblocket använder:

- `custom.butikshylla`
  - Typ: `single_line_text_field`
  - Läsbar sammanfattning
- `custom.butikshylla_sektioner`
  - Typ: `list.single_line_text_field`
  - Masterfält för flera hyllor
- `custom.butikshylla_uppdaterad`
  - Typ: `date_time`
  - Senaste uppdatering

## Funktioner

- visar en eller flera hyllor
- lägger till nya hyllor
- tar bort hyllor
- stoppar dubbletter
- synkar alla tre metafälten
- migrerar äldre data från `custom.butikshylla` om listfältet saknas
- visar senaste uppdateringstid

## Viktigt före deploy

Det här repot innehåller själva extensionen, men behöver kopplas till en Shopify-app.

Appens `shopify.app.toml` behöver minst:

```toml
[access_scopes]
scopes = "write_products"
```

Om appen redan har andra scopes ska `write_products` läggas till, inte ersätta dem.

## Extension

```text
extensions/
└── butikshylla-block/
    ├── locales/
    │   └── en.default.json
    ├── src/
    │   └── BlockExtension.jsx
    ├── package.json
    └── shopify.extension.toml
```

## UID

Shopify kräver ett UID för extensionen. Det ska skapas av Shopify och ska inte hittas på manuellt.

När extensionen kopplas till appen kan Shopify CLI/deploy skapa UID, eller så kan man generera en tom Admin block-extension i rätt app och sedan behålla det UID Shopify ger den.

## Nästa steg

1. Koppla detta repo till rätt Shopify-app.
2. Säkerställ `write_products`.
3. Låt Shopify skapa extension-UID.
4. Deploya appversionen.
5. Lägg till/fäst blocket **Butikshylla** på produktsidan i Shopify Admin.
6. Testa på en produkt med ett befintligt hyllvärde.

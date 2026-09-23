import {render} from "preact";
import {useEffect, useMemo, useState} from "preact/hooks";

/* ============================================================
   START: DL BUTIKSHYLLA – KONFIGURATION
   Ändra i första hand bara värden i detta block.
   ============================================================ */

const METAFIELDS = {
  readable: {
    namespace: "custom",
    key: "butikshylla",
    type: "single_line_text_field",
  },
  sections: {
    namespace: "custom",
    key: "butikshylla_sektioner",
    type: "list.single_line_text_field",
  },
  updated: {
    namespace: "custom",
    key: "butikshylla_uppdaterad",
    type: "date_time",
  },
};

const COPY = {
  heading: "Butikshylla",
  empty: "Ingen hylla är registrerad ännu.",
  inputLabel: "Lägg till hylla",
  inputPlaceholder: "Exempel: Strategi",
  add: "Lägg till",
  save: "Spara hyllplacering",
  saving: "Sparar…",
  reload: "Läs om",
  remove: "Ta bort",
  updatedPrefix: "Senast uppdaterad:",
  oldDataNotice:
    "Den här produkten hade bara den äldre hylltexten. Spara för att även fylla i sektionslistan.",
  duplicate: "Den hyllan finns redan på produkten.",
  blank: "Skriv ett hyllnamn först.",
  saveSuccess: "Hyllplaceringen är uppdaterad.",
  saveEmptySuccess: "Hyllplaceringen är borttagen.",
  loadError: "Kunde inte läsa produktens hyllinformation.",
  saveError: "Kunde inte spara hyllplaceringen.",
};

const QUICK_SHELVES = [
  // "Familjespel",
  // "Strategi",
  // "Två spelare",
];

/* ============================================================
   END: DL BUTIKSHYLLA – KONFIGURATION
   ============================================================ */


/* ============================================================
   START: DL BUTIKSHYLLA – GRAPHQL
   ============================================================ */

const GET_PRODUCT_SHELVES = `
  query DlGetProductShelves($id: ID!) {
    product(id: $id) {
      id
      title
      readableShelf: metafield(namespace: "custom", key: "butikshylla") {
        value
        type
        updatedAt
      }
      shelfSections: metafield(namespace: "custom", key: "butikshylla_sektioner") {
        value
        type
        updatedAt
      }
      shelfUpdated: metafield(namespace: "custom", key: "butikshylla_uppdaterad") {
        value
        type
        updatedAt
      }
    }
  }
`;

const SET_METAFIELDS = `
  mutation DlSetShelfMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        namespace
        key
        value
        type
        updatedAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const DELETE_METAFIELDS = `
  mutation DlDeleteShelfMetafields($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        ownerId
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/* ============================================================
   END: DL BUTIKSHYLLA – GRAPHQL
   ============================================================ */


/* ============================================================
   START: DL BUTIKSHYLLA – HJÄLPFUNKTIONER
   ============================================================ */

function normalizeShelfName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function uniqueShelves(values) {
  const seen = new Set();

  return values
    .map(normalizeShelfName)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase("sv-SE");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseSectionList(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return uniqueShelves(parsed);
  } catch {}

  return [];
}

function parseLegacyReadableShelf(value) {
  if (!value) return [];

  return uniqueShelves(
    String(value)
      .split(/[,;\n]/)
      .map((part) => part.trim()),
  );
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getErrors(payload, operationName) {
  return payload?.data?.[operationName]?.userErrors ?? [];
}

async function queryProduct(productId) {
  return shopify.query(GET_PRODUCT_SHELVES, {
    variables: {id: productId},
  });
}

async function setShelfMetafields(productId, shelves) {
  const now = new Date().toISOString();

  const result = await shopify.query(SET_METAFIELDS, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELDS.sections.namespace,
          key: METAFIELDS.sections.key,
          type: METAFIELDS.sections.type,
          value: JSON.stringify(shelves),
        },
        {
          ownerId: productId,
          namespace: METAFIELDS.readable.namespace,
          key: METAFIELDS.readable.key,
          type: METAFIELDS.readable.type,
          value: shelves.join(", "),
        },
        {
          ownerId: productId,
          namespace: METAFIELDS.updated.namespace,
          key: METAFIELDS.updated.key,
          type: METAFIELDS.updated.type,
          value: now,
        },
      ],
    },
  });

  const errors = getErrors(result, "metafieldsSet");
  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(" | "));
  }

  return now;
}

async function clearShelfMetafields(productId) {
  const deleteResult = await shopify.query(DELETE_METAFIELDS, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELDS.sections.namespace,
          key: METAFIELDS.sections.key,
        },
        {
          ownerId: productId,
          namespace: METAFIELDS.readable.namespace,
          key: METAFIELDS.readable.key,
        },
      ],
    },
  });

  const deleteErrors = getErrors(deleteResult, "metafieldsDelete");
  if (deleteErrors.length) {
    throw new Error(deleteErrors.map((error) => error.message).join(" | "));
  }

  const now = new Date().toISOString();

  const setResult = await shopify.query(SET_METAFIELDS, {
    variables: {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELDS.updated.namespace,
          key: METAFIELDS.updated.key,
          type: METAFIELDS.updated.type,
          value: now,
        },
      ],
    },
  });

  const setErrors = getErrors(setResult, "metafieldsSet");
  if (setErrors.length) {
    throw new Error(setErrors.map((error) => error.message).join(" | "));
  }

  return now;
}

/* ============================================================
   END: DL BUTIKSHYLLA – HJÄLPFUNKTIONER
   ============================================================ */


/* ============================================================
   START: DL BUTIKSHYLLA – UI
   ============================================================ */

export default async () => {
  render(<ShelfBlock />, document.body);
};

function ShelfBlock() {
  const productId = shopify.data.selected?.[0]?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shelves, setShelves] = useState([]);
  const [initialShelves, setInitialShelves] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [legacyFallback, setLegacyFallback] = useState(false);
  const [message, setMessage] = useState(null);

  const isDirty = useMemo(
    () => JSON.stringify(shelves) !== JSON.stringify(initialShelves),
    [shelves, initialShelves],
  );

  useEffect(() => {
    load();
  }, [productId]);

  async function load() {
    if (!productId) {
      setMessage({tone: "critical", text: COPY.loadError});
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await queryProduct(productId);
      const product = result?.data?.product;

      if (!product) throw new Error("Produkten kunde inte hittas.");

      const structured = parseSectionList(product.shelfSections?.value);
      const legacy = parseLegacyReadableShelf(product.readableShelf?.value);

      const usingLegacy = structured.length === 0 && legacy.length > 0;
      const nextShelves = usingLegacy ? legacy : structured;

      setShelves(nextShelves);
      setInitialShelves(nextShelves);
      setLegacyFallback(usingLegacy);
      setUpdatedAt(
        product.shelfUpdated?.value ??
          product.shelfSections?.updatedAt ??
          product.readableShelf?.updatedAt ??
          "",
      );
    } catch (error) {
      console.error("[DL Butikshylla] load error", error);
      setMessage({
        tone: "critical",
        text: `${COPY.loadError} ${error?.message ?? ""}`.trim(),
      });
    } finally {
      setLoading(false);
    }
  }

  function addShelf(rawValue = inputValue) {
    const shelf = normalizeShelfName(rawValue);

    if (!shelf) {
      setMessage({tone: "warning", text: COPY.blank});
      return;
    }

    const exists = shelves.some(
      (existing) =>
        existing.toLocaleLowerCase("sv-SE") ===
        shelf.toLocaleLowerCase("sv-SE"),
    );

    if (exists) {
      setMessage({tone: "warning", text: COPY.duplicate});
      return;
    }

    setShelves((current) => [...current, shelf]);
    setInputValue("");
    setMessage(null);
  }

  function removeShelf(index) {
    setShelves((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
    setMessage(null);
  }

  async function save() {
    if (!productId || saving) return;

    setSaving(true);
    setMessage(null);

    try {
      const cleaned = uniqueShelves(shelves);
      const newUpdatedAt =
        cleaned.length > 0
          ? await setShelfMetafields(productId, cleaned)
          : await clearShelfMetafields(productId);

      setShelves(cleaned);
      setInitialShelves(cleaned);
      setLegacyFallback(false);
      setUpdatedAt(newUpdatedAt);

      const text =
        cleaned.length > 0 ? COPY.saveSuccess : COPY.saveEmptySuccess;

      setMessage({tone: "success", text});

      try {
        shopify.toast.show(text);
      } catch {}
    } catch (error) {
      console.error("[DL Butikshylla] save error", error);
      setMessage({
        tone: "critical",
        text: `${COPY.saveError} ${error?.message ?? ""}`.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <s-admin-block heading={COPY.heading}>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel="Laddar hyllplacering" />
          <s-text>Laddar hyllplacering…</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading={COPY.heading}>
      <s-stack direction="block" gap="base">
        {message ? (
          <s-banner heading={message.text} tone={message.tone} />
        ) : null}

        {legacyFallback ? (
          <s-banner heading={COPY.oldDataNotice} tone="info" />
        ) : null}

        {shelves.length === 0 ? (
          <s-text>{COPY.empty}</s-text>
        ) : (
          <s-stack direction="block" gap="small">
            {shelves.map((shelf, index) => (
              <s-stack
                key={`${shelf}-${index}`}
                direction="inline"
                gap="small"
                alignItems="center"
              >
                <s-badge tone="info">{shelf}</s-badge>
                <s-button
                  variant="tertiary"
                  onClick={() => removeShelf(index)}
                  accessibilityLabel={`${COPY.remove} ${shelf}`}
                >
                  {COPY.remove}
                </s-button>
              </s-stack>
            ))}
          </s-stack>
        )}

        <s-divider />

        <s-stack direction="inline" gap="small" alignItems="end">
          <s-text-field
            label={COPY.inputLabel}
            placeholder={COPY.inputPlaceholder}
            value={inputValue}
            onInput={(event) => setInputValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addShelf();
              }
            }}
          />
          <s-button onClick={() => addShelf()}>{COPY.add}</s-button>
        </s-stack>

        {QUICK_SHELVES.length > 0 ? (
          <s-stack direction="inline" gap="small">
            {QUICK_SHELVES.map((shelf) => (
              <s-button
                key={shelf}
                variant="tertiary"
                onClick={() => addShelf(shelf)}
              >
                + {shelf}
              </s-button>
            ))}
          </s-stack>
        ) : null}

        {updatedAt ? (
          <s-text tone="subdued">
            {COPY.updatedPrefix} {formatDateTime(updatedAt)}
          </s-text>
        ) : null}

        <s-stack direction="inline" gap="small">
          <s-button
            variant="primary"
            disabled={!isDirty || saving}
            loading={saving}
            onClick={save}
          >
            {saving ? COPY.saving : COPY.save}
          </s-button>

          <s-button disabled={saving} onClick={load}>
            {COPY.reload}
          </s-button>
        </s-stack>
      </s-stack>
    </s-admin-block>
  );
}

/* ============================================================
   END: DL BUTIKSHYLLA – UI
   ============================================================ */

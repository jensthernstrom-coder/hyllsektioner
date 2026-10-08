import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useMemo, useRef, useState} from "preact/hooks";
import {SHELF_SECTIONS} from "./shelves.js";
import {
  formatDateTime, summarizeShelves, uniqueShelves, validateShelfName,
} from "./shelf-model.js";
import {
  loadProductShelves, removeProductShelves, saveProductShelves,
} from "./shelf-api.js";

// START: DL BUTIKSHYLLA – TEXTER
const COPY = {
  heading: "Butikshylla",
  empty: "Ingen hylla registrerad",
  edit: "Redigera",
  addMode: "Lägg till",
  removeMode: "Ta bort",
  pickExisting: "Välj hylla att lägga till",
  pickToRemove: "Välj hylla att ta bort",
  placeholder: "Välj en hylla",
  custom: "Skapa ny hylla",
  customLabel: "Namn på ny hylla",
  customPlaceholder: "Exempel: Strategi",
  noMoreShelves: "Alla förvalda hyllor är tillagda.",
  noShelvesToRemove: "Det finns inga hyllor att ta bort.",
  add: "Lägg till",
  back: "Tillbaka",
  save: "Spara",
  saving: "Sparar…",
  cancel: "Avbryt",
  reload: "Läs om",
  updated: "Senast uppdaterad:",
  legacy: "Äldre hyllinformation. Spara för att uppdatera.",
  duplicate: "Den hyllan finns redan på produkten.",
  pending: "Osparade ändringar",
  saved: "Hyllplaceringen är uppdaterad.",
  removed: "Hyllplaceringen är borttagen.",
  loadError: "Kunde inte läsa hyllplaceringen.",
  saveError: "Kunde inte spara hyllplaceringen.",
  loading: "Laddar hyllplacering…",
};
// END: DL BUTIKSHYLLA – TEXTER

export default async () => {
  render(<ShelfBlock />, document.body);
};

function queryShopify(document, options) {
  return shopify.query(document, options);
}

// START: DL BUTIKSHYLLA – KOMPAKT ADMIN-BLOCK
// Shopify kapar admin-block med innehåll som är högre än 300px.
// Visa därför bara sammanfattningen tills användaren väljer Redigera.
// I redigeringsläget visas endast ett fält åt gången.
function ShelfBlock() {
  const productId = shopify.data.selected?.[0]?.id;
  const currentProductRef = useRef(productId);
  currentProductRef.current = productId;
  const requestRef = useRef(0);
  const digestsRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shelves, setShelves] = useState([]);
  const [initialShelves, setInitialShelves] = useState([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [legacyFallback, setLegacyFallback] = useState(false);
  const [message, setMessage] = useState(null);

  // Endast presentation. Hyllorna sparas inte förrän användaren klickar Spara.
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState("add");
  const [custom, setCustom] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState("");
  const [inputValue, setInputValue] = useState("");

  const isDirty = useMemo(
    () => legacyFallback || JSON.stringify(shelves) !== JSON.stringify(initialShelves),
    [shelves, initialShelves, legacyFallback],
  );
  const editable = ready && !loading && !saving;

  const selectableShelves = useMemo(() => {
    const used = new Set(shelves.map((name) => name.toLocaleLowerCase("sv-SE")));
    return SHELF_SECTIONS.filter(
      (section) => !used.has(section.name.toLocaleLowerCase("sv-SE")),
    );
  }, [shelves]);

  const summary = summarizeShelves(shelves, 2);

  useEffect(() => {
    void load(productId);
    return () => { requestRef.current += 1; };
  }, [productId]);

  function resetEditor() {
    setEditing(false);
    setMode("add");
    setCustom(false);
    setSelectedShelf("");
    setInputValue("");
  }

  async function load(id = productId) {
    const request = ++requestRef.current;
    setLoading(true);
    setReady(false);
    setSaving(false);
    setMessage(null);
    setShelves([]);
    setInitialShelves([]);
    setLegacyFallback(false);
    setUpdatedAt("");
    digestsRef.current = null;
    resetEditor();

    try {
      if (!id) throw new Error("Ingen produkt är vald.");
      const state = await loadProductShelves(queryShopify, id);
      if (request !== requestRef.current || currentProductRef.current !== id) return;
      setShelves(state.shelves);
      setInitialShelves(state.shelves);
      setLegacyFallback(state.legacyFallback);
      setUpdatedAt(state.updatedAt);
      digestsRef.current = state.digests;
      setReady(true);
    } catch (error) {
      if (request !== requestRef.current || currentProductRef.current !== id) return;
      console.error("[DL Butikshylla] load", error);
      setMessage({
        tone: "critical",
        text: COPY.loadError + " " + (error?.message ?? ""),
      });
    } finally {
      if (request === requestRef.current && currentProductRef.current === id) {
        setLoading(false);
      }
    }
  }

  function addShelf(value) {
    if (!editable || !editing) return;
    let shelf;
    try {
      shelf = validateShelfName(value);
    } catch (error) {
      setMessage({tone: "warning", text: error.message});
      return;
    }
    if (shelves.some((item) =>
      item.toLocaleLowerCase("sv-SE") === shelf.toLocaleLowerCase("sv-SE")
    )) {
      setMessage({tone: "warning", text: COPY.duplicate});
      return;
    }
    setShelves((current) => [...current, shelf]);
    setSelectedShelf("");
    setInputValue("");
    setCustom(false);
    setMessage(null);
  }

  function removeShelf(name) {
    if (!editable || !editing || !name) return;
    setShelves((current) => current.filter((item) => item !== name));
    setSelectedShelf("");
    setMessage(null);
  }

  function switchMode(next) {
    if (!editable) return;
    setMode(next);
    setCustom(false);
    setSelectedShelf("");
    setInputValue("");
    setMessage(null);
  }

  function cancel() {
    if (!editable) return;
    // Återställ bara formulärets utkast. Produktens data ändras inte.
    setShelves(initialShelves);
    resetEditor();
    setMessage(null);
  }

  async function save() {
    if (!editable || !editing || !isDirty || !productId || !digestsRef.current) return;
    const saveId = productId;
    setSaving(true);
    setMessage(null);

    try {
      const cleaned = uniqueShelves(shelves);
      const result = cleaned.length
        ? await saveProductShelves(queryShopify, saveId, cleaned, digestsRef.current)
        : await removeProductShelves(queryShopify, saveId, digestsRef.current);

      if (currentProductRef.current !== saveId) return;
      digestsRef.current = result.digests;
      setShelves(cleaned);
      setInitialShelves(cleaned);
      setUpdatedAt(result.updatedAt);
      setLegacyFallback(false);
      resetEditor();
      const text = cleaned.length ? COPY.saved : COPY.removed;
      setMessage({tone: "success", text});
      try { shopify.toast.show(text); } catch {}
    } catch (error) {
      if (currentProductRef.current !== saveId) return;
      console.error("[DL Butikshylla] save", error);
      setMessage({
        tone: "critical",
        text: COPY.saveError + " " + (error?.message ?? ""),
      });
    } finally {
      if (currentProductRef.current === saveId) setSaving(false);
    }
  }

  if (loading) {
    return (
      <s-admin-block heading={COPY.heading}>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-spinner accessibilityLabel={COPY.loading} />
          <s-text>{COPY.loading}</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  if (!ready) {
    return (
      <s-admin-block heading={COPY.heading}>
        <s-stack direction="block" gap="small">
          {message ? <s-banner tone={message.tone} heading={message.text} /> : null}
          <s-button onClick={() => void load(productId)}>{COPY.reload}</s-button>
        </s-stack>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading={COPY.heading}>
      <s-stack direction="block" gap="small">
        {message ? <s-banner tone={message.tone} heading={message.text} /> : null}

        <s-stack direction="inline" gap="small" alignItems="center">
          {shelves.length ? (
            <>
              {summary.visible.map((name) => (
                <s-badge key={name} tone="info">{name}</s-badge>
              ))}
              {summary.remaining > 0 ? (
                <s-text tone="subdued">+{summary.remaining} till</s-text>
              ) : null}
            </>
          ) : (
            <s-text tone="subdued">{COPY.empty}</s-text>
          )}
        </s-stack>

        {!editing ? (
          <>
            {updatedAt ? (
              <s-text tone="subdued">{COPY.updated} {formatDateTime(updatedAt)}</s-text>
            ) : null}
            {legacyFallback ? <s-text tone="subdued">{COPY.legacy}</s-text> : null}
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" onClick={() => setEditing(true)}>
                {COPY.edit}
              </s-button>
              <s-button variant="tertiary" onClick={() => void load(productId)}>
                {COPY.reload}
              </s-button>
            </s-stack>
          </>
        ) : (
          <>
            <s-stack direction="inline" gap="small">
              <s-button variant={mode === "add" ? "primary" : "tertiary"}
                disabled={!editable} onClick={() => switchMode("add")}>
                {COPY.addMode}
              </s-button>
              <s-button variant={mode === "remove" ? "primary" : "tertiary"}
                disabled={!editable} onClick={() => switchMode("remove")}>
                {COPY.removeMode}
              </s-button>
              {isDirty ? <s-text tone="subdued">{COPY.pending}</s-text> : null}
            </s-stack>

            {mode === "add" && !custom ? (
              <>
                {selectableShelves.length ? (
                  <s-select label={COPY.pickExisting} placeholder={COPY.placeholder}
                    disabled={!editable} value={selectedShelf}
                    onChange={(event) => addShelf(event.currentTarget.value)}>
                    {selectableShelves.map((section) => (
                      <s-option key={section.name} value={section.name}>
                        {section.name} ({section.area})
                      </s-option>
                    ))}
                  </s-select>
                ) : <s-text tone="subdued">{COPY.noMoreShelves}</s-text>}
                <s-button variant="tertiary" disabled={!editable}
                  onClick={() => {setCustom(true); setMessage(null);}}>
                  {COPY.custom}
                </s-button>
              </>
            ) : null}

            {mode === "add" && custom ? (
              <s-stack direction="block" gap="small">
                <s-text-field label={COPY.customLabel} placeholder={COPY.customPlaceholder}
                  disabled={!editable} value={inputValue}
                  onInput={(event) => setInputValue(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addShelf(inputValue);
                    }
                  }} />
                <s-stack direction="inline" gap="small">
                  <s-button disabled={!editable || !inputValue.trim()}
                    onClick={() => addShelf(inputValue)}>{COPY.add}</s-button>
                  <s-button variant="tertiary" disabled={!editable}
                    onClick={() => {setCustom(false); setInputValue(""); setMessage(null);}}>
                    {COPY.back}
                  </s-button>
                </s-stack>
              </s-stack>
            ) : null}

            {mode === "remove" ? (
              shelves.length ? (
                <s-select label={COPY.pickToRemove} placeholder={COPY.placeholder}
                  disabled={!editable} value={selectedShelf}
                  onChange={(event) => removeShelf(event.currentTarget.value)}>
                  {shelves.map((name) => (
                    <s-option key={name} value={name}>{name}</s-option>
                  ))}
                </s-select>
              ) : <s-text tone="subdued">{COPY.noShelvesToRemove}</s-text>
            ) : null}

            <s-stack direction="inline" gap="small">
              <s-button variant="primary" loading={saving}
                disabled={!editable || !isDirty} onClick={save}>
                {saving ? COPY.saving : COPY.save}
              </s-button>
              <s-button disabled={!editable} onClick={cancel}>{COPY.cancel}</s-button>
            </s-stack>
          </>
        )}
      </s-stack>
    </s-admin-block>
  );
}
// END: DL BUTIKSHYLLA – KOMPAKT ADMIN-BLOCK

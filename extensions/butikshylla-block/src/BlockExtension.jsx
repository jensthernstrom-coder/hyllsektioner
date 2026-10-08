import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useMemo, useRef, useState} from "preact/hooks";
import {SHELF_SECTIONS} from "./shelves.js";
import {
  formatDateTime, normalizeShelfName, uniqueShelves, validateShelfName,
} from "./shelf-model.js";
import {
  loadProductShelves, removeProductShelves, saveProductShelves,
} from "./shelf-api.js";

// START: DL BUTIKSHYLLA - TEXTER
const COPY = {
  heading: "Butikshylla",
  empty: "Ingen hylla är registrerad ännu.",
  existingLabel: "Välj befintlig hylla",
  existingPlaceholder: "Välj en hylla",
  noExistingShelves: "Inga fler förvalda hyllor finns.",
  newShelfLabel: "Skapa ny hylla",
  inputPlaceholder: "Exempel: Strategi",
  add: "Lägg till",
  save: "Spara hyllplacering",
  saving: "Sparar…",
  reload: "Läs om",
  remove: "Ta bort",
  updatedPrefix: "Senast uppdaterad:",
  legacy: "Äldre hyllinformation visas. Spara för att uppdatera till den nya strukturen.",
  duplicate: "Den hyllan finns redan på produkten.",
  saveSuccess: "Hyllplaceringen är uppdaterad.",
  removeSuccess: "Hyllplaceringen är borttagen.",
  loadError: "Kunde inte läsa produktens hyllinformation.",
  saveError: "Kunde inte spara hyllplaceringen.",
  reloadWarning: "Du har osparade ändringar. Vill du kasta dem och läsa om?",
  reloadConfirm: "Läs om ändå",
  cancel: "Avbryt",
  loading: "Laddar hyllplacering…",
};
// END: DL BUTIKSHYLLA - TEXTER

export default async () => {
  render(<ShelfBlock />, document.body);
};

// START: DL BUTIKSHYLLA - KUND-/PERSONALVY
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
  const [selectedExistingShelf, setSelectedExistingShelf] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [legacyFallback, setLegacyFallback] = useState(false);
  const [reloadWarning, setReloadWarning] = useState(false);
  const [message, setMessage] = useState(null);

  const isDirty = useMemo(
    () => legacyFallback || JSON.stringify(shelves) !== JSON.stringify(initialShelves),
    [shelves, initialShelves, legacyFallback],
  );
  const editable = ready && !loading && !saving;
  const selectableShelves = useMemo(() => {
    const selected = new Set(shelves.map((s) => s.toLocaleLowerCase("sv-SE")));
    return SHELF_SECTIONS.filter(
      (section) => !selected.has(section.name.toLocaleLowerCase("sv-SE")),
    );
  }, [shelves]);

  useEffect(() => {
    void load(productId);
    return () => { requestRef.current += 1; };
  }, [productId]);

  async function load(id = productId) {
    const request = ++requestRef.current;
    setLoading(true);
    setReady(false);
    setReloadWarning(false);
    setMessage(null);
    setShelves([]);
    setInitialShelves([]);
    setSelectedExistingShelf("");
    setInputValue("");
    setLegacyFallback(false);
    setUpdatedAt("");
    digestsRef.current = null;

    try {
      if (!id) throw new Error("Ingen produkt är vald.");
      const state = await loadProductShelves(shopify.query, id);
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
      setMessage({tone: "critical", text: COPY.loadError + " " + (error?.message ?? "")});
    } finally {
      if (request === requestRef.current && currentProductRef.current === id) {
        setLoading(false);
      }
    }
  }

  function addShelf(value) {
    if (!editable) return;
    let shelf;
    try {
      shelf = validateShelfName(value);
    } catch (error) {
      setMessage({tone: "warning", text: error.message});
      return;
    }
    if (shelves.some((existing) =>
      existing.toLocaleLowerCase("sv-SE") === shelf.toLocaleLowerCase("sv-SE")
    )) {
      setMessage({tone: "warning", text: COPY.duplicate});
      return;
    }
    setShelves((current) => [...current, shelf]);
    setSelectedExistingShelf("");
    setInputValue("");
    setReloadWarning(false);
    setMessage(null);
  }

  function removeShelf(index) {
    if (!editable) return;
    setShelves((current) => current.filter((_, i) => i !== index));
    setReloadWarning(false);
    setMessage(null);
  }

  async function save() {
    if (!editable || !productId || !digestsRef.current) return;
    const saveId = productId;
    setSaving(true);
    setMessage(null);
    setReloadWarning(false);
    try {
      const cleaned = uniqueShelves(shelves);
      const result = cleaned.length
        ? await saveProductShelves(shopify.query, saveId, cleaned, digestsRef.current)
        : await removeProductShelves(shopify.query, saveId, digestsRef.current);

      if (currentProductRef.current !== saveId) return;
      digestsRef.current = result.digests;
      setShelves(cleaned);
      setInitialShelves(cleaned);
      setUpdatedAt(result.updatedAt);
      setLegacyFallback(false);
      const text = cleaned.length ? COPY.saveSuccess : COPY.removeSuccess;
      setMessage({tone: "success", text});
      try { shopify.toast.show(text); } catch {}
    } catch (error) {
      if (currentProductRef.current !== saveId) return;
      console.error("[DL Butikshylla] save", error);
      setMessage({tone: "critical", text: COPY.saveError + " " + (error?.message ?? "")});
    } finally {
      if (currentProductRef.current === saveId) setSaving(false);
    }
  }

  function handleReload() {
    if (!editable) return;
    if (isDirty) {
      setReloadWarning(true);
      return;
    }
    void load(productId);
  }

  if (loading) {
    return (
      <s-admin-block heading={COPY.heading}>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel={COPY.loading} />
          <s-text>{COPY.loading}</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading={COPY.heading}>
      <s-stack direction="block" gap="base">
        {message ? <s-banner heading={message.text} tone={message.tone} /> : null}
        {reloadWarning ? (
          <s-stack gap="small">
            <s-banner heading={COPY.reloadWarning} tone="warning" />
            <s-stack direction="inline" gap="small">
              <s-button onClick={() => void load(productId)}>{COPY.reloadConfirm}</s-button>
              <s-button variant="tertiary" onClick={() => setReloadWarning(false)}>
                {COPY.cancel}
              </s-button>
            </s-stack>
          </s-stack>
        ) : null}
        {legacyFallback ? <s-banner heading={COPY.legacy} tone="info" /> : null}

        {shelves.length === 0 ? <s-text>{COPY.empty}</s-text> : (
          <s-stack direction="block" gap="small">
            {shelves.map((shelf, index) => (
              <s-stack key={shelf + "-" + index} direction="inline" gap="small" alignItems="center">
                <s-badge tone="info">{shelf}</s-badge>
                <s-button variant="tertiary" disabled={!editable}
                  onClick={() => removeShelf(index)}
                  accessibilityLabel={COPY.remove + " " + shelf}>
                  {COPY.remove}
                </s-button>
              </s-stack>
            ))}
          </s-stack>
        )}

        <s-divider />

        {selectableShelves.length > 0 ? (
          <s-stack direction="inline" gap="small" alignItems="end">
            <s-select label={COPY.existingLabel} placeholder={COPY.existingPlaceholder}
              value={selectedExistingShelf} disabled={!editable}
              onChange={(event) => setSelectedExistingShelf(event.currentTarget.value)}>
              {selectableShelves.map((section) => (
                <s-option key={section.name} value={section.name}>
                  {section.name} ({section.area})
                </s-option>
              ))}
            </s-select>
            <s-button disabled={!editable || !selectedExistingShelf}
              onClick={() => addShelf(selectedExistingShelf)}>{COPY.add}</s-button>
          </s-stack>
        ) : <s-text tone="subdued">{COPY.noExistingShelves}</s-text>}

        <s-stack direction="inline" gap="small" alignItems="end">
          <s-text-field label={COPY.newShelfLabel} placeholder={COPY.inputPlaceholder}
            disabled={!editable} value={inputValue}
            onInput={(event) => setInputValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); addShelf(inputValue); }
            }} />
          <s-button disabled={!editable} onClick={() => addShelf(inputValue)}>{COPY.add}</s-button>
        </s-stack>

        {updatedAt ? (
          <s-text tone="subdued">{COPY.updatedPrefix} {formatDateTime(updatedAt)}</s-text>
        ) : null}

        <s-stack direction="inline" gap="small">
          <s-button variant="primary" disabled={!editable || !isDirty}
            loading={saving} onClick={save}>
            {saving ? COPY.saving : COPY.save}
          </s-button>
          <s-button disabled={!editable} onClick={handleReload}>{COPY.reload}</s-button>
        </s-stack>
      </s-stack>
    </s-admin-block>
  );
}
// END: DL BUTIKSHYLLA - KUND-/PERSONALVY

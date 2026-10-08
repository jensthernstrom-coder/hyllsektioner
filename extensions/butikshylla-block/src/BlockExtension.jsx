import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
import {SHELF_SECTIONS} from "./shelves.js";
import {
  formatStockholm, summarizeShelves, uniqueShelves, validateShelfName,
} from "./shelf-model.js";
import {loadShelfBundle, saveStoreShelves} from "./shelf-api.js";

// START: DL HYLLSEKTIONER – KOMPAKT BUTIKSSPECIFIK REDIGERARE
const COPY = {
  heading: "Butikshylla",
  selectStore: "Butik",
  missingConfig: "Ingen butik är kopplad. Kontrollera sidekick_shelf_store.",
  empty: "Ingen hyllplacering registrerad",
  never: "Inte registrerad i nya modellen",
  updated: "Bekräftad/ändrad:",
  legacy: "Äldre placering (butik okänd):",
  edit: "Redigera",
  reload: "Läs om",
  cancel: "Avbryt",
  add: "Lägg till",
  remove: "Ta bort",
  save: "Spara",
  saving: "Sparar…",
  placeholder: "Välj hylla",
  custom: "Annan hylla",
  input: "Nytt hyllnamn",
  back: "Tillbaka",
  pending: "Osparade ändringar",
  doNotDiscard: "Spara eller avbryt ändringarna innan du byter butik.",
  doNotReload: "Avbryt dina ändringar innan du läser om.",
  noMoreShelves: "Alla föreslagna hyllor är valda.",
  noShelvesToRemove: "Inga hyllor att ta bort.",
  clear: "Töm alla placeringar",
  confirmClear: "Bekräfta tömning",
  clearWarning: "Tömning sparas först när du klickar på Spara.",
  saved: "Hyllplaceringen har uppdaterats.",
  error: "Det gick inte att läsa eller spara hyllplaceringen.",
  loading: "Laddar hyllplaceringar…",
};

export default async () => {
  render(<ShelfBlock />, document.body);
};

function queryShopify(document, options) {
  return shopify.query(document, options);
}

function ShelfBlock() {
  const productId = shopify.data.selected?.[0]?.id;
  const currentProduct = useRef(productId);
  currentProduct.current = productId;
  const requestId = useRef(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bundle, setBundle] = useState(null);
  const [storeKey, setStoreKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [mode, setMode] = useState("add");
  const [custom, setCustom] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [message, setMessage] = useState(null);

  const store = bundle?.stores.find((entry) => entry.key === storeKey);
  const state = bundle?.states[storeKey];
  const initial = state?.shelves || [];
  const isDirty = editing && JSON.stringify(draft) !== JSON.stringify(initial);
  const editable = !!state && !!store && !loading && !saving;
  const visibleShelves = editing ? draft : initial;
  const summary = summarizeShelves(visibleShelves);
  const used = new Set(draft.map((name) => name.toLocaleLowerCase("sv-SE")));
  const available = SHELF_SECTIONS.filter((section) =>
    !used.has(section.name.toLocaleLowerCase("sv-SE"))
  );

  useEffect(() => {
    void load(productId);
    return () => {requestId.current += 1;};
  }, [productId]);

  function resetEditor() {
    setEditing(false);
    setDraft([]);
    setMode("add");
    setCustom(false);
    setInputValue("");
    setClearConfirm(false);
  }

  async function load(id = productId) {
    const request = ++requestId.current;
    setLoading(true);
    setBundle(null);
    setStoreKey("");
    resetEditor();
    setMessage(null);
    try {
      if (!id) throw new Error("Ingen produkt är vald.");
      const next = await loadShelfBundle(queryShopify, id);
      if (request !== requestId.current || currentProduct.current !== id) return;
      setBundle(next);
      setStoreKey(next.stores[0]?.key || "");
    } catch (error) {
      if (request !== requestId.current || currentProduct.current !== id) return;
      console.error("[DL Hyllsektioner] load", error);
      setMessage({tone: "critical", text: COPY.error + " " + (error?.message || "")});
    } finally {
      if (request === requestId.current && currentProduct.current === id) setLoading(false);
    }
  }

  function selectStore(nextKey) {
    if (saving) return;
    if (isDirty) {
      setMessage({tone: "warning", text: COPY.doNotDiscard});
      return;
    }
    if (!bundle?.stores.some((entry) => entry.key === nextKey)) return;
    resetEditor();
    setStoreKey(nextKey);
    setMessage(null);
  }

  function startEditing() {
    if (!editable) return;
    setDraft([...initial]);
    setEditing(true);
    setMessage(null);
  }

  function switchMode(next) {
    setMode(next);
    setCustom(false);
    setInputValue("");
    setClearConfirm(false);
    setMessage(null);
  }

  function addShelf(value) {
    if (!editable || !editing) return;
    try {
      const newName = validateShelfName(value);
      if (draft.some((item) =>
        item.toLocaleLowerCase("sv-SE") === newName.toLocaleLowerCase("sv-SE")
      )) {
        setMessage({tone: "warning", text: "Hyllan finns redan på produkten."});
        return;
      }
      setDraft(uniqueShelves([...draft, newName]));
      setCustom(false);
      setInputValue("");
      setClearConfirm(false);
      setMessage(null);
    } catch (error) {
      setMessage({tone: "warning", text: error.message});
    }
  }

  function removeShelf(value) {
    if (!editable || !editing || !value) return;
    setDraft(uniqueShelves(draft.filter((item) => item !== value)));
    setClearConfirm(false);
    setMessage(null);
  }

  function clearShelves() {
    if (!clearConfirm) {
      setClearConfirm(true);
      setMessage({tone: "warning", text: COPY.clearWarning});
      return;
    }
    setDraft([]);
    setClearConfirm(false);
    setMessage(null);
  }

  async function save() {
    if (!editable || !editing || !isDirty || !productId) return;
    const id = productId;
    const key = storeKey;
    setSaving(true);
    setMessage(null);
    try {
      const next = await saveStoreShelves(queryShopify, id, store, draft, state.digests);
      if (currentProduct.current !== id) return;
      setBundle((before) => ({
        ...before,
        states: {...before.states, [key]: next},
      }));
      resetEditor();
      setMessage({tone: "success", text: COPY.saved});
      try {shopify.toast.show(COPY.saved);} catch {}
    } catch (error) {
      if (currentProduct.current !== id) return;
      console.error("[DL Hyllsektioner] save", error);
      setMessage({tone: "critical", text: COPY.error + " " + (error?.message || "")});
    } finally {
      if (currentProduct.current === id) setSaving(false);
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

  if (!bundle) {
    return (
      <s-admin-block heading={COPY.heading}>
        {message ? <s-banner tone={message.tone} heading={message.text} /> : null}
        <s-button onClick={() => void load(productId)}>{COPY.reload}</s-button>
      </s-admin-block>
    );
  }

  return (
    <s-admin-block heading={COPY.heading}>
      <s-stack direction="block" gap="small">
        {message ? <s-banner tone={message.tone} heading={message.text} /> : null}

        {bundle.stores.length ? (
          <s-select label={COPY.selectStore} value={storeKey}
            disabled={saving || (editing && isDirty)}
            onChange={(event) => selectStore(event.currentTarget.value)}>
            {bundle.stores.map((item) => (
              <s-option key={item.key} value={item.key}>{item.displayName}</s-option>
            ))}
          </s-select>
        ) : <s-text tone="critical">{COPY.missingConfig}</s-text>}

        {store ? (
          <>
            <s-stack direction="inline" gap="small" alignItems="center">
              {summary.visible.map((name) => (
                <s-badge key={name} tone="info">{name}</s-badge>
              ))}
              {summary.remaining ? <s-text tone="subdued">+{summary.remaining} till</s-text> : null}
              {!visibleShelves.length ? (
                <s-text tone="subdued">{state?.present ? COPY.empty : COPY.never}</s-text>
              ) : null}
            </s-stack>
            {state?.updatedAt && !editing ? (
              <s-text tone="subdued">{COPY.updated} {formatStockholm(state.updatedAt)}</s-text>
            ) : null}

            {editing ? (
              <>
                <s-stack direction="inline" gap="small">
                  <s-button variant={mode === "add" ? "primary" : "tertiary"}
                    disabled={!editable} onClick={() => switchMode("add")}>Lägg till</s-button>
                  <s-button variant={mode === "remove" ? "primary" : "tertiary"}
                    disabled={!editable} onClick={() => switchMode("remove")}>Ta bort</s-button>
                  {isDirty ? <s-text tone="subdued">{COPY.pending}</s-text> : null}
                </s-stack>
                {mode === "add" && !custom ? (
                  <>
                    {available.length ? (
                      <s-select label="Välj hylla att lägga till" placeholder={COPY.placeholder}
                        disabled={!editable} onChange={(event) =>
                          addShelf(event.currentTarget.value)
                        }>
                        {available.map((item) => (
                          <s-option key={item.name} value={item.name}>
                            {item.name} ({item.area})
                          </s-option>
                        ))}
                      </s-select>
                    ) : <s-text tone="subdued">{COPY.noMoreShelves}</s-text>}
                    <s-button variant="tertiary" disabled={!editable}
                      onClick={() => setCustom(true)}>{COPY.custom}</s-button>
                  </>
                ) : null}
                {mode === "add" && custom ? (
                  <>
                    <s-text-field label={COPY.input} value={inputValue} disabled={!editable}
                      onInput={(event) => setInputValue(event.currentTarget.value)} />
                    <s-stack direction="inline" gap="small">
                      <s-button disabled={!editable || !inputValue.trim()}
                        onClick={() => addShelf(inputValue)}>{COPY.add}</s-button>
                      <s-button variant="tertiary" disabled={!editable}
                        onClick={() => setCustom(false)}>{COPY.back}</s-button>
                    </s-stack>
                  </>
                ) : null}
                {mode === "remove" ? (
                  draft.length ? (
                    <>
                      <s-select label="Välj hylla att ta bort" placeholder={COPY.placeholder}
                        disabled={!editable} onChange={(event) =>
                          removeShelf(event.currentTarget.value)
                        }>
                        {draft.map((name) => <s-option key={name} value={name}>{name}</s-option>)}
                      </s-select>
                      <s-button variant="tertiary" disabled={!editable}
                        onClick={clearShelves}>
                        {clearConfirm ? COPY.confirmClear : COPY.clear}
                      </s-button>
                    </>
                  ) : <s-text tone="subdued">{COPY.noShelvesToRemove}</s-text>
                ) : null}
                <s-stack direction="inline" gap="small">
                  <s-button variant="primary" loading={saving}
                    disabled={!editable || !isDirty} onClick={save}>{saving ? COPY.saving : COPY.save}</s-button>
                  <s-button disabled={!editable}
                    onClick={() => {resetEditor(); setMessage(null);}}>{COPY.cancel}</s-button>
                </s-stack>
              </>
            ) : (
              <s-stack direction="inline" gap="small">
                <s-button variant="primary" onClick={startEditing}>{COPY.edit}</s-button>
                <s-button variant="tertiary" onClick={() => void load(productId)}>{COPY.reload}</s-button>
              </s-stack>
            )}
          </>
        ) : null}
        {!editing && bundle.legacy.readable ? (
          <s-text tone="subdued">
            {COPY.legacy} {bundle.legacy.readable.length > 100 ?
              bundle.legacy.readable.slice(0, 100) + "…" : bundle.legacy.readable}
          </s-text>
        ) : null}
      </s-stack>
    </s-admin-block>
  );
}
// END: DL HYLLSEKTIONER – KOMPAKT BUTIKSSPECIFIK REDIGERARE

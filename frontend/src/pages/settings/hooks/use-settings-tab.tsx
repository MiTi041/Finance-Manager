import { useCallback, useEffect, useRef, useState } from "react";
import { hasFreshCache } from "@/lib/fetch-cache";
import { ConfirmDialog } from "@/components/confirm-dialog";

type PendingEditorAction<TRecord> =
  | { kind: "close-edit" }
  | { kind: "switch-edit"; item: TRecord }
  | { kind: "close-create" };

export interface SettingsTabConfig<TRecord extends { id: number }, TForm> {
  entityName: string;
  cacheKey: string;
  loadErrorTitle: string;
  saveErrorTitle: string;
  deleteErrorTitle: string;
  EMPTY_FORM: TForm;
  fetchItems: (options?: {
    forceRefresh?: boolean;
  }) => Promise<TRecord[]>;
  createItem: (payload: unknown) => Promise<TRecord>;
  updateItem: (id: number, payload: unknown) => Promise<TRecord>;
  deleteItem: (id: number) => Promise<void>;
  normalizeDraft: (form: TForm) => unknown;
  isDirty: (editingItem: TRecord | null, form: TForm) => boolean;
  formFromItem: (item: TRecord) => TForm;
}

export interface SettingsTabState<TRecord, TForm> {
  items: TRecord[];
  setItems: (items: TRecord[]) => void;
  setItemsUpdater: (
    updater: (current: TRecord[]) => TRecord[],
  ) => void;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  editingItem: TRecord | null;
  setEditingItem: (item: TRecord | null) => void;
  form: TForm;
  setForm: (form: TForm | ((prev: TForm) => TForm)) => void;
  createDialogOpen: boolean;
  setCreateDialogOpen: (open: boolean) => void;
  discardChangesOpen: boolean;
  pendingAction: PendingEditorAction<TRecord> | null;
  itemToDelete: TRecord | null;
  deletingItemId: number | null;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  loadData: (options?: {
    silent?: boolean;
    forceRefresh?: boolean;
  }) => Promise<void>;
  resetEditor: () => void;
  closeEditEditor: () => void;
  requestOpenItem: (item: TRecord) => void;
  closeCreateEditor: () => void;
  confirmDiscardChanges: () => void;
  cancelDiscardChanges: () => void;
  handleSaveAndContinueForDiscard: () => Promise<void>;
  openCreateDialog: () => void;
  openEditRow: (item: TRecord) => void;
  handleSave: () => Promise<void>;
  openDeleteDialog: (item: TRecord) => void;
  confirmDelete: () => Promise<void>;
  setSaving: (saving: boolean) => void;
  setDiscardChangesOpen: (open: boolean) => void;
  setPendingAction: (action: PendingEditorAction<TRecord> | null) => void;
  setItemToDelete: (item: TRecord | null) => void;
}

export function DiscardChangesDialog({
  hook,
}: {
  hook: SettingsTabState<any, any>;
}) {
  return (
    <ConfirmDialog
      open={hook.discardChangesOpen}
      title="Ungespeicherte Änderungen"
      description="Du hast ungespeicherte Änderungen. Was möchtest du tun?"
      confirmLabel="Verwerfen"
      saveLabel="Speichern"
      cancelLabel="Weiter bearbeiten"
      destructive={false}
      saving={hook.saving}
      onSave={() => void hook.handleSaveAndContinueForDiscard()}
      onOpenChange={(open) => {
        if (open) return;
        hook.cancelDiscardChanges();
      }}
      onConfirm={hook.confirmDiscardChanges}
    />
  );
}

export function useSettingsTab<
  TRecord extends { id: number },
  TForm,
>(
  config: SettingsTabConfig<TRecord, TForm>,
): SettingsTabState<TRecord, TForm> {
  const configRef = useRef(config);
  configRef.current = config;

  const [items, setItemsState] = useState<TRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<TRecord | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<PendingEditorAction<TRecord> | null>(null);
  const [form, setForm] = useState<TForm>(config.EMPTY_FORM);
  const [itemToDelete, setItemToDelete] = useState<TRecord | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const setItemsUpdater = useCallback(
    (updater: (current: TRecord[]) => TRecord[]) => {
      setItemsState(updater);
    },
    [],
  );

  const loadData = useCallback(
    async (options?: { silent?: boolean; forceRefresh?: boolean }) => {
      const {
        cacheKey,
        loadErrorTitle,
        fetchItems,
      } = configRef.current;
      const shouldShowLoading =
        options?.forceRefresh || !hasFreshCache(cacheKey);
      if (!options?.silent && shouldShowLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        const nextItems = await fetchItems(options);
        setItemsState(nextItems);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : loadErrorTitle,
        );
        setItemsState([]);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadData();
    const onReferenceChange = () => {
      void loadData({ forceRefresh: true });
    };
    window.addEventListener(
      "finance-reference-data-changed",
      onReferenceChange,
    );
    return () => {
      window.removeEventListener(
        "finance-reference-data-changed",
        onReferenceChange,
      );
    };
  }, [loadData]);

  const resetEditor = useCallback(() => {
    setEditingItem(null);
    setForm(configRef.current.EMPTY_FORM);
  }, []);

  const closeEditEditor = useCallback(() => {
    const { isDirty } = configRef.current;
    if (isDirty(editingItem, form)) {
      setPendingAction({ kind: "close-edit" });
      setDiscardChangesOpen(true);
      return;
    }
    resetEditor();
  }, [editingItem, form, resetEditor]);

  const requestOpenItem = useCallback(
    (item: TRecord) => {
      const { isDirty, formFromItem } = configRef.current;
      if (editingItem?.id === item.id) {
        closeEditEditor();
        return;
      }
      if (isDirty(editingItem, form)) {
        setPendingAction({ kind: "switch-edit", item });
        setDiscardChangesOpen(true);
        return;
      }
      setEditingItem(item);
      setForm(formFromItem(item));
      setError(null);
    },
    [editingItem, form, closeEditEditor],
  );

  const closeCreateEditor = useCallback(() => {
    const { isDirty } = configRef.current;
    if (isDirty(null, form)) {
      setPendingAction({ kind: "close-create" });
      setDiscardChangesOpen(true);
      return;
    }
    setCreateDialogOpen(false);
    setForm(configRef.current.EMPTY_FORM);
  }, [form]);

  const cancelDiscardChanges = useCallback(() => {
    setDiscardChangesOpen(false);
    setPendingAction(null);
  }, []);

  const confirmDiscardChanges = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    setDiscardChangesOpen(false);
    if (!action) return;
    const { formFromItem } = configRef.current;
    if (action.kind === "close-edit") {
      resetEditor();
      return;
    }
    if (action.kind === "switch-edit") {
      setEditingItem(action.item);
      setForm(formFromItem(action.item));
      setError(null);
      return;
    }
    setCreateDialogOpen(false);
    setForm(configRef.current.EMPTY_FORM);
  }, [pendingAction, resetEditor]);

  const handleSaveAndContinueForDiscard = useCallback(async () => {
    setSaving(true);
    setError(null);
    const { normalizeDraft, createItem, updateItem } = configRef.current;
    const config = configRef.current;
    try {
      const payload = normalizeDraft(form);
      if (editingItem) {
        const updated = await updateItem(editingItem.id, payload);
        setItemsState((current) =>
          current.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        );
        setEditingItem(updated);
      } else {
        const created = await createItem(payload);
        setItemsState((current) => [...current, created]);
        setCreateDialogOpen(false);
        setForm(config.EMPTY_FORM);
      }
      confirmDiscardChanges();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : config.saveErrorTitle,
      );
    } finally {
      setSaving(false);
    }
  }, [form, editingItem, confirmDiscardChanges]);

  const openCreateDialog = useCallback(() => {
    setForm(configRef.current.EMPTY_FORM);
    setEditingItem(null);
    setCreateDialogOpen(true);
  }, []);

  const openEditRow = useCallback(
    (item: TRecord) => {
      requestOpenItem(item);
    },
    [requestOpenItem],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const { normalizeDraft, createItem, updateItem } = configRef.current;
    const config = configRef.current;
    try {
      const prevScroll = listScrollRef.current?.scrollTop;
      const payload = normalizeDraft(form);
      if (editingItem) {
        const updated = await updateItem(editingItem.id, payload);
        setItemsState((current) =>
          current.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        );
        setEditingItem(updated);
      } else {
        const created = await createItem(payload);
        setItemsState((current) => [...current, created]);
        setCreateDialogOpen(false);
        setForm(config.EMPTY_FORM);
      }
      if (prevScroll != null) {
        const restoreScroll = () => {
          try {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = prevScroll;
            }
          } catch {
            // ignore
          }
        };
        requestAnimationFrame(() => {
          restoreScroll();
          requestAnimationFrame(() => {
            restoreScroll();
            setTimeout(restoreScroll, 120);
          });
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : config.saveErrorTitle,
      );
    } finally {
      setSaving(false);
    }
  }, [form, editingItem]);

  const openDeleteDialog = useCallback((item: TRecord) => {
    setItemToDelete(item);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!itemToDelete) return;
    setDeletingItemId(itemToDelete.id);
    setError(null);
    try {
      await configRef.current.deleteItem(itemToDelete.id);
      setItemsState((current) =>
        current.filter((item) => item.id !== itemToDelete.id),
      );
      if (editingItem?.id === itemToDelete.id) {
        resetEditor();
      }
      setItemToDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : configRef.current.deleteErrorTitle,
      );
    } finally {
      setDeletingItemId(null);
    }
  }, [itemToDelete, editingItem, resetEditor]);

  return {
    items,
    setItems: setItemsState,
    setItemsUpdater,
    loading,
    saving,
    error,
    setError,
    editingItem,
    setEditingItem,
    form,
    setForm,
    createDialogOpen,
    setCreateDialogOpen,
    discardChangesOpen,
    pendingAction,
    itemToDelete,
    deletingItemId,
    listScrollRef,
    loadData,
    resetEditor,
    closeEditEditor,
    requestOpenItem,
    closeCreateEditor,
    confirmDiscardChanges,
    cancelDiscardChanges,
    handleSaveAndContinueForDiscard,
    openCreateDialog,
    openEditRow,
    handleSave,
    openDeleteDialog,
    confirmDelete,
    setSaving,
    setDiscardChangesOpen,
    setPendingAction,
    setItemToDelete,
  };
}

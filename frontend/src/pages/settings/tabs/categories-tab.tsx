import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Tags, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  type FinanceCategory,
  updateCategory,
} from "@/lib/categories";
import { hasFreshCache } from "@/lib/fetch-cache";
import { VirtualizedList } from "@/components/virtualized-list";
import { toast } from "sonner";

const EMPTY_FORM = {
  name: "",
  typ: "",
  parent_id: "",
  personal_expense: false,
  icon: "",
};

const DEPTH_GAP = 16; // px zwischen Einzugsebenen

type CategoryFormState = typeof EMPTY_FORM;

type CategoryTreeNode = {
  category: FinanceCategory;
  depth: number;
};

function normalizeOptionalId(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function buildTree(categories: FinanceCategory[]) {
  const childrenByParent = new Map<number | null, FinanceCategory[]>();

  categories.forEach((category) => {
    const key = category.parent_id ?? null;
    childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), category]);
  });

  const sortItems = (items: FinanceCategory[]) =>
    [...items].sort(
      (a, b) =>
        a.typ.localeCompare(b.typ, "de") ||
        a.name.localeCompare(b.name, "de") ||
        a.id - b.id,
    );

  const output: CategoryTreeNode[] = [];
  const visited = new Set<number>();

  const walk = (parentId: number | null, depth: number) => {
    sortItems(childrenByParent.get(parentId) ?? []).forEach((category) => {
      if (visited.has(category.id)) return;
      visited.add(category.id);
      output.push({ category, depth });
      walk(category.id, depth + 1);
    });
  };

  walk(null, 0);

  categories
    .filter((category) => !visited.has(category.id))
    .sort(
      (a, b) =>
        a.typ.localeCompare(b.typ, "de") ||
        a.name.localeCompare(b.name, "de") ||
        a.id - b.id,
    )
    .forEach((category) => {
      output.push({ category, depth: 0 });
    });

  return output;
}

function collectDescendantIds(
  categoryId: number,
  childrenByParent: Map<number | null, FinanceCategory[]>,
) {
  const descendants = new Set<number>();
  const stack = [...(childrenByParent.get(categoryId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || descendants.has(current.id)) continue;
    descendants.add(current.id);
    stack.push(...(childrenByParent.get(current.id) ?? []));
  }

  return descendants;
}

function normalizeCategoryDraft(form: CategoryFormState) {
  return {
    name: form.name.trim(),
    typ: form.typ.trim(),
    parent_id: normalizeOptionalId(form.parent_id),
    personal_expense: form.personal_expense,
    icon: form.icon.trim() || null,
  };
}

function isCategoryDirty(
  editingCategory: FinanceCategory | null,
  form: CategoryFormState,
) {
  const draft = normalizeCategoryDraft(form);

  if (!editingCategory) {
    return (
    draft.name !== "" ||
    draft.typ !== "" ||
    draft.parent_id !== null ||
    draft.personal_expense !== false ||
    draft.icon !== null
    );
  }

  return (
    draft.name !== editingCategory.name ||
    draft.typ !== editingCategory.typ ||
    draft.parent_id !== (editingCategory.parent_id ?? null) ||
    draft.personal_expense !== editingCategory.personal_expense ||
    draft.icon !== (editingCategory.icon ?? null)
  );
}

type PendingCategoryAction =
  | { kind: "close-edit" }
  | { kind: "switch-edit"; category: FinanceCategory }
  | { kind: "close-create" };

export function CategoriesTab() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryToDelete, setCategoryToDelete] =
    useState<FinanceCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] =
    useState<FinanceCategory | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [pendingCategoryAction, setPendingCategoryAction] =
    useState<PendingCategoryAction | null>(null);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleCategories = useMemo(() => buildTree(categories), [categories]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, FinanceCategory[]>();
    categories.forEach((category) => {
      const key = category.parent_id ?? null;
      map.set(key, [...(map.get(key) ?? []), category]);
    });
    return map;
  }, [categories]);

  const loadData = async (options?: {
    silent?: boolean;
    forceRefresh?: boolean;
  }) => {
    const shouldShowLoading =
      options?.forceRefresh || !hasFreshCache("categories");

    if (!options?.silent && shouldShowLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      const nextCategories = await fetchCategories({
        forceRefresh: options?.forceRefresh,
      });
      setCategories(nextCategories);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kategorien konnten nicht geladen werden",
      );
      setCategories([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

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
  }, []);

  const resetEditor = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
  };

  const closeEditEditor = () => {
    if (isCategoryDirty(editingCategory, form)) {
      setPendingCategoryAction({ kind: "close-edit" });
      setDiscardChangesOpen(true);
      return;
    }

    resetEditor();
  };

  const requestOpenCategory = (category: FinanceCategory) => {
    if (editingCategory?.id === category.id) {
      closeEditEditor();
      return;
    }

    if (isCategoryDirty(editingCategory, form)) {
      setPendingCategoryAction({ kind: "switch-edit", category });
      setDiscardChangesOpen(true);
      return;
    }

    setEditingCategory(category);
    setForm({
      name: category.name,
      typ: category.typ,
      parent_id: category.parent_id ? String(category.parent_id) : "",
      personal_expense: category.personal_expense,
      icon: category.icon ?? "",
    });
    setError(null);
  };

  const closeCreateEditor = () => {
    if (isCategoryDirty(null, form)) {
      setPendingCategoryAction({ kind: "close-create" });
      setDiscardChangesOpen(true);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const confirmDiscardChanges = () => {
    const action = pendingCategoryAction;
    setPendingCategoryAction(null);
    setDiscardChangesOpen(false);

    if (!action) return;

    if (action.kind === "close-edit") {
      resetEditor();
      return;
    }

    if (action.kind === "switch-edit") {
      setEditingCategory(action.category);
      setForm({
        name: action.category.name,
        typ: action.category.typ,
        parent_id: action.category.parent_id
          ? String(action.category.parent_id)
          : "",
        personal_expense: action.category.personal_expense,
        icon: action.category.icon ?? "",
      });
      setError(null);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const openCreateDialog = () => {
    setForm(EMPTY_FORM);
    setEditingCategory(null);
    setCreateDialogOpen(true);
    resetEditor();
  };

  const openEditRow = (category: FinanceCategory) => {
    requestOpenCategory(category);
  };

  const handleSaveCategory = async () => {
    setSavingCategory(true);
    setError(null);

    try {
      const prevScroll = listScrollRef.current?.scrollTop;
      const payload = {
        name: form.name.trim(),
        typ: form.typ.trim(),
        parent_id: normalizeOptionalId(form.parent_id),
        personal_expense: form.personal_expense,
        icon: form.icon.trim() || null,
      };

      if (editingCategory) {
        const updatedCategory = await updateCategory(
          editingCategory.id,
          payload,
        );
        setCategories((current) =>
          current.map((item) =>
            item.id === updatedCategory.id ? updatedCategory : item,
          ),
        );
        setEditingCategory(updatedCategory);
      } else {
        const createdCategory = await createCategory(payload);
        setCategories((current) => [...current, createdCategory]);
        setCreateDialogOpen(false);
        setForm(EMPTY_FORM);
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
          : "Kategorie konnte nicht gespeichert werden",
      );
    } finally {
      setSavingCategory(false);
    }
  };

  const openDeleteCategoryDialog = (category: FinanceCategory) => {
    setCategoryToDelete(category);
  };

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return;

    setDeletingCategoryId(categoryToDelete.id);
    setError(null);

    try {
      await deleteCategory(categoryToDelete.id);
      setCategories((current) =>
        current.filter((item) => item.id !== categoryToDelete.id),
      );

      if (editingCategory?.id === categoryToDelete.id) {
        resetEditor();
      }
      setCategoryToDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kategorie konnte nicht gelöscht werden",
      );
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const filterCategory = (category: FinanceCategory, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystack = [
      category.name,
      category.typ,
      category.parent_name ?? "",
      category.personal_expense ? "persönliche ausgabe" : "",
      category.personal_expense ? "privat" : "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  };

  const parentOptionsForForm = useMemo(() => {
    // Build options from the category tree but filter by form.typ when provided
    const options: Array<{ value: string; label: string }> = [];

    const walk = (parentId: number | null, depth: number) => {
      [...(childrenByParent.get(parentId) ?? [])]
        .sort(
          (a, b) =>
            a.typ.localeCompare(b.typ, "de") ||
            a.name.localeCompare(b.name, "de") ||
            a.id - b.id,
        )
        .forEach((category) => {
          // If a type is selected in the form, only include matching types
          if (form.typ && category.typ !== form.typ) return;

          options.push({
            value: String(category.id),
            label: `${"\u00A0\u00A0".repeat(depth)}${category.name}`,
          });
          walk(category.id, depth + 1);
        });
    };

    walk(null, 0);

    if (!editingCategory) return options;

    const forbidden = new Set<number>([editingCategory.id]);
    collectDescendantIds(editingCategory.id, childrenByParent).forEach((id) => {
      forbidden.add(id);
    });

    return options.filter((option) => !forbidden.has(Number(option.value)));
  }, [childrenByParent, editingCategory, form.typ]);

  const filteredCategories = useMemo(() => {
    return visibleCategories.filter((cat) => {
      const isIncome = cat.category.typ.toLowerCase() === "einnahme";

      if (typeFilter === "income" && !isIncome) return false;
      if (typeFilter === "expense" && isIncome) return false;

      return true;
    });
  }, [typeFilter, visibleCategories]);

  return (
    <div>
      {error ? (
        <EmptyState
          title="Kategorien konnten nicht geladen werden"
          text={error}
          illustration={<Tags className="size-5" />}
        />
      ) : (
        <VirtualizedList
          items={filteredCategories}
          loading={loading}
          filterItem={(entry, query) => filterCategory(entry.category, query)}
          searchPlaceholder="Kategorien suchen..."
          externalScrollRef={listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Kategorien vorhanden"
          emptyStateText="Lege Kategorien mit Typ, übergeordneter Kategorie und Persönliche Ausgabe an."
          emptyStateIllustration={<Tags className="size-5" />}
          getItemKey={(entry) => entry.category.id}
          getItemHeight={(entry) =>
            editingCategory?.id === entry.category.id ? 410 : 108
          }
          toolbarActions={[
            <Button
              key="category-create"
              type="button"
              onClick={openCreateDialog}
            >
              <Plus className="size-4" />
              Kategorie hinzufügen
            </Button>,
          ]}
          filterItems={[
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value="income">Einnahmen</SelectItem>
                <SelectItem value="expense">Ausgaben</SelectItem>
              </SelectContent>
            </Select>,
          ]}
          renderLoadingSkeleton={() => (
            <div className="flex items-center gap-4 border-b border-muted/60 bg-background px-4 py-3">
              <div className="size-12 shrink-0 rounded-lg border bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-[42%] max-w-[220px] rounded bg-muted" />
                  <div className="h-5 w-[88px] rounded-full bg-muted" />
                </div>
                <div className="h-3 w-[58%] max-w-[340px] rounded bg-muted" />
                <div className="h-3 w-[74%] max-w-[420px] rounded bg-muted" />
              </div>
              <div className="h-9 w-[100px] shrink-0 rounded-md bg-muted" />
            </div>
          )}
          renderItem={(entry) => {
            const category = entry.category;
            const isExpanded = editingCategory?.id === category.id;

            return (
              <div className="border-b border-muted/60 bg-background relative">
                <button
                  type="button"
                  className="flex w-full items-center gap-4 pr-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => openEditRow(category)}
                  style={{
                    paddingLeft: entry.depth * DEPTH_GAP,
                  }}
                >
                  {/* Indent indicator */}
                  <div
                    className={`self-stretch bg-border mr-1 shrink-0 ${entry.depth == 0 ? "w-0" : "w-px"}`}
                  />

                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground text-xl">
                    {category.icon || <Tags className="size-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="relative">
                      <div className="flex items-center gap-2 relative z-10">
                        <span className="truncate text-sm font-medium text-foreground">
                          {category.name}
                        </span>
                        <Badge variant="secondary" className="text-[11px]">
                          {category.typ}
                        </Badge>
                        {category.personal_expense && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/15 text-amber-700 text-[11px]"
                          >
                            Persönliche Ausgabe
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    className={
                      isExpanded
                        ? "size-4 shrink-0 text-muted-foreground transition-transform rotate-180"
                        : "size-4 shrink-0 text-muted-foreground transition-transform"
                    }
                  />
                </button>

                {isExpanded && (
                  <div className="border-y border-muted/60 bg-muted/20">
                    <div className="flex flex-col gap-0 divide-y divide-border/60">
                      <div className="flex flex-col gap-4 px-4 py-4">
                        <div className="flex flex-wrap gap-4">
                          <div className="flex flex-col gap-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor={`category-name-${category.id}`}
                            >
                              Name
                            </label>
                            <Input
                              id={`category-name-${category.id}`}
                              value={form.name}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              autoComplete="off"
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor={`category-icon-${category.id}`}
                            >
                              Icon (Emoji)
                            </label>
                            <Input
                              id={`category-icon-${category.id}`}
                              value={form.icon}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  icon: event.target.value,
                                }))
                              }
                              placeholder="z.B. 🍔"
                              className="w-24"
                              autoComplete="off"
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor={`category-type-${category.id}`}
                            >
                              Typ
                            </label>
                            <Select
                              value={form.typ}
                              onValueChange={(value) =>
                                setForm((current) => ({
                                  ...current,
                                  typ: value,
                                }))
                              }
                            >
                              <SelectTrigger
                                id={`category-type-${category.id}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <SelectValue placeholder="Typ wählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Einnahme">
                                  Einnahme
                                </SelectItem>
                                <SelectItem value="Ausgabe">Ausgabe</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col gap-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor={`category-parent-${category.id}`}
                            >
                              Übergeordnete Kategorie
                            </label>
                            <Select
                              value={form.parent_id || "none"}
                              onValueChange={(value) =>
                                setForm((current) => ({
                                  ...current,
                                  parent_id: value === "none" ? "" : value,
                                }))
                              }
                            >
                              <SelectTrigger
                                id={`category-parent-${category.id}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <SelectValue placeholder="Keine übergeordnete Kategorie" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Keine übergeordnete Kategorie
                                </SelectItem>
                                {parentOptionsForForm.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.personal_expense}
                          className={
                            form.personal_expense
                              ? "flex w-full items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
                              : "flex w-full items-center justify-between rounded-lg border border-muted/60 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            setForm((current) => ({
                              ...current,
                              personal_expense: !current.personal_expense,
                            }));
                          }}
                        >
                          <div>
                            <div className="text-sm font-medium">
                              Persönliche Ausgabe
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Wird für die bessere Analyse benötigt
                            </div>
                          </div>
                          <span
                            className={
                              form.personal_expense
                                ? "inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white"
                                : "inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                            }
                          >
                            {form.personal_expense ? "Ja" : "Nein"}
                          </span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-end px-4 py-2">
                        <Button
                          type="button"
                          onClick={() => void handleSaveCategory()}
                          disabled={
                            savingCategory ||
                            !isCategoryDirty(editingCategory, form) ||
                            !form.name.trim() ||
                            !form.typ.trim()
                          }
                        >
                          {savingCategory ? "Speichere ..." : "Speichern"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openDeleteCategoryDialog(category)}
                          disabled={
                            deletingCategoryId === category.id || savingCategory
                          }
                        >
                          <Trash2 className="size-4" />
                          {deletingCategoryId === category.id
                            ? "Lösche ..."
                            : "Löschen"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          closeCreateEditor();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kategorie hinzufügen</DialogTitle>
            <DialogDescription>
              Name, Typ, übergeordnete Kategorie und Persönliche Ausgabe werden
              hier hinterlegt.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="category-name">
                Name
              </label>
              <Input
                id="category-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="category-icon">
                Icon (Emoji)
              </label>
              <Input
                id="category-icon"
                value={form.icon}
                onChange={(event) =>
                  setForm((current) => ({ ...current, icon: event.target.value }))
                }
                placeholder="z.B. 🍔"
                className="w-24"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="category-type">
                Typ
              </label>
              <Select
                value={form.typ}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, typ: value }))
                }
              >
                <SelectTrigger
                  id="category-type"
                  onClick={(event) => event.stopPropagation()}
                >
                  <SelectValue placeholder="Typ wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Einnahme">Einnahme</SelectItem>
                  <SelectItem value="Ausgabe">Ausgabe</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="category-parent">
                Übergeordnete Kategorie
              </label>
              <Select
                value={form.parent_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    parent_id: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger
                  id="category-parent"
                  onClick={(event) => event.stopPropagation()}
                >
                  <SelectValue placeholder="Keine übergeordnete Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    Keine übergeordnete Kategorie
                  </SelectItem>
                  {parentOptionsForForm.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={form.personal_expense}
              className={
                form.personal_expense
                  ? "flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
                  : "flex items-center justify-between rounded-lg border border-muted/60 bg-background px-4 py-3 text-left transition-colors hover:bg-muted/40"
              }
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  personal_expense: !current.personal_expense,
                }))
              }
            >
              <div>
                <div className="text-sm font-medium">Persönliche Ausgabe</div>
                <div className="text-xs text-muted-foreground">
                  Wird für die bessere Analyse benötigt
                </div>
              </div>
              <span
                className={
                  form.personal_expense
                    ? "inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white"
                    : "inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                }
              >
                {form.personal_expense ? "Ja" : "Nein"}
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                onClick={() => void handleSaveCategory()}
                disabled={
                  savingCategory ||
                  !isCategoryDirty(null, form) ||
                  !form.name.trim() ||
                  !form.typ.trim()
                }
              >
                {savingCategory ? "Speichere ..." : "Speichern"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardChangesOpen}
        title="Änderungen verwerfen?"
        description="Du hast ungespeicherte Änderungen. Wenn du jetzt schließt, gehen sie verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
        destructive={false}
        onOpenChange={(open) => {
          if (open) return;
          setDiscardChangesOpen(false);
          setPendingCategoryAction(null);
        }}
        onConfirm={confirmDiscardChanges}
      />
      <ConfirmDialog
        open={Boolean(categoryToDelete)}
        title="Kategorie löschen"
        description={`Kategorie "${categoryToDelete?.name ?? ""}" wirklich löschen? Unterkategorien bleiben erhalten und werden entkoppelt. Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={
          categoryToDelete ? deletingCategoryId === categoryToDelete.id : false
        }
        onOpenChange={(open) => {
          if (!open) setCategoryToDelete(null);
        }}
        onConfirm={confirmDeleteCategory}
      />

    </div>
  );
}

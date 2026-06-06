import { useMemo, useState } from "react";
import { ChevronDown, Plus, Tags } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildFlatCategoryTree } from "@/lib/categories/category-tree";
import { createCategory, deleteCategory, fetchCategories, updateCategory } from "@/lib/categories/api";
import { type FinanceCategory } from "@/lib/categories/types";
import { VirtualizedList } from "@/components/virtualized-list";
import { DiscardChangesDialog, useSettingsTab } from "@/hooks/useSettingsTab";
import { CategoryForm } from "./categories/CategoryForm";
import { CategoryCreateDialog } from "./categories/CategoryCreateDialog";

const EMPTY_FORM = {
  name: "",
  typ: "",
  parent_id: "",
  personal_expense: false,
  icon: "",
};

const DEPTH_GAP = 16;

type CategoryFormState = typeof EMPTY_FORM;

function normalizeOptionalId(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
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

export function CategoriesTab() {
  const [typeFilter, setTypeFilter] = useState("all");

  const hook = useSettingsTab<FinanceCategory, CategoryFormState>({
    entityName: "Kategorie",
    cacheKey: "categories",
    loadErrorTitle: "Kategorien konnten nicht geladen werden",
    saveErrorTitle: "Kategorie konnte nicht gespeichert werden",
    deleteErrorTitle: "Kategorie konnte nicht gelöscht werden",
    EMPTY_FORM,
    fetchItems: (options) => fetchCategories(options),
    createItem: (payload) => createCategory(payload as Parameters<typeof createCategory>[0]),
    updateItem: (id, payload) => updateCategory(id, payload as Parameters<typeof updateCategory>[1]),
    deleteItem: (id) => deleteCategory(id),
    normalizeDraft: normalizeCategoryDraft,
    isDirty: isCategoryDirty,
    formFromItem: (category) => ({
      name: category.name,
      typ: category.typ,
      parent_id: category.parent_id ? String(category.parent_id) : "",
      personal_expense: category.personal_expense,
      icon: category.icon ?? "",
    }),
  });

  const visibleCategories = useMemo(() => buildFlatCategoryTree(hook.items), [hook.items]);

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, FinanceCategory[]>();
    hook.items.forEach((category) => {
      const key = category.parent_id ?? null;
      map.set(key, [...(map.get(key) ?? []), category]);
    });
    return map;
  }, [hook.items]);

  const filteredCategories = useMemo(() => {
    return visibleCategories.filter((cat) => {
      const isIncome = cat.category.typ.toLowerCase() === "einnahme";
      if (typeFilter === "income" && !isIncome) return false;
      if (typeFilter === "expense" && isIncome) return false;
      return true;
    });
  }, [typeFilter, visibleCategories]);

  const parentOptionsForForm = useMemo(() => {
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
          if (hook.form.typ && category.typ !== hook.form.typ) return;

          options.push({
            value: String(category.id),
            label: `${"\u00A0\u00A0".repeat(depth)}${category.name}`,
          });
          walk(category.id, depth + 1);
        });
    };

    walk(null, 0);

    if (!hook.editingItem) return options;

    const forbidden = new Set<number>([hook.editingItem.id]);
    collectDescendantIds(hook.editingItem.id, childrenByParent).forEach((id) => {
      forbidden.add(id);
    });

    return options.filter((option) => !forbidden.has(Number(option.value)));
  }, [childrenByParent, hook.editingItem, hook.form.typ]);

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

  return (
    <div>
      {hook.error ? (
        <EmptyState
          title="Kategorien konnten nicht geladen werden"
          text={hook.error}
          illustration={<Tags className="size-5" />}
        />
      ) : (
        <VirtualizedList
          items={filteredCategories}
          loading={hook.loading}
          filterItem={(entry, query) => filterCategory(entry.category, query)}
          searchPlaceholder="Kategorien suchen..."
          externalScrollRef={hook.listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Kategorien vorhanden"
          emptyStateText="Lege Kategorien mit Typ, übergeordneter Kategorie und Persönliche Ausgabe an."
          emptyStateIllustration={<Tags className="size-5" />}
          getItemKey={(entry) => entry.category.id}
          getItemHeight={(entry) =>
            hook.editingItem?.id === entry.category.id ? 410 : 108
          }
          toolbarActions={[
            <Button
              key="category-create"
              type="button"
              onClick={hook.openCreateDialog}
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
            const isExpanded = hook.editingItem?.id === category.id;

            return (
              <div className="border-b border-muted/60 bg-background relative">
                <button
                  type="button"
                  className="flex w-full items-center gap-4 pr-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => hook.openEditRow(category)}
                  style={{
                    paddingLeft: entry.depth * DEPTH_GAP,
                  }}
                >
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
                  <CategoryForm
                    category={category}
                    form={hook.form}
                    setForm={hook.setForm}
                    saving={hook.saving}
                    isDirty={isCategoryDirty(hook.editingItem, hook.form)}
                    onSave={() => void hook.handleSave()}
                    onDelete={() => hook.openDeleteDialog(category)}
                    deleting={hook.deletingItemId === category.id}
                    parentOptions={parentOptionsForForm}
                  />
                )}
              </div>
            );
          }}
        />
      )}

      <CategoryCreateDialog
        open={hook.createDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          hook.closeCreateEditor();
        }}
        form={hook.form}
        setForm={hook.setForm}
        saving={hook.saving}
        isDirty={isCategoryDirty(null, hook.form)}
        onSave={() => void hook.handleSave()}
        parentOptions={parentOptionsForForm}
      />

      <DiscardChangesDialog hook={hook} />
      <ConfirmDialog
        open={Boolean(hook.itemToDelete)}
        title="Kategorie löschen"
        description={`Kategorie "${hook.itemToDelete?.name ?? ""}" wirklich löschen? Unterkategorien bleiben erhalten und werden entkoppelt. Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={
          hook.itemToDelete
            ? hook.deletingItemId === hook.itemToDelete.id
            : false
        }
        onOpenChange={(open) => {
          if (!open) hook.setItemToDelete(null);
        }}
        onConfirm={hook.confirmDelete}
      />
    </div>
  );
}

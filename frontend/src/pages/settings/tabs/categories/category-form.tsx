import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { ToggleRow } from "@/components/toggle-row";
import { Trash2 } from "lucide-react";
import { type FinanceCategory } from "@/lib/categories/types";

type CategoryFormState = {
  name: string;
  typ: string;
  parent_id: string;
  personal_expense: boolean;
  icon: string;
};

type Props = {
  category: FinanceCategory;
  form: CategoryFormState;
  setForm: (updater: (prev: CategoryFormState) => CategoryFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onDelete: () => void;
  deleting: boolean;
  parentOptions: Array<{ value: string; label: string }>;
};

export function CategoryForm({
  category,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
  onDelete,
  deleting,
  parentOptions,
}: Props) {
  return (
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
                  <SelectItem value="Einnahme">Einnahme</SelectItem>
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
              <SearchableSelect
                value={form.parent_id || "none"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    parent_id: value === "none" ? "" : value,
                  }))
                }
                options={parentOptions}
                placeholder="Keine übergeordnete Kategorie"
                searchPlaceholder="Kategorie suchen …"
                emptyText="Keine Kategorie gefunden"
                showNoneOption
                noneLabel="Keine übergeordnete Kategorie"
                noneValue="none"
                triggerId={`category-parent-${category.id}`}
                triggerClassName="h-10"
              />
            </div>
          </div>

          {form.typ === "Ausgabe" && (
            <ToggleRow
              title="Persönliche Ausgabe"
              description="Wird für die bessere Analyse benötigt"
              color="amber"
              checked={form.personal_expense}
              onCheckedChange={(personal_expense) =>
                setForm((current) => ({ ...current, personal_expense }))
              }
              stopPropagation
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end px-4 py-2">
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={
              saving || !isDirty || !form.name.trim() || !form.typ.trim()
            }
          >
            {saving ? "Speichere ..." : "Speichern"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete()}
            disabled={deleting || saving}
          >
            <Trash2 className="size-4" />
            {deleting ? "Lösche ..." : "Löschen"}
          </Button>
        </div>
      </div>
    </div>
  );
}

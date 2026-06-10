import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";

type CategoryFormState = {
  name: string;
  typ: string;
  parent_id: string;
  personal_expense: boolean;
  icon: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CategoryFormState;
  setForm: (updater: (prev: CategoryFormState) => CategoryFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
  parentOptions: Array<{ value: string; label: string }>;
};

export function CategoryCreateDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
  parentOptions,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              triggerId="category-parent"
              triggerClassName="h-10"
            />
          </div>

          {form.typ === "Ausgabe" && (
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
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={
                saving || !isDirty || !form.name.trim() || !form.typ.trim()
              }
            >
              {saving ? "Speichere ..." : "Speichern"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

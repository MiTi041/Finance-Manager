import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type OwnerFormState = {
  name: string;
  website: string;
  logo_url: string;
  logo_white_background: boolean;
  logo_padding: boolean;
  is_company: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: OwnerFormState;
  setForm: (updater: (prev: OwnerFormState) => OwnerFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
};

export function KontoinhaberCreateDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
}: Props) {
  const updateOwnerKind = (isCompany: boolean) => {
    setForm((current) => ({
      ...current,
      is_company: isCompany,
      website: isCompany ? current.website : "",
      logo_url: isCompany ? current.logo_url : "",
      logo_white_background: isCompany ? current.logo_white_background : false,
      logo_padding: isCompany ? current.logo_padding : true,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kontoinhaber hinzufügen</DialogTitle>
          <DialogDescription>
            Name, Webseite, Logo und Typ lassen sich hier hinterlegen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="owner-name">
              Name
            </label>
            <Input
              id="owner-name"
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

          {form.is_company && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="owner-website">
                  Webseite
                </label>
                <Input
                  id="owner-website"
                  value={form.website}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      website: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                  autoComplete="off"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium" htmlFor="owner-logo">
                  Logo-URL
                </label>
                <Input
                  id="owner-logo"
                  value={form.logo_url}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      logo_url: event.target.value,
                    }))
                  }
                  placeholder="https://..."
                  autoComplete="off"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="owner-logo-background"
                >
                  Logo-Hintergrund
                </label>
                <Select
                  value={form.logo_white_background ? "white" : "dark"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      logo_white_background: value === "white",
                    }))
                  }
                >
                  <SelectTrigger id="owner-logo-background">
                    <SelectValue placeholder="Hintergrund auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dunkel</SelectItem>
                    <SelectItem value="white">Weiß</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="owner-kind">
              Typ
            </label>
            <Select
              value={form.is_company ? "company" : "person"}
              onValueChange={(value) => updateOwnerKind(value === "company")}
            >
              <SelectTrigger id="owner-kind">
                <SelectValue placeholder="Typ auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Unternehmen</SelectItem>
                <SelectItem value="person">Einzelperson</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !isDirty || !form.name.trim()}
          >
            {saving ? "Speichere ..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

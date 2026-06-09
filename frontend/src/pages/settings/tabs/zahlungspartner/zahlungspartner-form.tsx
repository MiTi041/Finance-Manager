import { BrandIcon } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { type ZahlungspartnerRecord } from "@/lib/zahlungspartner";

type OwnerFormState = {
  name: string;
  website: string;
  logo_url: string;
  logo_white_background: boolean;
  logo_padding: boolean;
  is_company: boolean;
};

type Props = {
  owner: ZahlungspartnerRecord;
  form: OwnerFormState;
  setForm: (updater: (prev: OwnerFormState) => OwnerFormState) => void;
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onDelete: () => void;
  deleting: boolean;
  uploadingLogoId: number | null;
  deletingLogoId: number | null;
  dragOverOwnerId: number | null;
  onDragOver: (id: number) => void;
  onDragLeave: () => void;
  onLogoDrop: (id: number, e: React.DragEvent) => void;
  onLogoUpload: (id: number, file: File) => void;
  onLogoDelete: (id: number) => void;
  hasLocalImage: boolean;
  logoSrc: string;
};

export function ZahlungspartnerForm({
  owner,
  form,
  setForm,
  saving,
  isDirty,
  onSave,
  onDelete,
  deleting,
  uploadingLogoId,
  deletingLogoId,
  dragOverOwnerId,
  onDragOver,
  onDragLeave,
  onLogoDrop,
  onLogoUpload,
  onLogoDelete,
  hasLocalImage,
  logoSrc,
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

  const avatarKind = (isCompany: boolean) =>
    isCompany ? "company" : "person";

  return (
    <div className="border-y border-muted/60 bg-muted/20">
      <div className="flex flex-col gap-0 divide-y divide-border/60">
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`owner-name-${owner.id}`}
              >
                Name
              </label>
              <Input
                id={`owner-name-${owner.id}`}
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

            {form.is_company && (
              <>
                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor={`owner-website-${owner.id}`}
                  >
                    Webseite
                  </label>
                  <Input
                    id={`owner-website-${owner.id}`}
                    value={form.website}
                    onClick={(event) => event.stopPropagation()}
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

                {!hasLocalImage && (
                  <div className="flex flex-col gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor={`owner-logo-${owner.id}`}
                    >
                      Logo-URL
                    </label>
                    <Input
                      id={`owner-logo-${owner.id}`}
                      value={form.logo_url}
                      onClick={(event) => event.stopPropagation()}
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
                )}

                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor={`owner-logo-background-${owner.id}`}
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
                    <SelectTrigger
                      id={`owner-logo-background-${owner.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <SelectValue placeholder="Hintergrund auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dunkel</SelectItem>
                      <SelectItem value="white">Hell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor={`owner-logo-padding-${owner.id}`}
                  >
                    Logo-Padding
                  </label>
                  <Select
                    value={form.logo_padding ? "true" : "false"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        logo_padding: value === "true",
                      }))
                    }
                  >
                    <SelectTrigger
                      id={`owner-logo-padding-${owner.id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <SelectValue placeholder="Padding auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Aktiviert</SelectItem>
                      <SelectItem value="false">Deaktiviert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`owner-kind-${owner.id}`}
              >
                Typ
              </label>
              <Select
                value={form.is_company ? "company" : "person"}
                onValueChange={(value) => updateOwnerKind(value === "company")}
              >
                <SelectTrigger
                  id={`owner-kind-${owner.id}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <SelectValue placeholder="Typ auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Unternehmen</SelectItem>
                  <SelectItem value="person">Einzelperson</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.is_company && (
            <>
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-sm font-medium">Profilbild</label>

                {hasLocalImage ? (
                  <div
                    className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
                      dragOverOwnerId === owner.id
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/30 bg-muted/20"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDragOver(owner.id);
                    }}
                    onDrop={(e) => {
                      onLogoDrop(owner.id, e);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDragLeave();
                    }}
                  >
                    <BrandIcon
                      src={logoSrc}
                      alt={owner.name}
                      sizeClassName="size-12 shrink-0"
                      backgroundClassName={
                        owner.logo_white_background
                          ? "bg-white"
                          : "bg-zinc-900"
                      }
                      kind={avatarKind(owner.is_company)}
                      imgNoPadding={!form.logo_padding}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground mb-2">
                        Lokales Bild hinterlegt
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <label
                          className="cursor-pointer group"
                          onClick={(e) => e.stopPropagation()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDragOver(owner.id);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDragLeave();
                          }}
                          onDrop={(e) => {
                            onLogoDrop(owner.id, e);
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void onLogoUpload(owner.id, file);
                              }
                              event.target.value = "";
                            }}
                          />
                          <span className="inline-flex h-10 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
                            {uploadingLogoId === owner.id ? (
                              <>
                                <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
                                Hochladen…
                              </>
                            ) : (
                              "Bild ersetzen"
                            )}
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onLogoDelete(owner.id);
                          }}
                          disabled={deletingLogoId === owner.id}
                        >
                          {deletingLogoId === owner.id ? (
                            <>
                              <span className="mr-1 size-3 animate-spin rounded-full border border-current border-t-transparent" />
                              Lösche…
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-1 size-3" />
                              Bild entfernen
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label
                    className="cursor-pointer group"
                    onClick={(e) => e.stopPropagation()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDragOver(owner.id);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDragLeave();
                    }}
                    onDrop={(e) => {
                      onLogoDrop(owner.id, e);
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void onLogoUpload(owner.id, file);
                        }
                        event.target.value = "";
                      }}
                    />
                    <div
                      className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
                        dragOverOwnerId === owner.id
                          ? "border-primary bg-primary/10"
                          : "border-muted-foreground/30 bg-muted/20 group-hover:border-muted-foreground/60 group-hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-background text-muted-foreground transition-colors group-hover:text-foreground">
                        {uploadingLogoId === owner.id ? (
                          <span className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {uploadingLogoId === owner.id
                            ? "Wird hochgeladen…"
                            : "Logo hochladen"}
                        </p>
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-end px-4 py-2">
          <Button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !isDirty || !form.name.trim()}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, Store, User } from "lucide-react";
import { toast } from "sonner";

import { BrandIcon } from "@/components/bank-logo";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getApiBaseUrl } from "@/lib/api";
import {
  createKontoinhaber,
  deleteKontoinhaber,
  fetchKontoinhaber,
  fetchKontoinhaberReferenceData,
  type KontoinhaberRecord,
  updateKontoinhaber,
} from "@/lib/kontoinhaber";
import { resolveKontoinhaberLogoSrc } from "@/lib/bank/kontoinhaber-logo";
import {
  VirtualizedList,
  type VirtualizedListRef,
} from "@/components/virtualized-list";
import { DiscardChangesDialog, useSettingsTab } from "@/hooks/useSettingsTab";
import { KontoinhaberForm } from "./kontoinhaber/KontoinhaberForm";
import { KontoinhaberCreateDialog } from "./kontoinhaber/KontoinhaberCreateDialog";

const EMPTY_FORM = {
  name: "",
  website: "",
  logo_url: "",
  logo_white_background: false,
  logo_padding: false,
  is_company: true,
};

type OwnerFormState = typeof EMPTY_FORM;

function ownerKindLabel(isCompany: boolean) {
  return isCompany ? "Unternehmen" : "Einzelperson";
}

function avatarKind(isCompany: boolean) {
  return isCompany ? "company" : "person";
}

function normalizeOwnerDraft(form: OwnerFormState) {
  const isCompany = form.is_company;

  return {
    name: form.name.trim(),
    website: isCompany ? form.website.trim() || null : null,
    logo_url: isCompany ? form.logo_url.trim() || null : null,
    logo_white_background: isCompany ? form.logo_white_background : false,
    logo_padding: isCompany ? form.logo_padding : false,
    is_company: isCompany,
  };
}

function isOwnerDirty(
  editingOwner: KontoinhaberRecord | null,
  form: OwnerFormState,
) {
  const draft = normalizeOwnerDraft(form);

  if (!editingOwner) {
    return (
      draft.name !== "" ||
      draft.website !== null ||
      draft.logo_url !== null ||
      draft.logo_white_background !== false ||
      draft.logo_padding !== false ||
      draft.is_company !== true
    );
  }

  return (
    draft.name !== editingOwner.name ||
    draft.website !== (editingOwner.website ?? null) ||
    draft.logo_url !== (editingOwner.logo_url ?? null) ||
    draft.logo_white_background !==
      (editingOwner.logo_white_background ?? false) ||
    draft.logo_padding !== (editingOwner.logo_padding ?? false) ||
    draft.is_company !== editingOwner.is_company
  );
}

export function KontoinhaberTab() {
  const [searchParams] = useSearchParams();
  const targetOwnerId = searchParams.get("ownerId");
  const navigate = useNavigate();

  const virtualListRef = useRef<VirtualizedListRef>(null);

  const [dragOverOwnerId, setDragOverOwnerId] = useState<number | null>(null);
  const [logoVersions, setLogoVersions] = useState<Record<number, number>>({});
  const [uploadingLogoId, setUploadingLogoId] = useState<number | null>(null);
  const [deletingLogoId, setDeletingLogoId] = useState<number | null>(null);
  const [showOnlyWithoutWebsite, setShowOnlyWithoutWebsite] = useState(false);
  const [showOnlyWithoutLogo, setShowOnlyWithoutLogo] = useState(false);
  const [showIndividualOwners, setShowIndividualOwners] = useState(true);

  const hook = useSettingsTab<KontoinhaberRecord, OwnerFormState>({
    entityName: "Kontoinhaber",
    cacheKey: "kontoinhaber-reference-data",
    loadErrorTitle: "Kontoinhaber konnten nicht geladen werden",
    saveErrorTitle: "Kontoinhaber konnten nicht gespeichert werden",
    deleteErrorTitle: "Kontoinhaber konnte nicht gelöscht werden",
    EMPTY_FORM,
    fetchItems: async (options) => {
      const payload = await fetchKontoinhaberReferenceData(options);
      return payload.kontoinhaber ?? [];
    },
    createItem: (payload) => createKontoinhaber(payload as Parameters<typeof createKontoinhaber>[0]),
    updateItem: (id, payload) => updateKontoinhaber(id, payload as Parameters<typeof updateKontoinhaber>[1]),
    deleteItem: (id) => deleteKontoinhaber(id),
    normalizeDraft: normalizeOwnerDraft,
    isDirty: isOwnerDirty,
    formFromItem: (owner) => ({
      name: owner.name,
      website: owner.website ?? "",
      logo_url: owner.logo_url ?? "",
      logo_white_background: owner.logo_white_background ?? false,
      logo_padding: owner.logo_padding ?? false,
      is_company: owner.is_company,
    }),
  });

  const visibleOwners = useMemo(() => hook.items, [hook.items]);
  const pendingScrollRef = useRef<number | null>(null);
  const processedOwnerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingScrollRef.current == null) return;
    const ownerId = pendingScrollRef.current;
    pendingScrollRef.current = null;
    requestAnimationFrame(() => {
      virtualListRef.current?.scrollToItem(ownerId);
    });
  }, [hook.items]);

  const handleLogoUpload = useCallback(
    async (ownerId: number, file: File) => {
      setUploadingLogoId(ownerId);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${ownerId}/logo`,
          {
            method: "POST",
            body: formData,
          },
        );

        if (!response.ok) {
          let detail = "Logo-Upload fehlgeschlagen";
          try {
            const body = await response.json();
            if (body.detail) detail = body.detail;
          } catch {
            // ignore parse errors
          }
          throw new Error(detail);
        }

        pendingScrollRef.current = ownerId;
        await hook.loadData({ forceRefresh: true });

        if (hook.editingItem?.id === ownerId) {
          const refreshed = await fetchKontoinhaber(ownerId);
          hook.setEditingItem(refreshed);
          hook.setForm((prev) => ({
            ...prev,
            logo_url: refreshed.logo_url ?? "",
          }));
        }

        setLogoVersions((current) => ({
          ...current,
          [ownerId]: Date.now(),
        }));

        toast.success("Logo erfolgreich hochgeladen");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Logo-Upload fehlgeschlagen",
        );
      } finally {
        setUploadingLogoId(null);
      }
    },
    [hook],
  );

  const handleLogoDelete = useCallback(
    async (ownerId: number) => {
      setDeletingLogoId(ownerId);
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${ownerId}/logo`,
          {
            method: "DELETE",
          },
        );

        if (!response.ok) {
          let detail = "Logo-Löschvorgang fehlgeschlagen";
          try {
            const body = await response.json();
            if (body.detail) detail = body.detail;
          } catch {
            // ignore parse errors
          }
          throw new Error(detail);
        }

        pendingScrollRef.current = ownerId;
        await hook.loadData({ forceRefresh: true });

        toast.success("Logo erfolgreich gelöscht");
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Logo-Löschvorgang fehlgeschlagen",
        );
      } finally {
        setDeletingLogoId(null);
      }
    },
    [hook],
  );

  const handleLogoDrop = useCallback(
    (ownerId: number, event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOverOwnerId(null);

      const file = event.dataTransfer.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Bitte eine Bilddatei hochladen");
        return;
      }

      void handleLogoUpload(ownerId, file);
    },
    [handleLogoUpload],
  );

  useEffect(() => {
    if (!targetOwnerId || hook.items.length === 0) return;

    const id = Number(targetOwnerId);
    if (processedOwnerIdRef.current === id) return;
    processedOwnerIdRef.current = id;

    const owner = hook.items.find((o) => o.id === id);
    const index = hook.items.findIndex((o) => o.id === id);

    if (!owner || index < 0) return;

    hook.setEditingItem(owner);
    hook.setForm({
      name: owner.name,
      website: owner.website ?? "",
      logo_url: owner.logo_url ?? "",
      logo_white_background: owner.logo_white_background ?? false,
      logo_padding: owner.logo_padding ?? false,
      is_company: owner.is_company,
    });

    requestAnimationFrame(() => {
      virtualListRef.current?.scrollToItem(owner.id);
    });

    const params = new URLSearchParams(searchParams);
    params.delete("ownerId");
    navigate(
      {
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true },
    );
  }, [targetOwnerId, hook.items, navigate, searchParams]);

  const updateOwnerKind = (isCompany: boolean) => {
    hook.setForm((current) => ({
      ...current,
      is_company: isCompany,
      website: isCompany ? current.website : "",
      logo_url: isCompany ? current.logo_url : "",
      logo_white_background: isCompany ? current.logo_white_background : false,
      logo_padding: isCompany ? current.logo_padding : true,
    }));
  };

  const handleSaveOwner = async () => {
    hook.setSaving(true);
    hook.setError(null);

    try {
      const payload = normalizeOwnerDraft(hook.form);

      if (hook.editingItem) {
        const updatedOwner = await updateKontoinhaber(
          hook.editingItem.id,
          payload,
        );

        pendingScrollRef.current = updatedOwner.id;
        hook.setItemsUpdater((current) =>
          current.map((owner) =>
            owner.id === updatedOwner.id ? updatedOwner : owner,
          ),
        );

        hook.setEditingItem(updatedOwner);
        hook.setForm({
          name: updatedOwner.name,
          website: updatedOwner.website ?? "",
          logo_url: updatedOwner.logo_url ?? "",
          logo_white_background:
            updatedOwner.logo_white_background ?? false,
          logo_padding: updatedOwner.logo_padding ?? false,
          is_company: updatedOwner.is_company,
        });
      } else {
        const createdOwner = await createKontoinhaber(payload);
        hook.setItemsUpdater((current) => [...current, createdOwner]);
        hook.setCreateDialogOpen(false);
        hook.setForm(EMPTY_FORM);
      }
    } catch (err) {
      hook.setError(
        err instanceof Error
          ? err.message
          : "Kontoinhaber konnten nicht gespeichert werden",
      );
    } finally {
      hook.setSaving(false);
    }
  };

  const filterOwner = (owner: KontoinhaberRecord, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const haystack = [
      owner.name,
      owner.website ?? "",
      owner.logo_url ?? "",
      owner.ibans.join(" "),
      owner.is_company ? "unternehmen" : "einzelperson",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  };

  const matchesOwnerFilters = (owner: KontoinhaberRecord) => {
    const hasWebsite = Boolean(owner.website?.trim());
    const hasLogo = Boolean(owner.logo_url?.trim() || owner.local_logo_path);

    if (!showIndividualOwners && !owner.is_company) {
      return false;
    }

    if (showOnlyWithoutWebsite && hasWebsite) {
      return false;
    }

    if (showOnlyWithoutLogo && hasLogo) {
      return false;
    }

    return true;
  };

  return (
    <div>
      {hook.error ? (
        <EmptyState
          title="Kontoinhaber konnten nicht geladen werden"
          text={hook.error}
          illustration={<Store className="size-5" />}
        />
      ) : (
        <VirtualizedList
          ref={virtualListRef}
          items={visibleOwners}
          loading={hook.loading}
          filterItem={(owner, query) =>
            filterOwner(owner, query) && matchesOwnerFilters(owner)
          }
          searchPlaceholder="Kontoinhaber suchen..."
          externalScrollRef={hook.listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Kontoinhaber vorhanden"
          emptyStateText="Lege einen Kontoinhaber an, um IBANs und Logos zuzuordnen."
          emptyStateIllustration={<User className="size-5" />}
          getItemKey={(owner) => owner.id}
          getItemHeight={(owner) =>
            hook.editingItem?.id === owner.id
              ? 476
              : owner.ibans.length > 0
                ? 108
                : 92
          }
          filterItems={[
            <Button
              type="button"
              variant="ghost"
              className={
                showIndividualOwners
                  ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
                  : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
              }
              onClick={() => setShowIndividualOwners((current) => !current)}
            >
              <span
                className={
                  showIndividualOwners
                    ? "size-2 rounded-full bg-background"
                    : "size-2 rounded-full bg-current opacity-60"
                }
              />
              Einzelpersonen anzeigen
            </Button>,
            <Button
              type="button"
              variant="ghost"
              className={
                showOnlyWithoutWebsite
                  ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
                  : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
              }
              onClick={() => setShowOnlyWithoutWebsite((current) => !current)}
            >
              <span
                className={
                  showOnlyWithoutWebsite
                    ? "size-2 rounded-full bg-background"
                    : "size-2 rounded-full bg-current opacity-60"
                }
              />
              Kontoinhaber ohne Webseite anzeigen
            </Button>,
            <Button
              type="button"
              variant="ghost"
              className={
                showOnlyWithoutLogo
                  ? "!bg-foreground !text-background hover:!bg-foreground/90 hover:!text-background"
                  : "!bg-muted !text-muted-foreground hover:!bg-muted/80 hover:!text-foreground"
              }
              onClick={() => setShowOnlyWithoutLogo((current) => !current)}
            >
              <span
                className={
                  showOnlyWithoutLogo
                    ? "size-2 rounded-full bg-background"
                    : "size-2 rounded-full bg-current opacity-60"
                }
              />
              Kontoinhaber ohne Logo anzeigen
            </Button>,
          ]}
          toolbarActions={[
            <Button key="owner-create" type="button" onClick={hook.openCreateDialog}>
              <Plus className="size-4" />
              Kontoinhaber hinzufügen
            </Button>,
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
          renderItem={(owner) => {
            const isExpanded = hook.editingItem?.id === owner.id;
            const hasLocalImage = Boolean(owner.local_logo_path);

            var logoSrc =
              resolveKontoinhaberLogoSrc(
                owner.logo_url,
                owner.id,
                owner.local_logo_path,
              ) + `?v=${logoVersions[owner.id] ?? 0}`;

            if (!hasLocalImage) {
              logoSrc =
                resolveKontoinhaberLogoSrc(
                  owner.logo_url,
                  owner.id,
                  owner.local_logo_path,
                ) ?? "";
            }

            return (
              <div className="border-b border-muted/60 bg-background">
                <button
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
                  onClick={() => hook.openEditRow(owner)}
                >
                  <BrandIcon
                    src={logoSrc}
                    alt={owner.name}
                    sizeClassName="size-12 shrink-0"
                    backgroundClassName={
                      owner.logo_white_background ? "bg-white" : "bg-zinc-900"
                    }
                    kind={avatarKind(owner.is_company)}
                    imgNoPadding={!owner.logo_padding}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {owner.name}
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {ownerKindLabel(owner.is_company)}
                      </Badge>
                      {owner.is_company && !owner.website?.trim() && (
                        <Badge
                          variant="outline"
                          className="bg-orange-500/20 text-orange-500 text-[11px]"
                        >
                          Keine Webseite
                        </Badge>
                      )}
                      {owner.is_company &&
                        !owner.logo_url?.trim() &&
                        !hasLocalImage && (
                          <Badge
                            variant="outline"
                            className="bg-orange-500/20 text-orange-500 text-[11px]"
                          >
                            Kein Logo
                          </Badge>
                        )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2 overflow-ellipsis">
                      {owner.website ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {owner.website}
                        </span>
                      ) : owner.is_company ? (
                        <span className="text-xs text-muted-foreground">
                          Keine Webseite hinterlegt
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {owner.ibans.length} IBAN
                      {owner.ibans.length === 1 ? "" : "s"}
                    </span>
                    <ChevronDown
                      className={
                        isExpanded
                          ? "size-4 shrink-0 text-muted-foreground transition-transform rotate-180"
                          : "size-4 shrink-0 text-muted-foreground transition-transform"
                      }
                    />
                  </div>
                </button>

                {isExpanded && (
                  <KontoinhaberForm
                    owner={owner}
                    form={hook.form}
                    setForm={hook.setForm}
                    saving={hook.saving}
                    isDirty={isOwnerDirty(hook.editingItem, hook.form)}
                    onSave={handleSaveOwner}
                    onDelete={() => hook.openDeleteDialog(owner)}
                    deleting={hook.deletingItemId === owner.id}
                    uploadingLogoId={uploadingLogoId}
                    deletingLogoId={deletingLogoId}
                    dragOverOwnerId={dragOverOwnerId}
                    onDragOver={(id) => setDragOverOwnerId(id)}
                    onDragLeave={() => setDragOverOwnerId(null)}
                    onLogoDrop={handleLogoDrop}
                    onLogoUpload={handleLogoUpload}
                    onLogoDelete={handleLogoDelete}
                    hasLocalImage={hasLocalImage}
                    logoSrc={logoSrc}
                  />
                )}
              </div>
            );
          }}
        />
      )}

      <KontoinhaberCreateDialog
        open={hook.createDialogOpen}
        onOpenChange={(open) => {
          if (open) return;
          hook.closeCreateEditor();
        }}
        form={hook.form}
        setForm={hook.setForm}
        saving={hook.saving}
        isDirty={isOwnerDirty(null, hook.form)}
        onSave={handleSaveOwner}
      />

      <DiscardChangesDialog hook={hook} />
      <ConfirmDialog
        open={Boolean(hook.itemToDelete)}
        title="Kontoinhaber löschen"
        description={`Kontoinhaber "${hook.itemToDelete?.name ?? ""}" wirklich löschen? Zugeordnete IBANs werden dabei entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
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

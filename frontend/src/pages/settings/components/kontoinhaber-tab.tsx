import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, Store, User, Trash2 } from "lucide-react";

import { BrandIcon } from "@/components/bank-logo";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  createKontoinhaber,
  deleteKontoinhaber,
  fetchKontoinhaber,
  fetchKontoinhaberReferenceData,
  getApiBaseUrl,
  type KontoinhaberRecord,
  updateKontoinhaber,
} from "@/lib/db";
import { resolveKontoinhaberLogoSrc } from "@/lib/kontoinhaber-logo";
import {
  VirtualizedList,
  type VirtualizedListRef,
} from "@/components/virtualized-list";
import { hasFreshCache } from "@/lib/fetch-cache";

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

type PendingOwnerAction =
  | { kind: "close-edit" }
  | { kind: "switch-edit"; owner: KontoinhaberRecord }
  | { kind: "close-create" };

export function KontoinhaberTab() {
  const [searchParams] = useSearchParams();
  const targetOwnerId = searchParams.get("ownerId");
  const navigate = useNavigate();

  const virtualListRef = useRef<VirtualizedListRef>(null);

  const [dragOverOwnerId, setDragOverOwnerId] = useState<number | null>(null);

  const [logoVersions, setLogoVersions] = useState<Record<number, number>>({});

  const [owners, setOwners] = useState<KontoinhaberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOwner, setSavingOwner] = useState(false);
  const [uploadingLogoId, setUploadingLogoId] = useState<number | null>(null);
  const [deletingLogoId, setDeletingLogoId] = useState<number | null>(null);
  const [deletingOwnerId, setDeletingOwnerId] = useState<number | null>(null);
  const [ownerToDelete, setOwnerToDelete] = useState<KontoinhaberRecord | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showOnlyWithoutWebsite, setShowOnlyWithoutWebsite] = useState(false);
  const [showOnlyWithoutLogo, setShowOnlyWithoutLogo] = useState(false);
  const [showIndividualOwners, setShowIndividualOwners] = useState(true);
  const [editingOwner, setEditingOwner] = useState<KontoinhaberRecord | null>(
    null,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [pendingOwnerAction, setPendingOwnerAction] =
    useState<PendingOwnerAction | null>(null);
  const [form, setForm] = useState<OwnerFormState>(EMPTY_FORM);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleOwners = useMemo(() => owners, [owners]);

  const handleLogoDrop = async (ownerId: number, event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    setDragOverOwnerId(null);

    const file = event.dataTransfer.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei hochladen");
      return;
    }

    await handleLogoUpload(ownerId, file);
  };

  const handleLogoUpload = async (ownerId: number, file: File) => {
    setUploadingLogoId(ownerId);
    try {
      const prevScroll = listScrollRef.current?.scrollTop;
      const formData = new FormData();
      formData.append("file", file);

      await fetch(
        `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${ownerId}/logo`,
        {
          method: "POST",
          body: formData,
        },
      );

      await loadData({ forceRefresh: true });

      if (editingOwner?.id === ownerId) {
        const refreshed = await fetchKontoinhaber(ownerId);

        setEditingOwner(refreshed);
        setForm((prev) => ({
          ...prev,
          logo_url: refreshed.logo_url ?? "",
        }));
      }

      if (prevScroll != null) {
        const doRestore = () => {
          try {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = prevScroll;
            }
          } catch {
            // ignore
          }
        };

        requestAnimationFrame(() => {
          doRestore();
          requestAnimationFrame(() => {
            doRestore();
            setTimeout(doRestore, 120);
          });
        });
      }

      setLogoVersions((current) => ({
        ...current,

        [ownerId]: Date.now(),
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Logo-Upload fehlgeschlagen",
      );
    } finally {
      setUploadingLogoId(null);
    }
  };

  const handleLogoDelete = async (ownerId: number) => {
    setDeletingLogoId(ownerId);
    try {
      const prevScroll = listScrollRef.current?.scrollTop;

      await fetch(
        `${getApiBaseUrl()}/db/reference-data/kontoinhaber/${ownerId}/logo`,
        {
          method: "DELETE",
        },
      );

      await loadData({ forceRefresh: true });

      if (prevScroll != null) {
        const doRestore = () => {
          try {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = prevScroll;
            }
          } catch {
            // ignore
          }
        };

        requestAnimationFrame(() => {
          doRestore();
          requestAnimationFrame(() => {
            doRestore();
            setTimeout(doRestore, 120);
          });
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Logo-Löschvorgang fehlgeschlagen",
      );
    } finally {
      setDeletingLogoId(null);
    }
  };

  const loadData = async (options?: {
    silent?: boolean;
    forceRefresh?: boolean;
  }) => {
    const shouldShowLoading =
      options?.forceRefresh || !hasFreshCache("kontoinhaber-reference-data");

    if (!options?.silent && shouldShowLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await fetchKontoinhaberReferenceData({
        forceRefresh: options?.forceRefresh,
      });
      setOwners(payload.kontoinhaber ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kontoinhaber konnten nicht geladen werden",
      );
      setOwners([]);
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

  useEffect(() => {
    if (!targetOwnerId || owners.length === 0) return;

    const id = Number(targetOwnerId);

    const owner = owners.find((o) => o.id === id);
    const index = owners.findIndex((o) => o.id === id);

    if (!owner || index < 0) return;

    setEditingOwner(owner);

    setForm({
      name: owner.name,
      website: owner.website ?? "",
      logo_url: owner.logo_url ?? "",
      logo_white_background: owner.logo_white_background ?? false,
      logo_padding: owner.logo_padding ?? false,
      is_company: owner.is_company,
    });

    requestAnimationFrame(() => {
      virtualListRef.current?.scrollToIndex(index, "auto");
    });

    const params = new URLSearchParams(searchParams);

    params.delete("ownerId");

    navigate(
      {
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true },
    );
  }, [targetOwnerId, owners]);

  const resetOwnerEditor = () => {
    setEditingOwner(null);
    setForm(EMPTY_FORM);
  };

  const closeOwnerEdit = () => {
    if (isOwnerDirty(editingOwner, form)) {
      setPendingOwnerAction({ kind: "close-edit" });
      setDiscardChangesOpen(true);
      return;
    }

    resetOwnerEditor();
  };

  const requestOpenOwner = (owner: KontoinhaberRecord) => {
    if (editingOwner?.id === owner.id) {
      closeOwnerEdit();
      return;
    }

    if (isOwnerDirty(editingOwner, form)) {
      setPendingOwnerAction({ kind: "switch-edit", owner });
      setDiscardChangesOpen(true);
      return;
    }

    setEditingOwner(owner);
    setForm({
      name: owner.name,
      website: owner.website ?? "",
      logo_url: owner.logo_url ?? "",
      logo_white_background: owner.logo_white_background ?? false,
      logo_padding: owner.logo_padding ?? false,
      is_company: owner.is_company,
    });
    setError(null);
  };

  const closeCreateEditor = () => {
    if (isOwnerDirty(null, form)) {
      setPendingOwnerAction({ kind: "close-create" });
      setDiscardChangesOpen(true);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const confirmDiscardChanges = () => {
    const action = pendingOwnerAction;
    setPendingOwnerAction(null);
    setDiscardChangesOpen(false);

    if (!action) return;

    if (action.kind === "close-edit") {
      resetOwnerEditor();
      return;
    }

    if (action.kind === "switch-edit") {
      setEditingOwner(action.owner);
      setForm({
        name: action.owner.name,
        website: action.owner.website ?? "",
        logo_url: action.owner.logo_url ?? "",
        logo_white_background: action.owner.logo_white_background ?? false,
        logo_padding: action.owner.logo_padding ?? true,
        is_company: action.owner.is_company,
      });
      setError(null);
      return;
    }

    setCreateDialogOpen(false);
    setForm(EMPTY_FORM);
  };

  const openCreateDialog = () => {
    setForm(EMPTY_FORM);
    setEditingOwner(null);
    setCreateDialogOpen(true);
    resetOwnerEditor();
  };

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

  const openEditRow = (owner: KontoinhaberRecord) => {
    requestOpenOwner(owner);
  };

  const handleSaveOwner = async () => {
    setSavingOwner(true);
    setError(null);

    try {
      const prevScroll = listScrollRef.current?.scrollTop;
      const payload = {
        name: form.name.trim(),
        website: form.is_company ? form.website.trim() || null : null,
        logo_url: form.is_company ? form.logo_url.trim() || null : null,
        logo_white_background: form.is_company
          ? form.logo_white_background
          : false,
        logo_padding: form.is_company ? form.logo_padding : false,
        is_company: form.is_company,
      };

      if (editingOwner) {
        const updatedOwner = await updateKontoinhaber(editingOwner.id, payload);

        setOwners((current) =>
          current.map((owner) =>
            owner.id === updatedOwner.id ? updatedOwner : owner,
          ),
        );

        setEditingOwner(updatedOwner);

        setForm({
          name: updatedOwner.name,
          website: updatedOwner.website ?? "",
          logo_url: updatedOwner.logo_url ?? "",
          logo_white_background: updatedOwner.logo_white_background ?? false,
          logo_padding: updatedOwner.logo_padding ?? false,
          is_company: updatedOwner.is_company,
        });
      } else {
        const createdOwner = await createKontoinhaber(payload);
        setOwners((current) => [...current, createdOwner]);
        setCreateDialogOpen(false);
        setForm(EMPTY_FORM);
      }

      if (prevScroll != null) {
        const doRestore = () => {
          try {
            if (listScrollRef.current) {
              listScrollRef.current.scrollTop = prevScroll;
            }
          } catch {
            // ignore
          }
        };

        requestAnimationFrame(() => {
          doRestore();
          requestAnimationFrame(() => {
            doRestore();
            setTimeout(doRestore, 120);
          });
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kontoinhaber konnten nicht gespeichert werden",
      );
    } finally {
      setSavingOwner(false);
    }
  };

  const openDeleteOwnerDialog = (owner: KontoinhaberRecord) => {
    setOwnerToDelete(owner);
  };

  const confirmDeleteOwner = async () => {
    if (!ownerToDelete) return;

    setDeletingOwnerId(ownerToDelete.id);
    setError(null);

    try {
      await deleteKontoinhaber(ownerToDelete.id);
      setOwners((current) =>
        current.filter((item) => item.id !== ownerToDelete.id),
      );

      if (editingOwner?.id === ownerToDelete.id) {
        resetOwnerEditor();
      }
      setOwnerToDelete(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kontoinhaber konnte nicht gelöscht werden",
      );
    } finally {
      setDeletingOwnerId(null);
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
    const hasLogo = Boolean(owner.logo_url?.trim());

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
      {error ? (
        <EmptyState
          title="Kontoinhaber konnten nicht geladen werden"
          text={error}
          illustration={<Store className="size-5" />}
        />
      ) : (
        <VirtualizedList
          ref={virtualListRef}
          items={visibleOwners}
          loading={loading}
          filterItem={(owner, query) =>
            filterOwner(owner, query) && matchesOwnerFilters(owner)
          }
          searchPlaceholder="Kontoinhaber suchen..."
          externalScrollRef={listScrollRef}
          scrollClassName="max-h-[65vh]"
          emptyStateTitle="Keine Kontoinhaber vorhanden"
          emptyStateText="Lege einen Kontoinhaber an, um IBANs und Logos zuzuordnen."
          emptyStateIllustration={<User className="size-5" />}
          getItemKey={(owner) => owner.id}
          getItemHeight={(owner) =>
            editingOwner?.id === owner.id
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
            <Button key="owner-create" type="button" onClick={openCreateDialog}>
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
            const isExpanded = editingOwner?.id === owner.id;
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
                  onClick={() => openEditRow(owner)}
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

                              {/* Logo-URL: nur anzeigen wenn kein lokales Bild vorhanden */}
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
                                  value={
                                    form.logo_white_background
                                      ? "white"
                                      : "dark"
                                  }
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
                                    <SelectItem value="true">
                                      Aktiviert
                                    </SelectItem>
                                    <SelectItem value="false">
                                      Deaktiviert
                                    </SelectItem>
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
                              onValueChange={(value) =>
                                updateOwnerKind(value === "company")
                              }
                            >
                              <SelectTrigger
                                id={`owner-kind-${owner.id}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <SelectValue placeholder="Typ auswählen" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="company">
                                  Unternehmen
                                </SelectItem>
                                <SelectItem value="person">
                                  Einzelperson
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {form.is_company && (
                          <>
                            {/* Profilbild-Sektion */}
                            <div className="flex flex-col gap-2 md:col-span-2">
                              <label className="text-sm font-medium">
                                Profilbild
                              </label>

                              {hasLocalImage ? (
                                /* Lokales Bild vorhanden: Vorschau + Aktionen */
                                <div
                                  className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
                                    dragOverOwnerId === owner.id
                                      ? "border-primary bg-primary/10"
                                      : "border-muted-foreground/30 bg-muted/20"
                                  }`}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverOwnerId(owner.id);
                                  }}
                                  onDrop={(e) => {
                                    void handleLogoDrop(owner.id, e);
                                  }}
                                  onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverOwnerId(null);
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
                                          setDragOverOwnerId(owner.id);
                                        }}
                                        onDragLeave={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setDragOverOwnerId((current) =>
                                            current === owner.id
                                              ? null
                                              : current,
                                          );
                                        }}
                                        onDrop={(e) => {
                                          void handleLogoDrop(owner.id, e);
                                        }}
                                      >
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(event) => {
                                            const file =
                                              event.target.files?.[0];
                                            if (file) {
                                              void handleLogoUpload(
                                                owner.id,
                                                file,
                                              );
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
                                          void handleLogoDelete(owner.id);
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
                                /* Kein lokales Bild: Upload-Fläche */
                                <label
                                  className="cursor-pointer group"
                                  onClick={(e) => e.stopPropagation()}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverOwnerId(owner.id);
                                  }}
                                  onDragLeave={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverOwnerId((current) =>
                                      current === owner.id ? null : current,
                                    );
                                  }}
                                  onDrop={(e) => {
                                    void handleLogoDrop(owner.id, e);
                                  }}
                                >
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) {
                                        void handleLogoUpload(owner.id, file);
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
                          onClick={() => void handleSaveOwner()}
                          disabled={
                            savingOwner ||
                            !isOwnerDirty(editingOwner, form) ||
                            !form.name.trim()
                          }
                        >
                          {savingOwner ? "Speichere ..." : "Speichern"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => openDeleteOwnerDialog(owner)}
                          disabled={deletingOwnerId === owner.id || savingOwner}
                        >
                          <Trash2 className="size-4" />
                          {deletingOwnerId === owner.id
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
                  <label
                    className="text-sm font-medium"
                    htmlFor="owner-website"
                  >
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
              onClick={() => void handleSaveOwner()}
              disabled={
                savingOwner || !isOwnerDirty(null, form) || !form.name.trim()
              }
            >
              {savingOwner ? "Speichere ..." : "Speichern"}
            </Button>
          </DialogFooter>
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
          setPendingOwnerAction(null);
        }}
        onConfirm={confirmDiscardChanges}
      />
      <ConfirmDialog
        open={Boolean(ownerToDelete)}
        title="Kontoinhaber löschen"
        description={`Kontoinhaber "${ownerToDelete?.name ?? ""}" wirklich löschen? Zugeordnete IBANs werden dabei entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        loading={ownerToDelete ? deletingOwnerId === ownerToDelete.id : false}
        onOpenChange={(open) => {
          if (!open) setOwnerToDelete(null);
        }}
        onConfirm={confirmDeleteOwner}
      />
    </div>
  );
}

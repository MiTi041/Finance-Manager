"use client";

import React, {
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon, Download } from "lucide-react";
import { Button } from "./ui/button";

function escapeCsvValue(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function flattenCsvRow(
  value: unknown,
  prefix = "",
  seen = new WeakSet<object>(),
): Record<string, string> {
  if (value === null || value === undefined) {
    return { [prefix || "Wert"]: "" };
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return { [prefix || "Wert"]: String(value) };
  }

  if (value instanceof Date) {
    return { [prefix || "Wert"]: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return {
      [prefix || "Wert"]: value.map((entry) => String(entry)).join(" | "),
    };
  }

  if (typeof value !== "object") {
    return { [prefix || "Wert"]: String(value) };
  }

  const objectValue = value as Record<string, unknown>;
  if (seen.has(objectValue)) {
    return { [prefix || "Wert"]: "[Zyklus]" };
  }
  seen.add(objectValue);

  const entries = Object.entries(objectValue).flatMap(([key, entry]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    const flattened = flattenCsvRow(entry, nextPrefix, seen);
    return Object.entries(flattened);
  });

  if (entries.length === 0) {
    return { [prefix || "Wert"]: "" };
  }

  return Object.fromEntries(entries);
}

function prettifyHeader(key: string) {
  // take last path segment and replace dots/underscores with spaces
  const last = key.split(".").slice(-1)[0];
  // split camelCase into words
  const splitted = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .toLowerCase();

  const tokenMap: Record<string, string> = {
    kontonummer: "Kontonummer",
    iban: "IBAN",
    bic: "BIC",
    betrag: "Betrag",
    wert: "Wert",
    buchungsdatum: "Buchungsdatum",
    valuta: "Valuta",
    zahlungspartner: "Zahlungspartner",
    beschreibung: "Beschreibung",
    verfuegbar: "Verfügbar",
    name: "Name",
    titel: "Titel",
    kategorie: "Kategorie",
    inhaber: "Inhaber",
  };

  const simple = splitted.split(" ").slice(-1)[0];
  if (tokenMap[simple]) return tokenMap[simple];

  // fallback: capitalize first letter
  return splitted.charAt(0).toUpperCase() + splitted.slice(1);
}

function inferExportFilename(entityName?: string, count?: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = entityName ? String(entityName).trim().toLowerCase().replace(/\s+/g, "-") : "export";
  const c = typeof count === "number" ? `-${count}` : "";
  return `${base}-export-${date}${c}.csv`;
}

function collectSearchableText(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || value === undefined) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => collectSearchableText(entry, seen)).join(" ");
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return "";
    seen.add(objectValue);

    return Object.values(objectValue)
      .map((entry) => collectSearchableText(entry, seen))
      .join(" ");
  }

  return "";
}

export interface SortOption<T> {
  /** Label shown in the sort dropdown */
  label: string;
  /** Unique key identifying this sort option */
  value: string;
  /** Comparator used for ascending sort; the list will also offer a descending variant */
  compareFn: (a: T, b: T) => number;
}

export interface VirtualizedListRef {
  scrollToIndex: (index: number, align?: "start" | "center" | "end" | "auto") => void;
  scrollToItem: (key: React.Key, align?: "start" | "center" | "end" | "auto") => void;
}

export interface VirtualizedListProps<T> {
  items: T[];
  loading?: boolean;
  noSearchbar?: boolean;
  csvExport?: boolean;
  filterItems?: ReactNode[];
  toolbarActions?: ReactNode[];
  footerActions?: ReactNode[];
  selectAllNode?: ReactNode;
  className?: string;
  searchPlaceholder?: string;
  filterItem?: (item: T, query: string) => boolean;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => React.Key;
  getItemHeight?: (item: T, index: number) => number;
  loadingSkeletonCount?: number;
  renderLoadingSkeleton?: (index: number) => ReactNode;
  emptyStateTitle?: string;
  emptyStateText?: string;
  emptyStateIllustration?: ReactNode;
  scrollClassName?: string;
  externalScrollRef?: React.RefObject<HTMLDivElement | null>;
  exportFilename?: string;
  /** Optional mapping from flattened object keys (e.g. "konto.kontonummer") to friendly column labels */
  exportColumnMapping?: Record<string, string>;
  /** Optional human readable entity name used for generated filenames (e.g. "transaktionen") */
  exportEntityName?: string;
  /** Pass sort options to enable the sort dropdown in the toolbar */
  sortItems?: SortOption<T>[];
  onVisibleItemsChange?: (items: T[]) => void;
  /** Override the visible item count shown in the footer */
  displayCount?: number;
  /** Override the total item count shown in the footer */
  totalCount?: number;
}

function VirtualizedListInner<T>(
  {
    items,
    loading = false,
    noSearchbar = false,
    csvExport = false,
    filterItems,
    toolbarActions,
    footerActions,
    selectAllNode,
    className,
    searchPlaceholder = "Suchen...",
    filterItem,
    renderItem,
    getItemKey = (_, index) => index,
    getItemHeight = () => 63,
    loadingSkeletonCount = 20,
    renderLoadingSkeleton,
    emptyStateTitle = "Keine Einträge",
    emptyStateText = "Es wurden keine Einträge gefunden.",
    emptyStateIllustration,
    scrollClassName,
    externalScrollRef,
    exportFilename,
    exportColumnMapping,
    exportEntityName,
    sortItems,
    onVisibleItemsChange,
    displayCount,
    totalCount,
  }: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef>,
) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [offsetTop, setOffsetTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    searchSort: true,
    actions: true,
    filters: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Measure where the component starts in the viewport so the height
  // can be calculated as (100vh - offsetTop - bottom padding) without
  // any hardcoded magic number.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      setOffsetTop(el.getBoundingClientRect().top + window.scrollY);
    };

    measure();

    // Re-measure when the page layout shifts (e.g. collapsing sidebars,
    // font loading, or window resize).
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const scrollRef = externalScrollRef ?? internalScrollRef;

  const activeSortOption = sortItems?.find((s) => s.value === sortKey) ?? null;

  const visibleItems = useMemo(() => {
    const query = globalFilter.trim().toLowerCase();

    // 1. Filter
    let result = items.filter((item) =>
      filterItem
        ? filterItem(item, query)
        : collectSearchableText(item).toLowerCase().includes(query),
    );

    // 2. Sort
    if (activeSortOption) {
      result = result.sort((a, b) => {
        const cmp = activeSortOption.compareFn(a, b);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [filterItem, globalFilter, items, activeSortOption, sortDir]);

  useEffect(() => {
    onVisibleItemsChange?.(visibleItems);
  }, [onVisibleItemsChange, visibleItems]);

  const virtualRows = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => getItemKey(visibleItems[index], index),
    estimateSize: (index) => getItemHeight(visibleItems[index], index),
    overscan: 10,
  });

  useImperativeHandle(
    ref,

    () => ({
      scrollToIndex(index, align = "center") {
        virtualRows.scrollToIndex(index, {
          align,
        });
      },
      scrollToItem(key, align = "start") {
        if (!getItemKey) return;
        const index = visibleItems.findIndex((item, i) => getItemKey(item, i) === key);
        if (index >= 0) {
          virtualRows.scrollToIndex(index, { align });
        }
      },
    }),

    [virtualRows, visibleItems, getItemKey],
  );

  const prevLengthRef = useRef(visibleItems.length);
  useEffect(() => {
    if (prevLengthRef.current !== visibleItems.length) {
      prevLengthRef.current = visibleItems.length;
      const frame = window.requestAnimationFrame(() => {
        virtualRows.measure();
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [virtualRows, visibleItems.length]);

  const loadingSkeletonRows = Array.from({ length: loadingSkeletonCount }, (_, index) => index);

  const handleExportCsv = () => {
    if (visibleItems.length === 0) return;
    const rows = visibleItems.map((item) => flattenCsvRow(item));

    // determine headers (stable order) and friendly labels
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const labels = headers.map((h) => exportColumnMapping?.[h] ?? prettifyHeader(h));

    const csvLines = [
      labels.map((l) => escapeCsvValue(l)).join(","),
      ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h] ?? "")).join(",")),
    ];

    const csv = csvLines.join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const filename = exportFilename ?? inferExportFilename(exportEntityName, rows.length);

    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Cycle: off → asc → desc → off
  // Activating a different option resets the previous one to off.
  function handleSortToggle(value: string) {
    if (sortKey !== value) {
      setSortKey(value);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey("");
      setSortDir("asc");
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col gap-4", className)}
      style={{
        height: offsetTop ? `calc(100vh - ${offsetTop}px - 3rem)` : undefined,
      }}
    >
      <div className="flex min-w-50 flex-col gap-4">
        {toolbarActions && (
          <div className="space-y-2">
            <button
              type="button"
              aria-expanded={openSections.actions}
              onClick={() => toggleSection("actions")}
              className="cursor-pointer flex w-full items-center justify-start gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <span>Funktionen</span>
              <ChevronDownIcon
                size={14}
                className={cn(
                  "transition-transform duration-200",
                  openSections.actions ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>
            {openSections.actions && (
              <div className={cn("flex flex-wrap gap-2")}>
                {toolbarActions?.map((item, index) => (
                  <React.Fragment key={index}>{item}</React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {filterItems && (
          <div className="space-y-2">
            <button
              type="button"
              aria-expanded={openSections.filters}
              onClick={() => toggleSection("filters")}
              className="cursor-pointer flex w-full items-center justify-start gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <span>Filtern</span>
              <ChevronDownIcon
                size={14}
                className={cn(
                  "transition-transform duration-200",
                  openSections.filters ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>
            {openSections.filters && (
              <div className={cn("flex flex-wrap gap-2")}>
                {filterItems?.map((item, index) => (
                  <React.Fragment key={index}>{item}</React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {(!noSearchbar || sortItems) && (
          <div className="space-y-2 w-full">
            <button
              type="button"
              aria-expanded={openSections.searchSort}
              onClick={() => toggleSection("searchSort")}
              className="cursor-pointer flex w-full items-center justify-start gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <span>
                {!noSearchbar && "Suchen"} {!noSearchbar && sortItems && "&"}{" "}
                {sortItems && "Sortieren"}
              </span>
              <ChevronDownIcon
                size={14}
                className={cn(
                  "transition-transform duration-200",
                  openSections.searchSort ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>

            {openSections.searchSort && (
              <div className="flex flex-wrap gap-4">
                {!noSearchbar && (
                  <Input
                    placeholder={searchPlaceholder}
                    value={globalFilter}
                    onChange={(event) => setGlobalFilter(event.target.value)}
                    className="flex-1 min-w-[200px]"
                  />
                )}

                {sortItems && (
                  <div className="flex min-w-0 flex-wrap items-center gap-2 justify-start">
                    {sortItems.map((option) => {
                      const isActive = sortKey === option.value;
                      const dir = isActive ? sortDir : null;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          onClick={() => handleSortToggle(option.value)}
                          className={cn(
                            "inline-flex items-center gap-1.5 w-min rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                            isActive
                              ? "!bg-foreground !text-background !hover:bg-foreground/90"
                              : "!bg-muted !text-muted-foreground !hover:bg-muted/80 !hover:text-foreground",
                          )}
                        >
                          <span>{option.label}</span>
                          <span className="text-xs">
                            {dir === "asc" ? (
                              <ChevronUpIcon size={16} />
                            ) : dir === "desc" ? (
                              <ChevronDownIcon size={16} />
                            ) : (
                              <ChevronsUpDownIcon size={16} />
                            )}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll container + footer — fills remaining height */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 min-h-0 overflow-auto rounded-t-md border border-muted no-scrollbar",
            scrollClassName,
          )}
        >
          {loading && (
            <div className="space-y-0">
              {loadingSkeletonRows.map((index) =>
                renderLoadingSkeleton ? (
                  <div key={index}>{renderLoadingSkeleton(index)}</div>
                ) : (
                  <div
                    key={index}
                    className="flex items-center gap-4 border-b border-muted/60 px-4 py-3"
                  >
                    <Skeleton className="size-9 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-[42%] max-w-[280px]" />
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-[18%] min-w-[72px]" />
                        <Skeleton className="h-3 w-[44%] max-w-[320px]" />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Skeleton className="size-2 rounded-full" />
                      <Skeleton className="h-4 w-[90px]" />
                      <Skeleton className="h-4 w-4 rounded-full" />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          {!loading && visibleItems.length === 0 && (
            <div className="flex h-64 items-center justify-center px-6 text-sm text-muted-foreground">
              <EmptyState
                title={emptyStateTitle}
                text={emptyStateText}
                illustration={emptyStateIllustration}
              />
            </div>
          )}

          {!loading &&
            visibleItems.length > 0 &&
            (() => {
              const virtualItems = virtualRows.getVirtualItems();
              const paddingTop = virtualItems[0]?.start ?? 0;
              const paddingBottom =
                virtualRows.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0);

              return (
                <div>
                  {paddingTop > 0 && <div style={{ height: paddingTop }} />}
                  {virtualItems.map((virtualRow) => {
                    const item = visibleItems[virtualRow.index];
                    return (
                      <div
                        key={getItemKey(item, virtualRow.index)}
                        ref={(el) => {
                          if (el) virtualRows.measureElement(el);
                        }}
                        data-index={virtualRow.index}
                      >
                        {renderItem(item, virtualRow.index)}
                      </div>
                    );
                  })}
                  {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
                </div>
              );
            })()}
        </div>

        {footerActions?.map((item, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center justify-between gap-3 border border-t-0 px-4 py-2 bg-primary/5 border-primary/20",
            )}
          >
            {item}
          </div>
        ))}

        {/* Footer — row count, pinned below the table */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-b-md border border-t-0 px-4 py-2 bg-muted/30 border-muted",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {loading ? (
              <span className="text-xs text-muted-foreground">Lädt…</span>
            ) : (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {totalCount !== undefined ? (
                  <><span className="font-medium text-foreground">{totalCount}</span> Zeilen</>
                ) : visibleItems.length !== items.length ? (
                  <>
                    <span className="font-medium text-foreground">{visibleItems.length}</span>
                    {" von "}
                    <span className="font-medium text-foreground">{items.length}</span>
                    {" Zeilen"}
                  </>
                ) : (
                  <><span className="font-medium text-foreground">{items.length}</span> Zeilen</>
                )}
              </span>
            )}
            {!footerActions?.length && selectAllNode}
          </div>
          {!loading && visibleItems.length > 0 && csvExport ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCsv}
              className="ml-auto shrink-0"
              height={10}
            >
              <Download className="size-4" />
              CSV exportieren
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & {
    ref?: React.Ref<VirtualizedListRef>;
  },
) => React.ReactElement;

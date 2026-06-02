"use client";

import { Fragment, ReactNode, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  Table as ReactTableInstance,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  ChevronsLeft as IconChevronsLeft,
  ChevronsRight as IconChevronsRight,
} from "lucide-react";
import { cn } from "@lib/utils";

interface DataTableProps<T> {
  data: T[];
  noHeader?: boolean;
  columns: ColumnDef<T>[];
  globalFilterPlaceholder?: string;
  noSearchbar?: boolean;
  toolbarActions?: ReactNode;
  className?: string;
  loading?: boolean;
  getRowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  isRowExpanded?: (row: T) => boolean;
  renderExpandedRow?: (row: T) => ReactNode;
}

export function DataTable<T>({
  data,
  noHeader = false,
  columns,
  globalFilterPlaceholder = "Suchen...",
  noSearchbar = false,
  toolbarActions,
  loading = false,
  getRowClassName,
  onRowClick,
  isRowExpanded,
  renderExpandedRow,
  ...props
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  return (
    <div className={cn("space-y-4", props.className)}>
      {!noSearchbar && (
        <div className="flex items-center justify-between gap-2">
          <Input
            placeholder={globalFilterPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
          {toolbarActions}
        </div>
      )}

      <div className="w-full overflow-x-auto overflow-y-hidden rounded-md border border-muted no-scrollbar">
        {loading && (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && (
          <Table>
            {!noHeader && (
              <TableHeader className="bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="whitespace-nowrap p-4"
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <Button
                            variant="ghost"
                            className="-ml-3 h-8 gap-1 px-3 font-medium"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getIsSorted() === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
            )}
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(
                      onRowClick &&
                        "cursor-pointer hover:bg-muted/40 transition-colors",
                      getRowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "p-4 min-w-0 max-w-full",
                          (
                            cell.column.columnDef.meta as
                              | { cellClassName?: string }
                              | undefined
                          )?.cellClassName,
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderExpandedRow && isRowExpanded?.(row.original) && (
                    <TableRow className="border-0 bg-background hover:bg-background">
                      <TableCell
                        colSpan={row.getVisibleCells().length}
                        className="border-0  border-b p-0"
                      >
                        <div className="relative">
                          <div className="absolute left-6 top-3 bottom-3 w-px bg-muted rounded" />
                          <div className="ml-8 bg-background/80">
                            {renderExpandedRow(row.original)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}

function DataTablePagination<T>({ table }: { table: ReactTableInstance<T> }) {
  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex w-full items-center gap-6 lg:w-fit">
        <div className="hidden items-center gap-2 lg:flex">
          <Label htmlFor="rows-per-page" className="text-sm font-medium">
            Zeilen pro Seite
          </Label>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger size="sm" className="w-20" id="rows-per-page">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 50, 100, 200].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm font-medium">
          Seite {table.getState().pagination.pageIndex + 1} von{" "}
          {table.getPageCount()}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-8"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden size-8 lg:flex"
            size="icon"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <IconChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

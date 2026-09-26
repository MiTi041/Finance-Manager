import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  FolderPlus,
  LocateFixed,
  Minus,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  Waypoints,
} from "lucide-react";

import { BankLogo } from "@/components/bank-logo";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fetchAccountFlowLayout, saveAccountFlowLayout } from "@/lib/account-flow";
import type { AccountFlowZone } from "@/lib/account-flow";
import { logoBackgroundClass } from "@/lib/bank/zahlungspartner-logo";

import {
  flowArrow,
  netFlowAmount,
  type AccountFlowEdge,
  type AccountFlowGraph,
  type AccountFlowGraphNode,
  type AccountFlowIncomeNode,
  type AccountFlowNode,
} from "./account-flow-data";

const WIDTH = 1200;
const HEIGHT = 680;
const CARD_WIDTH = 250;
const CARD_MIN_HEIGHT = 104;
const CARD_MAX_HEIGHT = 152;
const CORNER_RADIUS = 16;
const INCOME_CHIP_SIZE = 56;
const INCOME_CHIP_GAP = 80;

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.4;
const ZOOM_STEP = 0.2;
const TRANSITION_MS = 220;
const FIT_PADDING = 56;
const CONNECTION_LANE_SPACING = 10;
const CONNECTION_KNOB_RADIUS = 3.5;
const MIN_ZONE_WIDTH = 180;
const MIN_ZONE_HEIGHT = 120;

// Trackpad tuning: a pinch gesture reports as a `wheel` event with `ctrlKey`
// set to true and a much smaller deltaY per "tick" than a physical mouse
// wheel notch, so it needs its own, steeper sensitivity curve.
const TRACKPAD_PINCH_SENSITIVITY = 0.012;
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.0022;

const COLOR_DEFAULT = "#64748b";
const COLOR_HOVER = "#54a0ff";
const COLOR_ACTIVE = "#00d4a1";
const COLOR_INCOME = "#10b981";

type Point = { x: number; y: number };

function getCardHeight(note: string) {
  return note.trim() ? CARD_MIN_HEIGHT + 14 : CARD_MIN_HEIGHT;
}

function nodeWidth(node: AccountFlowGraphNode) {
  return node.kind === "income" ? INCOME_CHIP_SIZE : CARD_WIDTH;
}

function nodeHeight(node: AccountFlowGraphNode, note: string) {
  return node.kind === "income" ? INCOME_CHIP_SIZE : getCardHeight(note);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFlowAmount(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

function initialPosition(index: number, count: number): Point {
  if (count === 1) return { x: WIDTH / 2, y: HEIGHT / 2 };
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: WIDTH / 2 + Math.cos(angle) * 360,
    y: HEIGHT / 2 + Math.sin(angle) * 225,
  };
}

function getFitView(nodes: AccountFlowGraphNode[], positions: Map<string, Point>) {
  const boxes = nodes
    .map((node) => {
      const position = positions.get(node.id);
      if (!position) return null;
      const halfWidth = nodeWidth(node) / 2;
      return {
        minX: position.x - halfWidth,
        maxX: position.x + halfWidth,
        minY: position.y - CARD_MAX_HEIGHT / 2,
        maxY: position.y + CARD_MAX_HEIGHT / 2,
      };
    })
    .filter((box): box is NonNullable<typeof box> => Boolean(box));

  if (boxes.length === 0) {
    return { scale: 1, offset: { x: 0, y: 0 } };
  }

  const minX = Math.min(...boxes.map((box) => box.minX));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const scale = clamp(
    Math.min(
      1,
      (WIDTH - FIT_PADDING * 2) / contentWidth,
      (HEIGHT - FIT_PADDING * 2) / contentHeight,
    ),
    MIN_SCALE,
    MAX_SCALE,
  );

  return {
    scale,
    offset: {
      x: (WIDTH - scale * (minX + maxX)) / 2,
      y: (HEIGHT - scale * (minY + maxY)) / 2,
    },
  };
}

function undirectedEdgeKey(source: string, target: string) {
  return [source, target].sort().join("|");
}

function laneOffset(index: number, count: number) {
  return index - (count - 1) / 2;
}

/**
 * Income chips are auto-placed left of their target account and are not part of
 * the saved layout: they follow the account card as it is dragged.
 */
function computeIncomePositions(
  nodes: AccountFlowGraphNode[],
  accountPositions: Map<string, Point>,
): Map<string, Point> {
  const result = new Map(accountPositions);
  const byAccount = new Map<string, AccountFlowIncomeNode[]>();
  for (const node of nodes) {
    if (node.kind !== "income") continue;
    byAccount.set(node.accountIban, [...(byAccount.get(node.accountIban) ?? []), node]);
  }

  byAccount.forEach((incomeNodes, accountIban) => {
    const account = accountPositions.get(accountIban);
    if (!account) return;
    incomeNodes.forEach((node, index) => {
      result.set(node.id, {
        x: account.x - CARD_WIDTH / 2 - INCOME_CHIP_GAP,
        y: account.y + laneOffset(index, incomeNodes.length) * INCOME_CHIP_GAP,
      });
    });
  });

  return result;
}

/** Orthogonal (Manhattan) waypoints between two card edges, offset into a lane to avoid overlap. */
type ConnectionSide = "left" | "right" | "top" | "bottom";

function connectionSide(source: Point, target: Point, isSource: boolean): ConnectionSide {
  const horizontal = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
  if (horizontal) {
    const pointsRight = target.x >= source.x;
    if (isSource) return pointsRight ? "right" : "left";
    return pointsRight ? "left" : "right";
  }

  const pointsDown = target.y >= source.y;
  if (isSource) return pointsDown ? "bottom" : "top";
  return pointsDown ? "top" : "bottom";
}

function connectionWaypoints(
  source: Point,
  target: Point,
  lane: number,
  sourcePort: number,
  targetPort: number,
  sourceHeight: number,
  targetHeight: number,
  sourceWidth: number,
  targetWidth: number,
): Point[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const sourceX = source.x + (dx >= 0 ? sourceWidth / 2 : -sourceWidth / 2);
    const targetX = target.x - (dx >= 0 ? targetWidth / 2 : -targetWidth / 2);
    const sourceY = source.y + sourcePort * CONNECTION_LANE_SPACING;
    const targetY = target.y + targetPort * CONNECTION_LANE_SPACING;
    const bendX = (sourceX + targetX) / 2 + lane * 32;
    return [
      { x: sourceX, y: sourceY },
      { x: bendX, y: sourceY },
      { x: bendX, y: targetY },
      { x: targetX, y: targetY },
    ];
  }

  const sourceY = source.y + (dy >= 0 ? sourceHeight / 2 : -sourceHeight / 2);
  const targetY = target.y - (dy >= 0 ? targetHeight / 2 : -targetHeight / 2);
  const sourceX = source.x + sourcePort * CONNECTION_LANE_SPACING;
  const targetX = target.x + targetPort * CONNECTION_LANE_SPACING;
  const bendY = (sourceY + targetY) / 2 + lane * 32;
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: bendY },
    { x: targetX, y: bendY },
    { x: targetX, y: targetY },
  ];
}

/** Turns a polyline into a path with rounded corners (radius clamped to segment length). */
function roundedPath(points: Point[], radius: number): string {
  if (points.length < 2) return "";
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.max(0, Math.min(radius, inLen / 2, outLen / 2));

    if (r === 0 || inLen === 0 || outLen === 0) {
      d.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const inPoint = {
      x: curr.x - ((curr.x - prev.x) / inLen) * r,
      y: curr.y - ((curr.y - prev.y) / inLen) * r,
    };
    const outPoint = {
      x: curr.x + ((next.x - curr.x) / outLen) * r,
      y: curr.y + ((next.y - curr.y) / outLen) * r,
    };
    d.push(`L ${inPoint.x} ${inPoint.y}`);
    d.push(`Q ${curr.x} ${curr.y} ${outPoint.x} ${outPoint.y}`);
  }

  const last = points[points.length - 1];
  d.push(`L ${last.x} ${last.y}`);
  return d.join(" ");
}

/** Converts a client (mouse/touch) coordinate into the SVG's own viewBox coordinate space. */
function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (ctm && typeof svg.createSVGPoint === "function") {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * WIDTH,
    y: ((clientY - rect.top) / rect.height) * HEIGHT,
  };
}

function createZoneId() {
  return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function AccountFlowZoneLayer({
  zone,
  hovered,
  onPointerEnter,
  onPointerLeave,
  onDelete,
  onRename,
  onMoveStart,
  onResizeStart,
}: {
  zone: AccountFlowZone;
  hovered: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onMoveStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (direction: ZoneResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(zone.title);

  const commitTitle = () => {
    const title = draftTitle.trim();
    if (title) onRename(title);
    else setDraftTitle(zone.title);
    setEditing(false);
  };

  return (
    <foreignObject
      x={zone.x}
      y={zone.y}
      width={zone.width}
      height={zone.height}
      style={{ overflow: "visible" }}
    >
      <div
        className={cn(
          "group relative h-full w-full rounded-xl border border-dashed border-[#8aa5bd] bg-[#eaf2f8]/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)] transition-[border-color,background-color,box-shadow] duration-150 dark:border-[#45657c] dark:bg-[#203442]/60",
          hovered &&
            "border-[#0f6cbd] bg-[#e4f0f8]/80 shadow-[0_4px_16px_rgba(15,108,189,0.12)] dark:bg-[#24465c]/70",
        )}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onMoveStart}
      >
        <div className="absolute inset-x-0 top-0 flex h-9 items-center justify-between border-b border-dashed border-[#8aa5bd]/70 px-3 dark:border-[#45657c]">
          {editing ? (
            <input
              autoFocus
              value={draftTitle}
              className="min-w-0 max-w-[calc(100%-2rem)] flex-1 rounded-sm border border-[#8aa5bd] bg-card px-1.5 text-xs font-semibold text-foreground outline-none focus:border-[#0f6cbd]"
              aria-label="Zonentitel bearbeiten"
              onChange={(event) => setDraftTitle(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") commitTitle();
                if (event.key === "Escape") {
                  setDraftTitle(zone.title);
                  setEditing(false);
                }
              }}
              onBlur={commitTitle}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="max-w-[calc(100%-2rem)] cursor-text truncate text-left text-xs font-semibold text-[#35556d] outline-none hover:text-[#0f6cbd] dark:text-[#b8d8eb] dark:hover:text-[#8ac7f5]"
                  title="Titel bearbeiten"
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setDraftTitle(zone.title);
                    setEditing(true);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {zone.title}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Titel bearbeiten</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-[#58758a] transition-opacity hover:bg-[#d7e8f3] hover:text-[#b42318] dark:hover:bg-[#31566d]",
                  hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                aria-label={`Zone ${zone.title} löschen`}
                title="Zone löschen"
                onPointerEnter={onPointerEnter}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Zone löschen</TooltipContent>
          </Tooltip>
        </div>
        <ZoneResizeHandle direction="top" zoneTitle={zone.title} onResizeStart={onResizeStart} />
        <ZoneResizeHandle direction="right" zoneTitle={zone.title} onResizeStart={onResizeStart} />
        <ZoneResizeHandle direction="bottom" zoneTitle={zone.title} onResizeStart={onResizeStart} />
        <ZoneResizeHandle direction="left" zoneTitle={zone.title} onResizeStart={onResizeStart} />
        <ZoneResizeHandle
          direction="top-left"
          zoneTitle={zone.title}
          onResizeStart={onResizeStart}
        />
        <ZoneResizeHandle
          direction="top-right"
          zoneTitle={zone.title}
          onResizeStart={onResizeStart}
        />
        <ZoneResizeHandle
          direction="bottom-right"
          zoneTitle={zone.title}
          onResizeStart={onResizeStart}
        />
        <ZoneResizeHandle
          direction="bottom-left"
          zoneTitle={zone.title}
          onResizeStart={onResizeStart}
        />
      </div>
    </foreignObject>
  );
}

type ZoneResizeDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

function ZoneResizeHandle({
  direction,
  zoneTitle,
  onResizeStart,
}: {
  direction: ZoneResizeDirection;
  zoneTitle: string;
  onResizeStart: (direction: ZoneResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const edgeClasses: Record<ZoneResizeDirection, string> = {
    top: "inset-x-2 -top-1 h-2 cursor-ns-resize",
    right: "inset-y-2 -right-1 w-2 cursor-ew-resize",
    bottom: "inset-x-2 -bottom-1 h-2 cursor-ns-resize",
    left: "inset-y-2 -left-1 w-2 cursor-ew-resize",
    "top-left": "-left-1 -top-1 size-3 cursor-nwse-resize rounded-tl",
    "top-right": "-right-1 -top-1 size-3 cursor-nesw-resize rounded-tr",
    "bottom-right": "-bottom-1 -right-1 size-3 cursor-nwse-resize rounded-br",
    "bottom-left": "-bottom-1 -left-1 size-3 cursor-nesw-resize rounded-bl",
  };

  return (
    <div
      className={cn(
        "absolute z-10 opacity-0 transition-opacity group-hover:opacity-100",
        edgeClasses[direction],
      )}
      aria-label={`Zone ${zoneTitle} an ${direction} resizen`}
      onPointerDown={(event) => {
        event.stopPropagation();
        onResizeStart(direction, event);
      }}
    />
  );
}

function AccountCard({
  node,
  position,
  note,
  ports,
  active,
  dimmed,
  dragging,
  hovered,
  onSelect,
  onPointerEnter,
  onPointerLeave,
  onDragStart,
  onNoteChange,
  onNoteEditingChange,
  noteEditing,
  noteFocusMode,
}: {
  node: AccountFlowNode;
  position: Point;
  note: string;
  ports: Point[];
  active: boolean;
  dimmed: boolean;
  dragging: boolean;
  hovered: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onNoteChange: (note: string) => void;
  onNoteEditingChange: (editing: boolean) => void;
  noteEditing: boolean;
  noteFocusMode: boolean;
}) {
  const cardHeight = getCardHeight(note);
  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState(note);

  const commitNote = () => {
    onNoteChange(draftNote.trim());
    setEditingNote(false);
    onNoteEditingChange(false);
  };

  const portOpacity = dimmed ? 0.35 : 1;

  return (
    <g>
      <g className={noteFocusMode && !noteEditing ? "blur-[3px] opacity-60" : undefined}>
        {ports.map((port, index) => (
          <circle
            key={index}
            cx={port.x}
            cy={port.y}
            r={CONNECTION_KNOB_RADIUS}
            fill="hsl(var(--border))"
            opacity={portOpacity}
            pointerEvents="none"
          />
        ))}
      </g>
      <foreignObject
        x={position.x - CARD_WIDTH / 2}
        y={position.y - cardHeight / 2}
        width={CARD_WIDTH}
        height={cardHeight}
        style={{ overflow: "visible" }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={`Konto ${node.label}`}
          className={cn(
            "flex h-full w-full origin-center items-center gap-3 rounded-xl border bg-card px-3 shadow-sm transition-[transform,box-shadow,border-color,opacity] duration-150 ease-out will-change-transform",
            dragging ? "cursor-grabbing shadow-xl" : "cursor-grab",
            active ? "border-[#00d4a1] ring-2 ring-[#00d4a1]/20" : "border-border",
            hovered && !dimmed && !dragging && "-translate-y-px border-[#54a0ff]/60 shadow-md",
            dragging && "shadow-[0_18px_38px_-8px_rgba(15,23,42,0.28)]",
            dimmed && "opacity-35",
            noteFocusMode && !noteEditing && "blur-[3px] opacity-60",
          )}
          onClick={onSelect}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onDragStart}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect();
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "absolute right-2 top-2 z-10 flex size-6 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  note && "text-[#0f6cbd]",
                )}
                aria-label={note ? "Kontonotiz bearbeiten" : "Kontonotiz hinzufügen"}
                title={note || "Kontonotiz hinzufügen"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraftNote(note);
                  setEditingNote((current) => !current);
                  onNoteEditingChange(!editingNote);
                }}
              >
                <StickyNote className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {note ? "Kontonotiz bearbeiten" : "Kontonotiz hinzufügen"}
            </TooltipContent>
          </Tooltip>
          {editingNote && (
            <div
              className="absolute left-2 top-[calc(100%+6px)] z-30 w-[210px] rounded-lg border border-border/70 bg-popover/95 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.16)] backdrop-blur"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <textarea
                autoFocus
                value={draftNote}
                rows={3}
                className="block w-full resize-none rounded-sm border-0 bg-muted/45 px-2.5 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-2 focus:ring-[#0f6cbd]/25"
                placeholder="z. B. 3,5 % Zinsen"
                aria-label={`Notiz für ${node.label}`}
                onChange={(event) => setDraftNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraftNote(note);
                    setEditingNote(false);
                    onNoteEditingChange(false);
                  }
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commitNote();
                }}
                onBlur={commitNote}
              />
            </div>
          )}
          <BankLogo
            src={node.bankLogo}
            srcDark={node.bankLogoDark}
            alt={node.bankName}
          sizeClassName="size-12"
          className="p-1"
          backgroundClassName="bg-muted/70"
          />
          <div className="min-w-0 flex-1 pr-7">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{node.label}</span>
              {node.isPrimary ? (
                <Badge
                  variant="secondary"
                  className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                >
                  Hauptkonto
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-[10px] text-muted-foreground">{node.bankName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{formatIban(node.iban)}</p>
            <p className="truncate text-[10px] font-medium text-foreground">
              Kontostand:{" "}
              <span className="font-mono">
                {node.balance === undefined ? "-" : formatAmount(node.balance)}
              </span>
            </p>
            {node.externalFlow !== undefined && (
              <p className="truncate text-[10px] font-medium text-foreground">
                {node.externalFlow > 0 ? "Kontoeinfluss" : "Kontoausfluss"}:{" "}
                <span
                  className={`font-mono ${node.externalFlow > 0 ? "text-emerald-500" : "text-red-500"}`}
                >
                  {formatAmount(Math.abs(node.externalFlow))}
                </span>
              </p>
            )}
            {note && (
              <p
                className="mt-1 truncate border-t border-border/70 pt-1 text-[10px] font-medium text-[#0f6cbd]"
                title={note}
              >
                {note}
              </p>
            )}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function IncomeChip({
  node,
  position,
  dimmed,
  hovered,
  onPointerEnter,
  onPointerLeave,
}: {
  node: AccountFlowIncomeNode;
  position: Point;
  dimmed: boolean;
  hovered: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  return (
    <g>
      <foreignObject
        x={position.x - INCOME_CHIP_SIZE / 2}
        y={position.y - INCOME_CHIP_SIZE / 2}
        width={INCOME_CHIP_SIZE}
        height={INCOME_CHIP_SIZE}
        style={{ overflow: "visible" }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="img"
              aria-label={`Einkommen ${node.label}`}
              className={cn(
                "flex h-full w-full items-center justify-center rounded-full border bg-card shadow-sm transition-[transform,box-shadow,border-color,opacity] duration-150 ease-out",
                hovered && !dimmed ? "-translate-y-px border-[#10b981]/60 shadow-md" : "border-border",
                dimmed && "opacity-35",
              )}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
            >
              <BankLogo
                src={node.logo}
                srcDark={node.logoDark}
                alt={node.label}
                sizeClassName="size-12"
                className="rounded-full"
                backgroundClassName={logoBackgroundClass(node.logoBackground)}
                imgNoPadding={!node.logoPadding}
                kind={node.isCompany === false ? "person" : "company"}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="block font-medium">{node.label}</span>
            {node.purpose ? <span className="block text-xs opacity-80">{node.purpose}</span> : null}
            <span className="block text-xs opacity-80">
              <span className="font-mono">{formatAmount(node.amount)}</span> / Monat
            </span>
          </TooltipContent>
        </Tooltip>
      </foreignObject>
      <text
        x={position.x}
        y={position.y + INCOME_CHIP_SIZE / 2 + 12}
        textAnchor="middle"
        pointerEvents="none"
        className="fill-emerald-600 font-mono text-[10px] font-semibold"
      >
        {formatAmount(node.amount)}
      </text>
    </g>
  );
}

function EdgeLabel({
  edge,
  position,
  start,
  end,
  color,
}: {
  edge: AccountFlowEdge;
  position: Point;
  start: Point;
  end: Point;
  color: string;
}) {
  const net = netFlowAmount(edge);
  if (Math.abs(net) < 0.005) return null;

  const arrow = flowArrow(net > 0 ? start : end, net > 0 ? end : start);
  const amountLabel = `${arrow} ${formatFlowAmount(Math.abs(net))}`;
  const transactionLabel = `${edge.transactionCount} ${edge.transactionCount === 1 ? "Buchung" : "Buchungen"}`;
  const labelWidth = Math.max(116, amountLabel.length * 7 + 24, transactionLabel.length * 5 + 24);
  const labelHeight = 36;
  const labelTop = position.y - labelHeight / 2;

  return (
    <g>
      <rect
        x={position.x - labelWidth / 2}
        y={labelTop}
        width={labelWidth}
        height={labelHeight}
        rx={8}
        fill="hsl(var(--card))"
        stroke={color}
        strokeWidth={1.5}
        className="transition-[stroke] duration-150 ease-out"
      />
      <text
        x={position.x}
        y={labelTop + 14}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {amountLabel}
      </text>
      <text
        x={position.x}
        y={labelTop + labelHeight - 7}
        textAnchor="middle"
        className="fill-muted-foreground text-[8px]"
      >
        {transactionLabel}
      </text>
    </g>
  );
}

type PinchState = {
  initialDistance: number;
  initialScale: number;
  initialOffset: Point;
  initialMidSvg: Point;
};

export function AccountFlowGraph({
  graph,
  activeAccountIban,
}: {
  graph: AccountFlowGraph;
  activeAccountIban: string;
}) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [zones, setZones] = useState<AccountFlowZone[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNoteNodeId, setEditingNoteNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [positions, setPositions] = useState<Map<string, Point>>(() => {
    const accountNodes = graph.nodes.filter((node) => node.kind === "account");
    return new Map(
      accountNodes.map((node, index) => [node.id, initialPosition(index, accountNodes.length)]),
    );
  });

  // Income chips follow their target account and are never saved to the layout.
  const allPositions = useMemo(
    () => computeIncomePositions(graph.nodes, positions),
    [graph.nodes, positions],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const transitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{ id: string; origin: Point; position: Point } | null>(null);
  const zoneDragState = useRef<{ id: string; origin: Point; position: Point } | null>(null);
  const zoneResizeState = useRef<{
    id: string;
    origin: Point;
    x: number;
    y: number;
    width: number;
    height: number;
    direction: ZoneResizeDirection;
  } | null>(null);
  const panState = useRef<{ origin: Point; offset: Point } | null>(null);
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchState = useRef<PinchState | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLayoutLoaded(false);
    const accountNodes = graph.nodes.filter((node) => node.kind === "account");
    setPositions((current) => {
      const next = new Map<string, Point>();
      accountNodes.forEach((node, index) => {
        next.set(node.id, current.get(node.id) ?? initialPosition(index, accountNodes.length));
      });
      return next;
    });

    fetchAccountFlowLayout()
      .then((layout) => {
        if (cancelled) return;
        const next = new Map<string, Point>();
        accountNodes.forEach((node, index) => {
          next.set(
            node.id,
            layout.positions[node.id] ??
              positions.get(node.id) ??
              initialPosition(index, accountNodes.length),
          );
        });
        setPositions(next);
        setZones((current) => (current.length > 0 ? current : (layout.zones ?? [])));
        setNotes((current) => (Object.keys(current).length > 0 ? current : (layout.notes ?? {})));
        const fitView = getFitView(graph.nodes, computeIncomePositions(graph.nodes, next));
        setScale(fitView.scale);
        setOffset(fitView.offset);
      })
      .catch(() => {
        if (cancelled) return;
        const fitView = getFitView(
          graph.nodes,
          computeIncomePositions(graph.nodes, positions),
        );
        setScale(fitView.scale);
        setOffset(fitView.offset);
      })
      .finally(() => {
        if (!cancelled) setLayoutLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [graph.nodes]);

  useEffect(() => {
    if (!layoutLoaded) return;
    if (layoutSaveTimeout.current) clearTimeout(layoutSaveTimeout.current);

    layoutSaveTimeout.current = setTimeout(() => {
      void saveAccountFlowLayout({
        positions: Object.fromEntries(positions.entries()),
        zones,
        notes,
      }).catch(() => undefined);
    }, 400);

    return () => {
      if (layoutSaveTimeout.current) clearTimeout(layoutSaveTimeout.current);
    };
  }, [layoutLoaded, positions, zones, notes]);

  useEffect(
    () => () => {
      if (transitionTimeout.current) clearTimeout(transitionTimeout.current);
      if (layoutSaveTimeout.current) clearTimeout(layoutSaveTimeout.current);
    },
    [],
  );

  const edgeLanes = useMemo(() => {
    const grouped = new Map<string, string[]>();
    graph.edges.forEach((edge) => {
      const key = undirectedEdgeKey(edge.source, edge.target);
      grouped.set(key, [...(grouped.get(key) ?? []), edge.id]);
    });

    const lanes = new Map<string, number>();
    grouped.forEach((edgeIds) => {
      edgeIds.forEach((edgeId, index) => lanes.set(edgeId, laneOffset(index, edgeIds.length)));
    });
    return lanes;
  }, [graph.edges]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  const edgePorts = useMemo(() => {
    const groups = new Map<string, string[]>();
    graph.edges.forEach((edge) => {
      const source = allPositions.get(edge.source);
      const target = allPositions.get(edge.target);
      if (!source || !target) return;

      const sourceKey = `${edge.source}|${connectionSide(source, target, true)}`;
      const targetKey = `${edge.target}|${connectionSide(source, target, false)}`;
      groups.set(sourceKey, [...(groups.get(sourceKey) ?? []), `${edge.id}:source`]);
      groups.set(targetKey, [...(groups.get(targetKey) ?? []), `${edge.id}:target`]);
    });

    const ports = new Map<string, number>();
    groups.forEach((edgeKeys) => {
      edgeKeys.forEach((edgeKey, index) => {
        ports.set(edgeKey, laneOffset(index, edgeKeys.length));
      });
    });
    return ports;
  }, [graph.edges, allPositions]);

  const edgeGeometry = useMemo(() => {
    const result = new Map<
      string,
      { path: string; length: number; label: Point; start: Point; end: Point }
    >();
    graph.edges.forEach((edge) => {
      const source = allPositions.get(edge.source);
      const target = allPositions.get(edge.target);
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!source || !target || !sourceNode || !targetNode) return;
      const lane = edgeLanes.get(edge.id) ?? 0;
      const waypoints = connectionWaypoints(
        source,
        target,
        lane,
        edgePorts.get(`${edge.id}:source`) ?? 0,
        edgePorts.get(`${edge.id}:target`) ?? 0,
        nodeHeight(sourceNode, notes[edge.source] ?? ""),
        nodeHeight(targetNode, notes[edge.target] ?? ""),
        nodeWidth(sourceNode),
        nodeWidth(targetNode),
      );
      const mid = waypoints[Math.floor(waypoints.length / 2) - 1];
      const midNext = waypoints[Math.floor(waypoints.length / 2)];
      let length = 0;
      for (let i = 1; i < waypoints.length; i++) {
        length += Math.hypot(
          waypoints[i].x - waypoints[i - 1].x,
          waypoints[i].y - waypoints[i - 1].y,
        );
      }
      result.set(edge.id, {
        path: roundedPath(waypoints, CORNER_RADIUS),
        length,
        label: { x: (mid.x + midNext.x) / 2, y: (mid.y + midNext.y) / 2 },
        start: waypoints[0],
        end: waypoints[waypoints.length - 1],
      });
    });
    return result;
  }, [graph.edges, allPositions, edgeLanes, edgePorts, notes, nodeById]);

  const connectedEdgeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>();
    graph.edges.forEach((edge) => {
      if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) ids.add(edge.id);
    });
    return ids;
  }, [graph.edges, hoveredNodeId]);

  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    graph.edges.forEach((edge) => {
      if (edge.source === hoveredNodeId) ids.add(edge.target);
      if (edge.target === hoveredNodeId) ids.add(edge.source);
    });
    return ids;
  }, [graph.edges, hoveredNodeId]);

  const nodePorts = useMemo(() => {
    const ports = new Map<string, Point[]>();
    const addPort = (nodeId: string, point: Point) => {
      ports.set(nodeId, [...(ports.get(nodeId) ?? []), point]);
    };

    graph.edges.forEach((edge) => {
      const geometry = edgeGeometry.get(edge.id);
      if (!geometry) return;
      addPort(edge.source, geometry.start);
      addPort(edge.target, geometry.end);
    });

    return ports;
  }, [graph.edges, edgeGeometry]);

  const orderedNodes = useMemo(() => {
    // Render the hovered/dragged card last so it visually sits above its neighbours.
    const raised = editingNoteNodeId ?? draggingNodeId ?? hoveredNodeId;
    if (!raised) return graph.nodes;
    const rest = graph.nodes.filter((node) => node.id !== raised);
    const front = graph.nodes.find((node) => node.id === raised);
    return front ? [...rest, front] : graph.nodes;
  }, [graph.nodes, draggingNodeId, hoveredNodeId, editingNoteNodeId]);

  const applyWithTransition = useCallback((next: () => void) => {
    if (transitionTimeout.current) clearTimeout(transitionTimeout.current);
    setSmoothTransition(true);
    next();
    transitionTimeout.current = setTimeout(() => setSmoothTransition(false), TRANSITION_MS);
  }, []);

  const zoomAround = useCallback(
    (nextScale: number, anchorSvg: Point) => {
      const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const localX = (anchorSvg.x - offset.x) / scale;
      const localY = (anchorSvg.y - offset.y) / scale;
      setScale(clamped);
      setOffset({ x: anchorSvg.x - clamped * localX, y: anchorSvg.y - clamped * localY });
    },
    [offset, scale],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const anchorSvg = clientToSvgPoint(
        svg,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      applyWithTransition(() => zoomAround(scale + delta, anchorSvg));
    },
    [applyWithTransition, scale, zoomAround],
  );

  const resetView = useCallback(() => {
    const accountNodes = graph.nodes.filter((node) => node.kind === "account");
    const nextPositions = new Map(
      accountNodes.map((node, index) => [node.id, initialPosition(index, accountNodes.length)]),
    );
    const fitView = getFitView(graph.nodes, computeIncomePositions(graph.nodes, nextPositions));
    applyWithTransition(() => {
      setScale(fitView.scale);
      setOffset(fitView.offset);
      setPositions(nextPositions);
    });
    setSelectedEdgeId(null);
  }, [applyWithTransition, graph.nodes]);

  const centerView = useCallback(() => {
    const fitView = getFitView(graph.nodes, allPositions);
    applyWithTransition(() => {
      setScale(fitView.scale);
      setOffset(fitView.offset);
    });
  }, [applyWithTransition, graph.nodes, allPositions]);

  const addZone = useCallback(() => {
    let title = "Neue Zone";
    try {
      title = window.prompt("Titel der neuen Zone", title)?.trim() || title;
    } catch {}

    setZones((current) => [
      ...current,
      {
        id: createZoneId(),
        title,
        x: 260 + (current.length % 3) * 40,
        y: 190 + (current.length % 3) * 36,
        width: 360,
        height: 220,
      },
    ]);
  }, []);

  const renameZone = useCallback((id: string, title: string) => {
    setZones((current) => current.map((zone) => (zone.id === id ? { ...zone, title } : zone)));
  }, []);

  const deleteZone = useCallback((id: string) => {
    setZones((current) => current.filter((zone) => zone.id !== id));
    setHoveredZoneId((current) => (current === id ? null : current));
  }, []);

  const handleZoneMoveStart = useCallback(
    (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (editingNoteNodeId) return;
      event.stopPropagation();
      const svg = svgRef.current;
      const zone = zones.find((item) => item.id === id);
      if (!svg || !zone) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      zoneDragState.current = {
        id,
        origin: clientToSvgPoint(svg, event.clientX, event.clientY),
        position: { x: zone.x, y: zone.y },
      };
    },
    [editingNoteNodeId, zones],
  );

  const handleZoneResizeStart = useCallback(
    (id: string, direction: ZoneResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
      if (editingNoteNodeId) return;
      event.stopPropagation();
      const svg = svgRef.current;
      const zone = zones.find((item) => item.id === id);
      if (!svg || !zone) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      zoneResizeState.current = {
        id,
        origin: clientToSvgPoint(svg, event.clientX, event.clientY),
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        direction,
      };
    },
    [editingNoteNodeId, zones],
  );

  const endGesture = useCallback((pointerId: number) => {
    pointers.current.delete(pointerId);
    if (pointers.current.size < 2) pinchState.current = null;
    if (pointers.current.size === 0) {
      dragState.current = null;
      zoneDragState.current = null;
      zoneResizeState.current = null;
      panState.current = null;
      setDraggingNodeId(null);
      setIsPanning(false);
    }
  }, []);

  // A wheel gesture zooms around the cursor. Pinch and Ctrl/Cmd + scroll use
  // a smaller sensitivity because browsers report finer-grained deltas.
  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    if (editingNoteNodeId) return;
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    if (transitionTimeout.current) {
      clearTimeout(transitionTimeout.current);
      setSmoothTransition(false);
    }

    const anchorSvg = clientToSvgPoint(svg, event.clientX, event.clientY);
    const sensitivity = event.ctrlKey ? TRACKPAD_PINCH_SENSITIVITY : MOUSE_WHEEL_ZOOM_SENSITIVITY;
    zoomAround(scale * Math.exp(-event.deltaY * sensitivity), anchorSvg);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (editingNoteNodeId) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (transitionTimeout.current) {
      clearTimeout(transitionTimeout.current);
      setSmoothTransition(false);
    }

    if (pointers.current.size >= 2) {
      const svg = svgRef.current;
      if (!svg) return;
      dragState.current = null;
      panState.current = null;
      setDraggingNodeId(null);
      setIsPanning(false);
      const [a, b] = Array.from(pointers.current.values());
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinchState.current = {
        initialDistance: Math.hypot(b.x - a.x, b.y - a.y),
        initialScale: scale,
        initialOffset: offset,
        initialMidSvg: clientToSvgPoint(svg, midpoint.x, midpoint.y),
      };
      return;
    }

    const isCanvasBackground =
      event.target instanceof SVGRectElement &&
      event.target.getAttribute("data-canvas-background") === "true";
    if (event.target !== event.currentTarget && !isCanvasBackground) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedEdgeId(null);
    setIsPanning(true);
    panState.current = { origin: clientToSvgPoint(svg, event.clientX, event.clientY), offset };
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (editingNoteNodeId) return;
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    const svg = svgRef.current;
    if (!svg) return;

    if (pointers.current.size >= 2 && pinchState.current) {
      const points = Array.from(pointers.current.values());
      const [a, b] = points;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const currentMidSvg = clientToSvgPoint(svg, midpoint.x, midpoint.y);
      const { initialDistance, initialScale, initialOffset, initialMidSvg } = pinchState.current;
      const nextScale = clamp(initialScale * (distance / initialDistance), MIN_SCALE, MAX_SCALE);
      const localAnchorX = (initialMidSvg.x - initialOffset.x) / initialScale;
      const localAnchorY = (initialMidSvg.y - initialOffset.y) / initialScale;
      setScale(nextScale);
      setOffset({
        x: currentMidSvg.x - nextScale * localAnchorX,
        y: currentMidSvg.y - nextScale * localAnchorY,
      });
      return;
    }

    if (zoneResizeState.current) {
      const resize = zoneResizeState.current;
      const origin = resize.origin;
      const current = clientToSvgPoint(svg, event.clientX, event.clientY);
      const deltaX = (current.x - origin.x) / scale;
      const deltaY = (current.y - origin.y) / scale;
      const resizeLeft = resize.direction.includes("left");
      const resizeTop = resize.direction.includes("top");
      const nextWidth = Math.max(MIN_ZONE_WIDTH, resize.width + (resizeLeft ? -deltaX : deltaX));
      const nextHeight = Math.max(MIN_ZONE_HEIGHT, resize.height + (resizeTop ? -deltaY : deltaY));
      setZones((currentZones) =>
        currentZones.map((zone) =>
          zone.id === resize.id
            ? {
                ...zone,
                x: resizeLeft ? resize.x + resize.width - nextWidth : resize.x,
                y: resizeTop ? resize.y + resize.height - nextHeight : resize.y,
                width: nextWidth,
                height: nextHeight,
              }
            : zone,
        ),
      );
      return;
    }

    if (zoneDragState.current) {
      const drag = zoneDragState.current;
      const currentSvg = clientToSvgPoint(svg, event.clientX, event.clientY);
      const deltaX = (currentSvg.x - drag.origin.x) / scale;
      const deltaY = (currentSvg.y - drag.origin.y) / scale;
      setZones((currentZones) =>
        currentZones.map((zone) =>
          zone.id === drag.id
            ? { ...zone, x: drag.position.x + deltaX, y: drag.position.y + deltaY }
            : zone,
        ),
      );
      return;
    }

    if (dragState.current) {
      const drag = dragState.current;
      const currentSvg = clientToSvgPoint(svg, event.clientX, event.clientY);
      const nextPosition = {
        x: drag.position.x + (currentSvg.x - drag.origin.x) / scale,
        y: drag.position.y + (currentSvg.y - drag.origin.y) / scale,
      };
      setPositions((current) => new Map(current).set(drag.id, nextPosition));
      return;
    }

    if (panState.current) {
      const pan = panState.current;
      const currentSvg = clientToSvgPoint(svg, event.clientX, event.clientY);
      setOffset({
        x: pan.offset.x + (currentSvg.x - pan.origin.x),
        y: pan.offset.y + (currentSvg.y - pan.origin.y),
      });
    }
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (editingNoteNodeId) return;
    endGesture(event.pointerId);
  };

  const handleCanvasDoubleClick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (editingNoteNodeId) return;
    if (event.target !== event.currentTarget) return;
    resetView();
  };

  const handleContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingNoteNodeId) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(-ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      resetView();
    }
  };

  const zoomPercent = Math.round(scale * 100);
  const accountCount = graph.nodes.filter((node) => node.kind === "account").length;
  const incomeCount = graph.nodes.length - accountCount;

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden rounded-panel border border-border bg-card"
      onKeyDown={handleContainerKeyDown}
      tabIndex={-1}
    >
      <div className="relative h-full overflow-hidden bg-[#fafbfc] dark:bg-[#17191d]">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 backdrop-blur">
          <Waypoints className="size-4 text-[#54a0ff]" />
          <span className="text-xs text-muted-foreground">
            {accountCount} Konten
            {incomeCount > 0 ? ` · ${incomeCount} Einkommen` : ""} · {graph.edges.length}{" "}
            Geldflüsse
          </span>
        </div>
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Zone erstellen"
                title="Zone erstellen"
                onClick={addZone}
              >
                <FolderPlus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zone erstellen</TooltipContent>
          </Tooltip>
          <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Verkleinern"
                title="Verkleinern"
                onClick={() => zoomBy(-ZOOM_STEP)}
              >
                <Minus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Verkleinern</TooltipContent>
          </Tooltip>
          <span className="w-11 shrink-0 py-1 text-center text-[11px] font-medium tabular-nums text-muted-foreground">
            {zoomPercent}%
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Vergrößern"
                title="Vergrößern"
                onClick={() => zoomBy(ZOOM_STEP)}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Vergrößern</TooltipContent>
          </Tooltip>
          <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Konten zentrieren"
                title="Konten zentrieren"
                onClick={centerView}
              >
                <LocateFixed className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Konten zentrieren</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Ansicht zurücksetzen"
                title="Ansicht zurücksetzen"
                onClick={() => setResetConfirmOpen(true)}
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Ansicht zurücksetzen</TooltipContent>
          </Tooltip>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn(
            "h-full w-full touch-none select-none",
            isPanning ? "cursor-grabbing" : "cursor-grab",
          )}
          role="img"
          aria-label="Netzwerkdiagramm der internen Geldflüsse"
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onDoubleClick={handleCanvasDoubleClick}
        >
          <defs>
            <pattern id="canvas-dots" width={38} height={38} patternUnits="userSpaceOnUse">
              <circle cx={1.5} cy={1.5} r={1.5} fill="rgba(100, 116, 139, 0.48)" />
            </pattern>
          </defs>
          <g
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "0 0",
              transitionProperty: smoothTransition ? "transform" : "none",
              transitionDuration: `${TRANSITION_MS}ms`,
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <rect
              x={-4000}
              y={-4000}
              width={8000}
              height={8000}
              fill="url(#canvas-dots)"
              data-canvas-background="true"
            />
            {zones.map((zone) => (
              <g
                key={zone.id}
                className={cn(editingNoteNodeId && "pointer-events-none blur-[3px] opacity-60")}
              >
                <AccountFlowZoneLayer
                  zone={zone}
                  hovered={hoveredZoneId === zone.id}
                  onPointerEnter={() => {
                    if (!editingNoteNodeId) setHoveredZoneId(zone.id);
                  }}
                  onPointerLeave={() => {
                    if (!editingNoteNodeId) {
                      setHoveredZoneId((current) => (current === zone.id ? null : current));
                    }
                  }}
                  onDelete={() => deleteZone(zone.id)}
                  onRename={(title) => renameZone(zone.id, title)}
                  onMoveStart={(event) => handleZoneMoveStart(zone.id, event)}
                  onResizeStart={(direction, event) =>
                    handleZoneResizeStart(zone.id, direction, event)
                  }
                />
              </g>
            ))}
            {graph.edges.map((edge) => {
              const geometry = edgeGeometry.get(edge.id);
              if (!geometry) return null;
              const selected = edge.id === selectedEdgeId;
              const hovered = edge.id === hoveredEdgeId;
              const connected = connectedEdgeIds ? connectedEdgeIds.has(edge.id) : true;
              const emphasized = selected || hovered || (connectedEdgeIds !== null && connected);
              const color = selected
                ? COLOR_ACTIVE
                : edge.kind === "income"
                  ? COLOR_INCOME
                  : hovered || connected
                    ? COLOR_HOVER
                    : COLOR_DEFAULT;
              const dimmedByHover = connectedEdgeIds !== null && !connected;
              // Dashes run along the path from source to target; reverse them when
              // the net money flow points the other way.
              const dashValues = netFlowAmount(edge) > 0 ? "0;-12" : "0;12";

              return (
                <g
                  key={edge.id}
                  className={editingNoteNodeId ? "blur-[3px] opacity-60" : undefined}
                >
                  <path
                    d={geometry.path}
                    fill="none"
                    pointerEvents="none"
                    stroke={color}
                    strokeOpacity={dimmedByHover ? 0.1 : emphasized ? 0.65 : 0.35}
                    strokeWidth={4}
                    strokeLinecap="round"
                    className="transition-[stroke,stroke-opacity,stroke-width] duration-150 ease-out"
                    onClick={() => setSelectedEdgeId(edge.id)}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() =>
                      setHoveredEdgeId((current) => (current === edge.id ? null : current))
                    }
                  />
                  {/* Flowing dash overlay: reads like a "running" connector, the way
                      Copilot Studio highlights the active path through a workflow. */}
                  {emphasized && !dimmedByHover && (
                    <path
                      d={geometry.path}
                      fill="none"
                      pointerEvents="none"
                      stroke={color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray="1 11"
                      opacity={0.9}
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        values={dashValues}
                        dur="0.5s"
                        repeatCount="indefinite"
                      />
                    </path>
                  )}
                </g>
              );
            })}
            {orderedNodes.map((node) => {
              const position = allPositions.get(node.id);
              if (!position) return null;
              const dimmedByAccount =
                node.kind === "account" &&
                activeAccountIban !== "all" &&
                activeAccountIban !== node.id;
              const dimmedByHover = connectedNodeIds !== null && !connectedNodeIds.has(node.id);
              const dimmed = dimmedByAccount || dimmedByHover;

              if (node.kind === "income") {
                return (
                  <g
                    key={node.id}
                    className={editingNoteNodeId ? "blur-[3px] opacity-60" : undefined}
                  >
                    <IncomeChip
                      node={node}
                      position={position}
                      dimmed={dimmed}
                      hovered={hoveredNodeId === node.id}
                      onPointerEnter={() => {
                        if (!editingNoteNodeId) setHoveredNodeId(node.id);
                      }}
                      onPointerLeave={() => {
                        if (!editingNoteNodeId) {
                          setHoveredNodeId((current) => (current === node.id ? null : current));
                        }
                      }}
                    />
                  </g>
                );
              }

              return (
                <AccountCard
                  key={node.id}
                  node={node}
                  position={position}
                  note={notes[node.id] ?? ""}
                  ports={nodePorts.get(node.id) ?? []}
                  noteEditing={editingNoteNodeId === node.id}
                  noteFocusMode={editingNoteNodeId !== null}
                  active={activeAccountIban !== "all" && activeAccountIban === node.id}
                  dimmed={dimmed}
                  dragging={draggingNodeId === node.id}
                  hovered={hoveredNodeId === node.id}
                  onSelect={() => setSelectedEdgeId(null)}
                  onPointerEnter={() => {
                    if (!editingNoteNodeId) setHoveredNodeId(node.id);
                  }}
                  onPointerLeave={() => {
                    if (!editingNoteNodeId) {
                      setHoveredNodeId((current) => (current === node.id ? null : current));
                    }
                  }}
                  onNoteChange={(note) =>
                    setNotes((current) => {
                      const next = { ...current };
                      if (note) next[node.id] = note;
                      else delete next[node.id];
                      return next;
                    })
                  }
                  onNoteEditingChange={(editing) => {
                    setEditingNoteNodeId(editing ? node.id : null);
                    if (editing) {
                      setHoveredNodeId(null);
                      setHoveredEdgeId(null);
                      setHoveredZoneId(null);
                    }
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    if (transitionTimeout.current) {
                      clearTimeout(transitionTimeout.current);
                      setSmoothTransition(false);
                    }
                    const svg = svgRef.current;
                    if (!svg) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    const current = positions.get(node.id);
                    if (current) {
                      dragState.current = {
                        id: node.id,
                        origin: clientToSvgPoint(svg, event.clientX, event.clientY),
                        position: current,
                      };
                      setDraggingNodeId(node.id);
                    }
                  }}
                />
              );
            })}
            {!editingNoteNodeId &&
              connectedEdgeIds !== null &&
              graph.edges.map((edge) => {
                if (!connectedEdgeIds.has(edge.id)) return null;
                if (edge.kind === "income") return null;
                const geometry = edgeGeometry.get(edge.id);
                if (!geometry) return null;
                const color = edge.id === selectedEdgeId ? COLOR_ACTIVE : COLOR_HOVER;

                return (
                  <g
                    key={`${edge.id}-label`}
                    className="pointer-events-none transition-opacity duration-150 ease-out"
                  >
                    <EdgeLabel
                      edge={edge}
                      position={geometry.label}
                      start={geometry.start}
                      end={geometry.end}
                      color={color}
                    />
                  </g>
                );
              })}
          </g>
        </svg>
      </div>
      <ConfirmDialog
        open={resetConfirmOpen}
        title="Ansicht zurücksetzen?"
        description="Die gespeicherte Anordnung der Konten wird auf die Standardpositionen zurückgesetzt. Das kann nicht rückgängig gemacht werden."
        confirmLabel="Zurücksetzen"
        onConfirm={() => {
          resetView();
          setResetConfirmOpen(false);
        }}
        onOpenChange={setResetConfirmOpen}
      />
    </div>
  );
}

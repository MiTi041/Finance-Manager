import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { LocateFixed, Minus, Plus, RotateCcw, Waypoints } from "lucide-react";

import { BankLogo } from "@/components/bank-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAccountFlowLayout, saveAccountFlowLayout } from "@/lib/account-flow";

import type { AccountFlowEdge, AccountFlowGraph, AccountFlowNode } from "./account-flow-data";

const WIDTH = 1200;
const HEIGHT = 680;
const CARD_WIDTH = 196;
const CARD_HEIGHT = 104;
const CORNER_RADIUS = 16;

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.4;
const ZOOM_STEP = 0.2;
const TRANSITION_MS = 220;
const FIT_PADDING = 56;

const COLOR_DEFAULT = "#64748b";
const COLOR_HOVER = "#54a0ff";
const COLOR_ACTIVE = "#00d4a1";

type Point = { x: number; y: number };

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

function getFitView(nodes: AccountFlowNode[], positions: Map<string, Point>) {
  const nodePositions = nodes
    .map((node) => positions.get(node.id))
    .filter((position): position is Point => Boolean(position));

  if (nodePositions.length === 0) {
    return { scale: 1, offset: { x: 0, y: 0 } };
  }

  const minX = Math.min(...nodePositions.map((position) => position.x - CARD_WIDTH / 2));
  const maxX = Math.max(...nodePositions.map((position) => position.x + CARD_WIDTH / 2));
  const minY = Math.min(...nodePositions.map((position) => position.y - CARD_HEIGHT / 2));
  const maxY = Math.max(...nodePositions.map((position) => position.y + CARD_HEIGHT / 2));
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

/** Orthogonal (Manhattan) waypoints between two card edges, offset into a lane to avoid overlap. */
function connectionWaypoints(source: Point, target: Point, lane: number): Point[] {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const sourceX = source.x + (dx >= 0 ? CARD_WIDTH / 2 : -CARD_WIDTH / 2);
    const targetX = target.x - (dx >= 0 ? CARD_WIDTH / 2 : -CARD_WIDTH / 2);
    const bendX = (sourceX + targetX) / 2 + lane * 32;
    return [
      { x: sourceX, y: source.y },
      { x: bendX, y: source.y },
      { x: bendX, y: target.y },
      { x: targetX, y: target.y },
    ];
  }

  const sourceY = source.y + (dy >= 0 ? CARD_HEIGHT / 2 : -CARD_HEIGHT / 2);
  const targetY = target.y - (dy >= 0 ? CARD_HEIGHT / 2 : -CARD_HEIGHT / 2);
  const bendY = (sourceY + targetY) / 2 + lane * 32;
  return [
    { x: source.x, y: sourceY },
    { x: source.x, y: bendY },
    { x: target.x, y: bendY },
    { x: target.x, y: targetY },
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

function AccountCard({
  node,
  position,
  active,
  dimmed,
  dragging,
  hovered,
  onSelect,
  onPointerEnter,
  onPointerLeave,
  onDragStart,
}: {
  node: AccountFlowNode;
  position: Point;
  active: boolean;
  dimmed: boolean;
  dragging: boolean;
  hovered: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <foreignObject
      x={position.x - CARD_WIDTH / 2}
      y={position.y - CARD_HEIGHT / 2}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      style={{ overflow: "visible" }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Konto ${node.label}`}
        className={cn(
          "flex h-full w-full origin-center items-center gap-3 rounded-xl border bg-card px-3 shadow-sm transition-[transform,box-shadow,border-color,opacity] duration-150 ease-out",
          dragging ? "cursor-grabbing shadow-lg" : "cursor-grab",
          active ? "border-[#00d4a1] ring-2 ring-[#00d4a1]/20" : "border-border",
          hovered && !dimmed && "border-[#54a0ff]/60 shadow-md",
          dragging && "scale-[1.03] shadow-xl",
          dimmed && "opacity-35",
        )}
        onClick={onSelect}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={onDragStart}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect();
        }}
      >
        <BankLogo
          src={node.bankLogo}
          alt={node.bankName}
          sizeClassName="size-11"
          backgroundClassName="bg-muted/70"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{node.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{node.bankName}</p>
          <p className="truncate text-[10px] text-muted-foreground">{formatIban(node.iban)}</p>
          <p className="truncate text-[10px] font-medium text-foreground">
            Kontostand: {node.balance === undefined ? "-" : formatAmount(node.balance)}
          </p>
        </div>
      </div>
    </foreignObject>
  );
}

function EdgeLabel({
  edge,
  position,
  color,
  emphasized,
  onSelect,
  onPointerEnter,
  onPointerLeave,
}: {
  edge: AccountFlowEdge;
  position: Point;
  color: string;
  emphasized: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  if (edge.amountTargetToSource === 0 && edge.amountSourceToTarget === 0) return null;

  const amountLabels = [
    edge.amountTargetToSource > 0 ? `← ${formatFlowAmount(edge.amountTargetToSource)}` : null,
    edge.amountSourceToTarget > 0 ? `→ ${formatFlowAmount(edge.amountSourceToTarget)}` : null,
  ].filter((label): label is string => label !== null);
  const transactionLabel = `${edge.transactionCount} ${edge.transactionCount === 1 ? "Buchung" : "Buchungen"}`;
  const labelWidth = Math.max(
    116,
    ...amountLabels.map((label) => label.length * 7 + 24),
    transactionLabel.length * 5 + 24,
  );
  const labelHeight = 16 + amountLabels.length * 14 + 6;
  const labelTop = position.y - labelHeight / 2;

  return (
    <g
      className="cursor-pointer"
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <rect
        x={position.x - labelWidth / 2}
        y={labelTop}
        width={labelWidth}
        height={labelHeight}
        rx={8}
        fill="hsl(var(--card))"
        stroke={color}
        strokeWidth={emphasized ? 1.5 : 1}
        className="transition-[stroke,stroke-width] duration-150 ease-out"
      />
      {amountLabels.map((label, index) => (
        <text
          key={label}
          x={position.x}
          y={labelTop + 14 + index * 14}
          textAnchor="middle"
          className="fill-foreground text-[11px] font-semibold"
        >
          {label}
        </text>
      ))}
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
  const [isPanning, setIsPanning] = useState(false);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [positions, setPositions] = useState<Map<string, Point>>(
    () =>
      new Map(
        graph.nodes.map((node, index) => [node.id, initialPosition(index, graph.nodes.length)]),
      ),
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const transitionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragState = useRef<{ id: string; origin: Point; position: Point } | null>(null);
  const panState = useRef<{ origin: Point; offset: Point } | null>(null);
  const pointers = useRef<Map<number, Point>>(new Map());
  const pinchState = useRef<PinchState | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLayoutLoaded(false);
    setPositions((current) => {
      const next = new Map<string, Point>();
      graph.nodes.forEach((node, index) => {
        next.set(node.id, current.get(node.id) ?? initialPosition(index, graph.nodes.length));
      });
      return next;
    });

    fetchAccountFlowLayout()
      .then((layout) => {
        if (cancelled) return;
        const next = new Map<string, Point>();
        graph.nodes.forEach((node, index) => {
          next.set(
            node.id,
            layout.positions[node.id] ??
              positions.get(node.id) ??
              initialPosition(index, graph.nodes.length),
          );
        });
        setPositions(next);
        const fitView = getFitView(graph.nodes, next);
        setScale(fitView.scale);
        setOffset(fitView.offset);
      })
      .catch(() => {
        if (cancelled) return;
        const fitView = getFitView(graph.nodes, positions);
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
      }).catch(() => undefined);
    }, 400);

    return () => {
      if (layoutSaveTimeout.current) clearTimeout(layoutSaveTimeout.current);
    };
  }, [layoutLoaded, positions]);

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

  const edgeGeometry = useMemo(() => {
    const result = new Map<string, { path: string; label: Point }>();
    graph.edges.forEach((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      if (!source || !target) return;
      const lane = edgeLanes.get(edge.id) ?? 0;
      const waypoints = connectionWaypoints(source, target, lane);
      const mid = waypoints[Math.floor(waypoints.length / 2) - 1];
      const midNext = waypoints[Math.floor(waypoints.length / 2)];
      result.set(edge.id, {
        path: roundedPath(waypoints, CORNER_RADIUS),
        label: { x: (mid.x + midNext.x) / 2, y: (mid.y + midNext.y) / 2 },
      });
    });
    return result;
  }, [graph.edges, positions, edgeLanes]);

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

  const orderedNodes = useMemo(() => {
    // Render the hovered/dragged card last so it visually sits above its neighbours.
    const raised = draggingNodeId ?? hoveredNodeId;
    if (!raised) return graph.nodes;
    const rest = graph.nodes.filter((node) => node.id !== raised);
    const front = graph.nodes.find((node) => node.id === raised);
    return front ? [...rest, front] : graph.nodes;
  }, [graph.nodes, draggingNodeId, hoveredNodeId]);

  const applyWithTransition = useCallback((next: () => void) => {
    if (transitionTimeout.current) clearTimeout(transitionTimeout.current);
    setSmoothTransition(true);
    next();
    transitionTimeout.current = setTimeout(() => setSmoothTransition(false), TRANSITION_MS);
  }, []);

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
      const nextScale = clamp(scale + delta, MIN_SCALE, MAX_SCALE);
      const localX = (anchorSvg.x - offset.x) / scale;
      const localY = (anchorSvg.y - offset.y) / scale;
      applyWithTransition(() => {
        setScale(nextScale);
        setOffset({ x: anchorSvg.x - nextScale * localX, y: anchorSvg.y - nextScale * localY });
      });
    },
    [applyWithTransition, offset, scale],
  );

  const resetView = useCallback(() => {
    const nextPositions = new Map(
      graph.nodes.map((node, index) => [node.id, initialPosition(index, graph.nodes.length)]),
    );
    const fitView = getFitView(graph.nodes, nextPositions);
    applyWithTransition(() => {
      setScale(fitView.scale);
      setOffset(fitView.offset);
      setPositions(nextPositions);
    });
    setSelectedEdgeId(null);
  }, [applyWithTransition, graph.nodes]);

  const centerView = useCallback(() => {
    applyWithTransition(() => {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    });
  }, [applyWithTransition]);

  const endGesture = useCallback((pointerId: number) => {
    pointers.current.delete(pointerId);
    if (pointers.current.size < 2) pinchState.current = null;
    if (pointers.current.size === 0) {
      dragState.current = null;
      panState.current = null;
      setDraggingNodeId(null);
      setIsPanning(false);
    }
  }, []);

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    if (transitionTimeout.current) {
      clearTimeout(transitionTimeout.current);
      setSmoothTransition(false);
    }
    const anchorSvg = clientToSvgPoint(svg, event.clientX, event.clientY);
    const nextScale = clamp(scale * Math.exp(-event.deltaY * 0.0018), MIN_SCALE, MAX_SCALE);
    const localX = (anchorSvg.x - offset.x) / scale;
    const localY = (anchorSvg.y - offset.y) / scale;
    setScale(nextScale);
    setOffset({ x: anchorSvg.x - nextScale * localX, y: anchorSvg.y - nextScale * localY });
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
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
    endGesture(event.pointerId);
  };

  const handleCanvasDoubleClick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    resetView();
  };

  const handleContainerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <div
      className="min-h-[760px] overflow-hidden rounded-panel border border-border bg-card"
      onKeyDown={handleContainerKeyDown}
      tabIndex={-1}
    >
      <div className="relative min-h-[760px] overflow-hidden bg-[#fafbfc] dark:bg-[#17191d]">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2 backdrop-blur">
          <Waypoints className="size-4 text-[#54a0ff]" />
          <span className="text-xs text-muted-foreground">
            {graph.nodes.length} Konten · {graph.edges.length} Geldflüsse
          </span>
        </div>
        <div className="absolute bottom-4 right-4 z-10 flex gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur">
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
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Ansicht zurücksetzen"
            title="Ansicht zurücksetzen"
            onClick={resetView}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn(
            "h-full min-h-[760px] w-full touch-none select-none",
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
            {graph.edges.map((edge) => {
              const geometry = edgeGeometry.get(edge.id);
              if (!geometry) return null;
              const selected = edge.id === selectedEdgeId;
              const hovered = edge.id === hoveredEdgeId;
              const connected = connectedEdgeIds ? connectedEdgeIds.has(edge.id) : true;
              const emphasized = selected || hovered || (connectedEdgeIds !== null && connected);
              const color = selected
                ? COLOR_ACTIVE
                : hovered || connected
                  ? COLOR_HOVER
                  : COLOR_DEFAULT;
              const dimmedByHover = connectedEdgeIds !== null && !connected;

              return (
                <g key={edge.id}>
                  <path
                    d={geometry.path}
                    fill="none"
                    stroke={color}
                    strokeOpacity={dimmedByHover ? 0.1 : emphasized ? 0.65 : 0.35}
                    strokeWidth={selected ? 2.5 : 2}
                    strokeLinecap="round"
                    className="transition-[stroke,stroke-opacity,stroke-width] duration-150 ease-out"
                    onClick={() => setSelectedEdgeId(edge.id)}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() =>
                      setHoveredEdgeId((current) => (current === edge.id ? null : current))
                    }
                  />
                </g>
              );
            })}
            {orderedNodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const dimmedByAccount = activeAccountIban !== "all" && activeAccountIban !== node.id;
              const dimmedByHover = connectedNodeIds !== null && !connectedNodeIds.has(node.id);
              return (
                <AccountCard
                  key={node.id}
                  node={node}
                  position={position}
                  active={activeAccountIban !== "all" && activeAccountIban === node.id}
                  dimmed={dimmedByAccount || dimmedByHover}
                  dragging={draggingNodeId === node.id}
                  hovered={hoveredNodeId === node.id}
                  onSelect={() => setSelectedEdgeId(null)}
                  onPointerEnter={() => setHoveredNodeId(node.id)}
                  onPointerLeave={() =>
                    setHoveredNodeId((current) => (current === node.id ? null : current))
                  }
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
            {graph.edges.map((edge) => {
              const geometry = edgeGeometry.get(edge.id);
              if (!geometry) return null;
              const selected = edge.id === selectedEdgeId;
              const hovered = edge.id === hoveredEdgeId;
              const connected = connectedEdgeIds ? connectedEdgeIds.has(edge.id) : true;
              const emphasized = selected || hovered || (connectedEdgeIds !== null && connected);
              const color = selected
                ? COLOR_ACTIVE
                : hovered || connected
                  ? COLOR_HOVER
                  : COLOR_DEFAULT;
              const dimmedByHover = connectedEdgeIds !== null && !connected;

              return (
                <g
                  key={`${edge.id}-label`}
                  className="transition-opacity duration-150 ease-out"
                  style={{ opacity: dimmedByHover ? 0.25 : 1 }}
                >
                  <EdgeLabel
                    edge={edge}
                    position={geometry.label}
                    color={color}
                    emphasized={emphasized}
                    onSelect={() => setSelectedEdgeId(edge.id)}
                    onPointerEnter={() => setHoveredEdgeId(edge.id)}
                    onPointerLeave={() =>
                      setHoveredEdgeId((current) => (current === edge.id ? null : current))
                    }
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

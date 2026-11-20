'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  PenLine,
  Ruler,
  Scissors,
  Sofa,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  computeSnappedPoint2D,
  distance2D,
  getPropertyBounds,
  getWallGeometry,
  projectPointToSegment,
  type SnapResult2D,
} from '@/lib/geometry';
import { metersToCm, radToDeg, snapMeters } from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type {
  FixedFixture,
  FurnitureAsset,
  Point2D,
  Property,
  WallSegment,
} from '@/types/planner';
import { FloorplanUploadModal } from './FloorplanUploadModal';
import { ScaleCalibrationModal } from './ScaleCalibrationModal';

type Tool2D = 'select' | 'draw_wall' | 'split_wall' | 'calibrate';

interface FloorplanEditor2DProps {
  property: Property;
  catalog: FurnitureAsset[];
}

interface ViewTransform {
  centerX: number;
  centerZ: number;
  pxPerMeter: number;
}

type DragOperation =
  | { kind: 'none' }
  | {
      kind: 'pan';
      startClientX: number;
      startClientY: number;
      originCenterX: number;
      originCenterZ: number;
    }
  | {
      kind: 'vertex';
      vertexId: string;
      mergeTargetId?: string;
    }
  | {
      kind: 'fixture_move';
      fixtureId: string;
      offsetX: number;
      offsetZ: number;
    }
  | {
      kind: 'fixture_resize';
      fixtureId: string;
      cornerSx: -1 | 1;
      cornerSz: -1 | 1;
      rotationY: number;
      anchorWorldX: number;
      anchorWorldZ: number;
    };

export function FloorplanEditor2D({ property, catalog }: FloorplanEditor2DProps) {
  const selectedEntity = usePlannerStore((s) => s.selectedEntity);
  const setSelectedEntity = usePlannerStore((s) => s.setSelectedEntity);
  const moveWallVertex = usePlannerStore((s) => s.moveWallVertex);
  const mergeWallVertex = usePlannerStore((s) => s.mergeWallVertex);
  const addWallSegment = usePlannerStore((s) => s.addWallSegment);
  const splitWallAtPoint = usePlannerStore((s) => s.splitWallAtPoint);
  const deleteWallSegment = usePlannerStore((s) => s.deleteWallSegment);
  const deleteWallVertex = usePlannerStore((s) => s.deleteWallVertex);
  const updateFixedFixture = usePlannerStore((s) => s.updateFixedFixture);
  const updateFloorplanImage = usePlannerStore((s) => s.updateFloorplanImage);
  const setFloorplanImage = usePlannerStore((s) => s.setFloorplanImage);
  const calibratePropertyScale = usePlannerStore((s) => s.calibratePropertyScale);
  const commitActiveProperty = usePlannerStore((s) => s.commitActiveProperty);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 640 });
  const [view, setView] = useState<ViewTransform>({
    centerX: 0,
    centerZ: 0,
    pxPerMeter: 75,
  });

  const [tool, setTool] = useState<Tool2D>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showFurnitureOverlay, setShowFurnitureOverlay] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // 壁追加ツールの始点・プレビュー
  const [drawStart, setDrawStart] = useState<{
    vertexId?: string;
    point: Point2D;
  } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [activeSnap, setActiveSnap] = useState<SnapResult2D | null>(null);

  // 縮尺補正ツールの状態
  const [calibPointA, setCalibPointA] = useState<Point2D | null>(null);
  const [calibPointB, setCalibPointB] = useState<Point2D | null>(null);
  const [calibModalOpen, setCalibModalOpen] = useState(false);

  // 壁分割ホバープレビュー
  const [splitHover, setSplitHover] = useState<{
    wallId: string;
    point: Point2D;
  } | null>(null);

  const dragRef = useRef<DragOperation>({ kind: 'none' });
  const fittedPropertyRef = useRef<string | null>(null);

  const verticesMap = useMemo(
    () => new Map(property.vertices.map((v) => [v.id, v])),
    [property.vertices],
  );
  const catalogMap = useMemo(
    () => new Map(catalog.map((a) => [a.id, a])),
    [catalog],
  );
  const activeLayout = useMemo(
    () =>
      property.layouts.find((l) => l.id === property.activeLayoutId) ??
      property.layouts[0],
    [property.layouts, property.activeLayoutId],
  );

  // コンテナサイズ監視
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 10 && height > 10) {
        setCanvasSize({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 全体フィット
  const fitToView = useCallback(() => {
    const bounds = getPropertyBounds(property);
    const padX = Math.max(1.2, bounds.width * 0.2);
    const padZ = Math.max(1.2, bounds.depth * 0.2);
    const spanW = bounds.width + padX * 2;
    const spanD = bounds.depth + padZ * 2;
    const pxPerMeter = Math.min(
      260,
      Math.max(
        28,
        Math.min(canvasSize.width / spanW, canvasSize.height / spanD),
      ),
    );
    setView({
      centerX: bounds.centerX,
      centerZ: bounds.centerZ,
      pxPerMeter,
    });
  }, [property, canvasSize.width, canvasSize.height]);

  // 物件切替時・間取り図反映時・縮尺確定時に自動フィット
  const fitSignature = `${property.id}__${property.floorplanImage?.dataUrl?.length ?? 0}__${property.scaleCalibration?.calibratedAt ?? ''}`;
  useEffect(() => {
    if (fittedPropertyRef.current !== fitSignature && canvasSize.width > 100) {
      fittedPropertyRef.current = fitSignature;
      fitToView();
    }
  }, [fitSignature, canvasSize.width, fitToView]);

  // 座標変換ヘルパー
  const worldToScreen = useCallback(
    (x: number, z: number) => ({
      sx: canvasSize.width / 2 + (x - view.centerX) * view.pxPerMeter,
      sy: canvasSize.height / 2 + (z - view.centerZ) * view.pxPerMeter,
    }),
    [canvasSize.width, canvasSize.height, view],
  );

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, z: 0 };
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: view.centerX + (sx - canvasSize.width / 2) / view.pxPerMeter,
        z: view.centerZ + (sy - canvasSize.height / 2) / view.pxPerMeter,
      };
    },
    [canvasSize.width, canvasSize.height, view],
  );

  // スクリーン距離に比例したスナップ閾値（ズームしても自然な吸着距離を保つ）
  const vertexSnapThreshold = Math.max(0.08, 16 / view.pxPerMeter);
  const alignSnapThreshold = Math.max(0.06, 10 / view.pxPerMeter);

  // ツール変更時の状態リセット
  const switchTool = (nextTool: Tool2D) => {
    setTool(nextTool);
    setDrawStart(null);
    setCalibPointA(null);
    setCalibPointB(null);
    setSplitHover(null);
    setActiveSnap(null);
  };

  // キーボードショートカット
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (drawStart) {
          setDrawStart(null);
          setActiveSnap(null);
        } else if (calibPointA) {
          setCalibPointA(null);
          setCalibPointB(null);
        } else if (tool !== 'select') {
          setTool('select');
        } else {
          setSelectedEntity(null);
        }
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        setDrawStart(null);
      } else if (e.key === 'w' || e.key === 'W') {
        setTool('draw_wall');
      } else if (e.key === 's' || e.key === 'S') {
        setTool('calibrate');
        setDrawStart(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEntity?.type === 'wall') {
          e.preventDefault();
          deleteWallSegment(selectedEntity.id);
        } else if (selectedEntity?.type === 'vertex') {
          e.preventDefault();
          deleteWallVertex(selectedEntity.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    drawStart,
    calibPointA,
    tool,
    selectedEntity,
    setSelectedEntity,
    deleteWallSegment,
    deleteWallVertex,
  ]);

  // グローバル pointermove / pointerup（ドラッグ操作）
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag.kind === 'none') return;

      if (drag.kind === 'pan') {
        const dxPx = e.clientX - drag.startClientX;
        const dyPx = e.clientY - drag.startClientY;
        setView((prev) => ({
          ...prev,
          centerX: drag.originCenterX - dxPx / prev.pxPerMeter,
          centerZ: drag.originCenterZ - dyPx / prev.pxPerMeter,
        }));
        return;
      }

      const raw = clientToWorld(e.clientX, e.clientY);

      if (drag.kind === 'vertex') {
        const snap = computeSnappedPoint2D(raw, property.vertices, {
          excludeVertexIds: [drag.vertexId],
          vertexThresholdMeters: vertexSnapThreshold,
          alignThresholdMeters: alignSnapThreshold,
          gridStepMeters: 0.05,
          disableSnap: !snapEnabled || e.shiftKey,
        });
        drag.mergeTargetId = snap.snappedVertexId;
        setActiveSnap(snap);
        moveWallVertex(drag.vertexId, snap.point, { persist: false });
        return;
      }

      if (drag.kind === 'fixture_move') {
        const rawX = raw.x + drag.offsetX;
        const rawZ = raw.z + drag.offsetZ;
        const useSnap = snapEnabled && !e.shiftKey;
        const nextX = useSnap ? snapMeters(rawX, 0.05) : rawX;
        const nextZ = useSnap ? snapMeters(rawZ, 0.05) : rawZ;
        const targetFix = property.fixtures.find((f) => f.id === drag.fixtureId);
        if (!targetFix) return;
        updateFixedFixture(
          drag.fixtureId,
          { position: { x: nextX, y: targetFix.position.y, z: nextZ } },
          { persist: false },
        );
        return;
      }

      if (drag.kind === 'fixture_resize') {
        const targetFix = property.fixtures.find((f) => f.id === drag.fixtureId);
        if (!targetFix) return;

        // 固定された反対角からポインタへのベクトルを、設備ローカル座標系に変換
        const dx = raw.x - drag.anchorWorldX;
        const dz = raw.z - drag.anchorWorldZ;
        const cos = Math.cos(drag.rotationY);
        const sin = Math.sin(drag.rotationY);
        const localDx = dx * cos - dz * sin;
        const localDz = dx * sin + dz * cos;

        const useSnap = snapEnabled && !e.shiftKey;
        const rawWidth = localDx * drag.cornerSx;
        const rawDepth = localDz * drag.cornerSz;
        const nextWidth = Math.max(
          0.2,
          useSnap ? snapMeters(rawWidth, 0.05) : Math.round(rawWidth * 100) / 100,
        );
        const nextDepth = Math.max(
          0.2,
          useSnap ? snapMeters(rawDepth, 0.05) : Math.round(rawDepth * 100) / 100,
        );

        // 新しい中心を反対角アンカーからローカル半分だけ進めてワールド変換
        const halfLocalX = (drag.cornerSx * nextWidth) / 2;
        const halfLocalZ = (drag.cornerSz * nextDepth) / 2;
        const nextCenterX =
          drag.anchorWorldX + halfLocalX * cos + halfLocalZ * sin;
        const nextCenterZ =
          drag.anchorWorldZ - halfLocalX * sin + halfLocalZ * cos;

        updateFixedFixture(
          drag.fixtureId,
          {
            position: {
              x: Math.round(nextCenterX * 1000) / 1000,
              y: targetFix.position.y,
              z: Math.round(nextCenterZ * 1000) / 1000,
            },
            dimensions: {
              ...targetFix.dimensions,
              width: nextWidth,
              depth: nextDepth,
            },
          },
          { persist: false },
        );
      }
    };

    const onPointerUp = () => {
      const drag = dragRef.current;
      if (drag.kind === 'none') return;

      if (drag.kind === 'vertex') {
        if (drag.mergeTargetId) {
          mergeWallVertex(drag.vertexId, drag.mergeTargetId);
        } else {
          commitActiveProperty();
        }
        setActiveSnap(null);
      } else if (drag.kind === 'fixture_move' || drag.kind === 'fixture_resize') {
        commitActiveProperty();
      }

      dragRef.current = { kind: 'none' };
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [
    clientToWorld,
    property.vertices,
    property.fixtures,
    vertexSnapThreshold,
    alignSnapThreshold,
    snapEnabled,
    moveWallVertex,
    mergeWallVertex,
    updateFixedFixture,
    commitActiveProperty,
  ]);

  // ホイールズーム（カーソル中心）
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const before = clientToWorld(e.clientX, e.clientY);

    setView((prev) => {
      const nextPpm = Math.min(360, Math.max(20, prev.pxPerMeter * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...prev, pxPerMeter: nextPpm };
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return {
        pxPerMeter: nextPpm,
        centerX: before.x - (sx - canvasSize.width / 2) / nextPpm,
        centerZ: before.z - (sy - canvasSize.height / 2) / nextPpm,
      };
    });
  };

  // 壁上ヒット判定ヘルパー
  const findWallHit = useCallback(
    (point: Point2D, thresholdMeters: number) => {
      let best: { wall: WallSegment; point: Point2D; dist: number; t: number } | null =
        null;
      for (const wall of property.walls) {
        const s = verticesMap.get(wall.startVertexId);
        const e = verticesMap.get(wall.endVertexId);
        if (!s || !e) continue;
        const proj = projectPointToSegment(point, s, e);
        if (proj.distance < thresholdMeters && (!best || proj.distance < best.dist)) {
          best = { wall, point: proj.projected, dist: proj.distance, t: proj.t };
        }
      }
      return best;
    },
    [property.walls, verticesMap],
  );

  // SVG 上のポインタ移動（プレビュー更新）
  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current.kind !== 'none') return;
    const raw = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(raw);

    if (tool === 'draw_wall' || tool === 'calibrate') {
      const snap = computeSnappedPoint2D(raw, property.vertices, {
        vertexThresholdMeters: vertexSnapThreshold,
        alignThresholdMeters: alignSnapThreshold,
        gridStepMeters: 0.05,
        disableSnap: !snapEnabled || e.shiftKey,
      });
      setActiveSnap(snap);
      setSplitHover(null);
    } else if (tool === 'split_wall') {
      const hit = findWallHit(raw, Math.max(0.18, 16 / view.pxPerMeter));
      if (hit && hit.t > 0.08 && hit.t < 0.92) {
        setSplitHover({ wallId: hit.wall.id, point: hit.point });
      } else {
        setSplitHover(null);
      }
      setActiveSnap(null);
    } else {
      setActiveSnap(null);
      setSplitHover(null);
    }
  };

  // SVG 背景・キャンバスクリック処理
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // 中ボタンまたは右クリック
    if (e.button === 1) {
      e.preventDefault();
      dragRef.current = {
        kind: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        originCenterX: view.centerX,
        originCenterZ: view.centerZ,
      };
      return;
    }

    if (e.button === 2) {
      e.preventDefault();
      if (drawStart) setDrawStart(null);
      if (calibPointA) {
        setCalibPointA(null);
        setCalibPointB(null);
      }
      return;
    }

    if (e.button !== 0) return;

    const raw = clientToWorld(e.clientX, e.clientY);

    // 1. 壁追加ツール
    if (tool === 'draw_wall') {
      const snap = computeSnappedPoint2D(raw, property.vertices, {
        vertexThresholdMeters: vertexSnapThreshold,
        alignThresholdMeters: alignSnapThreshold,
        gridStepMeters: 0.05,
        disableSnap: !snapEnabled || e.shiftKey,
      });

      let resolvedVertexId = snap.snappedVertexId;
      let resolvedPoint = snap.point;

      // 頂点に吸着しなかった場合、既存壁の途中なら自動分割して接続する
      if (!resolvedVertexId) {
        const wallHit = findWallHit(raw, Math.max(0.14, 12 / view.pxPerMeter));
        if (wallHit && wallHit.t > 0.08 && wallHit.t < 0.92) {
          const splitVId = splitWallAtPoint(wallHit.wall.id, wallHit.point);
          if (splitVId) {
            resolvedVertexId = splitVId;
            resolvedPoint = wallHit.point;
          }
        }
      }

      if (!drawStart) {
        setDrawStart({ vertexId: resolvedVertexId, point: resolvedPoint });
      } else {
        const created = addWallSegment(drawStart, {
          vertexId: resolvedVertexId,
          point: resolvedPoint,
        });
        if (created) {
          // 既存頂点へ閉じた場合は連続描画を終了、新規点なら続けて次の壁を描ける
          if (resolvedVertexId) {
            setDrawStart(null);
          } else {
            setDrawStart({
              vertexId: created.endVertexId,
              point: resolvedPoint,
            });
          }
        }
      }
      return;
    }

    // 2. 壁分割ツール
    if (tool === 'split_wall') {
      const hit = findWallHit(raw, Math.max(0.18, 16 / view.pxPerMeter));
      if (hit && hit.t > 0.08 && hit.t < 0.92) {
        splitWallAtPoint(hit.wall.id, hit.point);
      }
      return;
    }

    // 3. 縮尺補正ツール（任意の2点クリック）
    if (tool === 'calibrate') {
      const snap = computeSnappedPoint2D(raw, property.vertices, {
        vertexThresholdMeters: vertexSnapThreshold,
        alignThresholdMeters: alignSnapThreshold,
        gridStepMeters: 0.01,
        disableSnap: !snapEnabled || e.shiftKey,
      });

      if (!calibPointA) {
        setCalibPointA(snap.point);
        setCalibPointB(null);
      } else {
        if (distance2D(calibPointA, snap.point) >= 0.05) {
          setCalibPointB(snap.point);
          setCalibModalOpen(true);
        }
      }
      return;
    }

    // 4. 選択ツールで空白ドラッグ → パン＆選択解除
    setSelectedEntity(null);
    dragRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      originCenterX: view.centerX,
      originCenterZ: view.centerZ,
    };
  };

  // 壁クリック
  const handleWallPointerDown = (
    e: React.PointerEvent,
    wall: WallSegment,
  ) => {
    if (e.button !== 0) return;

    if (tool === 'calibrate') {
      e.stopPropagation();
      const s = verticesMap.get(wall.startVertexId);
      const end = verticesMap.get(wall.endVertexId);
      if (s && end) {
        setCalibPointA({ x: s.x, z: s.z });
        setCalibPointB({ x: end.x, z: end.z });
        setCalibModalOpen(true);
      }
      return;
    }

    if (tool === 'split_wall') {
      e.stopPropagation();
      const raw = clientToWorld(e.clientX, e.clientY);
      splitWallAtPoint(wall.id, raw);
      return;
    }

    if (tool === 'select') {
      e.stopPropagation();
      setSelectedEntity({ type: 'wall', id: wall.id });
    }
  };

  // 頂点ドラッグ開始
  const handleVertexPointerDown = (
    e: React.PointerEvent,
    vertexId: string,
  ) => {
    if (e.button !== 0) return;
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedEntity({ type: 'vertex', id: vertexId });
    dragRef.current = { kind: 'vertex', vertexId };
  };

  // 固定設備クリック・移動ドラッグ開始
  const handleFixturePointerDown = (
    e: React.PointerEvent,
    fixture: FixedFixture,
  ) => {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    setSelectedEntity({ type: 'fixture', id: fixture.id });

    if (fixture.locked) return;
    const raw = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'fixture_move',
      fixtureId: fixture.id,
      offsetX: fixture.position.x - raw.x,
      offsetZ: fixture.position.z - raw.z,
    };
  };

  // 固定設備リサイズハンドルドラッグ開始
  const handleFixtureResizePointerDown = (
    e: React.PointerEvent,
    fixture: FixedFixture,
    cornerSx: -1 | 1,
    cornerSz: -1 | 1,
  ) => {
    if (e.button !== 0 || fixture.locked) return;
    e.stopPropagation();

    const cos = Math.cos(fixture.rotationY);
    const sin = Math.sin(fixture.rotationY);
    // 反対角のローカル座標 → ワールド座標アンカー
    const oppLocalX = (-cornerSx * fixture.dimensions.width) / 2;
    const oppLocalZ = (-cornerSz * fixture.dimensions.depth) / 2;
    const anchorWorldX =
      fixture.position.x + oppLocalX * cos + oppLocalZ * sin;
    const anchorWorldZ =
      fixture.position.z - oppLocalX * sin + oppLocalZ * cos;

    dragRef.current = {
      kind: 'fixture_resize',
      fixtureId: fixture.id,
      cornerSx,
      cornerSz,
      rotationY: fixture.rotationY,
      anchorWorldX,
      anchorWorldZ,
    };
  };

  // グリッド線の生成（現在表示範囲のみ描画して高速化）
  const gridLines = useMemo(() => {
    const halfW = canvasSize.width / 2 / view.pxPerMeter;
    const halfD = canvasSize.height / 2 / view.pxPerMeter;
    const minX = Math.floor((view.centerX - halfW) * 2) / 2;
    const maxX = Math.ceil((view.centerX + halfW) * 2) / 2;
    const minZ = Math.floor((view.centerZ - halfD) * 2) / 2;
    const maxZ = Math.ceil((view.centerZ + halfD) * 2) / 2;

    const verticals: Array<{ x: number; major: boolean }> = [];
    const horizontals: Array<{ z: number; major: boolean }> = [];

    for (let x = minX; x <= maxX; x += 0.5) {
      verticals.push({ x, major: Math.abs(x - Math.round(x)) < 0.01 });
    }
    for (let z = minZ; z <= maxZ; z += 0.5) {
      horizontals.push({ z, major: Math.abs(z - Math.round(z)) < 0.01 });
    }
    return { verticals, horizontals };
  }, [canvasSize.width, canvasSize.height, view]);

  const bgImg = property.floorplanImage;
  const previewEndPoint = activeSnap?.point ?? cursorWorld;

  const toolButtons: Array<{
    id: Tool2D;
    label: string;
    shortcut: string;
    icon: typeof MousePointer2;
  }> = [
    { id: 'select', label: '選択・端点移動', shortcut: 'V', icon: MousePointer2 },
    { id: 'draw_wall', label: '壁を追加', shortcut: 'W', icon: PenLine },
    { id: 'split_wall', label: '壁を分割', shortcut: '', icon: Scissors },
    { id: 'calibrate', label: '縮尺補正 (cm)', shortcut: 'S', icon: Ruler },
  ];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-100 select-none">
      {/* 上部 2D ツールバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 編集ツール切替 */}
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {toolButtons.map(({ id, label, shortcut, icon: Icon }) => {
              const active = tool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchTool(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {shortcut && (
                    <span
                      className={`rounded px-1 text-[9px] ${
                        active ? 'bg-blue-500 text-blue-50' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 間取り図アップロード / AI解析 */}
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-indigo-700"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            間取り図UP / AI解析
          </button>
        </div>

        {/* 右側：背景調整・表示オプション・ズーム */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {bgImg && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
              <button
                type="button"
                onClick={() => updateFloorplanImage({ visible: !bgImg.visible })}
                title={bgImg.visible ? '背景間取り図を隠す' : '背景間取り図を表示'}
                className="flex items-center gap-1 font-medium text-slate-700 hover:text-blue-600"
              >
                {bgImg.visible ? (
                  <Eye className="h-3.5 w-3.5 text-blue-600" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                )}
                背景図
              </button>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={bgImg.opacity}
                onChange={(e) =>
                  updateFloorplanImage(
                    { opacity: Number(e.target.value) },
                    { persist: false },
                  )
                }
                onPointerUp={() => commitActiveProperty()}
                title="背景画像の不透明度"
                className="h-1.5 w-16 accent-blue-600"
              />
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('背景の間取り図画像を削除しますか？（壁と設備は残ります）')) {
                    setFloorplanImage(undefined);
                  }
                }}
                title="背景画像を削除"
                className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-medium transition ${
              snapEnabled
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Magnet className="h-3.5 w-3.5" />
            スナップ
          </button>

          <button
            type="button"
            onClick={() => setShowFurnitureOverlay(!showFurnitureOverlay)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 font-medium transition ${
              showFurnitureOverlay
                ? 'border-slate-300 bg-slate-100 text-slate-800'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Sofa className="h-3.5 w-3.5" />
            家具影
          </button>

          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() =>
                setView((v) => ({
                  ...v,
                  pxPerMeter: Math.min(360, v.pxPerMeter * 1.2),
                }))
              }
              title="拡大"
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setView((v) => ({
                  ...v,
                  pxPerMeter: Math.max(20, v.pxPerMeter / 1.2),
                }))
              }
              title="縮小"
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={fitToView}
              title="全体を表示"
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* メイン 2D SVG キャンバス */}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <svg
          width={canvasSize.width}
          height={canvasSize.height}
          onWheel={handleWheel}
          onPointerMove={handleSvgPointerMove}
          onPointerDown={handleSvgPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          className={`h-full w-full bg-[#F8FAFC] ${
            tool === 'draw_wall' || tool === 'calibrate'
              ? 'cursor-crosshair'
              : tool === 'split_wall'
                ? 'cursor-cell'
                : 'cursor-default'
          }`}
        >
          {/* 1. 50cm / 100cm 方眼グリッド */}
          <g pointerEvents="none">
            {gridLines.verticals.map(({ x, major }) => {
              const { sx } = worldToScreen(x, 0);
              return (
                <line
                  key={`gx-${x.toFixed(2)}`}
                  x1={sx}
                  y1={0}
                  x2={sx}
                  y2={canvasSize.height}
                  stroke={major ? '#CBD5E1' : '#E2E8F0'}
                  strokeWidth={major ? 1 : 0.7}
                />
              );
            })}
            {gridLines.horizontals.map(({ z, major }) => {
              const { sy } = worldToScreen(0, z);
              return (
                <line
                  key={`gz-${z.toFixed(2)}`}
                  x1={0}
                  y1={sy}
                  x2={canvasSize.width}
                  y2={sy}
                  stroke={major ? '#CBD5E1' : '#E2E8F0'}
                  strokeWidth={major ? 1 : 0.7}
                />
              );
            })}
          </g>

          {/* 2. 半透明の間取り図背景画像 */}
          {bgImg && bgImg.visible && (() => {
            const topLeft = worldToScreen(bgImg.offsetX, bgImg.offsetZ);
            const wPx = bgImg.widthPx * bgImg.metersPerPixel * view.pxPerMeter;
            const hPx = bgImg.heightPx * bgImg.metersPerPixel * view.pxPerMeter;
            return (
              <image
                href={bgImg.dataUrl}
                x={topLeft.sx}
                y={topLeft.sy}
                width={wPx}
                height={hPx}
                opacity={bgImg.opacity}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            );
          })()}

          {/* 3. 部屋エリアゾーン（存在する場合） */}
          {property.zones && (
            <g pointerEvents="none">
              {property.zones.map((zone) => {
                const points = zone.polygon
                  .map((pt) => {
                    const p = worldToScreen(pt.x, pt.z);
                    return `${p.sx},${p.sy}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={zone.id}
                    points={points}
                    fill={zone.floorColor || '#DFC9A8'}
                    fillOpacity={bgImg && bgImg.visible ? 0.16 : 0.32}
                  />
                );
              })}
            </g>
          )}

          {/* 4. 配置済み家具の参考シルエット（任意表示） */}
          {showFurnitureOverlay && activeLayout && (
            <g pointerEvents="none">
              {activeLayout.placements.map((pl) => {
                const asset = catalogMap.get(pl.assetId);
                if (!asset) return null;
                const dims = pl.dimensionsOverride ?? asset.dimensions;
                const center = worldToScreen(pl.position.x, pl.position.z);
                const wPx = dims.width * view.pxPerMeter;
                const dPx = dims.depth * view.pxPerMeter;
                const svgDeg = -radToDeg(pl.rotationY);
                return (
                  <g
                    key={pl.id}
                    transform={`translate(${center.sx}, ${center.sy}) rotate(${svgDeg})`}
                  >
                    <rect
                      x={-wPx / 2}
                      y={-dPx / 2}
                      width={wPx}
                      height={dPx}
                      rx={3}
                      fill="#3B82F6"
                      fillOpacity={0.14}
                      stroke="#3B82F6"
                      strokeOpacity={0.45}
                      strokeWidth={1.2}
                      strokeDasharray="4 3"
                    />
                    {wPx > 32 && dPx > 18 && (
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#1D4ED8"
                        fillOpacity={0.75}
                      >
                        {asset.name.slice(0, 8)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* 5. 備え付け固定設備（選択・ロック解除時の移動＆4隅リサイズ対応） */}
          <g>
            {property.fixtures.map((fix) => {
              const isSelected =
                selectedEntity?.type === 'fixture' && selectedEntity.id === fix.id;
              const center = worldToScreen(fix.position.x, fix.position.z);
              const wPx = fix.dimensions.width * view.pxPerMeter;
              const dPx = fix.dimensions.depth * view.pxPerMeter;
              const svgDeg = -radToDeg(fix.rotationY);
              const strokeColor = isSelected
                ? fix.locked
                  ? '#D97706'
                  : '#059669'
                : fix.locked
                  ? '#B45309'
                  : '#10B981';

              return (
                <g
                  key={fix.id}
                  transform={`translate(${center.sx}, ${center.sy}) rotate(${svgDeg})`}
                  onPointerDown={(e) => handleFixturePointerDown(e, fix)}
                  className={
                    tool === 'select'
                      ? fix.locked
                        ? 'cursor-pointer'
                        : 'cursor-move'
                      : 'pointer-events-none'
                  }
                >
                  <rect
                    x={-wPx / 2}
                    y={-dPx / 2}
                    width={wPx}
                    height={dPx}
                    rx={3}
                    fill={fix.locked ? '#FEF3C7' : '#D1FAE5'}
                    fillOpacity={isSelected ? 0.72 : 0.52}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 2.4 : 1.5}
                  />
                  {/* 正面方向インジケータ (+Z 側 = 下辺) */}
                  <line
                    x1={-Math.min(wPx * 0.25, 16)}
                    y1={dPx / 2 - 3}
                    x2={Math.min(wPx * 0.25, 16)}
                    y2={dPx / 2 - 3}
                    stroke={strokeColor}
                    strokeWidth={2}
                  />
                  {/* ラベル */}
                  <text
                    x={0}
                    y={-2}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="#1E293B"
                    pointerEvents="none"
                  >
                    {fix.locked ? '🔒 ' : '🔓 '}
                    {fix.label.slice(0, 10)}
                  </text>
                  <text
                    x={0}
                    y={11}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#475569"
                    pointerEvents="none"
                  >
                    {Math.round(metersToCm(fix.dimensions.width))}×
                    {Math.round(metersToCm(fix.dimensions.depth))}cm
                  </text>

                  {/* ロック解除かつ選択時：4隅リサイズハンドル */}
                  {isSelected && !fix.locked && tool === 'select' && (
                    <>
                      {(
                        [
                          [-1, -1],
                          [1, -1],
                          [1, 1],
                          [-1, 1],
                        ] as Array<[-1 | 1, -1 | 1]>
                      ).map(([sx, sz]) => (
                        <rect
                          key={`${sx}_${sz}`}
                          x={(sx * wPx) / 2 - 5}
                          y={(sz * dPx) / 2 - 5}
                          width={10}
                          height={10}
                          rx={2}
                          fill="#FFFFFF"
                          stroke="#059669"
                          strokeWidth={2}
                          className="cursor-nwse-resize"
                          onPointerDown={(e) =>
                            handleFixtureResizePointerDown(e, fix, sx, sz)
                          }
                        />
                      ))}
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* 6. 壁線分・建具（ドア/引き戸/窓）・長さラベル(cm) */}
          <g>
            {property.walls.map((wall) => {
              const geom = getWallGeometry(wall, verticesMap);
              if (!geom) return null;
              const p1 = worldToScreen(geom.start.x, geom.start.z);
              const p2 = worldToScreen(geom.end.x, geom.end.z);
              const isSelected =
                selectedEntity?.type === 'wall' && selectedEntity.id === wall.id;
              const strokeW = Math.max(4, wall.thickness * view.pxPerMeter);
              const lengthCm = Math.round(metersToCm(geom.length));
              const midX = (p1.sx + p2.sx) / 2;
              const midY = (p1.sy + p2.sy) / 2;
              const dx = p2.sx - p1.sx;
              const dy = p2.sy - p1.sy;
              const pxLen = Math.hypot(dx, dy);

              // 壁に沿った単位ベクトル（開口部描画用）
              const ux = pxLen > 0.1 ? dx / pxLen : 1;
              const uy = pxLen > 0.1 ? dy / pxLen : 0;

              return (
                <g key={wall.id}>
                  {/* クリックしやすくするための透明ヒットライン */}
                  <line
                    x1={p1.sx}
                    y1={p1.sy}
                    x2={p2.sx}
                    y2={p2.sy}
                    stroke="transparent"
                    strokeWidth={Math.max(18, strokeW + 10)}
                    className={
                      tool === 'calibrate'
                        ? 'cursor-pointer'
                        : tool === 'split_wall'
                          ? 'cursor-cell'
                          : 'cursor-pointer'
                    }
                    onPointerDown={(e) => handleWallPointerDown(e, wall)}
                  />

                  {/* 壁本体 */}
                  <line
                    x1={p1.sx}
                    y1={p1.sy}
                    x2={p2.sx}
                    y2={p2.sy}
                    stroke={
                      isSelected
                        ? '#2563EB'
                        : wall.kind === 'exterior'
                          ? '#0F172A'
                          : wall.kind === 'low_wall'
                            ? '#64748B'
                            : '#334155'
                    }
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />

                  {/* 建具（ドア・引き戸・窓・開口）の2D表現 */}
                  {wall.openings.map((op) => {
                    const centerOffset = op.positionRatio * pxLen;
                    const halfOpPx = Math.min(
                      pxLen * 0.45,
                      (op.width * view.pxPerMeter) / 2,
                    );
                    const ox1 = p1.sx + ux * (centerOffset - halfOpPx);
                    const oy1 = p1.sy + uy * (centerOffset - halfOpPx);
                    const ox2 = p1.sx + ux * (centerOffset + halfOpPx);
                    const oy2 = p1.sy + uy * (centerOffset + halfOpPx);

                    const opColor =
                      op.kind === 'window'
                        ? '#0EA5E9'
                        : op.kind === 'door'
                          ? '#D97706'
                          : op.kind === 'sliding_door'
                            ? '#8B5CF6'
                            : '#94A3B8';

                    return (
                      <g key={op.id} pointerEvents="none">
                        {/* 壁を切り抜く白ライン */}
                        <line
                          x1={ox1}
                          y1={oy1}
                          x2={ox2}
                          y2={oy2}
                          stroke="#FFFFFF"
                          strokeWidth={strokeW + 1.5}
                        />
                        {/* 建具シンボル線 */}
                        <line
                          x1={ox1}
                          y1={oy1}
                          x2={ox2}
                          y2={oy2}
                          stroke={opColor}
                          strokeWidth={Math.max(2.5, strokeW * 0.45)}
                          strokeDasharray={op.kind === 'opening' ? '4 3' : undefined}
                        />
                      </g>
                    );
                  })}

                  {/* 壁の長さラベル (cm) */}
                  {pxLen >= 46 && (
                    <g pointerEvents="none">
                      <rect
                        x={midX - 24}
                        y={midY - 9}
                        width={48}
                        height={17}
                        rx={4}
                        fill={isSelected ? '#2563EB' : '#FFFFFF'}
                        fillOpacity={0.92}
                        stroke={isSelected ? '#1D4ED8' : '#CBD5E1'}
                        strokeWidth={1}
                      />
                      <text
                        x={midX}
                        y={midY + 3}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill={isSelected ? '#FFFFFF' : '#334155'}
                      >
                        {lengthCm}cm
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* 7. 水平・垂直アライン補助ガイドライン */}
          {activeSnap && (
            <g pointerEvents="none">
              {activeSnap.alignX !== undefined && (
                <line
                  x1={worldToScreen(activeSnap.alignX, 0).sx}
                  y1={0}
                  x2={worldToScreen(activeSnap.alignX, 0).sx}
                  y2={canvasSize.height}
                  stroke="#06B6D4"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                />
              )}
              {activeSnap.alignZ !== undefined && (
                <line
                  x1={0}
                  y1={worldToScreen(0, activeSnap.alignZ).sy}
                  x2={canvasSize.width}
                  y2={worldToScreen(0, activeSnap.alignZ).sy}
                  stroke="#06B6D4"
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                />
              )}
            </g>
          )}

          {/* 8. 壁の端点（頂点ドラッグハンドル） */}
          <g>
            {property.vertices.map((v) => {
              const { sx, sy } = worldToScreen(v.x, v.z);
              const isSelected =
                selectedEntity?.type === 'vertex' && selectedEntity.id === v.id;
              const isSnapTarget = activeSnap?.snappedVertexId === v.id;
              const isMergePreview =
                dragRef.current.kind === 'vertex' &&
                dragRef.current.mergeTargetId === v.id;

              return (
                <g key={v.id}>
                  {(isSnapTarget || isMergePreview) && (
                    <circle
                      cx={sx}
                      cy={sy}
                      r={13}
                      fill={isMergePreview ? '#EF4444' : '#3B82F6'}
                      fillOpacity={0.2}
                      stroke={isMergePreview ? '#EF4444' : '#2563EB'}
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    cx={sx}
                    cy={sy}
                    r={isSelected ? 7.5 : 6}
                    fill={isSelected ? '#1D4ED8' : '#2563EB'}
                    stroke="#FFFFFF"
                    strokeWidth={2.2}
                    className={
                      tool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
                    }
                    onPointerDown={(e) => handleVertexPointerDown(e, v.id)}
                  />
                </g>
              );
            })}
          </g>

          {/* 9. 壁追加ツールのリアルタイムプレビュー */}
          {tool === 'draw_wall' && drawStart && previewEndPoint && (() => {
            const p1 = worldToScreen(drawStart.point.x, drawStart.point.z);
            const p2 = worldToScreen(previewEndPoint.x, previewEndPoint.z);
            const lenCm = Math.round(
              metersToCm(distance2D(drawStart.point, previewEndPoint)),
            );
            return (
              <g pointerEvents="none">
                <line
                  x1={p1.sx}
                  y1={p1.sy}
                  x2={p2.sx}
                  y2={p2.sy}
                  stroke="#2563EB"
                  strokeWidth={4}
                  strokeDasharray="6 4"
                />
                <circle cx={p1.sx} cy={p1.sy} r={6} fill="#2563EB" />
                <circle cx={p2.sx} cy={p2.sy} r={6} fill="#3B82F6" fillOpacity={0.6} />
                {lenCm >= 5 && (
                  <g>
                    <rect
                      x={(p1.sx + p2.sx) / 2 - 28}
                      y={(p1.sy + p2.sy) / 2 - 12}
                      width={56}
                      height={20}
                      rx={5}
                      fill="#1D4ED8"
                    />
                    <text
                      x={(p1.sx + p2.sx) / 2}
                      y={(p1.sy + p2.sy) / 2 + 2}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill="#FFFFFF"
                    >
                      {lenCm}cm
                    </text>
                  </g>
                )}
              </g>
            );
          })()}

          {/* 10. 壁分割ホバー点プレビュー */}
          {tool === 'split_wall' && splitHover && (() => {
            const p = worldToScreen(splitHover.point.x, splitHover.point.z);
            return (
              <g pointerEvents="none">
                <circle
                  cx={p.sx}
                  cy={p.sy}
                  r={8}
                  fill="#F59E0B"
                  fillOpacity={0.35}
                  stroke="#D97706"
                  strokeWidth={2}
                />
              </g>
            );
          })()}

          {/* 11. 縮尺補正ツールの計測ライン */}
          {tool === 'calibrate' && calibPointA && (() => {
            const endPt = calibPointB ?? previewEndPoint;
            const p1 = worldToScreen(calibPointA.x, calibPointA.z);
            if (!endPt) {
              return (
                <circle
                  cx={p1.sx}
                  cy={p1.sy}
                  r={7}
                  fill="#D97706"
                  stroke="#FFFFFF"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            }
            const p2 = worldToScreen(endPt.x, endPt.z);
            const distCm = Math.round(metersToCm(distance2D(calibPointA, endPt)));
            return (
              <g pointerEvents="none">
                <line
                  x1={p1.sx}
                  y1={p1.sy}
                  x2={p2.sx}
                  y2={p2.sy}
                  stroke="#D97706"
                  strokeWidth={3}
                  strokeDasharray="6 3"
                />
                <circle cx={p1.sx} cy={p1.sy} r={6} fill="#D97706" stroke="#FFFFFF" strokeWidth={2} />
                <circle cx={p2.sx} cy={p2.sy} r={6} fill="#D97706" stroke="#FFFFFF" strokeWidth={2} />
                <rect
                  x={(p1.sx + p2.sx) / 2 - 30}
                  y={(p1.sy + p2.sy) / 2 - 12}
                  width={60}
                  height={20}
                  rx={5}
                  fill="#D97706"
                />
                <text
                  x={(p1.sx + p2.sx) / 2}
                  y={(p1.sy + p2.sy) / 2 + 2}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="#FFFFFF"
                >
                  {distCm}cm
                </text>
              </g>
            );
          })()}
        </svg>

        {/* 左下：現在ツール別の操作ガイド */}
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xl rounded-lg border border-slate-200/90 bg-white/92 px-3 py-1.5 text-[11px] text-slate-600 shadow-xs backdrop-blur">
          {tool === 'select' && (
            <span>
              <strong className="text-slate-800">選択・端点編集:</strong>{' '}
              青丸（壁端点）をドラッグして移動（他頂点に重ねると結合） ／ 壁クリックで建具追加・削除 ／ 固定設備はロック解除で移動＆角リサイズ可 ／ Shiftでスナップ一時解除
            </span>
          )}
          {tool === 'draw_wall' && (
            <span>
              <strong className="text-blue-700">壁を追加:</strong>{' '}
              {drawStart
                ? '終点をクリックして壁を確定（右クリック または Esc で連続描画を終了）'
                : '始点をクリック（既存頂点や壁の途中にもスナップします）'}
            </span>
          )}
          {tool === 'split_wall' && (
            <span>
              <strong className="text-amber-700">壁を分割:</strong>{' '}
              既存の壁の上をクリックすると、その位置に新しい頂点を追加して2本に分割します
            </span>
          )}
          {tool === 'calibrate' && (
            <span>
              <strong className="text-amber-700">縮尺補正 (cm):</strong>{' '}
              基準にしたい<strong>壁を1本クリック</strong>、または背景上の<strong>2点をクリック</strong>して実寸(cm)を入力します
            </span>
          )}
        </div>

        {/* 右下：凡例 ＆ 縮尺状態 */}
        <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 rounded-lg border border-slate-200/90 bg-white/92 px-3 py-1.5 text-[11px] text-slate-600 shadow-xs backdrop-blur">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-xs bg-amber-500" />
            ドア
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-xs bg-violet-500" />
            引き戸
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded-xs bg-sky-500" />
            窓
          </span>
          <span className="flex items-center gap-1 text-amber-700">
            <Lock className="h-3 w-3" />
            設備ロック
          </span>
          {property.scaleCalibration && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
              縮尺補正済 ({Math.round(metersToCm(property.scaleCalibration.actualDistanceMeters))}cm基準)
            </span>
          )}
        </div>
      </div>

      {/* モーダル群 */}
      <FloorplanUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
      />

      <ScaleCalibrationModal
        open={calibModalOpen}
        pointA={calibPointA}
        pointB={calibPointB}
        onClose={() => {
          setCalibModalOpen(false);
          setCalibPointA(null);
          setCalibPointB(null);
        }}
        onConfirm={(actualMeters) => {
          if (calibPointA && calibPointB) {
            calibratePropertyScale(calibPointA, calibPointB, actualMeters);
            setTool('select');
          }
        }}
      />
    </div>
  );
}

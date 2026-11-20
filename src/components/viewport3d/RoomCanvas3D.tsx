'use client';

import { useEffect, useMemo } from 'react';
import { Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  Compass,
  Eye,
  Grid3X3,
  Layers,
  Magnet,
  RotateCcw,
  Square,
  User,
} from 'lucide-react';
import { getPropertyBounds } from '@/lib/geometry';
import { degToRad } from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { CameraViewMode, FurnitureAsset, Property } from '@/types/planner';
import { CameraController } from './CameraController';
import { FixedFixtureMesh } from './FixedFixtureMesh';
import { PlacedFurnitureItem } from './PlacedFurnitureItem';
import { RoomStructure3D } from './RoomStructure3D';

interface RoomCanvas3DProps {
  property: Property;
  catalog: FurnitureAsset[];
}

export function RoomCanvas3D({ property, catalog }: RoomCanvas3DProps) {
  const cameraViewMode = usePlannerStore((s) => s.cameraViewMode);
  const showCeiling = usePlannerStore((s) => s.showCeiling);
  const showGrid = usePlannerStore((s) => s.showGrid);
  const snapMoveCm = usePlannerStore((s) => s.snapMoveCm);
  const snapAngle90 = usePlannerStore((s) => s.snapAngle90);
  const selectedEntity = usePlannerStore((s) => s.selectedEntity);

  const setCameraViewMode = usePlannerStore((s) => s.setCameraViewMode);
  const setShowCeiling = usePlannerStore((s) => s.setShowCeiling);
  const setShowGrid = usePlannerStore((s) => s.setShowGrid);
  const setSnapMoveCm = usePlannerStore((s) => s.setSnapMoveCm);
  const setSnapAngle90 = usePlannerStore((s) => s.setSnapAngle90);
  const setSelectedEntity = usePlannerStore((s) => s.setSelectedEntity);
  const triggerCameraReset = usePlannerStore((s) => s.triggerCameraReset);
  const updatePlacedFurniture = usePlannerStore((s) => s.updatePlacedFurniture);
  const removePlacedFurniture = usePlannerStore((s) => s.removePlacedFurniture);

  const bounds = useMemo(() => getPropertyBounds(property), [property]);

  const activeLayout = useMemo(
    () =>
      property.layouts.find((l) => l.id === property.activeLayoutId) ??
      property.layouts[0],
    [property.layouts, property.activeLayoutId],
  );

  const catalogMap = useMemo(
    () => new Map(catalog.map((asset) => [asset.id, asset])),
    [catalog],
  );

  // 便利なキーボードショートカット（R: 90度回転、Delete/Backspace: 選択家具削除、Esc: 選択解除）
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
        setSelectedEntity(null);
        return;
      }

      if (selectedEntity?.type === 'furniture' && activeLayout) {
        const placement = activeLayout.placements.find(
          (p) => p.id === selectedEntity.id,
        );
        if (!placement) return;

        if ((e.key === 'r' || e.key === 'R') && !placement.locked) {
          e.preventDefault();
          const delta = e.shiftKey ? -degToRad(90) : degToRad(90);
          updatePlacedFurniture(placement.id, {
            rotationY: placement.rotationY + delta,
          });
        } else if (
          (e.key === 'Delete' || e.key === 'Backspace') &&
          !placement.locked
        ) {
          e.preventDefault();
          removePlacedFurniture(placement.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedEntity,
    activeLayout,
    setSelectedEntity,
    updatePlacedFurniture,
    removePlacedFurniture,
  ]);

  const viewButtons: Array<{
    mode: CameraViewMode;
    label: string;
    icon: typeof Eye;
  }> = [
    { mode: 'perspective', label: '斜め俯瞰', icon: Eye },
    { mode: 'top', label: '真上2D', icon: Square },
    { mode: 'first_person', label: '一人称', icon: User },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 select-none">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 46, near: 0.08, far: 120, position: [6, 7, 7] }}
        onPointerMissed={() => setSelectedEntity(null)}
      >
        <color attach="background" args={['#E8EEF5']} />

        {/* ライティング */}
        <ambientLight intensity={0.62} />
        <hemisphereLight args={['#FFFFFF', '#CBD5E1', 0.45]} />
        <directionalLight
          position={[8, 14, 9]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[-6, 8, -7]} intensity={0.35} />

        {/* 1m / 50cm グリッド */}
        {showGrid && (
          <Grid
            position={[bounds.centerX, 0.004, bounds.centerZ]}
            args={[24, 24]}
            cellSize={0.5}
            cellThickness={0.6}
            cellColor="#94A3B8"
            sectionSize={1}
            sectionThickness={1.1}
            sectionColor="#64748B"
            fadeDistance={26}
            fadeStrength={1.2}
          />
        )}

        {/* 間取り（壁・床・開口部・天井） */}
        <RoomStructure3D
          property={property}
          showCeiling={showCeiling}
          onFloorPointerDown={() => setSelectedEntity(null)}
        />

        {/* 備え付け固定設備 */}
        {property.fixtures.map((fixture) => (
          <FixedFixtureMesh
            key={fixture.id}
            fixture={fixture}
            isSelected={
              selectedEntity?.type === 'fixture' && selectedEntity.id === fixture.id
            }
          />
        ))}

        {/* 配置済み家具 */}
        {activeLayout?.placements.map((placement) => {
          const asset = catalogMap.get(placement.assetId);
          if (!asset) return null;
          return (
            <PlacedFurnitureItem
              key={placement.id}
              placement={placement}
              asset={asset}
              isSelected={
                selectedEntity?.type === 'furniture' &&
                selectedEntity.id === placement.id
              }
            />
          );
        })}

        <CameraController bounds={bounds} />
      </Canvas>

      {/* 上部フローティングバー：視点切替・表示オプション */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-sm backdrop-blur">
          {viewButtons.map(({ mode, label, icon: Icon }) => {
            const active = cameraViewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setCameraViewMode(mode)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
          <div className="mx-1 h-5 w-px bg-slate-200" />
          <button
            type="button"
            onClick={triggerCameraReset}
            title="視点を初期位置に戻す"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            視点リセット
          </button>
        </div>

        {/* 表示・スナップ設定 */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => setShowCeiling(!showCeiling)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              showCeiling
                ? 'bg-slate-800 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            天井: {showCeiling ? '表示' : '非表示'}
          </button>

          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              showGrid
                ? 'bg-slate-100 text-slate-800'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            グリッド
          </button>

          <div className="h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setSnapMoveCm(snapMoveCm > 0 ? 0 : 5)}
            title="ドラッグ移動時の5cm刻みスナップ切替"
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              snapMoveCm > 0
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Magnet className="h-3.5 w-3.5" />
            {snapMoveCm > 0 ? `移動 ${snapMoveCm}cm` : '自由移動'}
          </button>

          <button
            type="button"
            onClick={() => setSnapAngle90(!snapAngle90)}
            title="回転ハンドル操作時の90度スナップ切替"
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              snapAngle90
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            {snapAngle90 ? '90°スナップ' : '自由回転'}
          </button>
        </div>
      </div>

      {/* 左下操作ヒント */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-xs backdrop-blur">
        {cameraViewMode === 'first_person' ? (
          <span>
            <strong className="text-slate-800">一人称操作:</strong>{' '}
            左ドラッグで見渡す ／ W・A・S・D または矢印キーで移動
          </span>
        ) : (
          <span>
            <strong className="text-slate-800">操作ガイド:</strong>{' '}
            家具ドラッグで移動 ／ 青ノブで回転 ／{' '}
            <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
              R
            </kbd>{' '}
            90°回転 ／{' '}
            <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px]">
              Shift
            </kbd>{' '}
            スナップ一時解除 ／ 右ドラッグでカメラ移動
          </span>
        )}
      </div>

      {/* 右下：部屋概算サイズ表示 */}
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] text-slate-600 shadow-xs backdrop-blur">
        間取り外寸: 約 {Math.round(bounds.width * 100)} × {Math.round(bounds.depth * 100)} cm ／ 天井高{' '}
        {Math.round(property.defaultCeilingHeight * 100)} cm
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Copy,
  DoorOpen,
  Info,
  Lock,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Trash2,
  Unlock,
} from 'lucide-react';
import { ScaleCalibrationModal } from '@/components/editor2d/ScaleCalibrationModal';
import { distance2D } from '@/lib/geometry';
import {
  cmToMeters,
  degToRad,
  FIXTURE_KIND_LABELS,
  formatDimensionsCm,
  FURNITURE_CATEGORY_LABELS,
  metersToCm,
  radToDeg,
  WALL_KIND_LABELS,
  WALL_OPENING_KIND_LABELS,
} from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { Point2D, WallOpeningKind, WallSegment } from '@/types/planner';

function CmNumberField({
  label,
  valueMeters,
  onChangeMeters,
  disabled = false,
  minCm,
  maxCm,
  stepCm = 1,
}: {
  label: string;
  valueMeters: number;
  onChangeMeters: (meters: number) => void;
  disabled?: boolean;
  minCm?: number;
  maxCm?: number;
  stepCm?: number;
}) {
  const cmVal = metersToCm(valueMeters);
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          value={cmVal}
          min={minCm}
          max={maxCm}
          step={stepCm}
          disabled={disabled}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isFinite(parsed)) return;
            const clamped =
              minCm !== undefined ? Math.max(minCm, parsed) : parsed;
            onChangeMeters(cmToMeters(clamped));
          }}
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-7 pl-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-slate-400">
          cm
        </span>
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const properties = usePlannerStore((s) => s.properties);
  const activePropertyId = usePlannerStore((s) => s.activePropertyId);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedEntity = usePlannerStore((s) => s.selectedEntity);

  const updatePropertyMemo = usePlannerStore((s) => s.updatePropertyMemo);
  const updateDefaultCeilingHeight = usePlannerStore(
    (s) => s.updateDefaultCeilingHeight,
  );
  const updatePlacedFurniture = usePlannerStore((s) => s.updatePlacedFurniture);
  const duplicatePlacedFurniture = usePlannerStore((s) => s.duplicatePlacedFurniture);
  const removePlacedFurniture = usePlannerStore((s) => s.removePlacedFurniture);
  const toggleFixtureLock = usePlannerStore((s) => s.toggleFixtureLock);
  const updateFixedFixture = usePlannerStore((s) => s.updateFixedFixture);
  const removeFixedFixture = usePlannerStore((s) => s.removeFixedFixture);
  const updateWallSegment = usePlannerStore((s) => s.updateWallSegment);
  const deleteWallSegment = usePlannerStore((s) => s.deleteWallSegment);
  const addWallOpening = usePlannerStore((s) => s.addWallOpening);
  const updateWallOpening = usePlannerStore((s) => s.updateWallOpening);
  const deleteWallOpening = usePlannerStore((s) => s.deleteWallOpening);
  const moveWallVertex = usePlannerStore((s) => s.moveWallVertex);
  const deleteWallVertex = usePlannerStore((s) => s.deleteWallVertex);
  const calibratePropertyScale = usePlannerStore((s) => s.calibratePropertyScale);

  const [wallCalibPoints, setWallCalibPoints] = useState<{
    a: Point2D;
    b: Point2D;
  } | null>(null);
  const [newOpeningKind, setNewOpeningKind] = useState<WallOpeningKind>('door');

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) ?? properties[0];
  const activeLayout =
    activeProperty?.layouts.find((l) => l.id === activeProperty.activeLayoutId) ??
    activeProperty?.layouts[0];

  if (!activeProperty) return null;

  // 1. 配置済み家具が選択されている場合
  if (selectedEntity?.type === 'furniture' && activeLayout) {
    const placement = activeLayout.placements.find(
      (p) => p.id === selectedEntity.id,
    );
    const asset = placement
      ? catalog.find((a) => a.id === placement.assetId)
      : undefined;

    if (placement && asset) {
      const dims = placement.dimensionsOverride ?? asset.dimensions;
      const deg = Math.round(radToDeg(placement.rotationY));
      const locked = Boolean(placement.locked);

      return (
        <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3.5">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                配置家具 ・ {FURNITURE_CATEGORY_LABELS[asset.category]}
              </span>
              <span className="text-[10px] text-slate-400">
                {asset.model.kind === 'glb' ? 'GLBモデル' : 'プロシージャル'}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              {asset.thumbnailDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.thumbnailDataUrl}
                  alt={asset.name}
                  className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-slate-900">
                  {asset.name}
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  実寸: {formatDimensionsCm(dims)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3.5 space-y-4">
            {/* 回転コントロール（90度スナップボタン ＋ 自由角度スライダー） */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700">向き・回転</h3>
                <span className="text-xs font-semibold text-blue-600">{deg}°</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    updatePlacedFurniture(placement.id, {
                      rotationY: placement.rotationY - degToRad(90),
                    })
                  }
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  -90°
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    updatePlacedFurniture(placement.id, {
                      rotationY: placement.rotationY + degToRad(90),
                    })
                  }
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  +90°
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={359}
                  step={1}
                  disabled={locked}
                  value={deg}
                  onChange={(e) =>
                    updatePlacedFurniture(placement.id, {
                      rotationY: degToRad(Number(e.target.value)),
                    })
                  }
                  className="h-1.5 flex-1 accent-blue-600"
                />
                <input
                  type="number"
                  min={0}
                  max={359}
                  disabled={locked}
                  value={deg}
                  onChange={(e) =>
                    updatePlacedFurniture(placement.id, {
                      rotationY: degToRad(Number(e.target.value)),
                    })
                  }
                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-xs text-slate-800"
                />
              </div>
            </section>

            {/* 位置 (cm) */}
            <section className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-700">位置 (cm)</h3>
              <div className="grid grid-cols-3 gap-2">
                <CmNumberField
                  label="横 (X)"
                  valueMeters={placement.position.x}
                  disabled={locked}
                  onChangeMeters={(x) =>
                    updatePlacedFurniture(placement.id, {
                      position: { ...placement.position, x },
                    })
                  }
                />
                <CmNumberField
                  label="奥行 (Z)"
                  valueMeters={placement.position.z}
                  disabled={locked}
                  onChangeMeters={(z) =>
                    updatePlacedFurniture(placement.id, {
                      position: { ...placement.position, z },
                    })
                  }
                />
                <CmNumberField
                  label="床高さ (Y)"
                  valueMeters={placement.position.y}
                  minCm={0}
                  disabled={locked}
                  onChangeMeters={(y) =>
                    updatePlacedFurniture(placement.id, {
                      position: { ...placement.position, y },
                    })
                  }
                />
              </div>
            </section>

            {/* サイズ微調整（この配置のみ上書き可） */}
            <section className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700">サイズ (cm)</h3>
                {placement.dimensionsOverride && (
                  <button
                    type="button"
                    onClick={() =>
                      updatePlacedFurniture(placement.id, {
                        dimensionsOverride: undefined,
                      })
                    }
                    className="text-[10px] font-medium text-blue-600 hover:underline"
                  >
                    カタログ値に戻す
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <CmNumberField
                  label="幅 (W)"
                  valueMeters={dims.width}
                  minCm={5}
                  disabled={locked}
                  onChangeMeters={(width) =>
                    updatePlacedFurniture(placement.id, {
                      dimensionsOverride: { ...dims, width },
                    })
                  }
                />
                <CmNumberField
                  label="奥行 (D)"
                  valueMeters={dims.depth}
                  minCm={5}
                  disabled={locked}
                  onChangeMeters={(depth) =>
                    updatePlacedFurniture(placement.id, {
                      dimensionsOverride: { ...dims, depth },
                    })
                  }
                />
                <CmNumberField
                  label="高さ (H)"
                  valueMeters={dims.height}
                  minCm={1}
                  disabled={locked}
                  onChangeMeters={(height) =>
                    updatePlacedFurniture(placement.id, {
                      dimensionsOverride: { ...dims, height },
                    })
                  }
                />
              </div>
            </section>

            {/* アクション */}
            <section className="space-y-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() =>
                  updatePlacedFurniture(placement.id, { locked: !locked })
                }
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition ${
                  locked
                    ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {locked ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    位置ロックを解除
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    位置をロックする
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => duplicatePlacedFurniture(placement.id)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  複製
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => removePlacedFurniture(placement.id)}
                  className="flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  撤去
                </button>
              </div>
            </section>
          </div>
        </aside>
      );
    }
  }

  // 2. 備え付け固定設備が選択されている場合
  if (selectedEntity?.type === 'fixture') {
    const fixture = activeProperty.fixtures.find(
      (f) => f.id === selectedEntity.id,
    );
    if (fixture) {
      const deg = Math.round(radToDeg(fixture.rotationY));

      return (
        <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3.5">
          <div className="border-b border-slate-100 pb-3">
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              備え付け固定設備 ・ {FIXTURE_KIND_LABELS[fixture.kind]}
            </span>
            <h2 className="mt-1.5 text-sm font-bold text-slate-900">
              {fixture.label}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              サイズ: {formatDimensionsCm(fixture.dimensions)}
            </p>
          </div>

          {/* ロック状態カード */}
          <div
            className={`mt-3.5 rounded-xl border p-3 ${
              fixture.locked
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold ${
                  fixture.locked ? 'text-amber-900' : 'text-emerald-900'
                }`}
              >
                {fixture.locked ? '🔒 ロック中（誤操作防止）' : '🔓 ロック解除中'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              {fixture.locked
                ? '備え付け設備は既定で固定されています。位置やサイズを調整したい場合のみロックを解除してください。'
                : '3D画面上でのドラッグ移動、および下記フォームでのリサイズ・回転が可能です。'}
            </p>
            <button
              type="button"
              onClick={() => toggleFixtureLock(fixture.id)}
              className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                fixture.locked
                  ? 'bg-amber-600 text-white hover:bg-amber-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {fixture.locked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  ロックを解除して調整
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  調整完了・ロックする
                </>
              )}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                設備ラベル
              </label>
              <input
                type="text"
                disabled={fixture.locked}
                value={fixture.label}
                onChange={(e) =>
                  updateFixedFixture(fixture.id, { label: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            <section className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700">向き・回転</h3>
                <span className="text-xs font-semibold text-slate-700">{deg}°</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={fixture.locked}
                  onClick={() =>
                    updateFixedFixture(fixture.id, {
                      rotationY: fixture.rotationY - degToRad(90),
                    })
                  }
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  -90°
                </button>
                <button
                  type="button"
                  disabled={fixture.locked}
                  onClick={() =>
                    updateFixedFixture(fixture.id, {
                      rotationY: fixture.rotationY + degToRad(90),
                    })
                  }
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  +90°
                </button>
              </div>
            </section>

            <section className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-700">位置 (cm)</h3>
              <div className="grid grid-cols-3 gap-2">
                <CmNumberField
                  label="横 (X)"
                  valueMeters={fixture.position.x}
                  disabled={fixture.locked}
                  onChangeMeters={(x) =>
                    updateFixedFixture(fixture.id, {
                      position: { ...fixture.position, x },
                    })
                  }
                />
                <CmNumberField
                  label="奥行 (Z)"
                  valueMeters={fixture.position.z}
                  disabled={fixture.locked}
                  onChangeMeters={(z) =>
                    updateFixedFixture(fixture.id, {
                      position: { ...fixture.position, z },
                    })
                  }
                />
                <CmNumberField
                  label="床高さ (Y)"
                  valueMeters={fixture.position.y}
                  minCm={0}
                  disabled={fixture.locked}
                  onChangeMeters={(y) =>
                    updateFixedFixture(fixture.id, {
                      position: { ...fixture.position, y },
                    })
                  }
                />
              </div>
            </section>

            <section className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-700">サイズ (cm)</h3>
              <div className="grid grid-cols-3 gap-2">
                <CmNumberField
                  label="幅 (W)"
                  valueMeters={fixture.dimensions.width}
                  minCm={10}
                  disabled={fixture.locked}
                  onChangeMeters={(width) =>
                    updateFixedFixture(fixture.id, {
                      dimensions: { ...fixture.dimensions, width },
                    })
                  }
                />
                <CmNumberField
                  label="奥行 (D)"
                  valueMeters={fixture.dimensions.depth}
                  minCm={10}
                  disabled={fixture.locked}
                  onChangeMeters={(depth) =>
                    updateFixedFixture(fixture.id, {
                      dimensions: { ...fixture.dimensions, depth },
                    })
                  }
                />
                <CmNumberField
                  label="高さ (H)"
                  valueMeters={fixture.dimensions.height}
                  minCm={5}
                  disabled={fixture.locked}
                  onChangeMeters={(height) =>
                    updateFixedFixture(fixture.id, {
                      dimensions: { ...fixture.dimensions, height },
                    })
                  }
                />
              </div>
            </section>

            {!fixture.locked && (
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`設備「${fixture.label}」を削除しますか？`)) {
                      removeFixedFixture(fixture.id);
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  この設備を削除
                </button>
              </div>
            )}
          </div>
        </aside>
      );
    }
  }

  // 3. 壁線分が選択されている場合（2Dエディタ）
  if (selectedEntity?.type === 'wall') {
    const wall = activeProperty.walls.find((w) => w.id === selectedEntity.id);
    if (wall) {
      const startV = activeProperty.vertices.find(
        (v) => v.id === wall.startVertexId,
      );
      const endV = activeProperty.vertices.find((v) => v.id === wall.endVertexId);
      const wallLengthMeters =
        startV && endV ? distance2D(startV, endV) : 0;
      const wallKind = wall.kind ?? 'interior';

      return (
        <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3.5">
          <div className="border-b border-slate-100 pb-3">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              壁線分 ・ {WALL_KIND_LABELS[wallKind]}
            </span>
            <h2 className="mt-1.5 text-sm font-bold text-slate-900">
              壁の長さ: {Math.round(metersToCm(wallLengthMeters))} cm
            </h2>
            {startV && endV && (
              <button
                type="button"
                onClick={() =>
                  setWallCalibPoints({
                    a: { x: startV.x, z: startV.z },
                    b: { x: endV.x, z: endV.z },
                  })
                }
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                <Ruler className="h-3.5 w-3.5" />
                この壁を基準に縮尺補正 (cm)
              </button>
            )}
          </div>

          <div className="mt-3.5 space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                壁種別
              </label>
              <select
                value={wallKind}
                onChange={(e) => {
                  const nextKind = e.target.value as NonNullable<WallSegment['kind']>;
                  updateWallSegment(wall.id, {
                    kind: nextKind,
                    thickness: nextKind === 'exterior' ? 0.14 : 0.1,
                    height: nextKind === 'low_wall' ? 1.1 : undefined,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {(
                  Object.entries(WALL_KIND_LABELS) as Array<
                    [NonNullable<WallSegment['kind']>, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <CmNumberField
                label="壁の厚み"
                valueMeters={wall.thickness}
                minCm={4}
                maxCm={60}
                onChangeMeters={(thickness) =>
                  updateWallSegment(wall.id, { thickness })
                }
              />
              <CmNumberField
                label="壁の高さ"
                valueMeters={wall.height ?? activeProperty.defaultCeilingHeight}
                minCm={30}
                maxCm={450}
                onChangeMeters={(height) =>
                  updateWallSegment(wall.id, { height })
                }
              />
            </div>

            {/* 建具（ドア・引き戸・窓・開口）管理 */}
            <section className="space-y-2.5 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-xs font-bold text-slate-700">
                  <DoorOpen className="h-3.5 w-3.5 text-blue-600" />
                  ドア・窓 ({wall.openings.length})
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={newOpeningKind}
                  onChange={(e) =>
                    setNewOpeningKind(e.target.value as WallOpeningKind)
                  }
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
                >
                  {(
                    Object.entries(WALL_OPENING_KIND_LABELS) as Array<
                      [WallOpeningKind, string]
                    >
                  ).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addWallOpening(wall.id, newOpeningKind)}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3 w-3" />
                  追加
                </button>
              </div>

              {wall.openings.length > 0 && (
                <div className="space-y-2">
                  {wall.openings.map((op) => (
                    <div
                      key={op.id}
                      className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">
                          {WALL_OPENING_KIND_LABELS[op.kind]}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteWallOpening(wall.id, op.id)}
                          title="この建具を削除"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div>
                        <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-500">
                          <span>壁上の位置</span>
                          <span>{Math.round(op.positionRatio * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={0.9}
                          step={0.02}
                          value={op.positionRatio}
                          onChange={(e) =>
                            updateWallOpening(wall.id, op.id, {
                              positionRatio: Number(e.target.value),
                            })
                          }
                          className="h-1.5 w-full accent-blue-600"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <CmNumberField
                          label="幅"
                          valueMeters={op.width}
                          minCm={30}
                          onChangeMeters={(width) =>
                            updateWallOpening(wall.id, op.id, { width })
                          }
                        />
                        <CmNumberField
                          label="高さ"
                          valueMeters={op.height}
                          minCm={30}
                          onChangeMeters={(height) =>
                            updateWallOpening(wall.id, op.id, { height })
                          }
                        />
                        <CmNumberField
                          label="床から"
                          valueMeters={op.sillHeight}
                          minCm={0}
                          onChangeMeters={(sillHeight) =>
                            updateWallOpening(wall.id, op.id, { sillHeight })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => deleteWallSegment(wall.id)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                この壁を削除
              </button>
            </div>
          </div>

          <ScaleCalibrationModal
            open={wallCalibPoints !== null}
            pointA={wallCalibPoints?.a ?? null}
            pointB={wallCalibPoints?.b ?? null}
            onClose={() => setWallCalibPoints(null)}
            onConfirm={(actualMeters) => {
              if (wallCalibPoints) {
                calibratePropertyScale(
                  wallCalibPoints.a,
                  wallCalibPoints.b,
                  actualMeters,
                );
              }
            }}
          />
        </aside>
      );
    }
  }

  // 4. 壁端点（頂点）が選択されている場合（2Dエディタ）
  if (selectedEntity?.type === 'vertex') {
    const vertex = activeProperty.vertices.find(
      (v) => v.id === selectedEntity.id,
    );
    if (vertex) {
      const connectedCount = activeProperty.walls.filter(
        (w) => w.startVertexId === vertex.id || w.endVertexId === vertex.id,
      ).length;

      return (
        <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3.5">
          <div className="border-b border-slate-100 pb-3">
            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              壁の端点（頂点）
            </span>
            <h2 className="mt-1.5 text-sm font-bold text-slate-900">
              接続中の壁: {connectedCount} 本
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              2Dキャンバス上でドラッグ移動、または下の数値(cm)で微調整できます
            </p>
          </div>

          <div className="mt-3.5 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <CmNumberField
                label="横位置 (X)"
                valueMeters={vertex.x}
                onChangeMeters={(x) => moveWallVertex(vertex.id, { x, z: vertex.z })}
              />
              <CmNumberField
                label="奥行位置 (Z)"
                valueMeters={vertex.z}
                onChangeMeters={(z) => moveWallVertex(vertex.id, { x: vertex.x, z })}
              />
            </div>

            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => deleteWallVertex(vertex.id)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                この頂点と接続壁を削除
              </button>
            </div>
          </div>
        </aside>
      );
    }
  }

  // 5. 未選択時：物件概要パネル
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
        <Info className="h-4 w-4 text-blue-600" />
        物件インスペクタ
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
        <div>
          <div className="text-[10px] font-medium text-slate-500">現在の物件</div>
          <div className="text-sm font-bold text-slate-900">
            {activeProperty.name}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg bg-white p-2 text-center border border-slate-100">
            <div className="text-[10px] text-slate-500">配置済み家具</div>
            <div className="text-base font-bold text-blue-600">
              {activeLayout?.placements.length ?? 0}
              <span className="ml-0.5 text-[10px] font-normal text-slate-400">
                点
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-white p-2 text-center border border-slate-100">
            <div className="text-[10px] text-slate-500">固定設備 / 壁</div>
            <div className="text-base font-bold text-slate-700">
              {activeProperty.fixtures.length}
              <span className="mx-0.5 text-xs font-normal text-slate-400">/</span>
              {activeProperty.walls.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <CmNumberField
          label="標準天井高 (cm)"
          valueMeters={activeProperty.defaultCeilingHeight}
          minCm={180}
          maxCm={450}
          stepCm={5}
          onChangeMeters={(h) => updateDefaultCeilingHeight(h)}
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-semibold text-slate-700">
          物件メモ
        </label>
        <textarea
          rows={3}
          value={activeProperty.memo ?? ''}
          onChange={(e) => updatePropertyMemo(activeProperty.id, e.target.value)}
          placeholder="家賃・駅徒歩・日当たり・搬入経路のメモなど..."
          className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] leading-relaxed text-slate-600">
        <div className="mb-1 font-bold text-blue-900">クイックヒント</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>左の「家具を登録」から家具写真をアップロードすると、AIが種類・色を判定し対話形式で実寸(cm)登録できます。</li>
          <li>「2D 間取り編集」で間取り図AI解析・壁端点補正・縮尺確定が行え、「2D+3D 同時」でリアルタイム確認できます。</li>
          <li>ヘッダーの「JSON保存/読込」から、全物件とマイ家具カタログを丸ごとバックアップ・復元できます。</li>
        </ul>
      </div>
    </aside>
  );
}

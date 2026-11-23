'use client';

import { useMemo, useState } from 'react';
import {
  Armchair,
  Lock,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  Wrench,
} from 'lucide-react';
import {
  FIXTURE_KIND_LABELS,
  formatDimensionsCm,
  FURNITURE_CATEGORY_LABELS,
  isCustomProceduralModel,
} from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type {
  FixedFixtureKind,
  FurnitureAsset,
  FurnitureCategory,
} from '@/types/planner';
import { FurnitureRegisterModal } from '../furniture/FurnitureRegisterModal';

type SidebarTab = 'catalog' | 'scene';

export function LeftSidebar() {
  const properties = usePlannerStore((s) => s.properties);
  const activePropertyId = usePlannerStore((s) => s.activePropertyId);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedEntity = usePlannerStore((s) => s.selectedEntity);

  const placeFurnitureFromCatalog = usePlannerStore(
    (s) => s.placeFurnitureFromCatalog,
  );
  const deleteFurnitureAsset = usePlannerStore((s) => s.deleteFurnitureAsset);
  const setSelectedEntity = usePlannerStore((s) => s.setSelectedEntity);
  const removePlacedFurniture = usePlannerStore((s) => s.removePlacedFurniture);
  const toggleFixtureLock = usePlannerStore((s) => s.toggleFixtureLock);
  const addFixedFixture = usePlannerStore((s) => s.addFixedFixture);

  const [tab, setTab] = useState<SidebarTab>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FurnitureCategory | 'all'>('all');
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FurnitureAsset | null>(null);
  const [newFixtureKind, setNewFixtureKind] = useState<FixedFixtureKind>('closet');

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) ?? properties[0];
  const activeLayout =
    activeProperty?.layouts.find((l) => l.id === activeProperty.activeLayoutId) ??
    activeProperty?.layouts[0];

  const catalogMap = useMemo(
    () => new Map(catalog.map((item) => [item.id, item])),
    [catalog],
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        FURNITURE_CATEGORY_LABELS[item.category].toLowerCase().includes(q) ||
        (item.memo ?? '').toLowerCase().includes(q)
      );
    });
  }, [catalog, searchQuery, categoryFilter]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* タブ切替 */}
      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 p-1.5">
        <button
          type="button"
          onClick={() => setTab('catalog')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            tab === 'catalog'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Armchair className="h-3.5 w-3.5" />
          マイ家具 ({catalog.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('scene')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
            tab === 'scene'
              ? 'bg-white text-blue-600 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wrench className="h-3.5 w-3.5" />
          配置済・設備
        </button>
      </div>

      {tab === 'catalog' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ヘッダー説明＆新規登録ボタン */}
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                全物件で共通利用
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingAsset(null);
                  setRegisterModalOpen(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                家具を登録
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="家具名・カテゴリで検索..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-2.5 pl-8 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as FurnitureCategory | 'all')
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
              aria-label="カテゴリ絞り込み"
            >
              <option value="all">すべてのカテゴリ</option>
              {(
                Object.entries(FURNITURE_CATEGORY_LABELS) as Array<
                  [FurnitureCategory, string]
                >
              ).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* 家具カタログリスト */}
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {filteredCatalog.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                該当する家具がありません。
              </div>
            ) : (
              filteredCatalog.map((asset) => {
                const isCustom3D = isCustomProceduralModel(asset.model);
                const swatchColor =
                  asset.model.kind === 'procedural' ? asset.model.color : '#64748B';
                return (
                  <div
                    key={asset.id}
                    className="group rounded-xl border border-slate-200 bg-white p-2.5 transition hover:border-blue-300 hover:shadow-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      {asset.thumbnailDataUrl ? (
                        <div className="relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={asset.thumbnailDataUrl}
                            alt={asset.name}
                            className="h-full w-full object-cover"
                          />
                          <span
                            className="absolute right-0.5 bottom-0.5 h-2.5 w-2.5 rounded-full border border-white shadow-2xs"
                            style={{ backgroundColor: swatchColor }}
                          />
                        </div>
                      ) : (
                        <div
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 text-[10px] font-bold text-white shadow-inner"
                          style={{ backgroundColor: swatchColor }}
                          title={
                            asset.model.kind === 'glb'
                              ? 'GLB 3Dモデル'
                              : isCustom3D
                                ? 'AI画像再現3Dモデル'
                                : 'プロシージャルモデル'
                          }
                        >
                          {asset.model.kind === 'glb' ? 'GLB' : isCustom3D ? 'AI' : ''}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="truncate text-xs font-bold text-slate-800">
                            {asset.name}
                          </h3>
                          <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAsset(asset);
                                setRegisterModalOpen(true);
                              }}
                              title="家具情報・実寸・3Dモデルを編集"
                              className="rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `「${asset.name}」をマイ家具カタログから削除しますか？（各物件に配置済みの家具も同時に削除されます）`,
                                  )
                                ) {
                                  deleteFurnitureAsset(asset.id);
                                }
                              }}
                              title="カタログから削除"
                              className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                          {formatDimensionsCm(asset.dimensions)}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {FURNITURE_CATEGORY_LABELS[asset.category]}
                            </span>
                            {isCustom3D && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                AI再現
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => placeFurnitureFromCatalog(asset.id)}
                            className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-600 hover:text-white"
                          >
                            <Plus className="h-3 w-3" />
                            部屋に配置
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 space-y-4">
          {/* 配置済み家具一覧 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">
                配置済み家具 ({activeLayout?.placements.length ?? 0})
              </h3>
              <span className="text-[10px] text-slate-400">
                {activeLayout?.name}
              </span>
            </div>
            <div className="space-y-1.5">
              {!activeLayout || activeLayout.placements.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">
                  まだ家具が配置されていません
                </p>
              ) : (
                activeLayout.placements.map((pl) => {
                  const asset = catalogMap.get(pl.assetId);
                  if (!asset) return null;
                  const selected =
                    selectedEntity?.type === 'furniture' &&
                    selectedEntity.id === pl.id;
                  return (
                    <div
                      key={pl.id}
                      onClick={() =>
                        setSelectedEntity({ type: 'furniture', id: pl.id })
                      }
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50/70 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{asset.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {formatDimensionsCm(
                            pl.dimensionsOverride ?? asset.dimensions,
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlacedFurniture(pl.id);
                        }}
                        title="部屋から撤去"
                        className="ml-2 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 備え付け固定設備一覧 */}
          <section className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">
                備え付け固定設備 ({activeProperty?.fixtures.length ?? 0})
              </h3>
              <span className="text-[10px] text-amber-600">既定ロック</span>
            </div>

            <div className="space-y-1.5">
              {activeProperty?.fixtures.map((fix) => {
                const selected =
                  selectedEntity?.type === 'fixture' && selectedEntity.id === fix.id;
                return (
                  <div
                    key={fix.id}
                    onClick={() => setSelectedEntity({ type: 'fixture', id: fix.id })}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition ${
                      selected
                        ? 'border-amber-500 bg-amber-50/70 text-amber-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{fix.label}</div>
                      <div className="text-[10px] text-slate-500">
                        {formatDimensionsCm(fix.dimensions)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFixtureLock(fix.id);
                      }}
                      title={fix.locked ? 'ロック解除して編集可能にする' : 'ロックする'}
                      className={`ml-2 rounded p-1 transition ${
                        fix.locked
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {fix.locked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 固定設備の手動追加 */}
            <div className="mt-3 flex items-center gap-1.5">
              <select
                value={newFixtureKind}
                onChange={(e) =>
                  setNewFixtureKind(e.target.value as FixedFixtureKind)
                }
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700"
              >
                {(
                  Object.entries(FIXTURE_KIND_LABELS) as Array<
                    [FixedFixtureKind, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addFixedFixture(newFixtureKind)}
                className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                + 設備追加
              </button>
            </div>
          </section>
        </div>
      )}

      <FurnitureRegisterModal
        open={registerModalOpen}
        editingAsset={editingAsset}
        onClose={() => {
          setRegisterModalOpen(false);
          setEditingAsset(null);
        }}
      />
    </aside>
  );
}

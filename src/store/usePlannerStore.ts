'use client';

import { create } from 'zustand';
import {
  deleteFurnitureAssetRecord,
  deletePropertyRecord,
  loadPlannerState,
  saveActivePropertyId,
  saveAllPlannerState,
  upsertFurnitureAssetRecord,
  upsertPropertyRecord,
} from '@/lib/db';
import { getPropertyBounds, rescalePropertyByReference } from '@/lib/geometry';
import { createBlankProperty, createId, createInitialSeedData } from '@/lib/seed-data';
import { mergeImportedPlannerData } from '@/lib/storage-io';
import { FIXTURE_KIND_LABELS } from '@/lib/units';
import type {
  CameraViewMode,
  Dimensions3D,
  EditorMode,
  FixedFixture,
  FixedFixtureKind,
  FloorplanImage,
  FurnitureAsset,
  FurnitureCategory,
  FurnitureModelSpec,
  LayoutVariant,
  PlacedFurniture,
  PlannerExportPayload,
  Point2D,
  Point3D,
  Property,
  SelectedEntity,
  WallOpening,
  WallOpeningKind,
  WallSegment,
  WallVertex,
} from '@/types/planner';

export interface CreateFurnitureAssetInput {
  name: string;
  category: FurnitureCategory;
  dimensions: Dimensions3D;
  model: FurnitureModelSpec;
  thumbnailDataUrl?: string;
  memo?: string;
}

interface PlannerStoreState {
  hydrated: boolean;
  properties: Property[];
  catalog: FurnitureAsset[];
  activePropertyId: string | null;

  // 一時的な UI / ビュー状態（IndexedDB 保存対象外）
  editorMode: EditorMode;
  cameraViewMode: CameraViewMode;
  showCeiling: boolean;
  showGrid: boolean;
  snapMoveCm: number;
  snapAngle90: boolean;
  selectedEntity: SelectedEntity;
  isDragging3D: boolean;
  cameraResetNonce: number;

  // 初期化・リセット・JSONインポート
  initialize: () => Promise<void>;
  resetToSeedData: () => Promise<void>;
  importPlannerData: (
    payload: PlannerExportPayload,
    mode: 'replace' | 'merge',
  ) => Promise<void>;

  // ビュー・UI操作
  setEditorMode: (mode: EditorMode) => void;
  setCameraViewMode: (mode: CameraViewMode) => void;
  setShowCeiling: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setSnapMoveCm: (cm: number) => void;
  setSnapAngle90: (enabled: boolean) => void;
  setSelectedEntity: (entity: SelectedEntity) => void;
  setIsDragging3D: (dragging: boolean) => void;
  triggerCameraReset: () => void;

  // 物件 CRUD
  setActiveProperty: (propertyId: string) => void;
  addProperty: (name?: string) => void;
  duplicateProperty: (propertyId: string) => void;
  renameProperty: (propertyId: string, name: string) => void;
  updatePropertyMemo: (propertyId: string, memo: string) => void;
  deleteProperty: (propertyId: string) => void;

  // レイアウト案 CRUD
  setActiveLayout: (layoutId: string) => void;
  addLayoutVariant: (name?: string) => void;
  duplicateLayoutVariant: (layoutId: string) => void;
  renameLayoutVariant: (layoutId: string, name: string) => void;
  deleteLayoutVariant: (layoutId: string) => void;

  // マイ家具カタログ CRUD（全物件共通）
  addFurnitureAsset: (input: CreateFurnitureAssetInput) => FurnitureAsset;
  updateFurnitureAsset: (
    assetId: string,
    patch: Partial<Omit<FurnitureAsset, 'id' | 'createdAt'>>,
  ) => void;
  deleteFurnitureAsset: (assetId: string) => void;

  // 配置済み家具操作
  placeFurnitureFromCatalog: (assetId: string, position?: Point3D) => void;
  updatePlacedFurniture: (
    placementId: string,
    patch: Partial<Omit<PlacedFurniture, 'id' | 'assetId'>>,
    options?: { persist?: boolean },
  ) => void;
  duplicatePlacedFurniture: (placementId: string) => void;
  removePlacedFurniture: (placementId: string) => void;

  // 備え付け固定設備操作
  toggleFixtureLock: (fixtureId: string) => void;
  updateFixedFixture: (
    fixtureId: string,
    patch: Partial<Omit<FixedFixture, 'id'>>,
    options?: { persist?: boolean },
  ) => void;
  addFixedFixture: (kind: FixedFixtureKind) => void;
  removeFixedFixture: (fixtureId: string) => void;

  // [Phase 2] 間取り図背景・壁・頂点・建具・スケール補正
  setFloorplanImage: (image: FloorplanImage | undefined) => void;
  updateFloorplanImage: (
    patch: Partial<FloorplanImage>,
    options?: { persist?: boolean },
  ) => void;
  applyFloorplanAnalysis: (payload: {
    floorplanImage: FloorplanImage;
    vertices: WallVertex[];
    walls: WallSegment[];
    fixtures: FixedFixture[];
  }) => void;
  updateDefaultCeilingHeight: (heightMeters: number) => void;
  moveWallVertex: (
    vertexId: string,
    point: Point2D,
    options?: { persist?: boolean },
  ) => void;
  mergeWallVertex: (sourceVertexId: string, targetVertexId: string) => void;
  addWallSegment: (
    start: { vertexId?: string; point: Point2D },
    end: { vertexId?: string; point: Point2D },
    options?: { kind?: WallSegment['kind']; thickness?: number },
  ) => { wallId: string; startVertexId: string; endVertexId: string } | null;
  splitWallAtPoint: (wallId: string, point: Point2D) => string | null;
  updateWallSegment: (
    wallId: string,
    patch: Partial<Omit<WallSegment, 'id'>>,
  ) => void;
  deleteWallSegment: (wallId: string) => void;
  deleteWallVertex: (vertexId: string) => void;
  addWallOpening: (
    wallId: string,
    kind: WallOpeningKind,
    positionRatio?: number,
  ) => void;
  updateWallOpening: (
    wallId: string,
    openingId: string,
    patch: Partial<Omit<WallOpening, 'id'>>,
  ) => void;
  deleteWallOpening: (wallId: string, openingId: string) => void;
  calibratePropertyScale: (
    pointA: Point2D,
    pointB: Point2D,
    actualDistanceMeters: number,
  ) => void;

  // ドラッグ終了時などの明示的永続化
  commitActiveProperty: () => void;
}

const DEFAULT_FIXTURE_DIMENSIONS: Record<FixedFixtureKind, Dimensions3D> = {
  kitchen: { width: 2.1, depth: 0.65, height: 0.85 },
  bathtub: { width: 1.4, depth: 0.78, height: 0.56 },
  toilet: { width: 0.44, depth: 0.7, height: 0.78 },
  vanity: { width: 0.75, depth: 0.52, height: 0.82 },
  washing_machine_pan: { width: 0.7, depth: 0.7, height: 0.08 },
  closet: { width: 1.5, depth: 0.6, height: 2.2 },
  shoe_box: { width: 0.9, depth: 0.38, height: 1.1 },
  aircon: { width: 0.8, depth: 0.28, height: 0.3 },
  other: { width: 0.8, depth: 0.6, height: 0.85 },
};

function persistPropertySilently(property: Property | undefined) {
  if (!property) return;
  void upsertPropertyRecord(property).catch((err) => {
    console.error('物件データの保存に失敗しました:', err);
  });
}

function getActivePropertyFrom(state: {
  properties: Property[];
  activePropertyId: string | null;
}): Property | undefined {
  return (
    state.properties.find((p) => p.id === state.activePropertyId) ?? state.properties[0]
  );
}

export const usePlannerStore = create<PlannerStoreState>((set, get) => ({
  hydrated: false,
  properties: [],
  catalog: [],
  activePropertyId: null,

  editorMode: '3d',
  cameraViewMode: 'perspective',
  showCeiling: false,
  showGrid: true,
  snapMoveCm: 5,
  snapAngle90: true,
  selectedEntity: null,
  isDragging3D: false,
  cameraResetNonce: 0,

  initialize: async () => {
    if (get().hydrated) return;
    try {
      const persisted = await loadPlannerState();
      if (persisted.properties.length > 0 || persisted.catalog.length > 0) {
        const validActiveId = persisted.properties.some(
          (p) => p.id === persisted.activePropertyId,
        )
          ? persisted.activePropertyId
          : (persisted.properties[0]?.id ?? null);
        set({
          properties: persisted.properties,
          catalog: persisted.catalog,
          activePropertyId: validActiveId,
          hydrated: true,
        });
        return;
      }

      const seed = createInitialSeedData();
      await saveAllPlannerState(seed);
      set({
        properties: seed.properties,
        catalog: seed.catalog,
        activePropertyId: seed.activePropertyId,
        hydrated: true,
      });
    } catch (err) {
      console.error('IndexedDB からの読み込みに失敗したため初期データを使用します:', err);
      const seed = createInitialSeedData();
      set({
        properties: seed.properties,
        catalog: seed.catalog,
        activePropertyId: seed.activePropertyId,
        hydrated: true,
      });
    }
  },

  resetToSeedData: async () => {
    const seed = createInitialSeedData();
    await saveAllPlannerState(seed).catch((err) => {
      console.error('初期データリセットの保存に失敗しました:', err);
    });
    set((s) => ({
      properties: seed.properties,
      catalog: seed.catalog,
      activePropertyId: seed.activePropertyId,
      selectedEntity: null,
      cameraViewMode: 'perspective',
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
  },

  importPlannerData: async (payload, mode) => {
    const state = get();
    const nextState =
      mode === 'replace'
        ? {
            properties: payload.properties,
            catalog: payload.catalog,
            activePropertyId:
              payload.activePropertyId ?? payload.properties[0]?.id ?? null,
          }
        : mergeImportedPlannerData(
            {
              properties: state.properties,
              catalog: state.catalog,
              activePropertyId: state.activePropertyId,
            },
            payload,
          );

    await saveAllPlannerState(nextState);
    set((s) => ({
      properties: nextState.properties,
      catalog: nextState.catalog,
      activePropertyId: nextState.activePropertyId,
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
  },

  setEditorMode: (mode) => set({ editorMode: mode }),
  setCameraViewMode: (mode) => set({ cameraViewMode: mode }),
  setShowCeiling: (show) => set({ showCeiling: show }),
  setShowGrid: (show) => set({ showGrid: show }),
  setSnapMoveCm: (cm) => set({ snapMoveCm: cm }),
  setSnapAngle90: (enabled) => set({ snapAngle90: enabled }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  setIsDragging3D: (dragging) => set({ isDragging3D: dragging }),
  triggerCameraReset: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1 })),

  setActiveProperty: (propertyId) => {
    const exists = get().properties.some((p) => p.id === propertyId);
    if (!exists) return;
    set((s) => ({
      activePropertyId: propertyId,
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    void saveActivePropertyId(propertyId).catch(console.error);
  },

  addProperty: (name) => {
    const count = get().properties.length + 1;
    const newProp = createBlankProperty(name?.trim() || `新規物件 ${count}`);
    set((s) => ({
      properties: [...s.properties, newProp],
      activePropertyId: newProp.id,
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    persistPropertySilently(newProp);
    void saveActivePropertyId(newProp.id).catch(console.error);
  },

  duplicateProperty: (propertyId) => {
    const target = get().properties.find((p) => p.id === propertyId);
    if (!target) return;
    const now = new Date().toISOString();
    const clonedLayouts: LayoutVariant[] = target.layouts.map((l) => ({
      ...l,
      id: createId('layout'),
      placements: l.placements.map((pl) => ({ ...pl, id: createId('pl') })),
      createdAt: now,
      updatedAt: now,
    }));
    const activeIdx = Math.max(
      0,
      target.layouts.findIndex((l) => l.id === target.activeLayoutId),
    );
    const cloned: Property = {
      ...structuredClone(target),
      id: createId('prop'),
      name: `${target.name}（コピー）`,
      layouts: clonedLayouts,
      activeLayoutId: clonedLayouts[activeIdx]?.id ?? clonedLayouts[0]?.id ?? '',
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      properties: [...s.properties, cloned],
      activePropertyId: cloned.id,
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    persistPropertySilently(cloned);
    void saveActivePropertyId(cloned.id).catch(console.error);
  },

  renameProperty: (propertyId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    let updated: Property | undefined;
    set((s) => ({
      properties: s.properties.map((p) => {
        if (p.id !== propertyId) return p;
        updated = { ...p, name: trimmed, updatedAt: now };
        return updated;
      }),
    }));
    persistPropertySilently(updated);
  },

  updatePropertyMemo: (propertyId, memo) => {
    const now = new Date().toISOString();
    let updated: Property | undefined;
    set((s) => ({
      properties: s.properties.map((p) => {
        if (p.id !== propertyId) return p;
        updated = { ...p, memo, updatedAt: now };
        return updated;
      }),
    }));
    persistPropertySilently(updated);
  },

  deleteProperty: (propertyId) => {
    const { properties, activePropertyId } = get();
    if (properties.length <= 1) return;
    const remaining = properties.filter((p) => p.id !== propertyId);
    const nextActiveId =
      activePropertyId === propertyId ? (remaining[0]?.id ?? null) : activePropertyId;
    set((s) => ({
      properties: remaining,
      activePropertyId: nextActiveId,
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    void deletePropertyRecord(propertyId).catch(console.error);
    void saveActivePropertyId(nextActiveId).catch(console.error);
  },

  setActiveLayout: (layoutId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop || !prop.layouts.some((l) => l.id === layoutId)) return;
    const now = new Date().toISOString();
    const updated: Property = { ...prop, activeLayoutId: layoutId, updatedAt: now };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: null,
    }));
    persistPropertySilently(updated);
  },

  addLayoutVariant: (name) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const newLayout: LayoutVariant = {
      id: createId('layout'),
      name: name?.trim() || `案${prop.layouts.length + 1}`,
      placements: [],
      createdAt: now,
      updatedAt: now,
    };
    const updated: Property = {
      ...prop,
      layouts: [...prop.layouts, newLayout],
      activeLayoutId: newLayout.id,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: null,
    }));
    persistPropertySilently(updated);
  },

  duplicateLayoutVariant: (layoutId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const target = prop.layouts.find((l) => l.id === layoutId);
    if (!target) return;
    const now = new Date().toISOString();
    const cloned: LayoutVariant = {
      id: createId('layout'),
      name: `${target.name}（複製）`,
      placements: target.placements.map((pl) => ({
        ...structuredClone(pl),
        id: createId('pl'),
      })),
      createdAt: now,
      updatedAt: now,
    };
    const updated: Property = {
      ...prop,
      layouts: [...prop.layouts, cloned],
      activeLayoutId: cloned.id,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: null,
    }));
    persistPropertySilently(updated);
  },

  renameLayoutVariant: (layoutId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: prop.layouts.map((l) =>
        l.id === layoutId ? { ...l, name: trimmed, updatedAt: now } : l,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  deleteLayoutVariant: (layoutId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop || prop.layouts.length <= 1) return;
    const remaining = prop.layouts.filter((l) => l.id !== layoutId);
    const nextLayoutId =
      prop.activeLayoutId === layoutId ? remaining[0].id : prop.activeLayoutId;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: remaining,
      activeLayoutId: nextLayoutId,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: null,
    }));
    persistPropertySilently(updated);
  },

  addFurnitureAsset: (input) => {
    const now = new Date().toISOString();
    const asset: FurnitureAsset = {
      id: createId('asset'),
      name: input.name.trim(),
      category: input.category,
      dimensions: input.dimensions,
      model: input.model,
      thumbnailDataUrl: input.thumbnailDataUrl,
      memo: input.memo?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ catalog: [...s.catalog, asset] }));
    void upsertFurnitureAssetRecord(asset).catch(console.error);
    return asset;
  },

  updateFurnitureAsset: (assetId, patch) => {
    const now = new Date().toISOString();
    let updated: FurnitureAsset | undefined;
    set((s) => ({
      catalog: s.catalog.map((item) => {
        if (item.id !== assetId) return item;
        updated = { ...item, ...patch, updatedAt: now };
        return updated;
      }),
    }));
    if (updated) {
      void upsertFurnitureAssetRecord(updated).catch(console.error);
    }
  },

  deleteFurnitureAsset: (assetId) => {
    const now = new Date().toISOString();
    const updatedProperties: Property[] = [];

    set((s) => {
      const nextProps = s.properties.map((prop) => {
        let changed = false;
        const nextLayouts = prop.layouts.map((layout) => {
          const filtered = layout.placements.filter((pl) => pl.assetId !== assetId);
          if (filtered.length !== layout.placements.length) {
            changed = true;
            return { ...layout, placements: filtered, updatedAt: now };
          }
          return layout;
        });
        if (!changed) return prop;
        const nextProp = { ...prop, layouts: nextLayouts, updatedAt: now };
        updatedProperties.push(nextProp);
        return nextProp;
      });

      return {
        catalog: s.catalog.filter((item) => item.id !== assetId),
        properties: nextProps,
        selectedEntity: null,
      };
    });

    void deleteFurnitureAssetRecord(assetId).catch(console.error);
    for (const p of updatedProperties) {
      persistPropertySilently(p);
    }
  },

  placeFurnitureFromCatalog: (assetId, position) => {
    const state = get();
    const prop = getActivePropertyFrom(state);
    const asset = state.catalog.find((a) => a.id === assetId);
    if (!prop || !asset) return;

    const bounds = getPropertyBounds(prop);
    const activeLayout =
      prop.layouts.find((l) => l.id === prop.activeLayoutId) ?? prop.layouts[0];
    if (!activeLayout) return;

    // 少しずらして連続配置しても重なりにくくする
    const offsetIndex = activeLayout.placements.length % 5;
    const defaultPos: Point3D = {
      x: Math.round((bounds.centerX + (offsetIndex - 2) * 0.2) * 20) / 20,
      y: 0,
      z: Math.round((bounds.centerZ + 0.5 + (offsetIndex - 2) * 0.15) * 20) / 20,
    };

    const placement: PlacedFurniture = {
      id: createId('pl'),
      assetId,
      position: position ?? defaultPos,
      rotationY: 0,
      locked: false,
    };

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: prop.layouts.map((l) =>
        l.id === activeLayout.id
          ? { ...l, placements: [...l.placements, placement], updatedAt: now }
          : l,
      ),
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'furniture', id: placement.id },
    }));
    persistPropertySilently(updated);
  },

  updatePlacedFurniture: (placementId, patch, options) => {
    const persist = options?.persist ?? true;
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: prop.layouts.map((l) =>
        l.id === prop.activeLayoutId
          ? {
              ...l,
              placements: l.placements.map((pl) =>
                pl.id === placementId ? { ...pl, ...patch } : pl,
              ),
              updatedAt: now,
            }
          : l,
      ),
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    if (persist) {
      persistPropertySilently(updated);
    }
  },

  duplicatePlacedFurniture: (placementId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const activeLayout = prop.layouts.find((l) => l.id === prop.activeLayoutId);
    const target = activeLayout?.placements.find((pl) => pl.id === placementId);
    if (!activeLayout || !target) return;

    const cloned: PlacedFurniture = {
      ...structuredClone(target),
      id: createId('pl'),
      position: {
        x: target.position.x + 0.35,
        y: target.position.y,
        z: target.position.z + 0.35,
      },
      locked: false,
    };

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: prop.layouts.map((l) =>
        l.id === activeLayout.id
          ? { ...l, placements: [...l.placements, cloned], updatedAt: now }
          : l,
      ),
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'furniture', id: cloned.id },
    }));
    persistPropertySilently(updated);
  },

  removePlacedFurniture: (placementId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      layouts: prop.layouts.map((l) =>
        l.id === prop.activeLayoutId
          ? {
              ...l,
              placements: l.placements.filter((pl) => pl.id !== placementId),
              updatedAt: now,
            }
          : l,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity:
        s.selectedEntity?.type === 'furniture' && s.selectedEntity.id === placementId
          ? null
          : s.selectedEntity,
    }));
    persistPropertySilently(updated);
  },

  toggleFixtureLock: (fixtureId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      fixtures: prop.fixtures.map((f) =>
        f.id === fixtureId ? { ...f, locked: !f.locked } : f,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  updateFixedFixture: (fixtureId, patch, options) => {
    const persist = options?.persist ?? true;
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const target = prop.fixtures.find((f) => f.id === fixtureId);
    if (!target) return;

    // ロック中はロック解除以外の移動・サイズ・回転変更を防止
    const isGeometryChange =
      patch.position !== undefined ||
      patch.dimensions !== undefined ||
      patch.rotationY !== undefined;
    if (target.locked && isGeometryChange && patch.locked !== false) {
      return;
    }

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      fixtures: prop.fixtures.map((f) =>
        f.id === fixtureId ? { ...f, ...patch } : f,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    if (persist) {
      persistPropertySilently(updated);
    }
  },

  addFixedFixture: (kind) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const bounds = getPropertyBounds(prop);
    const now = new Date().toISOString();
    const fixture: FixedFixture = {
      id: createId('fix'),
      kind,
      label: FIXTURE_KIND_LABELS[kind],
      position: { x: bounds.centerX, y: kind === 'aircon' ? 2.0 : 0, z: bounds.centerZ },
      rotationY: 0,
      dimensions: { ...DEFAULT_FIXTURE_DIMENSIONS[kind] },
      locked: false, // 手動追加時はそのまま微調整しやすいようロック解除で配置
      source: 'manual',
    };
    const updated: Property = {
      ...prop,
      fixtures: [...prop.fixtures, fixture],
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'fixture', id: fixture.id },
    }));
    persistPropertySilently(updated);
  },

  removeFixedFixture: (fixtureId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      fixtures: prop.fixtures.filter((f) => f.id !== fixtureId),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity:
        s.selectedEntity?.type === 'fixture' && s.selectedEntity.id === fixtureId
          ? null
          : s.selectedEntity,
    }));
    persistPropertySilently(updated);
  },

  setFloorplanImage: (image) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      floorplanImage: image,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  updateFloorplanImage: (patch, options) => {
    const persist = options?.persist ?? true;
    const prop = getActivePropertyFrom(get());
    if (!prop || !prop.floorplanImage) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      floorplanImage: { ...prop.floorplanImage, ...patch },
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    if (persist) {
      persistPropertySilently(updated);
    }
  },

  applyFloorplanAnalysis: ({ floorplanImage, vertices, walls, fixtures }) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      floorplanImage,
      scaleCalibration: undefined,
      vertices,
      walls,
      zones: undefined, // AI抽出時は壁ベースの床自動生成に切り替え
      fixtures,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: null,
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    persistPropertySilently(updated);
  },

  updateDefaultCeilingHeight: (heightMeters) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const clamped = Math.min(4.5, Math.max(1.8, heightMeters));
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      defaultCeilingHeight: clamped,
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  moveWallVertex: (vertexId, point, options) => {
    const persist = options?.persist ?? true;
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const oldVertex = prop.vertices.find((v) => v.id === vertexId);
    if (!oldVertex) return;

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      vertices: prop.vertices.map((v) =>
        v.id === vertexId ? { ...v, x: point.x, z: point.z } : v,
      ),
      // 既存の床ゾーンに一致頂点がある場合は追従させる
      zones: prop.zones?.map((zone) => ({
        ...zone,
        polygon: zone.polygon.map((pt) =>
          Math.hypot(pt.x - oldVertex.x, pt.z - oldVertex.z) < 0.02
            ? { x: point.x, z: point.z }
            : pt,
        ),
      })),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    if (persist) {
      persistPropertySilently(updated);
    }
  },

  mergeWallVertex: (sourceVertexId, targetVertexId) => {
    if (sourceVertexId === targetVertexId) return;
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const sourceV = prop.vertices.find((v) => v.id === sourceVertexId);
    const targetV = prop.vertices.find((v) => v.id === targetVertexId);
    if (!sourceV || !targetV) return;

    const seenPairs = new Set<string>();
    const nextWalls: WallSegment[] = [];

    for (const w of prop.walls) {
      const startVertexId =
        w.startVertexId === sourceVertexId ? targetVertexId : w.startVertexId;
      const endVertexId =
        w.endVertexId === sourceVertexId ? targetVertexId : w.endVertexId;
      if (startVertexId === endVertexId) continue;

      const pairKey = [startVertexId, endVertexId].sort().join('__');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      nextWalls.push({ ...w, startVertexId, endVertexId });
    }

    const usedIds = new Set<string>();
    for (const w of nextWalls) {
      usedIds.add(w.startVertexId);
      usedIds.add(w.endVertexId);
    }

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      vertices: prop.vertices.filter(
        (v) => v.id !== sourceVertexId && usedIds.has(v.id),
      ),
      walls: nextWalls,
      zones: prop.zones?.map((zone) => ({
        ...zone,
        polygon: zone.polygon.map((pt) =>
          Math.hypot(pt.x - sourceV.x, pt.z - sourceV.z) < 0.02
            ? { x: targetV.x, z: targetV.z }
            : pt,
        ),
      })),
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'vertex', id: targetVertexId },
    }));
    persistPropertySilently(updated);
  },

  addWallSegment: (start, end, options) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return null;

    if (Math.hypot(end.point.x - start.point.x, end.point.z - start.point.z) < 0.05) {
      return null;
    }

    const nextVertices = [...prop.vertices];

    let startVertexId = start.vertexId;
    if (!startVertexId || !nextVertices.some((v) => v.id === startVertexId)) {
      startVertexId = createId('v');
      nextVertices.push({ id: startVertexId, x: start.point.x, z: start.point.z });
    }

    let endVertexId = end.vertexId;
    if (!endVertexId || !nextVertices.some((v) => v.id === endVertexId)) {
      endVertexId = createId('v');
      nextVertices.push({ id: endVertexId, x: end.point.x, z: end.point.z });
    }

    if (startVertexId === endVertexId) return null;

    // 同一ペアの重複壁があればそれを選択して終了
    const existing = prop.walls.find(
      (w) =>
        (w.startVertexId === startVertexId && w.endVertexId === endVertexId) ||
        (w.startVertexId === endVertexId && w.endVertexId === startVertexId),
    );
    if (existing) {
      set({ selectedEntity: { type: 'wall', id: existing.id } });
      return { wallId: existing.id, startVertexId, endVertexId };
    }

    const kind = options?.kind ?? 'interior';
    const wall: WallSegment = {
      id: createId('w'),
      startVertexId,
      endVertexId,
      thickness: options?.thickness ?? (kind === 'exterior' ? 0.14 : 0.11),
      height: kind === 'low_wall' ? 1.1 : undefined,
      kind,
      openings: [],
    };

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      vertices: nextVertices,
      walls: [...prop.walls, wall],
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'wall', id: wall.id },
    }));
    persistPropertySilently(updated);

    return { wallId: wall.id, startVertexId, endVertexId };
  },

  splitWallAtPoint: (wallId, point) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return null;
    const wall = prop.walls.find((w) => w.id === wallId);
    if (!wall) return null;

    const startV = prop.vertices.find((v) => v.id === wall.startVertexId);
    const endV = prop.vertices.find((v) => v.id === wall.endVertexId);
    if (!startV || !endV) return null;

    const dx = endV.x - startV.x;
    const dz = endV.z - startV.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 0.04) return null;

    const rawT = ((point.x - startV.x) * dx + (point.z - startV.z) * dz) / lenSq;
    const t = Math.min(0.92, Math.max(0.08, rawT));

    const newVertex: WallVertex = {
      id: createId('v'),
      x: Math.round((startV.x + dx * t) * 1000) / 1000,
      z: Math.round((startV.z + dz * t) * 1000) / 1000,
    };

    const openingsA: WallOpening[] = [];
    const openingsB: WallOpening[] = [];
    for (const op of wall.openings) {
      if (op.positionRatio <= t) {
        openingsA.push({
          ...op,
          positionRatio: Math.min(0.9, Math.max(0.1, op.positionRatio / t)),
        });
      } else {
        openingsB.push({
          ...op,
          positionRatio: Math.min(
            0.9,
            Math.max(0.1, (op.positionRatio - t) / (1 - t)),
          ),
        });
      }
    }

    const wallA: WallSegment = {
      ...wall,
      id: createId('w'),
      endVertexId: newVertex.id,
      openings: openingsA,
    };
    const wallB: WallSegment = {
      ...wall,
      id: createId('w'),
      startVertexId: newVertex.id,
      openings: openingsB,
    };

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      vertices: [...prop.vertices, newVertex],
      walls: prop.walls.flatMap((w) => (w.id === wallId ? [wallA, wallB] : [w])),
      updatedAt: now,
    };

    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity: { type: 'vertex', id: newVertex.id },
    }));
    persistPropertySilently(updated);

    return newVertex.id;
  },

  updateWallSegment: (wallId, patch) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: prop.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  deleteWallSegment: (wallId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const remainingWalls = prop.walls.filter((w) => w.id !== wallId);
    const usedIds = new Set<string>();
    for (const w of remainingWalls) {
      usedIds.add(w.startVertexId);
      usedIds.add(w.endVertexId);
    }

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: remainingWalls,
      vertices: prop.vertices.filter((v) => usedIds.has(v.id)),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity:
        s.selectedEntity?.type === 'wall' && s.selectedEntity.id === wallId
          ? null
          : s.selectedEntity,
    }));
    persistPropertySilently(updated);
  },

  deleteWallVertex: (vertexId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const remainingWalls = prop.walls.filter(
      (w) => w.startVertexId !== vertexId && w.endVertexId !== vertexId,
    );
    const usedIds = new Set<string>();
    for (const w of remainingWalls) {
      usedIds.add(w.startVertexId);
      usedIds.add(w.endVertexId);
    }

    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: remainingWalls,
      vertices: prop.vertices.filter((v) => v.id !== vertexId && usedIds.has(v.id)),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
      selectedEntity:
        s.selectedEntity?.type === 'vertex' && s.selectedEntity.id === vertexId
          ? null
          : s.selectedEntity,
    }));
    persistPropertySilently(updated);
  },

  addWallOpening: (wallId, kind, positionRatio = 0.5) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const isWindow = kind === 'window';
    const opening: WallOpening = {
      id: createId('op'),
      kind,
      positionRatio: Math.min(0.9, Math.max(0.1, positionRatio)),
      width: kind === 'sliding_door' ? 1.5 : isWindow ? 1.2 : 0.8,
      height: isWindow ? 1.2 : 2.02,
      sillHeight: isWindow ? 0.9 : 0,
      swingDirection: kind === 'door' ? 'left' : 'none',
    };
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: prop.walls.map((w) =>
        w.id === wallId ? { ...w, openings: [...w.openings, opening] } : w,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  updateWallOpening: (wallId, openingId, patch) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: prop.walls.map((w) =>
        w.id === wallId
          ? {
              ...w,
              openings: w.openings.map((op) =>
                op.id === openingId ? { ...op, ...patch } : op,
              ),
            }
          : w,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  deleteWallOpening: (wallId, openingId) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const now = new Date().toISOString();
    const updated: Property = {
      ...prop,
      walls: prop.walls.map((w) =>
        w.id === wallId
          ? { ...w, openings: w.openings.filter((op) => op.id !== openingId) }
          : w,
      ),
      updatedAt: now,
    };
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? updated : p)),
    }));
    persistPropertySilently(updated);
  },

  calibratePropertyScale: (pointA, pointB, actualDistanceMeters) => {
    const prop = getActivePropertyFrom(get());
    if (!prop) return;
    const rescaled = rescalePropertyByReference(
      prop,
      pointA,
      pointB,
      actualDistanceMeters,
    );
    set((s) => ({
      properties: s.properties.map((p) => (p.id === prop.id ? rescaled : p)),
      cameraResetNonce: s.cameraResetNonce + 1,
    }));
    persistPropertySilently(rescaled);
  },

  commitActiveProperty: () => {
    const prop = getActivePropertyFrom(get());
    persistPropertySilently(prop);
  },
}));

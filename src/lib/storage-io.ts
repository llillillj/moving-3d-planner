import { createId } from '@/lib/seed-data';
import type {
  FurnitureAsset,
  PlannerExportPayload,
  Property,
} from '@/types/planner';

export interface ImportValidationResult {
  payload: PlannerExportPayload;
  summary: {
    propertyCount: number;
    catalogCount: number;
    totalLayouts: number;
    totalPlacements: number;
    propertyNames: string[];
    exportedAt: string;
  };
}

/** エクスポート用 JSON ペイロードを構築する */
export function buildExportPayload(params: {
  catalog: FurnitureAsset[];
  properties: Property[];
  activePropertyId: string | null;
}): PlannerExportPayload {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    catalog: params.catalog,
    properties: params.properties,
    activePropertyId: params.activePropertyId,
  };
}

/** JSON ファイルとしてブラウザからダウンロードする */
export function downloadPlannerJson(payload: PlannerExportPayload): void {
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `moving-3d-planner-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** バイト数を読みやすい単位表記へ整形 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDimensions(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.width === 'number' &&
    typeof value.depth === 'number' &&
    typeof value.height === 'number' &&
    value.width > 0 &&
    value.depth > 0 &&
    value.height > 0
  );
}

function isValidModelSpec(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  if (value.kind === 'procedural') {
    return typeof value.shapeType === 'string' && typeof value.color === 'string';
  }
  if (value.kind === 'glb') {
    return typeof value.url === 'string' && typeof value.normalizeScale === 'boolean';
  }
  return false;
}

function isValidAsset(value: unknown): value is FurnitureAsset {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.category === 'string' &&
    isValidDimensions(value.dimensions) &&
    isValidModelSpec(value.model)
  );
}

function isValidProperty(value: unknown): value is Property {
  if (!isObjectRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.defaultCeilingHeight === 'number' &&
    Array.isArray(value.vertices) &&
    Array.isArray(value.walls) &&
    Array.isArray(value.fixtures) &&
    Array.isArray(value.layouts) &&
    value.layouts.length > 0 &&
    typeof value.activeLayoutId === 'string'
  );
}

/** インポートされた JSON 文字列を厳密に検証・パースする */
export function parseAndValidateImportJson(
  jsonText: string,
): ImportValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('JSON の構文エラーのため読み込めませんでした。ファイルを確認してください。');
  }

  if (!isObjectRecord(raw)) {
    throw new Error('不正なデータ形式です（オブジェクト形式のJSONである必要があります）。');
  }

  if (raw.schemaVersion !== 1) {
    throw new Error(
      `サポートされていないスキーマバージョンです（期待値: 1、検出値: ${String(raw.schemaVersion)}）。`,
    );
  }

  if (!Array.isArray(raw.catalog) || !Array.isArray(raw.properties)) {
    throw new Error('必須フィールド（catalog / properties）が見つかりません。');
  }

  const invalidAssetIdx = raw.catalog.findIndex((item) => !isValidAsset(item));
  if (invalidAssetIdx !== -1) {
    throw new Error(
      `マイ家具カタログの ${invalidAssetIdx + 1} 件目のデータ形式が不正です。`,
    );
  }

  const invalidPropIdx = raw.properties.findIndex((item) => !isValidProperty(item));
  if (invalidPropIdx !== -1) {
    throw new Error(
      `物件データの ${invalidPropIdx + 1} 件目の形式が不正です。`,
    );
  }

  const catalog = raw.catalog as FurnitureAsset[];
  const properties = raw.properties as Property[];

  if (properties.length === 0 && catalog.length === 0) {
    throw new Error('インポート対象となる物件または家具データが含まれていません。');
  }

  const activePropertyId =
    typeof raw.activePropertyId === 'string' &&
    properties.some((p) => p.id === raw.activePropertyId)
      ? raw.activePropertyId
      : (properties[0]?.id ?? null);

  const exportedAt =
    typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString();

  const totalLayouts = properties.reduce((sum, p) => sum + p.layouts.length, 0);
  const totalPlacements = properties.reduce(
    (sum, p) =>
      sum + p.layouts.reduce((lsum, l) => lsum + l.placements.length, 0),
    0,
  );

  return {
    payload: {
      schemaVersion: 1,
      exportedAt,
      catalog,
      properties,
      activePropertyId,
    },
    summary: {
      propertyCount: properties.length,
      catalogCount: catalog.length,
      totalLayouts,
      totalPlacements,
      propertyNames: properties.map((p) => p.name),
      exportedAt,
    },
  };
}

/**
 * 既存データへインポートデータを安全に追加マージする（ID衝突時は新IDへ自動リマップ）
 */
export function mergeImportedPlannerData(
  current: {
    catalog: FurnitureAsset[];
    properties: Property[];
    activePropertyId: string | null;
  },
  incoming: PlannerExportPayload,
): {
  catalog: FurnitureAsset[];
  properties: Property[];
  activePropertyId: string | null;
} {
  const existingAssetIds = new Set(current.catalog.map((a) => a.id));
  const assetIdMap = new Map<string, string>();
  const addedAssets: FurnitureAsset[] = [];

  for (const asset of incoming.catalog) {
    if (existingAssetIds.has(asset.id)) {
      // 同一IDかつ同名の家具なら既存を再利用、別物なら新IDで追加
      const existing = current.catalog.find((a) => a.id === asset.id);
      if (existing && existing.name === asset.name) {
        assetIdMap.set(asset.id, existing.id);
      } else {
        const nextId = createId('asset');
        assetIdMap.set(asset.id, nextId);
        addedAssets.push({ ...structuredClone(asset), id: nextId });
      }
    } else {
      assetIdMap.set(asset.id, asset.id);
      existingAssetIds.add(asset.id);
      addedAssets.push(structuredClone(asset));
    }
  }

  const existingPropIds = new Set(current.properties.map((p) => p.id));
  const addedProperties: Property[] = [];

  for (const prop of incoming.properties) {
    const cloned = structuredClone(prop);
    if (existingPropIds.has(cloned.id)) {
      cloned.id = createId('prop');
      cloned.name = `${cloned.name}（インポート）`;
    }
    existingPropIds.add(cloned.id);

    // 配置済み家具の assetId をリマップ
    cloned.layouts = cloned.layouts.map((layout) => ({
      ...layout,
      id: createId('layout'),
      placements: layout.placements.map((pl) => ({
        ...pl,
        id: createId('pl'),
        assetId: assetIdMap.get(pl.assetId) ?? pl.assetId,
      })),
    }));
    cloned.activeLayoutId = cloned.layouts[0]?.id ?? cloned.activeLayoutId;
    addedProperties.push(cloned);
  }

  return {
    catalog: [...current.catalog, ...addedAssets],
    properties: [...current.properties, ...addedProperties],
    activePropertyId:
      addedProperties[0]?.id ?? current.activePropertyId ?? null,
  };
}

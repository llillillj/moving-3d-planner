import type {
  Dimensions3D,
  FixedFixtureKind,
  FurnitureCategory,
  KnownProceduralShapeType,
} from '@/types/planner';

/** メートル → センチメートル（表示用に小数第1位で丸め） */
export function metersToCm(meters: number): number {
  return Math.round(meters * 1000) / 10;
}

/** センチメートル → メートル */
export function cmToMeters(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return cm / 100;
}

/** 寸法(m) → 寸法(cm) */
export function dimensionsToCm(dims: Dimensions3D): {
  width: number;
  depth: number;
  height: number;
} {
  return {
    width: metersToCm(dims.width),
    depth: metersToCm(dims.depth),
    height: metersToCm(dims.height),
  };
}

/** 寸法(cm) → 寸法(m)（最小1cmを保証） */
export function cmToDimensions(cm: {
  width: number;
  depth: number;
  height: number;
}): Dimensions3D {
  return {
    width: Math.max(0.01, cmToMeters(cm.width)),
    depth: Math.max(0.01, cmToMeters(cm.depth)),
    height: Math.max(0.01, cmToMeters(cm.height)),
  };
}

/** ラジアン → 度数 (0〜359) */
export function radToDeg(rad: number): number {
  const raw = (rad * 180) / Math.PI;
  const normalized = ((raw % 360) + 360) % 360;
  return Math.round(normalized * 10) / 10;
}

/** 度数 → ラジアン */
export function degToRad(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return (deg * Math.PI) / 180;
}

/** 角度を指定ステップ（例: 90度）にスナップ */
export function snapAngleRad(rad: number, stepDeg = 90): number {
  const stepRad = degToRad(stepDeg);
  return Math.round(rad / stepRad) * stepRad;
}

/** 座標(m)を指定グリッド(m)にスナップ（例: 0.05m = 5cm） */
export function snapMeters(meters: number, stepMeters = 0.05): number {
  return Math.round(meters / stepMeters) * stepMeters;
}

/** 表示用の cm 文字列整形 */
export function formatCm(meters: number): string {
  const cm = metersToCm(meters);
  return Number.isInteger(cm) ? `${cm}cm` : `${cm.toFixed(1)}cm`;
}

/** W × D × H (cm) の要約文字列 */
export function formatDimensionsCm(dims: Dimensions3D): string {
  const w = Math.round(metersToCm(dims.width));
  const d = Math.round(metersToCm(dims.depth));
  const h = Math.round(metersToCm(dims.height));
  return `${w} × ${d} × ${h} cm`;
}

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  sofa: 'ソファ',
  bed: 'ベッド',
  table: 'テーブル',
  desk: 'デスク',
  chair: 'チェア',
  storage: '収納・棚',
  tv_stand: 'テレビ台',
  appliance: '家電',
  rug: 'ラグ・カーペット',
  other: 'その他',
};

export const PROCEDURAL_SHAPE_LABELS: Record<KnownProceduralShapeType, string> = {
  sofa: 'ソファ型',
  bed: 'ベッド型',
  table: 'ダイニングテーブル型',
  desk: 'デスク型',
  chair: 'チェア型',
  shelf: 'オープンシェルフ型',
  cabinet: 'キャビネット・チェスト型',
  tv_stand: 'テレビ台型',
  refrigerator: '冷蔵庫型',
  washing_machine: '洗濯機型',
  rug: 'ラグ型',
  box: 'シンプルボックス',
};

export const FIXTURE_KIND_LABELS: Record<FixedFixtureKind, string> = {
  kitchen: 'システムキッチン',
  bathtub: '浴槽・ユニットバス',
  toilet: 'トイレ',
  vanity: '洗面台',
  washing_machine_pan: '洗濯機パン',
  closet: '備え付け収納・クローゼット',
  shoe_box: 'シューズボックス',
  aircon: 'エアコン',
  other: 'その他設備',
};

export const WALL_OPENING_KIND_LABELS: Record<
  'door' | 'sliding_door' | 'window' | 'opening',
  string
> = {
  door: 'ドア（開き戸）',
  sliding_door: '引き戸',
  window: '窓',
  opening: '開口（枠のみ）',
};

export const WALL_KIND_LABELS: Record<'exterior' | 'interior' | 'low_wall', string> = {
  exterior: '外壁',
  interior: '間仕切り壁',
  low_wall: '腰壁',
};

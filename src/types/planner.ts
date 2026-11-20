// ============================================================================
// 基本幾何・単位型（内部データはすべて 1単位 = 1メートル、Y軸が高さ、XZ平面が床面）
// ============================================================================

/** 床面上の2D座標 (m) */
export interface Point2D {
  x: number;
  z: number;
}

/** 3D空間上の座標 (m)。家具・固定設備は底面中央 (centerX, bottomY, centerZ) を基準とする */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** 3Dサイズ (m) */
export interface Dimensions3D {
  width: number;  // X軸方向（幅）
  depth: number;  // Z軸方向（奥行）
  height: number; // Y軸方向（高さ）
}

// ============================================================================
// 1. マイ家具カタログ（全物件で共通利用）
// ============================================================================

export type FurnitureCategory =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'desk'
  | 'chair'
  | 'storage'
  | 'tv_stand'
  | 'appliance'
  | 'rug'
  | 'other';

/** 既知のプロシージャル形状タイプ（string 互換を維持しつつ補完を有効化） */
export type KnownProceduralShapeType =
  | 'sofa'
  | 'bed'
  | 'table'
  | 'desk'
  | 'chair'
  | 'shelf'
  | 'cabinet'
  | 'tv_stand'
  | 'refrigerator'
  | 'washing_machine'
  | 'rug'
  | 'box';

export type ProceduralShapeType = KnownProceduralShapeType | (string & {});

/**
 * 家具3Dモデルの判別共用体（GEMINI.md 必須要件）
 * 将来の外部 Image-to-3D API (.glb) へ容易に差し替え可能な設計
 */
export type FurnitureModelSpec =
  | {
      kind: 'procedural';
      shapeType: ProceduralShapeType;
      color: string;
      partsHint?: string[];
    }
  | {
      kind: 'glb';
      url: string;
      normalizeScale: boolean;
    };

/** マイ家具カタログのマスターデータ */
export interface FurnitureAsset {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** デフォルトの実寸サイズ (m) */
  dimensions: Dimensions3D;
  model: FurnitureModelSpec;
  /** カタログ表示・AI解析元の参照用サムネイル（リサイズ済み Data URL） */
  thumbnailDataUrl?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

/** <FurnitureModelRenderer /> の共通 Props */
export interface FurnitureModelRendererProps {
  asset: FurnitureAsset;
  dimensions: Dimensions3D;
  isSelected?: boolean;
  isHovered?: boolean;
}

// ============================================================================
// 2. 物件・間取り・建具・備え付け固定設備
// ============================================================================

/** 2D壁の頂点 (m) */
export interface WallVertex {
  id: string;
  x: number;
  z: number;
}

export type WallOpeningKind = 'door' | 'sliding_door' | 'window' | 'opening';

/** 壁に配置される建具（ドア・引き戸・窓・開口） */
export interface WallOpening {
  id: string;
  kind: WallOpeningKind;
  /** 壁の始点(0.0)〜終点(1.0)に対する開口中心の比率 */
  positionRatio: number;
  width: number;      // 開口幅 (m)
  height: number;     // 開口高さ (m)
  sillHeight: number; // 床から下端までの高さ (m)。ドアは 0、窓は例 0.9
  swingDirection?: 'left' | 'right' | 'both' | 'none';
}

/** 壁の線分 */
export interface WallSegment {
  id: string;
  startVertexId: string;
  endVertexId: string;
  /** 壁の厚み (m)。デフォルト例: 0.12 */
  thickness: number;
  /** 個別指定の壁高さ (m)。未指定時は Property.defaultCeilingHeight を使用 */
  height?: number;
  kind?: 'exterior' | 'interior' | 'low_wall';
  openings: WallOpening[];
}

/** 任意の部屋エリア情報（床色分けやラベル表示用・オプショナル） */
export interface RoomZone {
  id: string;
  name: string;
  polygon: Point2D[];
  floorColor?: string;
}

/** 備え付け固定設備の種別 */
export type FixedFixtureKind =
  | 'kitchen'
  | 'bathtub'
  | 'toilet'
  | 'vanity'
  | 'washing_machine_pan'
  | 'closet'
  | 'shoe_box'
  | 'aircon'
  | 'other';

/**
 * 備え付け固定設備
 * 誤操作防止のため初期状態は locked: true とし、必要時のみ解除して移動・リサイズ可能
 */
export interface FixedFixture {
  id: string;
  kind: FixedFixtureKind;
  label: string;
  position: Point3D;
  rotationY: number; // ラジアン
  dimensions: Dimensions3D;
  color?: string;
  locked: boolean;
  source: 'ai' | 'manual' | 'preset';
}

/** 2Dエディタ背景用の間取り図画像メタデータ */
export interface FloorplanImage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** スケール係数: 1ピクセルあたりのメートル数 */
  metersPerPixel: number;
  /** 画像左上のワールド座標オフセット (m) */
  offsetX: number;
  offsetZ: number;
  /** 背景透過度 (0.0〜1.0) */
  opacity: number;
  visible: boolean;
}

/** 基準2点間の実寸入力によるスケール補正記録 */
export interface ScaleCalibration {
  pointA: Point2D;
  pointB: Point2D;
  actualDistanceMeters: number;
  calibratedAt: string;
}

/** レイアウト案内に配置された家具インスタンス */
export interface PlacedFurniture {
  id: string;
  assetId: string; // FurnitureAsset.id への参照
  position: Point3D;
  rotationY: number; // ラジアン
  /** 個別にサイズ上書きしたい場合のみ指定（未指定時は FurnitureAsset.dimensions を参照） */
  dimensionsOverride?: Dimensions3D;
  locked?: boolean;
  memo?: string;
}

/** 同一物件内の家具配置パターン（案1、案2など） */
export interface LayoutVariant {
  id: string;
  name: string;
  placements: PlacedFurniture[];
  createdAt: string;
  updatedAt: string;
}

/** 物件データ */
export interface Property {
  id: string;
  name: string;
  memo?: string;
  /** 標準天井高 (m)。デフォルト例: 2.4 */
  defaultCeilingHeight: number;
  floorplanImage?: FloorplanImage;
  scaleCalibration?: ScaleCalibration;
  vertices: WallVertex[];
  walls: WallSegment[];
  zones?: RoomZone[];
  fixtures: FixedFixture[];
  layouts: LayoutVariant[];
  activeLayoutId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 3. UI・エディタ制御用の状態型（永続化対象外）
// ============================================================================

export type EditorMode = '3d' | '2d' | 'split';

export type CameraViewMode = 'perspective' | 'top' | 'first_person';

export type SelectedEntity =
  | { type: 'furniture'; id: string }
  | { type: 'fixture'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'vertex'; id: string }
  | null;

// ============================================================================
// 4. 家具解析・3Dモデル生成プロバイダ IF（GEMINI.md 必須要件）
// ============================================================================

export interface DimensionPromptField {
  key: keyof Dimensions3D;
  label: string;
  placeholderCm: number;
  hint?: string;
}

/** /api/analyze-furniture の解析結果 */
export interface FurnitureAnalysisResult {
  suggestedName: string;
  category: FurnitureCategory;
  primaryColor: string;
  shapeType: ProceduralShapeType;
  partsHint: string[];
  estimatedDimensionsCm: {
    width: number;
    depth: number;
    height: number;
  };
  requiredDimensionFields: DimensionPromptField[];
  summaryJa: string;
}

export interface FurnitureModelBuildInput {
  analysis: FurnitureAnalysisResult;
  /** ユーザーが確定した実寸 (m) */
  dimensions: Dimensions3D;
  imageDataUrl?: string;
}

/**
 * 家具解析・モデル生成プロバイダの共通インターフェース
 * 初期実装: ProceduralFurnitureProvider
 * 将来拡張: 外部 Image-to-3D API を呼んで kind: 'glb' を返す Provider に差し替え
 */
export interface FurnitureGenerationProvider {
  readonly id: string;
  readonly displayName: string;
  analyzeImage(imageDataUrl: string, mimeType: string): Promise<FurnitureAnalysisResult>;
  generateModel(input: FurnitureModelBuildInput): Promise<FurnitureModelSpec>;
}

// ============================================================================
// 5. 間取り図AI解析 API レスポンス型（[Phase 2] 画像正規化座標 0〜1000）
// ============================================================================

export interface FloorplanAnalysisResult {
  /** 推定される画像全体の横幅 (m)。初期スケールの仮値として使用 */
  estimatedImageWidthMeters: number;
  vertices: Array<{
    id: string;
    /** 画像左端=0 〜 右端=1000 */
    nx: number;
    /** 画像上端=0 〜 下端=1000 */
    ny: number;
  }>;
  walls: Array<{
    startVertexId: string;
    endVertexId: string;
    kind?: 'exterior' | 'interior' | 'low_wall';
    openings: Array<{
      kind: WallOpeningKind;
      positionRatio: number;
      widthMeters: number;
    }>;
  }>;
  fixtures: Array<{
    kind: FixedFixtureKind;
    label: string;
    nx: number;
    ny: number;
    rotationDeg: number;
    widthMeters: number;
    depthMeters: number;
    heightMeters: number;
  }>;
  notesJa?: string;
}

// ============================================================================
// 6. JSON エクスポート / インポート用スキーマ（[Phase 3]）
// ============================================================================

export interface PlannerExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  catalog: FurnitureAsset[];
  properties: Property[];
  activePropertyId: string | null;
}

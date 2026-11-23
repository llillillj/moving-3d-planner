import { Type, type Schema } from '@google/genai';
import type {
  CustomProceduralModel,
  ProceduralPartMaterial,
  ProceduralPartPrimitive,
  ProceduralPartSpec,
} from '@/types/planner';

const VALID_PRIMITIVES = new Set<ProceduralPartPrimitive>([
  'box',
  'rounded_box',
  'cylinder',
  'sphere',
  'capsule',
  'cone',
  'torus',
  'arch',
]);

const VALID_MATERIALS = new Set<ProceduralPartMaterial>([
  'wood',
  'fabric',
  'leather',
  'metal',
  'glass',
  'mirror',
  'plastic',
  'ceramic',
  'matte',
  'emissive',
]);

export function normalizeHexColor(value: unknown, fallback = '#6B7C8F'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
  }
  return fallback;
}

export function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampCm(value: unknown, fallback: number, min = 1, max = 500): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

/**
 * Gemini 構造化出力用のカスタム3Dモデル設計図スキーマ
 * LLM が幅(X)・高さ(Y)・奥行(Z)の軸を取り違えないよう、明示的プロパティ名で出力させ、
 * サーバー側サニタイザで内部配列型へ正規化する。
 */
export const CUSTOM_MODEL_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    '添付写真の家具を3Dプリミティブパーツの組み合わせで忠実に立体再現するための設計図（単位: cm、底面中央=[0,0,0]、Y軸上向き、正面=+Z）',
  properties: {
    designDimensionsCm: {
      type: Type.OBJECT,
      description: 'この3Dパーツ設計図の全体外寸 (cm)',
      properties: {
        width: { type: Type.NUMBER, description: '全体幅 X方向 (cm)' },
        depth: { type: Type.NUMBER, description: '全体奥行 Z方向 (cm)' },
        height: { type: Type.NUMBER, description: '全体高さ Y方向 (cm)' },
      },
      required: ['width', 'depth', 'height'],
    },
    structureSummaryJa: {
      type: Type.STRING,
      description:
        '構築した3Dモデルの構造的特徴を簡潔に説明する日本語文（例: 丸みのある3人掛けクッション、左右アーム、ハの字の木製テーパード脚4本で構成）',
    },
    parts: {
      type: Type.ARRAY,
      description:
        '家具を構成する3Dパーツ一覧（通常8〜36パーツ。脚・フレーム・天板・クッション・棚板・引き出し・取っ手・ガラス・装飾などを細かく分解する）',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'パーツの日本語名（例: 木製天板、左前脚、背もたれクッション）',
          },
          primitive: {
            type: Type.STRING,
            enum: [
              'box',
              'rounded_box',
              'cylinder',
              'sphere',
              'capsule',
              'cone',
              'torus',
              'arch',
            ],
            description:
              'box=角張った板・箱, rounded_box=角丸クッション・丸みのある本体, cylinder=円柱・丸脚・丸天板・シェード・鉢(topScale/bottomScaleで先細り可), sphere=球・楕円体・観葉植物の葉, capsule=パイプ・丸クッション, cone=円錐, torus=リング枠, arch=上部半円アーチ板',
          },
          position: {
            type: Type.OBJECT,
            description: 'パーツ中心の座標 (cm)。底面中央が (0, 0, 0)、正面が +Z、上が +Y',
            properties: {
              x: { type: Type.NUMBER, description: '左右位置 (cm)。左が負、右が正' },
              y: {
                type: Type.NUMBER,
                description:
                  '床からのパーツ中心高さ (cm)。床に接する高さHのパーツなら y = H / 2',
              },
              z: {
                type: Type.NUMBER,
                description: '前後位置 (cm)。背面が負、正面側が正',
              },
            },
            required: ['x', 'y', 'z'],
          },
          size: {
            type: Type.OBJECT,
            description: 'パーツ自体の大きさ (cm)。すべて正の値',
            properties: {
              width: { type: Type.NUMBER, description: 'X方向の幅 / 直径 (cm)' },
              height: { type: Type.NUMBER, description: 'Y方向の高さ (cm)' },
              depth: { type: Type.NUMBER, description: 'Z方向の奥行 / 直径 (cm)' },
            },
            required: ['width', 'height', 'depth'],
          },
          rotationDeg: {
            type: Type.OBJECT,
            description:
              '任意の傾き・回転（度数法 degrees）。不要なら省略またはすべて0。例: 背もたれ後傾は x:-10、横向き円柱は z:90 や x:90',
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              z: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'z'],
          },
          color: {
            type: Type.STRING,
            description: 'このパーツの正確な6桁HEXカラーコード（例: #8C6239）',
          },
          material: {
            type: Type.STRING,
            enum: [
              'wood',
              'fabric',
              'leather',
              'metal',
              'glass',
              'mirror',
              'plastic',
              'ceramic',
              'matte',
              'emissive',
            ],
            description: 'パーツの質感プリセット',
          },
          opacity: {
            type: Type.NUMBER,
            description: '不透明度 (0.1〜1.0)。ガラス・アクリルのみ 0.3〜0.45 程度、通常は 1.0',
          },
          cornerRadius: {
            type: Type.NUMBER,
            description: 'rounded_box の角丸係数 (0.05〜0.4)。クッションは 0.25〜0.38 目安',
          },
          topScale: {
            type: Type.NUMBER,
            description:
              'cylinder の上面半径倍率 (0.1〜1.5)。ランプシェードなど上が狭い形は 0.5〜0.7、通常は 1.0',
          },
          bottomScale: {
            type: Type.NUMBER,
            description:
              'cylinder の底面半径倍率 (0.1〜1.5)。先細りの北欧木脚や植木鉢は 0.55〜0.75、通常は 1.0',
          },
        },
        required: ['name', 'primitive', 'position', 'size', 'color', 'material'],
      },
    },
  },
  required: ['designDimensionsCm', 'structureSummaryJa', 'parts'],
};

/** 家具を写真から忠実に3D構築するための共通モデリング指針 */
export const CUSTOM_MODEL_DESIGN_RULES = `【3Dパーツ再構築の設計ルール（重要）】
写真に写っている「この特定の家具」のシルエット・構造・素材感・色分けを、Three.js のプリミティブパーツ群で忠実に立体再現してください。単調な箱1〜3個に簡略化せず、写真の特徴を丁寧に分解して通常 10〜36 個程度のパーツで組み立ててください。

1. 座標系（厳守・単位はすべて cm）:
   - 全体外寸は designDimensionsCm (width=X, depth=Z, height=Y)。
   - 原点 (0, 0, 0) は家具の「底面中央」。
   - X: 左が -width/2、右が +width/2。
   - Y: 床面が 0、最上部が +height。position.y はパーツの「中心」なので、床に接地する高さ h の脚やベースは必ず position.y = h / 2 にする。
   - Z: 背面が -depth/2、正面（ソファに座る側・棚の開口側・引き出し/扉側・椅子の座る側・デスクの膝側）が +depth/2。

2. 構造の接続性と接地:
   - パーツ同士が宙に浮いたり離れたりしないよう、下のパーツの上端 (y_bottom + h_bottom) と上のパーツの下端が密着または 1〜2cm 重なるように計算してください。
   - 例: 高さ 14cm の脚 (y=7, height=14) の上に厚さ 16cm の座面ベースを載せるなら、座面ベースの中心は y = 14 + 8 = 22。

3. プリミティブと質感の使い分け:
   - クッション・ソファ・ベッドマットレス・枕・丸みのある背もたれ → rounded_box（cornerRadius: 0.2〜0.38、material: fabric または leather）
   - 丸脚・テーパード脚・丸テーブル天板・スツール・植木鉢・シェード・ドラム窓 → cylinder（先細りの脚や鉢は bottomScale: 0.6、台形シェードは topScale: 0.55 など）
   - 傾いた背もたれ・ハの字脚・リクライニング面 → rotationDeg を活用（例: 背もたれ後傾は x: -10、ハの字脚は左右で z: ±6）
   - 横向きパイプ・ロールクッション・アーム → capsule や cylinder に rotationDeg (x: 90 または z: 90)
   - ガラス天板・ガラス扉 → material: "glass", opacity: 0.35
   - 鏡面 → material: "mirror"
   - 発光する照明のシェード内部や電球 → material: "emissive"
   - アーチ型ミラー・アーチ背もたれ → arch
   - 丸枠・リング脚 → torus

4. 家具タイプ別の忠実な再現ポイント:
   - L字ソファ・カウチ・オットマン付き: L字に張り出したカウチ部分を明確な位置差で再現。座面クッションや背もたれクッションの分割数、肘掛けの形、脚の本数と色、付属クッションの色違いまで再現。
   - テーブル・デスク: 天板の形状（長方形/丸/楕円/L字）、天板と脚の色・素材の違い（木天板×黒スチール脚など）、幕板・棚板・袖引き出し・モニター台・貫（補強バー）を個別パーツ化。
   - 棚・シェルフ・キャビネット: 側板・天板・底板・各段の棚板・背板を分けて「抜け感（空洞）」を再現。扉・引き出しの分割ライン、金属取っ手や丸ノブ、格子扉・ガラス扉もパーツ化。
   - チェア・オフィスチェア: 座面・背もたれのカーブや傾き、肘掛け、4本脚または5本星形脚＋ガスシリンダー支柱＋キャスターを再現。
   - 家電・その他（照明・観葉植物・ハンガーラック・ドレッサー・全身鏡など）: 固有の構造（鉢＋幹＋複数の葉 sphere、ハンガーバー＋下部棚＋キャスター、鏡＋フレーム＋引き出し等）を忠実に組み立てる。`;

interface RawVec3Object {
  x?: unknown;
  y?: unknown;
  z?: unknown;
}

interface RawSizeObject {
  width?: unknown;
  height?: unknown;
  depth?: unknown;
}

function extractPosition(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    const z = Number(raw[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return [
        clampNumber(x, 0, -400, 400),
        clampNumber(y, 0, -50, 450),
        clampNumber(z, 0, -400, 400),
      ];
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as RawVec3Object;
    if (
      typeof obj.x === 'number' &&
      typeof obj.y === 'number' &&
      typeof obj.z === 'number' &&
      Number.isFinite(obj.x) &&
      Number.isFinite(obj.y) &&
      Number.isFinite(obj.z)
    ) {
      return [
        clampNumber(obj.x, 0, -400, 400),
        clampNumber(obj.y, 0, -50, 450),
        clampNumber(obj.z, 0, -400, 400),
      ];
    }
  }
  return null;
}

function extractSize(raw: unknown): [number, number, number] | null {
  if (Array.isArray(raw) && raw.length >= 3) {
    const w = Number(raw[0]);
    const h = Number(raw[1]);
    const d = Number(raw[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && Number.isFinite(d)) {
      return [
        clampNumber(w, 10, 0.5, 500),
        clampNumber(h, 10, 0.5, 450),
        clampNumber(d, 10, 0.5, 500),
      ];
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as RawSizeObject;
    if (
      typeof obj.width === 'number' &&
      typeof obj.height === 'number' &&
      typeof obj.depth === 'number' &&
      Number.isFinite(obj.width) &&
      Number.isFinite(obj.height) &&
      Number.isFinite(obj.depth)
    ) {
      return [
        clampNumber(obj.width, 10, 0.5, 500),
        clampNumber(obj.height, 10, 0.5, 450),
        clampNumber(obj.depth, 10, 0.5, 500),
      ];
    }
  }
  return null;
}

function extractRotationDeg(raw: unknown): [number, number, number] | undefined {
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (Array.isArray(raw) && raw.length >= 3) {
    rx = clampNumber(Number(raw[0]), 0, -360, 360);
    ry = clampNumber(Number(raw[1]), 0, -360, 360);
    rz = clampNumber(Number(raw[2]), 0, -360, 360);
  } else if (raw && typeof raw === 'object') {
    const obj = raw as RawVec3Object;
    rx = clampNumber(obj.x, 0, -360, 360);
    ry = clampNumber(obj.y, 0, -360, 360);
    rz = clampNumber(obj.z, 0, -360, 360);
  } else {
    return undefined;
  }

  if (Math.abs(rx) < 0.01 && Math.abs(ry) < 0.01 && Math.abs(rz) < 0.01) {
    return undefined;
  }
  return [
    Math.round(rx * 10) / 10,
    Math.round(ry * 10) / 10,
    Math.round(rz * 10) / 10,
  ];
}

/**
 * Gemini から返却されたカスタム3Dモデル JSON を安全に検証・サニタイズする。
 * 有効なパーツが1つも無い場合は undefined を返す。
 */
export function sanitizeCustomProceduralModel(
  raw: unknown,
  fallbackDimsCm: { width: number; depth: number; height: number },
  fallbackColor = '#6B7C8F',
): CustomProceduralModel | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as {
    designDimensionsCm?: { width?: unknown; depth?: unknown; height?: unknown };
    structureSummaryJa?: unknown;
    parts?: unknown;
  };

  if (!Array.isArray(data.parts) || data.parts.length === 0) {
    return undefined;
  }

  const designDimensionsCm = {
    width: clampCm(data.designDimensionsCm?.width, fallbackDimsCm.width),
    depth: clampCm(data.designDimensionsCm?.depth, fallbackDimsCm.depth),
    height: clampCm(data.designDimensionsCm?.height, fallbackDimsCm.height),
  };

  const parts: ProceduralPartSpec[] = [];

  for (const item of data.parts.slice(0, 64)) {
    if (!item || typeof item !== 'object') continue;
    const rawPart = item as Record<string, unknown>;

    const position = extractPosition(rawPart.position);
    const size = extractSize(rawPart.size);
    if (!position || !size) continue;

    const primitive: ProceduralPartPrimitive =
      typeof rawPart.primitive === 'string' &&
      VALID_PRIMITIVES.has(rawPart.primitive as ProceduralPartPrimitive)
        ? (rawPart.primitive as ProceduralPartPrimitive)
        : 'box';

    const material: ProceduralPartMaterial =
      typeof rawPart.material === 'string' &&
      VALID_MATERIALS.has(rawPart.material as ProceduralPartMaterial)
        ? (rawPart.material as ProceduralPartMaterial)
        : 'matte';

    const name =
      typeof rawPart.name === 'string' && rawPart.name.trim()
        ? rawPart.name.trim().slice(0, 40)
        : `パーツ${parts.length + 1}`;

    const color = normalizeHexColor(rawPart.color, fallbackColor);
    const rotationDeg = extractRotationDeg(rawPart.rotationDeg);

    const spec: ProceduralPartSpec = {
      name,
      primitive,
      position: [
        Math.round(position[0] * 10) / 10,
        Math.round(position[1] * 10) / 10,
        Math.round(position[2] * 10) / 10,
      ],
      size: [
        Math.round(size[0] * 10) / 10,
        Math.round(size[1] * 10) / 10,
        Math.round(size[2] * 10) / 10,
      ],
      color,
      material,
    };

    if (rotationDeg) {
      spec.rotationDeg = rotationDeg;
    }

    if (typeof rawPart.opacity === 'number' && Number.isFinite(rawPart.opacity)) {
      const clampedOpacity = clampNumber(rawPart.opacity, 1, 0.12, 1);
      if (clampedOpacity < 0.99) {
        spec.opacity = Math.round(clampedOpacity * 100) / 100;
      }
    }

    if (
      primitive === 'rounded_box' &&
      typeof rawPart.cornerRadius === 'number' &&
      Number.isFinite(rawPart.cornerRadius)
    ) {
      spec.cornerRadius = Math.round(clampNumber(rawPart.cornerRadius, 0.2, 0.02, 0.45) * 100) / 100;
    }

    if (primitive === 'cylinder') {
      if (typeof rawPart.topScale === 'number' && Number.isFinite(rawPart.topScale)) {
        const ts = clampNumber(rawPart.topScale, 1, 0.08, 1.5);
        if (Math.abs(ts - 1) > 0.01) {
          spec.topScale = Math.round(ts * 100) / 100;
        }
      }
      if (typeof rawPart.bottomScale === 'number' && Number.isFinite(rawPart.bottomScale)) {
        const bs = clampNumber(rawPart.bottomScale, 1, 0.08, 1.5);
        if (Math.abs(bs - 1) > 0.01) {
          spec.bottomScale = Math.round(bs * 100) / 100;
        }
      }
    }

    parts.push(spec);
  }

  if (parts.length === 0) return undefined;

  const structureSummaryJa =
    typeof data.structureSummaryJa === 'string' && data.structureSummaryJa.trim()
      ? data.structureSummaryJa.trim()
      : `${parts.length}個の3Dパーツで写真の家具構造を再現しました。`;

  return {
    designDimensionsCm,
    parts,
    structureSummaryJa,
  };
}

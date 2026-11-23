import { NextResponse } from 'next/server';
import { Type, type Schema } from '@google/genai';
import {
  CUSTOM_MODEL_DESIGN_RULES,
  CUSTOM_MODEL_SCHEMA,
  clampCm,
  normalizeHexColor,
  sanitizeCustomProceduralModel,
} from '@/lib/furniture-custom-model';
import {
  createGeminiClient,
  extractJsonText,
  getGeminiModelName,
  MissingGeminiApiKeyError,
  parseImageDataUrl,
} from '@/lib/gemini';
import type {
  DimensionPromptField,
  FurnitureAnalysisMode,
  FurnitureAnalysisResult,
  FurnitureCategory,
  TemplateProceduralShapeType,
} from '@/types/planner';

const VALID_CATEGORIES = new Set<FurnitureCategory>([
  'sofa',
  'bed',
  'table',
  'desk',
  'chair',
  'storage',
  'tv_stand',
  'appliance',
  'rug',
  'other',
]);

const VALID_TEMPLATE_SHAPES = new Set<TemplateProceduralShapeType>([
  'sofa',
  'bed',
  'table',
  'desk',
  'chair',
  'shelf',
  'cabinet',
  'tv_stand',
  'refrigerator',
  'washing_machine',
  'rug',
  'box',
]);

const CATEGORY_FALLBACK_SHAPE: Record<FurnitureCategory, TemplateProceduralShapeType> = {
  sofa: 'sofa',
  bed: 'bed',
  table: 'table',
  desk: 'desk',
  chair: 'chair',
  storage: 'shelf',
  tv_stand: 'tv_stand',
  appliance: 'refrigerator',
  rug: 'rug',
  other: 'box',
};

const BASE_FURNITURE_PROPERTIES: Record<string, Schema> = {
  suggestedName: {
    type: Type.STRING,
    description:
      '特徴を含んだわかりやすい日本語の家具名（例: ネイビーの2.5人掛けソファ、オーク材ダイニングテーブル）',
  },
  category: {
    type: Type.STRING,
    enum: [
      'sofa',
      'bed',
      'table',
      'desk',
      'chair',
      'storage',
      'tv_stand',
      'appliance',
      'rug',
      'other',
    ],
  },
  primaryColor: {
    type: Type.STRING,
    description: '家具本体の代表的な色を表す6桁HEXカラーコード（例: #5B7489）',
  },
  shapeType: {
    type: Type.STRING,
    enum: [
      'sofa',
      'bed',
      'table',
      'desk',
      'chair',
      'shelf',
      'cabinet',
      'tv_stand',
      'refrigerator',
      'washing_machine',
      'rug',
      'box',
    ],
    description: '定型3Dテンプレートの中で最も近い形状タイプ',
  },
  partsHint: {
    type: Type.ARRAY,
    description:
      '家具の視覚的特徴を表す英語スネークケースのパーツヒント配列（例: arms, armless, wooden_legs, steel_legs, headboard, side_drawer, glass_top, drawers, cushion）',
    items: { type: Type.STRING },
  },
  estimatedDimensionsCm: {
    type: Type.OBJECT,
    description: '写真から推定される一般的なサイズ目安（cm単位の整数）',
    properties: {
      width: { type: Type.NUMBER, description: '幅 (cm)' },
      depth: { type: Type.NUMBER, description: '奥行 (cm)' },
      height: { type: Type.NUMBER, description: '高さ (cm)' },
    },
    required: ['width', 'depth', 'height'],
  },
  requiredDimensionFields: {
    type: Type.ARRAY,
    description:
      'ユーザーに実寸採寸をお願いする3項目（width, depth, height）。家具の形状に即した具体的な測り方ヒントを日本語で添える。',
    items: {
      type: Type.OBJECT,
      properties: {
        key: {
          type: Type.STRING,
          enum: ['width', 'depth', 'height'],
        },
        label: {
          type: Type.STRING,
          description: '日本語ラベル（例: 幅 (W) / 奥行 (D) / 高さ (H)）',
        },
        placeholderCm: {
          type: Type.NUMBER,
          description: '目安の入力値 (cm)',
        },
        hint: {
          type: Type.STRING,
          description:
            'どこからどこまで測るかの親切な日本語ヒント（例: 肘掛けの外側から外側まで）',
        },
      },
      required: ['key', 'label', 'placeholderCm', 'hint'],
    },
  },
  summaryJa: {
    type: Type.STRING,
    description:
      '写真から読み取った家具の特徴と、実寸サイズ入力を促す親しみやすい日本語コメント（1〜2文）',
  },
};

const BASE_REQUIRED_FIELDS = [
  'suggestedName',
  'category',
  'primaryColor',
  'shapeType',
  'partsHint',
  'estimatedDimensionsCm',
  'requiredDimensionFields',
  'summaryJa',
];

const FURNITURE_TEMPLATE_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: BASE_FURNITURE_PROPERTIES,
  required: BASE_REQUIRED_FIELDS,
};

const FURNITURE_RECONSTRUCT_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ...BASE_FURNITURE_PROPERTIES,
    customModel: CUSTOM_MODEL_SCHEMA,
  },
  required: [...BASE_REQUIRED_FIELDS, 'customModel'],
};

const FURNITURE_TEMPLATE_PROMPT = `あなたは引っ越し検討者向けのインテリア・家具アドバイザーです。
添付された家具の写真を解析し、3D部屋シミュレーションに登録するための特徴と、ユーザーに実寸（cm）を入力してもらうための案内を JSON で返してください。

【解析ルール】
1. suggestedName は色・素材・サイズ感を含んだ自然な日本語名にしてください（20文字以内目安）。
2. primaryColor は家具の面積が最も大きい本体の色を正確な6桁HEXコード（#RRGGBB）で抽出してください。
3. shapeType は最も見た目に近い定型プロシージャル形状を選んでください：
   - 扉・引き出しがある収納やチェスト → cabinet
   - 本棚・オープンラック → shelf
   - ローボード・テレビ台 → tv_stand
   - 作業机・PCデスク → desk
   - 食卓・ローテーブル → table
   - 冷蔵庫 → refrigerator
   - 洗濯機 → washing_machine
   - ラグ・カーペット → rug
4. partsHint には見た目の特徴を最大5個まで英語スネークケースで入れてください（例: arms, armless, wooden_legs, steel_legs, side_drawer, headboard, drawers, cushion, low_profile）。
5. estimatedDimensionsCm は日本の一般的な家具規格に基づく妥当な目安（cm）を返してください。
6. requiredDimensionFields には必ず width, depth, height の3項目を順番に含め、この家具をメジャーで測るときに「どこからどこまで測ればよいか」が直感的に分かる具体的な日本語 hint を書いてください。
7. summaryJa は「○○と判定しました。正確なサイズ感を確認するため、幅・奥行・高さ（cm）を入力してください。」のような親切な日本語にしてください。`;

const FURNITURE_RECONSTRUCT_PROMPT = `${FURNITURE_TEMPLATE_PROMPT}

さらに今回は、定型テンプレートだけでなく **写真に写っているこの家具そのものを3Dパーツの組み合わせで忠実に立体再現する customModel** も同時に生成してください。
- customModel.designDimensionsCm には、あなたが推定した estimatedDimensionsCm と一致する幅・奥行・高さ（cm）を設定し、その空間内に収まるように各パーツを配置してください。
- shapeType には、万一定型テンプレートへ切り替えた際に最も近いフォールバック型を入れてください。

${CUSTOM_MODEL_DESIGN_RULES}`;

function sanitizeFurnitureResult(
  raw: unknown,
  mode: FurnitureAnalysisMode,
): FurnitureAnalysisResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<FurnitureAnalysisResult> & {
    customModel?: unknown;
  };

  const category: FurnitureCategory =
    data.category && VALID_CATEGORIES.has(data.category) ? data.category : 'other';

  const templateShapeType: TemplateProceduralShapeType =
    data.shapeType && VALID_TEMPLATE_SHAPES.has(data.shapeType as TemplateProceduralShapeType)
      ? (data.shapeType as TemplateProceduralShapeType)
      : CATEGORY_FALLBACK_SHAPE[category];

  const primaryColor = normalizeHexColor(data.primaryColor);

  const estimatedDimensionsCm = {
    width: clampCm(data.estimatedDimensionsCm?.width, 120),
    depth: clampCm(data.estimatedDimensionsCm?.depth, 60),
    height: clampCm(data.estimatedDimensionsCm?.height, 75),
  };

  const partsHint = Array.isArray(data.partsHint)
    ? data.partsHint
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().toLowerCase())
        .slice(0, 6)
    : [];

  const defaultFields: Record<'width' | 'depth' | 'height', DimensionPromptField> = {
    width: {
      key: 'width',
      label: '幅 (W)',
      placeholderCm: estimatedDimensionsCm.width,
      hint: '正面から見た左右の最大幅',
    },
    depth: {
      key: 'depth',
      label: '奥行 (D)',
      placeholderCm: estimatedDimensionsCm.depth,
      hint: '手前から奥までの最大奥行',
    },
    height: {
      key: 'height',
      label: '高さ (H)',
      placeholderCm: estimatedDimensionsCm.height,
      hint: '床から一番高い部分までの高さ',
    },
  };

  const rawFieldMap = new Map<
    'width' | 'depth' | 'height',
    Partial<DimensionPromptField>
  >();
  if (Array.isArray(data.requiredDimensionFields)) {
    for (const f of data.requiredDimensionFields) {
      if (f && (f.key === 'width' || f.key === 'depth' || f.key === 'height')) {
        rawFieldMap.set(f.key, f);
      }
    }
  }

  const requiredDimensionFields: DimensionPromptField[] = (
    ['width', 'depth', 'height'] as const
  ).map((key) => {
    const incoming = rawFieldMap.get(key);
    const fallback = defaultFields[key];
    return {
      key,
      label:
        typeof incoming?.label === 'string' && incoming.label.trim()
          ? incoming.label.trim()
          : fallback.label,
      placeholderCm: clampCm(incoming?.placeholderCm, fallback.placeholderCm),
      hint:
        typeof incoming?.hint === 'string' && incoming.hint.trim()
          ? incoming.hint.trim()
          : fallback.hint,
    };
  });

  const suggestedName =
    typeof data.suggestedName === 'string' && data.suggestedName.trim()
      ? data.suggestedName.trim()
      : 'マイ家具';

  const customModel =
    mode === 'reconstruct'
      ? sanitizeCustomProceduralModel(
          data.customModel,
          estimatedDimensionsCm,
          primaryColor,
        )
      : undefined;

  const summaryJa =
    typeof data.summaryJa === 'string' && data.summaryJa.trim()
      ? data.summaryJa.trim()
      : customModel
        ? `「${suggestedName}」として写真から3Dモデルを構築しました。実寸サイズ（cm）を入力してカタログへ登録してください。`
        : `「${suggestedName}」として特徴を読み取りました。実寸サイズ（cm）を入力してカタログへ登録してください。`;

  return {
    suggestedName,
    category,
    primaryColor,
    shapeType: customModel ? 'custom' : templateShapeType,
    fallbackTemplateShapeType: templateShapeType,
    partsHint,
    estimatedDimensionsCm,
    requiredDimensionFields,
    summaryJa,
    customModel,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      mimeType?: string;
      mode?: FurnitureAnalysisMode;
    };

    if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
      return NextResponse.json(
        { error: '家具画像データが見つかりませんでした。' },
        { status: 400 },
      );
    }

    const mode: FurnitureAnalysisMode =
      body.mode === 'template' ? 'template' : 'reconstruct';

    const ai = createGeminiClient();
    const model = getGeminiModelName();
    const { mimeType, base64Data } = parseImageDataUrl(
      body.imageDataUrl,
      body.mimeType || 'image/jpeg',
    );

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        mode === 'reconstruct'
          ? FURNITURE_RECONSTRUCT_PROMPT
          : FURNITURE_TEMPLATE_PROMPT,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema:
          mode === 'reconstruct'
            ? FURNITURE_RECONSTRUCT_RESPONSE_SCHEMA
            : FURNITURE_TEMPLATE_RESPONSE_SCHEMA,
        temperature: mode === 'reconstruct' ? 0.25 : 0.2,
        maxOutputTokens: mode === 'reconstruct' ? 8192 : 2048,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json(
        {
          error:
            'Gemini API から解析結果を取得できませんでした。別の角度の写真でもう一度お試しください。',
          code: 'EMPTY_RESPONSE',
        },
        { status: 502 },
      );
    }

    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    const sanitized = sanitizeFurnitureResult(parsedJson, mode);

    return NextResponse.json(sanitized);
  } catch (error) {
    if (error instanceof MissingGeminiApiKeyError) {
      return NextResponse.json(
        { error: error.message, code: 'MISSING_API_KEY' },
        { status: 503 },
      );
    }

    console.error('家具画像AI解析エラー:', error);
    const message =
      error instanceof Error
        ? `家具画像の解析中にエラーが発生しました: ${error.message}`
        : '家具画像の解析中に予期しないエラーが発生しました。';

    return NextResponse.json(
      { error: message, code: 'ANALYSIS_FAILED' },
      { status: 500 },
    );
  }
}

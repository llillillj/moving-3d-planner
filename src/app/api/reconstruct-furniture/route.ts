import { NextResponse } from 'next/server';
import {
  CUSTOM_MODEL_DESIGN_RULES,
  CUSTOM_MODEL_SCHEMA,
  clampCm,
  sanitizeCustomProceduralModel,
} from '@/lib/furniture-custom-model';
import {
  createGeminiClient,
  extractJsonText,
  getGeminiModelName,
  MissingGeminiApiKeyError,
  parseImageDataUrl,
} from '@/lib/gemini';
import { FURNITURE_CATEGORY_LABELS } from '@/lib/units';
import type { FurnitureReconstructInput } from '@/types/planner';

function buildReconstructPrompt(input: FurnitureReconstructInput): string {
  const lines: string[] = [
    'あなたは家具の3Dモデリング・プロダクトデザインの専門家です。',
    '添付された家具の写真を詳細に観察し、その家具の形状・プロポーション・パーツ構成・色分け・素材感を 3D プリミティブパーツの組み合わせとして忠実に再構築し、JSON 形式で出力してください。',
  ];

  const contextHints: string[] = [];
  if (input.suggestedName?.trim()) {
    contextHints.push(`- 家具名: ${input.suggestedName.trim()}`);
  }
  if (input.category && input.category in FURNITURE_CATEGORY_LABELS) {
    contextHints.push(`- カテゴリ: ${FURNITURE_CATEGORY_LABELS[input.category]}`);
  }
  if (
    input.dimensionsCm &&
    input.dimensionsCm.width > 0 &&
    input.dimensionsCm.depth > 0 &&
    input.dimensionsCm.height > 0
  ) {
    const w = clampCm(input.dimensionsCm.width, 120);
    const d = clampCm(input.dimensionsCm.depth, 60);
    const h = clampCm(input.dimensionsCm.height, 75);
    contextHints.push(
      `- 目標の実寸サイズ: 幅(X) ${w}cm × 奥行(Z) ${d}cm × 高さ(Y) ${h}cm（designDimensionsCm はこの値に合わせ、パーツ全体がこの空間にぴったり収まるよう設計してください）`,
    );
  }
  if (input.userHint?.trim()) {
    contextHints.push(
      `- ユーザーからの形状・見た目リクエスト（最優先で反映）: ${input.userHint.trim()}`,
    );
  }

  if (contextHints.length > 0) {
    lines.push('', '【参考情報・ユーザー指定】', ...contextHints);
  }

  lines.push('', CUSTOM_MODEL_DESIGN_RULES);

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<FurnitureReconstructInput>;

    if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
      return NextResponse.json(
        { error: '家具画像データが見つかりませんでした。' },
        { status: 400 },
      );
    }

    const ai = createGeminiClient();
    const model = getGeminiModelName();
    const { mimeType, base64Data } = parseImageDataUrl(
      body.imageDataUrl,
      body.mimeType || 'image/jpeg',
    );

    const prompt = buildReconstructPrompt({
      imageDataUrl: body.imageDataUrl,
      mimeType,
      suggestedName: body.suggestedName,
      category: body.category,
      dimensionsCm: body.dimensionsCm,
      userHint: body.userHint,
    });

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: CUSTOM_MODEL_SCHEMA,
        temperature: 0.25,
        maxOutputTokens: 8192,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json(
        {
          error:
            'Gemini API から3D構築データを取得できませんでした。別の角度の写真でもう一度お試しください。',
          code: 'EMPTY_RESPONSE',
        },
        { status: 502 },
      );
    }

    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    const fallbackDimsCm = {
      width: clampCm(body.dimensionsCm?.width, 120),
      depth: clampCm(body.dimensionsCm?.depth, 60),
      height: clampCm(body.dimensionsCm?.height, 75),
    };

    const customModel = sanitizeCustomProceduralModel(parsedJson, fallbackDimsCm);
    if (!customModel) {
      return NextResponse.json(
        {
          error:
            '家具の3Dパーツ構成を生成できませんでした。全体がはっきり写った写真でもう一度お試しください。',
          code: 'EMPTY_PARTS',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(customModel);
  } catch (error) {
    if (error instanceof MissingGeminiApiKeyError) {
      return NextResponse.json(
        { error: error.message, code: 'MISSING_API_KEY' },
        { status: 503 },
      );
    }

    console.error('家具3D再構築エラー:', error);
    const message =
      error instanceof Error
        ? `家具の3D構築中にエラーが発生しました: ${error.message}`
        : '家具の3D構築中に予期しないエラーが発生しました。';

    return NextResponse.json(
      { error: message, code: 'RECONSTRUCT_FAILED' },
      { status: 500 },
    );
  }
}

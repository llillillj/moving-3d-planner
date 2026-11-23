import type {
  CustomProceduralModel,
  FurnitureAnalysisMode,
  FurnitureAnalysisResult,
  FurnitureGenerationProvider,
  FurnitureModelBuildInput,
  FurnitureModelSpec,
  FurnitureReconstructInput,
} from '@/types/planner';

/**
 * 初期実装プロバイダ:
 * - analyzeImage: /api/analyze-furniture を呼び出して家具の種類・色・形状ヒント・必要寸法（および mode='reconstruct' 時はカスタム3Dパーツ構成）を取得
 * - reconstructFromImage: /api/reconstruct-furniture を呼び出して写真からカスタム3Dパーツ構成を構築・再構築
 * - generateModel: 解析結果からプロシージャル3Dモデル仕様（AI構築パーツまたは定型テンプレート）を生成
 */
export class ProceduralFurnitureProvider implements FurnitureGenerationProvider {
  readonly id = 'procedural-gemini';
  readonly displayName = 'プロシージャル3D生成（Gemini解析・AIパーツ構築）';

  async analyzeImage(
    imageDataUrl: string,
    mimeType: string,
    options?: { mode?: FurnitureAnalysisMode },
  ): Promise<FurnitureAnalysisResult> {
    const response = await fetch('/api/analyze-furniture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl,
        mimeType,
        mode: options?.mode ?? 'reconstruct',
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as
      | FurnitureAnalysisResult
      | { error?: string };

    if (!response.ok) {
      const message =
        'error' in payload && payload.error
          ? payload.error
          : `家具画像の解析に失敗しました (HTTP ${response.status})`;
      throw new Error(message);
    }

    return payload as FurnitureAnalysisResult;
  }

  async reconstructFromImage(
    input: FurnitureReconstructInput,
  ): Promise<CustomProceduralModel> {
    const response = await fetch('/api/reconstruct-furniture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const payload = (await response.json().catch(() => ({}))) as
      | CustomProceduralModel
      | { error?: string };

    if (!response.ok) {
      const message =
        'error' in payload && payload.error
          ? payload.error
          : `家具の3D構築に失敗しました (HTTP ${response.status})`;
      throw new Error(message);
    }

    return payload as CustomProceduralModel;
  }

  async generateModel(input: FurnitureModelBuildInput): Promise<FurnitureModelSpec> {
    const hasCustomParts = Boolean(
      input.analysis.customModel && input.analysis.customModel.parts.length > 0,
    );
    return {
      kind: 'procedural',
      shapeType:
        input.analysis.shapeType === 'custom' && hasCustomParts
          ? 'custom'
          : input.analysis.shapeType === 'custom'
            ? (input.analysis.fallbackTemplateShapeType ?? 'box')
            : input.analysis.shapeType,
      color: input.analysis.primaryColor,
      partsHint: input.analysis.partsHint,
      ...(hasCustomParts ? { customModel: input.analysis.customModel } : {}),
    };
  }
}

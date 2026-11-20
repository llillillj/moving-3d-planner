import type {
  FurnitureAnalysisResult,
  FurnitureGenerationProvider,
  FurnitureModelBuildInput,
  FurnitureModelSpec,
} from '@/types/planner';

/**
 * 初期実装プロバイダ:
 * - analyzeImage: /api/analyze-furniture を呼び出して家具の種類・色・形状ヒント・必要寸法を取得
 * - generateModel: 解析結果からプロシージャル3Dモデル仕様を生成
 */
export class ProceduralFurnitureProvider implements FurnitureGenerationProvider {
  readonly id = 'procedural-gemini';
  readonly displayName = 'プロシージャル3D生成（Gemini解析）';

  async analyzeImage(
    imageDataUrl: string,
    mimeType: string,
  ): Promise<FurnitureAnalysisResult> {
    const response = await fetch('/api/analyze-furniture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl, mimeType }),
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

  async generateModel(input: FurnitureModelBuildInput): Promise<FurnitureModelSpec> {
    return {
      kind: 'procedural',
      shapeType: input.analysis.shapeType,
      color: input.analysis.primaryColor,
      partsHint: input.analysis.partsHint,
    };
  }
}

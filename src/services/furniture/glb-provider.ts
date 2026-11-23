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
 * 将来の外部 Image-to-3D API (.glb) 連携用プロバイダ（差し替え口）
 * 実際に接続する際は generateModel 内で生成APIを呼び出し、
 * 生成された .glb の URL を { kind: 'glb', url, normalizeScale: true } として返却する。
 */
export class GlbFurnitureProvider implements FurnitureGenerationProvider {
  readonly id = 'external-glb-placeholder';
  readonly displayName = '外部 Image-to-3D (GLB) 生成';

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
        mode: options?.mode ?? 'template',
      }),
    });
    if (!response.ok) {
      throw new Error(`家具画像の解析に失敗しました (HTTP ${response.status})`);
    }
    return (await response.json()) as FurnitureAnalysisResult;
  }

  async reconstructFromImage(
    _input: FurnitureReconstructInput,
  ): Promise<CustomProceduralModel> {
    throw new Error('外部 Image-to-3D (GLB) 生成プロバイダは未接続です。');
  }

  async generateModel(_input: FurnitureModelBuildInput): Promise<FurnitureModelSpec> {
    throw new Error('外部 Image-to-3D (GLB) 生成プロバイダは未接続です。');
  }
}

import type { FurnitureGenerationProvider } from '@/types/planner';
import { ProceduralFurnitureProvider } from './procedural-provider';

/**
 * アクティブな家具解析・3Dモデル生成プロバイダを取得する。
 * 将来 GLB 生成API（Tripo / Meshy 等）へ切り替える際は、
 * このファクトリの返却実装を GlbFurnitureProvider に差し替えるだけで UI 側は変更不要。
 */
const activeProvider: FurnitureGenerationProvider = new ProceduralFurnitureProvider();

export function getFurnitureGenerationProvider(): FurnitureGenerationProvider {
  return activeProvider;
}

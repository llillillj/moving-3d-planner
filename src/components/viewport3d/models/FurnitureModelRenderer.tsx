'use client';

import React, { Component, Suspense } from 'react';
import type { FurnitureModelRendererProps } from '@/types/planner';
import { GlbFurnitureMesh } from './GlbFurnitureMesh';
import { ProceduralFurnitureMesh } from './ProceduralFurnitureMesh';

interface GlbErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface GlbErrorBoundaryState {
  hasError: boolean;
}

class GlbErrorBoundary extends Component<GlbErrorBoundaryProps, GlbErrorBoundaryState> {
  constructor(props: GlbErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): GlbErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('GLBモデルの読み込みに失敗したためフォールバック表示を使用します:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function GlbLoadingFallback({
  dimensions,
}: {
  dimensions: FurnitureModelRendererProps['dimensions'];
}) {
  return (
    <mesh position={[0, dimensions.height / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshStandardMaterial color="#94A3B8" transparent opacity={0.45} wireframe />
    </mesh>
  );
}

/**
 * 家具3Dモデルの単一描画エントリ（GEMINI.md 必須要件）
 * asset.model.kind に応じてプロシージャル描画と GLB 読み込みを切り替える。
 */
export function FurnitureModelRenderer({
  asset,
  dimensions,
  isSelected = false,
  isHovered = false,
}: FurnitureModelRendererProps) {
  if (asset.model.kind === 'glb') {
    const fallback = (
      <ProceduralFurnitureMesh
        shapeType="box"
        color="#94A3B8"
        dimensions={dimensions}
        isSelected={isSelected}
        isHovered={isHovered}
      />
    );

    return (
      <GlbErrorBoundary fallback={fallback}>
        <Suspense fallback={<GlbLoadingFallback dimensions={dimensions} />}>
          <GlbFurnitureMesh
            url={asset.model.url}
            normalizeScale={asset.model.normalizeScale}
            dimensions={dimensions}
          />
        </Suspense>
      </GlbErrorBoundary>
    );
  }

  return (
    <ProceduralFurnitureMesh
      shapeType={asset.model.shapeType}
      color={asset.model.color}
      partsHint={asset.model.partsHint}
      dimensions={dimensions}
      isSelected={isSelected}
      isHovered={isHovered}
    />
  );
}

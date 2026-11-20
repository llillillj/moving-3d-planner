'use client';

import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { FurnitureModelRenderer } from '@/components/viewport3d/models/FurnitureModelRenderer';
import type { Dimensions3D, FurnitureAsset } from '@/types/planner';

interface FurniturePreview3DProps {
  asset: FurnitureAsset;
  dimensions: Dimensions3D;
}

export function FurniturePreview3D({ asset, dimensions }: FurniturePreview3DProps) {
  const maxSpan = useMemo(
    () => Math.max(dimensions.width, dimensions.depth, dimensions.height, 0.5),
    [dimensions.width, dimensions.depth, dimensions.height],
  );

  const camDist = maxSpan * 1.9;

  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100 to-slate-200/70">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          fov: 40,
          position: [camDist * 0.78, camDist * 0.62, camDist * 0.95],
          near: 0.05,
          far: 50,
        }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 7, 5]} intensity={1.1} castShadow />
        <directionalLight position={[-4, 3, -4]} intensity={0.35} />

        {/* 床ディスク */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <circleGeometry args={[maxSpan * 1.15, 32]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.95} />
        </mesh>

        {/* 単一描画コンポーネント <FurnitureModelRenderer /> を経由して描画 */}
        <FurnitureModelRenderer asset={asset} dimensions={dimensions} />

        <OrbitControls
          makeDefault
          target={[0, dimensions.height * 0.42, 0]}
          enablePan={false}
          autoRotate
          autoRotateSpeed={1.6}
          minDistance={maxSpan * 0.8}
          maxDistance={maxSpan * 4.5}
        />
      </Canvas>
      <div className="pointer-events-none absolute right-2 bottom-1.5 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-2xs">
        3Dプレビュー（ドラッグで回転）
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { Dimensions3D } from '@/types/planner';

interface GlbFurnitureMeshProps {
  url: string;
  normalizeScale: boolean;
  dimensions: Dimensions3D;
}

/**
 * 外部 GLB 3Dモデルを読み込み、normalizeScale が true の場合は
 * バウンディングボックスを指定実寸 (dimensions) に自動フィットさせ、
 * 底面中央が (0, 0, 0) に接地するよう補正して描画する。
 */
export function GlbFurnitureMesh({
  url,
  normalizeScale,
  dimensions,
}: GlbFurnitureMeshProps) {
  const gltf = useGLTF(url);

  const normalized = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const safeX = size.x > 0.0001 ? size.x : 1;
    const safeY = size.y > 0.0001 ? size.y : 1;
    const safeZ = size.z > 0.0001 ? size.z : 1;

    const scale: [number, number, number] = normalizeScale
      ? [
          dimensions.width / safeX,
          dimensions.height / safeY,
          dimensions.depth / safeZ,
        ]
      : [1, 1, 1];

    // 元メッシュの底面中央をローカル原点へ平行移動（スケール適用後の位置補正）
    const position: [number, number, number] = [
      -center.x * scale[0],
      -box.min.y * scale[1],
      -center.z * scale[2],
    ];

    return { scene: cloned, scale, position };
  }, [gltf.scene, normalizeScale, dimensions.width, dimensions.height, dimensions.depth]);

  return (
    <group position={normalized.position} scale={normalized.scale}>
      <primitive object={normalized.scene} />
    </group>
  );
}

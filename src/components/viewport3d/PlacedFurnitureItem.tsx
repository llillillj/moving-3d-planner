'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  formatDimensionsCm,
  radToDeg,
  snapAngleRad,
  snapMeters,
} from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { FurnitureAsset, PlacedFurniture } from '@/types/planner';
import { FurnitureModelRenderer } from './models/FurnitureModelRenderer';

interface PlacedFurnitureItemProps {
  placement: PlacedFurniture;
  asset: FurnitureAsset;
  isSelected: boolean;
}

export function PlacedFurnitureItem({
  placement,
  asset,
  isSelected,
}: PlacedFurnitureItemProps) {
  const { camera, gl } = useThree();
  const cameraViewMode = usePlannerStore((s) => s.cameraViewMode);
  const snapMoveCm = usePlannerStore((s) => s.snapMoveCm);
  const snapAngle90 = usePlannerStore((s) => s.snapAngle90);
  const setSelectedEntity = usePlannerStore((s) => s.setSelectedEntity);
  const setIsDragging3D = usePlannerStore((s) => s.setIsDragging3D);
  const updatePlacedFurniture = usePlannerStore((s) => s.updatePlacedFurniture);
  const commitActiveProperty = usePlannerStore((s) => s.commitActiveProperty);

  const [hovered, setHovered] = useState(false);
  const [rotateHovered, setRotateHovered] = useState(false);

  const dimensions = placement.dimensionsOverride ?? asset.dimensions;

  const interactionRef = useRef<{
    mode: 'none' | 'move' | 'rotate';
    offsetX: number;
    offsetZ: number;
    originX: number;
    originZ: number;
  }>({
    mode: 'none',
    offsetX: 0,
    offsetZ: 0,
    originX: 0,
    originZ: 0,
  });

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -placement.position.y);
    const hit = new THREE.Vector3();

    const handleMove = (e: PointerEvent) => {
      const mode = interactionRef.current.mode;
      if (mode === 'none') return;

      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      if (!raycaster.ray.intersectPlane(plane, hit)) return;

      if (mode === 'move') {
        const rawX = hit.x + interactionRef.current.offsetX;
        const rawZ = hit.z + interactionRef.current.offsetZ;
        const useSnap = snapMoveCm > 0 && !e.shiftKey;
        const nextX = useSnap ? snapMeters(rawX, snapMoveCm / 100) : rawX;
        const nextZ = useSnap ? snapMeters(rawZ, snapMoveCm / 100) : rawZ;

        updatePlacedFurniture(
          placement.id,
          {
            position: { x: nextX, y: placement.position.y, z: nextZ },
          },
          { persist: false },
        );
      } else if (mode === 'rotate') {
        const dx = hit.x - interactionRef.current.originX;
        const dz = hit.z - interactionRef.current.originZ;
        if (Math.hypot(dx, dz) < 0.05) return;
        // ローカル +Z 方向を正面として回転角を算出
        const rawAngle = Math.atan2(dx, dz);
        const nextAngle =
          snapAngle90 && !e.shiftKey
            ? snapAngleRad(rawAngle, 90)
            : snapAngleRad(rawAngle, 5);
        updatePlacedFurniture(
          placement.id,
          { rotationY: nextAngle },
          { persist: false },
        );
      }
    };

    const handleUp = () => {
      if (interactionRef.current.mode === 'none') return;
      interactionRef.current.mode = 'none';
      setIsDragging3D(false);
      document.body.style.cursor = 'auto';
      commitActiveProperty();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [
    camera,
    gl,
    placement.id,
    placement.position.y,
    snapMoveCm,
    snapAngle90,
    setIsDragging3D,
    updatePlacedFurniture,
    commitActiveProperty,
  ]);

  const handleBodyPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedEntity({ type: 'furniture', id: placement.id });

    if (placement.locked || cameraViewMode === 'first_person') return;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -placement.position.y);
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(plane, hit)) {
      interactionRef.current = {
        mode: 'move',
        offsetX: placement.position.x - hit.x,
        offsetZ: placement.position.z - hit.z,
        originX: placement.position.x,
        originZ: placement.position.z,
      };
      setIsDragging3D(true);
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleRotatePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (placement.locked || cameraViewMode === 'first_person') return;

    interactionRef.current = {
      mode: 'rotate',
      offsetX: 0,
      offsetZ: 0,
      originX: placement.position.x,
      originZ: placement.position.z,
    };
    setIsDragging3D(true);
    document.body.style.cursor = 'ew-resize';
  };

  const handleRadius = useMemo(
    () => Math.max(dimensions.depth / 2 + 0.32, 0.45),
    [dimensions.depth],
  );

  const selectionFrameGeom = useMemo(() => {
    const hw = dimensions.width / 2 + 0.04;
    const hd = dimensions.depth / 2 + 0.04;
    const pts = [
      new THREE.Vector3(-hw, 0.015, -hd),
      new THREE.Vector3(hw, 0.015, -hd),
      new THREE.Vector3(hw, 0.015, hd),
      new THREE.Vector3(-hw, 0.015, hd),
      new THREE.Vector3(-hw, 0.015, -hd),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [dimensions.width, dimensions.depth]);

  useEffect(() => {
    return () => {
      selectionFrameGeom.dispose();
    };
  }, [selectionFrameGeom]);

  return (
    <group
      position={[placement.position.x, placement.position.y, placement.position.z]}
      rotation={[0, placement.rotationY, 0]}
    >
      {/* 家具本体（単一エントリ FurnitureModelRenderer 経由） */}
      <group
        onPointerDown={handleBodyPointerDown}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          if (interactionRef.current.mode === 'none') {
            document.body.style.cursor = placement.locked ? 'pointer' : 'grab';
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          if (interactionRef.current.mode === 'none') {
            document.body.style.cursor = 'auto';
          }
        }}
      >
        <FurnitureModelRenderer
          asset={asset}
          dimensions={dimensions}
          isSelected={isSelected}
          isHovered={hovered}
        />
      </group>

      {/* 選択時の足元アウトライン・正面方向マーカー・回転ハンドル */}
      {isSelected && (
        <>
          <lineLoop geometry={selectionFrameGeom}>
            <lineBasicMaterial color={placement.locked ? '#F59E0B' : '#2563EB'} />
          </lineLoop>

          {/* 回転ハンドル（未ロック時かつ一人称以外） */}
          {!placement.locked && cameraViewMode !== 'first_person' && (
            <group>
              {/* 正面 (+Z) への軸線 */}
              <mesh position={[0, 0.02, handleRadius / 2]}>
                <boxGeometry args={[0.025, 0.012, handleRadius]} />
                <meshBasicMaterial color="#2563EB" />
              </mesh>
              {/* 回転ドラッグ用ノブ */}
              <mesh
                position={[0, 0.08, handleRadius]}
                onPointerDown={handleRotatePointerDown}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setRotateHovered(true);
                  document.body.style.cursor = 'ew-resize';
                }}
                onPointerOut={() => {
                  setRotateHovered(false);
                  if (interactionRef.current.mode === 'none') {
                    document.body.style.cursor = 'auto';
                  }
                }}
              >
                <sphereGeometry args={[rotateHovered ? 0.11 : 0.09, 16, 16]} />
                <meshStandardMaterial
                  color={rotateHovered ? '#1D4ED8' : '#3B82F6'}
                  emissive="#1D4ED8"
                  emissiveIntensity={0.35}
                />
              </mesh>
            </group>
          )}

          {/* 選択家具のコンパクト寸法ラベル */}
          <Html position={[0, dimensions.height + 0.24, 0]} center distanceFactor={9}>
            <div className="pointer-events-none whitespace-nowrap rounded-md bg-blue-600/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-md">
              <span>{asset.name}</span>
              <span className="ml-1.5 text-blue-100">
                {formatDimensionsCm(dimensions)}
              </span>
              <span className="ml-1.5 text-blue-200">
                {Math.round(radToDeg(placement.rotationY))}°
              </span>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

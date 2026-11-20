'use client';

import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { formatDimensionsCm, snapMeters } from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { FixedFixture } from '@/types/planner';

interface FixedFixtureMeshProps {
  fixture: FixedFixture;
  isSelected: boolean;
}

function FixtureGeometry({
  fixture,
  isSelected,
  isHovered,
}: {
  fixture: FixedFixture;
  isSelected: boolean;
  isHovered: boolean;
}) {
  const { width: w, depth: d, height: h } = fixture.dimensions;
  const baseColor = fixture.color || '#F1F5F9';
  const emissive = isSelected ? '#F59E0B' : isHovered ? '#38BDF8' : '#000000';
  const emissiveIntensity = isSelected ? 0.2 : isHovered ? 0.08 : 0;

  switch (fixture.kind) {
    case 'kitchen': {
      const counterH = Math.min(0.05, h * 0.08);
      const bodyH = Math.max(0.1, h - counterH);
      return (
        <group>
          {/* キャビネット */}
          <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, bodyH, d]} />
            <meshStandardMaterial
              color={baseColor}
              roughness={0.65}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* ステンレスワークトップ */}
          <mesh position={[0, h - counterH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w + 0.01, counterH, d + 0.01]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.35} metalness={0.55} />
          </mesh>
          {/* シンク */}
          <mesh position={[-w * 0.25, h + 0.004, 0]}>
            <boxGeometry args={[Math.min(0.65, w * 0.3), 0.008, Math.max(0.2, d - 0.16)]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.25} metalness={0.7} />
          </mesh>
          {/* 水栓 */}
          <mesh position={[-w * 0.25, h + 0.14, -d * 0.34]}>
            <cylinderGeometry args={[0.014, 0.016, 0.26, 10]} />
            <meshStandardMaterial color="#94A3B8" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* コンロ (IH/ガス) */}
          <mesh position={[w * 0.26, h + 0.006, 0]}>
            <boxGeometry args={[Math.min(0.6, w * 0.28), 0.01, Math.max(0.22, d - 0.16)]} />
            <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.4} />
          </mesh>
          <mesh position={[w * 0.2, h + 0.014, -0.06]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.006, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.6} />
          </mesh>
          <mesh position={[w * 0.32, h + 0.014, 0.06]}>
            <cylinderGeometry args={[0.075, 0.075, 0.006, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.6} />
          </mesh>
        </group>
      );
    }

    case 'bathtub': {
      return (
        <group>
          {/* 浴槽外枠 */}
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={baseColor}
              roughness={0.3}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* 内側の湯面イメージ */}
          <mesh position={[0, h - 0.03, 0]}>
            <boxGeometry args={[Math.max(0.1, w - 0.16), 0.08, Math.max(0.1, d - 0.16)]} />
            <meshStandardMaterial color="#BAE6FD" roughness={0.2} metalness={0.1} />
          </mesh>
        </group>
      );
    }

    case 'toilet': {
      const tankH = h;
      const bowlH = Math.min(0.42, h * 0.56);
      const tankD = Math.min(0.22, d * 0.34);
      const bowlD = Math.max(0.2, d - tankD);
      return (
        <group>
          {/* タンク */}
          <mesh position={[0, tankH / 2, -d / 2 + tankD / 2]} castShadow receiveShadow>
            <boxGeometry args={[w, tankH, tankD]} />
            <meshStandardMaterial
              color="#FFFFFF"
              roughness={0.25}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* 便器本体 */}
          <mesh position={[0, bowlH / 2, tankD / 2]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.88, bowlH, bowlD]} />
            <meshStandardMaterial
              color="#FFFFFF"
              roughness={0.25}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* 便座フタ */}
          <mesh position={[0, bowlH + 0.015, tankD / 2]}>
            <boxGeometry args={[w * 0.84, 0.03, bowlD * 0.9]} />
            <meshStandardMaterial color="#F1F5F9" roughness={0.3} />
          </mesh>
        </group>
      );
    }

    case 'vanity': {
      return (
        <group>
          {/* 下キャビネット */}
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={baseColor}
              roughness={0.5}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {/* 洗面ボウル */}
          <mesh position={[0, h + 0.008, 0.02]}>
            <boxGeometry args={[w * 0.72, 0.016, d * 0.62]} />
            <meshStandardMaterial color="#E0F2FE" roughness={0.2} />
          </mesh>
          {/* 鏡パネル（背面） */}
          <mesh position={[0, h + 0.48, -d / 2 + 0.03]} castShadow>
            <boxGeometry args={[w * 0.94, 0.82, 0.05]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.1} metalness={0.75} />
          </mesh>
        </group>
      );
    }

    case 'washing_machine_pan': {
      return (
        <group>
          <mesh position={[0, h / 2, 0]} receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={baseColor}
              roughness={0.55}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          <mesh position={[0, h + 0.002, 0]}>
            <boxGeometry args={[Math.max(0.1, w - 0.08), 0.004, Math.max(0.1, d - 0.08)]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.6} />
          </mesh>
        </group>
      );
    }

    case 'closet':
    case 'shoe_box': {
      const panels = w >= 1.2 ? 4 : 2;
      const panelW = w / panels;
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={baseColor}
              roughness={0.75}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          {Array.from({ length: panels - 1 }).map((_, idx) => {
            const x = -w / 2 + panelW * (idx + 1);
            return (
              <mesh key={idx} position={[x, h / 2, d / 2 + 0.004]}>
                <boxGeometry args={[0.012, h - 0.04, 0.006]} />
                <meshStandardMaterial color="#94A3B8" />
              </mesh>
            );
          })}
          {/* 取っ手 */}
          <mesh position={[-0.06, Math.min(1.05, h * 0.55), d / 2 + 0.015]}>
            <boxGeometry args={[0.016, 0.14, 0.02]} />
            <meshStandardMaterial color="#64748B" metalness={0.5} />
          </mesh>
          <mesh position={[0.06, Math.min(1.05, h * 0.55), d / 2 + 0.015]}>
            <boxGeometry args={[0.016, 0.14, 0.02]} />
            <meshStandardMaterial color="#64748B" metalness={0.5} />
          </mesh>
        </group>
      );
    }

    default: {
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={baseColor}
            roughness={0.65}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      );
    }
  }
}

export function FixedFixtureMesh({ fixture, isSelected }: FixedFixtureMeshProps) {
  const { camera, gl } = useThree();
  const cameraViewMode = usePlannerStore((s) => s.cameraViewMode);
  const snapMoveCm = usePlannerStore((s) => s.snapMoveCm);
  const setSelectedEntity = usePlannerStore((s) => s.setSelectedEntity);
  const setIsDragging3D = usePlannerStore((s) => s.setIsDragging3D);
  const updateFixedFixture = usePlannerStore((s) => s.updateFixedFixture);
  const commitActiveProperty = usePlannerStore((s) => s.commitActiveProperty);

  const [hovered, setHovered] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    offsetX: number;
    offsetZ: number;
  }>({ active: false, offsetX: 0, offsetZ: 0 });

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixture.position.y);
    const hit = new THREE.Vector3();

    const handleMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const rawX = hit.x + dragRef.current.offsetX;
        const rawZ = hit.z + dragRef.current.offsetZ;
        const useSnap = snapMoveCm > 0 && !e.shiftKey;
        const nextX = useSnap ? snapMeters(rawX, snapMoveCm / 100) : rawX;
        const nextZ = useSnap ? snapMeters(rawZ, snapMoveCm / 100) : rawZ;
        updateFixedFixture(
          fixture.id,
          { position: { x: nextX, y: fixture.position.y, z: nextZ } },
          { persist: false },
        );
      }
    };

    const handleUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
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
    fixture.id,
    fixture.position.y,
    snapMoveCm,
    setIsDragging3D,
    updateFixedFixture,
    commitActiveProperty,
  ]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedEntity({ type: 'fixture', id: fixture.id });

    // ロック中の固定設備はドラッグ移動させない（誤操作防止）
    if (fixture.locked || cameraViewMode === 'first_person') return;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixture.position.y);
    const hit = new THREE.Vector3();
    if (e.ray.intersectPlane(plane, hit)) {
      dragRef.current = {
        active: true,
        offsetX: fixture.position.x - hit.x,
        offsetZ: fixture.position.z - hit.z,
      };
      setIsDragging3D(true);
      document.body.style.cursor = 'grabbing';
    }
  };

  const { width: w, depth: d, height: h } = fixture.dimensions;

  return (
    <group
      position={[fixture.position.x, fixture.position.y, fixture.position.z]}
      rotation={[0, fixture.rotationY, 0]}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = fixture.locked ? 'pointer' : 'grab';
      }}
      onPointerOut={() => {
        setHovered(false);
        if (!dragRef.current.active) {
          document.body.style.cursor = 'auto';
        }
      }}
    >
      <FixtureGeometry fixture={fixture} isSelected={isSelected} isHovered={hovered} />

      {/* 選択時の枠表示（ロック中はアンバー、解除時はエメラルド） */}
      {isSelected && (
        <>
          <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(w, d) * 0.56, Math.max(w, d) * 0.62, 32]} />
            <meshBasicMaterial
              color={fixture.locked ? '#F59E0B' : '#10B981'}
              transparent
              opacity={0.75}
              side={THREE.DoubleSide}
            />
          </mesh>
          <Html position={[0, h + 0.22, 0]} center distanceFactor={9}>
            <div className="pointer-events-none whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-medium text-white shadow-md">
              <span className="mr-1">{fixture.locked ? '🔒' : '🔓'}</span>
              {fixture.label}
              <span className="ml-1.5 text-slate-300">
                {formatDimensionsCm(fixture.dimensions)}
              </span>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

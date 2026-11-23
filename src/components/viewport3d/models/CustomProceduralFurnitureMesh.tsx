'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {
  CustomProceduralModel,
  Dimensions3D,
  ProceduralPartSpec,
} from '@/types/planner';

interface CustomProceduralFurnitureMeshProps {
  customModel: CustomProceduralModel;
  dimensions: Dimensions3D;
  isSelected?: boolean;
  isHovered?: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

function safeColor(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#7C8A99';
}

function buildPartGeometry(part: ProceduralPartSpec): THREE.BufferGeometry {
  const sx = Math.max(0.005, part.size[0] / 100);
  const sy = Math.max(0.005, part.size[1] / 100);
  const sz = Math.max(0.005, part.size[2] / 100);

  switch (part.primitive) {
    case 'rounded_box': {
      const minDim = Math.min(sx, sy, sz);
      const ratio = Math.min(0.45, Math.max(0.02, part.cornerRadius ?? 0.2));
      const radius = Math.min(minDim * 0.45, Math.max(0.002, minDim * ratio));
      return new RoundedBoxGeometry(sx, sy, sz, 3, radius);
    }

    case 'cylinder': {
      const rawTop = Math.min(1.5, Math.max(0.08, part.topScale ?? 1));
      const rawBottom = Math.min(1.5, Math.max(0.08, part.bottomScale ?? 1));
      const maxScale = Math.max(rawTop, rawBottom, 0.08);
      const rTop = 0.5 * (rawTop / maxScale);
      const rBottom = 0.5 * (rawBottom / maxScale);
      const geom = new THREE.CylinderGeometry(rTop, rBottom, 1, 24);
      geom.scale(sx, sy, sz);
      return geom;
    }

    case 'sphere': {
      const geom = new THREE.SphereGeometry(0.5, 22, 16);
      geom.scale(sx, sy, sz);
      return geom;
    }

    case 'capsule': {
      const baseDiameter = Math.min(sx, sz);
      const radius = Math.min(baseDiameter / 2, sy / 2);
      const length = Math.max(0.001, sy - 2 * radius);
      const geom = new THREE.CapsuleGeometry(radius, length, 8, 16);
      const diameter = Math.max(radius * 2, 0.001);
      if (Math.abs(sx - diameter) > 0.001 || Math.abs(sz - diameter) > 0.001) {
        geom.scale(sx / diameter, 1, sz / diameter);
      }
      return geom;
    }

    case 'cone': {
      const geom = new THREE.ConeGeometry(0.5, 1, 24);
      geom.scale(sx, sy, sz);
      return geom;
    }

    case 'torus': {
      const outerXY = Math.max(sx, sy, 0.01);
      const tube = Math.max(0.002, Math.min(sz / 2, outerXY * 0.25));
      const radius = Math.max(0.004, outerXY / 2 - tube);
      const geom = new THREE.TorusGeometry(radius, tube, 14, 32);
      const scaleX = sx / outerXY;
      const scaleY = sy / outerXY;
      const scaleZ = sz / Math.max(tube * 2, 0.002);
      geom.scale(scaleX, scaleY, scaleZ);
      return geom;
    }

    case 'arch': {
      const halfW = sx / 2;
      const archH = Math.min(halfW, sy * 0.85);
      const rectH = Math.max(0, sy - archH);
      const shape = new THREE.Shape();
      shape.moveTo(-halfW, 0);
      shape.lineTo(halfW, 0);
      shape.lineTo(halfW, rectH);
      shape.absellipse(0, rectH, halfW, Math.max(0.002, archH), 0, Math.PI, false, 0);
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: sz,
        bevelEnabled: false,
        curveSegments: 24,
      });
      geom.translate(0, -sy / 2, -sz / 2);
      geom.computeVertexNormals();
      return geom;
    }

    case 'box':
    default:
      return new THREE.BoxGeometry(sx, sy, sz);
  }
}

interface BuiltPartEntry {
  key: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
  part: ProceduralPartSpec;
}

function getMaterialConfig(
  part: ProceduralPartSpec,
  isSelected: boolean,
  isHovered: boolean,
) {
  const mat = part.material ?? 'matte';
  const color = safeColor(part.color);
  const highlightEmissive = isSelected ? '#2563EB' : isHovered ? '#38BDF8' : '#000000';
  const highlightIntensity = isSelected ? 0.18 : isHovered ? 0.08 : 0;

  let roughness = 0.74;
  let metalness = 0.05;
  let transparent = false;
  let opacity = 1;
  let emissive = highlightEmissive;
  let emissiveIntensity = highlightIntensity;

  switch (mat) {
    case 'wood':
      roughness = 0.68;
      metalness = 0.04;
      break;
    case 'fabric':
      roughness = 0.92;
      metalness = 0.0;
      break;
    case 'leather':
      roughness = 0.42;
      metalness = 0.06;
      break;
    case 'metal':
      roughness = 0.28;
      metalness = 0.78;
      break;
    case 'glass':
      roughness = 0.08;
      metalness = 0.12;
      transparent = true;
      opacity = part.opacity ?? 0.36;
      break;
    case 'mirror':
      roughness = 0.06;
      metalness = 0.92;
      break;
    case 'plastic':
      roughness = 0.36;
      metalness = 0.08;
      break;
    case 'ceramic':
      roughness = 0.24;
      metalness = 0.06;
      break;
    case 'emissive':
      roughness = 0.28;
      metalness = 0.0;
      emissive = isSelected ? '#2563EB' : color;
      emissiveIntensity = isSelected ? 0.45 : 0.62;
      break;
    case 'matte':
    default:
      roughness = 0.74;
      metalness = 0.05;
      break;
  }

  if (part.opacity !== undefined && part.opacity < 0.99) {
    transparent = true;
    opacity = Math.min(1, Math.max(0.12, part.opacity));
  }

  return {
    color,
    roughness,
    metalness,
    transparent,
    opacity,
    depthWrite: !transparent,
    emissive,
    emissiveIntensity,
  };
}

/**
 * Gemini が画像から構築したカスタム3Dパーツ設計図を描画するコンポーネント。
 * 全パーツの回転込み厳密バウンディングボックスを算出し、
 * 底面中央 (0, 0, 0) に接地させた上で実寸 dimensions (W × H × D) へ自動フィットさせる。
 */
export function CustomProceduralFurnitureMesh({
  customModel,
  dimensions,
  isSelected = false,
  isHovered = false,
}: CustomProceduralFurnitureMeshProps) {
  // パーツ配列からジオメトリ群と厳密な外接バウンディングボックスを生成
  const built = useMemo(() => {
    const entries: BuiltPartEntry[] = [];
    const totalBox = new THREE.Box3();
    const vertex = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const posVec = new THREE.Vector3();
    const unitScale = new THREE.Vector3(1, 1, 1);

    customModel.parts.forEach((part, idx) => {
      const geometry = buildPartGeometry(part);
      const pos: [number, number, number] = [
        part.position[0] / 100,
        part.position[1] / 100,
        part.position[2] / 100,
      ];
      const rot: [number, number, number] = part.rotationDeg
        ? [
            part.rotationDeg[0] * DEG_TO_RAD,
            part.rotationDeg[1] * DEG_TO_RAD,
            part.rotationDeg[2] * DEG_TO_RAD,
          ]
        : [0, 0, 0];

      posVec.set(pos[0], pos[1], pos[2]);
      euler.set(rot[0], rot[1], rot[2], 'XYZ');
      quat.setFromEuler(euler);
      matrix.compose(posVec, quat, unitScale);

      const posAttr = geometry.getAttribute('position');
      if (posAttr) {
        for (let i = 0; i < posAttr.count; i += 1) {
          vertex.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
          totalBox.expandByPoint(vertex);
        }
      }

      entries.push({
        key: `${idx}-${part.primitive}-${part.name}`,
        geometry,
        position: pos,
        rotation: rot,
        part,
      });
    });

    const boxSize = new THREE.Vector3();
    const boxCenter = new THREE.Vector3();
    if (totalBox.isEmpty()) {
      boxSize.set(1, 1, 1);
      boxCenter.set(0, 0.5, 0);
      totalBox.min.set(-0.5, 0, -0.5);
    } else {
      totalBox.getSize(boxSize);
      totalBox.getCenter(boxCenter);
    }

    return {
      entries,
      boxSize,
      boxCenter,
      minY: totalBox.min.y,
    };
  }, [customModel.parts]);

  // 作成したジオメトリをアンマウント・更新時に確実に解放
  useEffect(() => {
    return () => {
      for (const entry of built.entries) {
        entry.geometry.dispose();
      }
    };
  }, [built]);

  const safeX = built.boxSize.x > 0.001 ? built.boxSize.x : 1;
  const safeY = built.boxSize.y > 0.001 ? built.boxSize.y : 1;
  const safeZ = built.boxSize.z > 0.001 ? built.boxSize.z : 1;

  const scale: [number, number, number] = [
    dimensions.width / safeX,
    dimensions.height / safeY,
    dimensions.depth / safeZ,
  ];

  const offset: [number, number, number] = [
    -built.boxCenter.x * scale[0],
    -built.minY * scale[1],
    -built.boxCenter.z * scale[2],
  ];

  return (
    <group position={offset} scale={scale}>
      {built.entries.map((entry) => {
        const matConfig = getMaterialConfig(entry.part, isSelected, isHovered);
        return (
          <mesh
            key={entry.key}
            geometry={entry.geometry}
            position={entry.position}
            rotation={entry.rotation}
            castShadow={!matConfig.transparent}
            receiveShadow
          >
            <meshStandardMaterial {...matConfig} />
          </mesh>
        );
      })}
    </group>
  );
}

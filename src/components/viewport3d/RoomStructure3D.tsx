'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getRoomStructureBounds, getWallGeometry } from '@/lib/geometry';
import type { Property, RoomZone, WallOpening, WallSegment, WallVertex } from '@/types/planner';

interface RoomStructure3DProps {
  property: Property;
  showCeiling: boolean;
  onFloorPointerDown?: () => void;
}

interface WallPiece {
  key: string;
  xCenter: number;
  yCenter: number;
  width: number;
  height: number;
}

/** 1本の壁を開口部でくり抜いた矩形ピース群と建具情報に分解する */
function buildWallPieces(
  length: number,
  wallHeight: number,
  openings: WallOpening[],
): {
  solidPieces: WallPiece[];
  resolvedOpenings: Array<{
    opening: WallOpening;
    xCenter: number;
    width: number;
    bottomY: number;
    topY: number;
  }>;
} {
  const half = length / 2;

  const sorted = openings
    .map((op) => {
      const clampedRatio = Math.min(0.95, Math.max(0.05, op.positionRatio));
      const center = (clampedRatio - 0.5) * length;
      const maxWidth = Math.max(0.1, length - 0.08);
      const width = Math.min(op.width, maxWidth);
      const start = Math.max(-half + 0.02, center - width / 2);
      const end = Math.min(half - 0.02, center + width / 2);
      const bottomY = Math.max(0, Math.min(wallHeight - 0.1, op.sillHeight));
      const topY = Math.min(wallHeight - 0.02, bottomY + op.height);
      return {
        opening: op,
        start,
        end,
        width: Math.max(0.05, end - start),
        xCenter: (start + end) / 2,
        bottomY,
        topY,
      };
    })
    .filter((item) => item.end > item.start + 0.04)
    .sort((a, b) => a.start - b.start);

  const solidPieces: WallPiece[] = [];
  let cursor = -half;

  sorted.forEach((op, index) => {
    // 左側のフル高さ壁
    if (op.start > cursor + 0.005) {
      const segW = op.start - cursor;
      solidPieces.push({
        key: `left-${index}`,
        xCenter: cursor + segW / 2,
        yCenter: wallHeight / 2,
        width: segW,
        height: wallHeight,
      });
    }

    // 開口下部の腰壁（窓など）
    if (op.bottomY > 0.01) {
      solidPieces.push({
        key: `sill-${index}`,
        xCenter: op.xCenter,
        yCenter: op.bottomY / 2,
        width: op.width,
        height: op.bottomY,
      });
    }

    // 開口上部の垂れ壁
    const headerH = wallHeight - op.topY;
    if (headerH > 0.01) {
      solidPieces.push({
        key: `header-${index}`,
        xCenter: op.xCenter,
        yCenter: op.topY + headerH / 2,
        width: op.width,
        height: headerH,
      });
    }

    cursor = Math.max(cursor, op.end);
  });

  // 右端までの残り壁
  if (half > cursor + 0.005) {
    const segW = half - cursor;
    solidPieces.push({
      key: 'right-tail',
      xCenter: cursor + segW / 2,
      yCenter: wallHeight / 2,
      width: segW,
      height: wallHeight,
    });
  }

  return {
    solidPieces,
    resolvedOpenings: sorted.map(({ opening, xCenter, width, bottomY, topY }) => ({
      opening,
      xCenter,
      width,
      bottomY,
      topY,
    })),
  };
}

function FloorZoneMesh({
  zone,
  onFloorPointerDown,
}: {
  zone: RoomZone;
  onFloorPointerDown?: () => void;
}) {
  const geometry = useMemo(() => {
    if (zone.polygon.length < 3) return null;
    const shape = new THREE.Shape();
    zone.polygon.forEach((pt, idx) => {
      // rotation [-PI/2, 0, 0] で (x, y) → (x, 0, -y) に写像されるため -pt.z を使用
      if (idx === 0) shape.moveTo(pt.x, -pt.z);
      else shape.lineTo(pt.x, -pt.z);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [zone.polygon]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      receiveShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        onFloorPointerDown?.();
      }}
    >
      <meshStandardMaterial
        color={zone.floorColor || '#DFC9A8'}
        roughness={0.85}
        metalness={0.02}
      />
    </mesh>
  );
}

function WallSegmentMesh({
  wall,
  verticesMap,
  defaultCeilingHeight,
}: {
  wall: WallSegment;
  verticesMap: Map<string, WallVertex>;
  defaultCeilingHeight: number;
}) {
  const geom = useMemo(
    () => getWallGeometry(wall, verticesMap),
    [wall, verticesMap],
  );

  const wallHeight = wall.height ?? defaultCeilingHeight;
  const wallColor = wall.kind === 'exterior' ? '#F4F4F0' : '#FAFAF8';

  const { solidPieces, resolvedOpenings } = useMemo(() => {
    if (!geom) return { solidPieces: [], resolvedOpenings: [] };
    return buildWallPieces(geom.length, wallHeight, wall.openings);
  }, [geom, wallHeight, wall.openings]);

  if (!geom) return null;

  return (
    <group position={[geom.midX, 0, geom.midZ]} rotation={[0, geom.angle, 0]}>
      {/* 壁の実体ピース */}
      {solidPieces.map((piece) => (
        <mesh
          key={piece.key}
          position={[piece.xCenter, piece.yCenter, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[piece.width, piece.height, wall.thickness]} />
          <meshStandardMaterial color={wallColor} roughness={0.88} metalness={0.02} />
        </mesh>
      ))}

      {/* 建具（窓ガラス・ドア枠・引き戸ガイド） */}
      {resolvedOpenings.map(({ opening, xCenter, width, bottomY, topY }) => {
        const opH = topY - bottomY;
        const centerY = bottomY + opH / 2;
        const frameT = 0.035;
        const frameD = wall.thickness + 0.02;

        return (
          <group key={opening.id} position={[xCenter, 0, 0]}>
            {/* 左右・上枠 */}
            <mesh position={[-width / 2 + frameT / 2, centerY, 0]}>
              <boxGeometry args={[frameT, opH, frameD]} />
              <meshStandardMaterial
                color={opening.kind === 'window' ? '#94A3B8' : '#C8B094'}
                roughness={0.55}
              />
            </mesh>
            <mesh position={[width / 2 - frameT / 2, centerY, 0]}>
              <boxGeometry args={[frameT, opH, frameD]} />
              <meshStandardMaterial
                color={opening.kind === 'window' ? '#94A3B8' : '#C8B094'}
                roughness={0.55}
              />
            </mesh>
            <mesh position={[0, topY - frameT / 2, 0]}>
              <boxGeometry args={[width, frameT, frameD]} />
              <meshStandardMaterial
                color={opening.kind === 'window' ? '#94A3B8' : '#C8B094'}
                roughness={0.55}
              />
            </mesh>

            {/* 窓の場合は下枠と半透明ガラス */}
            {opening.kind === 'window' && (
              <>
                <mesh position={[0, bottomY + frameT / 2, 0]}>
                  <boxGeometry args={[width, frameT, frameD]} />
                  <meshStandardMaterial color="#94A3B8" roughness={0.55} />
                </mesh>
                <mesh position={[0, centerY, 0]}>
                  <boxGeometry args={[Math.max(0.05, width - frameT * 2), Math.max(0.05, opH - frameT * 2), 0.018]} />
                  <meshStandardMaterial
                    color="#BAE6FD"
                    transparent
                    opacity={0.34}
                    roughness={0.15}
                    metalness={0.2}
                  />
                </mesh>
                {/* 中央サッシ桟 */}
                {width >= 1.1 && (
                  <mesh position={[0, centerY, 0]}>
                    <boxGeometry args={[0.03, Math.max(0.05, opH - frameT * 2), 0.04]} />
                    <meshStandardMaterial color="#94A3B8" roughness={0.45} />
                  </mesh>
                )}
              </>
            )}

            {/* 引き戸の場合は上部レール＋片側パネルを薄く表現 */}
            {opening.kind === 'sliding_door' && (
              <mesh position={[width * 0.23, centerY, 0.012]}>
                <boxGeometry args={[width * 0.46, Math.max(0.1, opH - 0.04), 0.028]} />
                <meshStandardMaterial
                  color="#E8DFD1"
                  transparent
                  opacity={0.42}
                  roughness={0.7}
                />
              </mesh>
            )}

            {/* ドアの場合は床面に開き方向がわかる薄い閾値ラインを表示 */}
            {opening.kind === 'door' && (
              <mesh position={[0, 0.005, 0]}>
                <boxGeometry args={[width, 0.008, wall.thickness]} />
                <meshStandardMaterial color="#C8B094" roughness={0.8} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function RoomStructure3D({
  property,
  showCeiling,
  onFloorPointerDown,
}: RoomStructure3DProps) {
  const verticesMap = useMemo(
    () => new Map(property.vertices.map((v) => [v.id, v])),
    [property.vertices],
  );

  const bounds = useMemo(() => getRoomStructureBounds(property), [property]);

  return (
    <group>
      {/* 部屋エリアごとの床（zones が無い場合はバウンディングボックス床） */}
      {property.zones && property.zones.length > 0 ? (
        property.zones.map((zone) => (
          <FloorZoneMesh
            key={zone.id}
            zone={zone}
            onFloorPointerDown={onFloorPointerDown}
          />
        ))
      ) : (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[bounds.centerX, 0.001, bounds.centerZ]}
          receiveShadow
          onPointerDown={(e) => {
            e.stopPropagation();
            onFloorPointerDown?.();
          }}
        >
          <planeGeometry args={[bounds.width, bounds.depth]} />
          <meshStandardMaterial color="#DFC9A8" roughness={0.88} />
        </mesh>
      )}

      {/* ベース床スラブ（部屋の厚み感） */}
      <mesh
        position={[bounds.centerX, -0.05, bounds.centerZ]}
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation();
          onFloorPointerDown?.();
        }}
      >
        <boxGeometry args={[bounds.width + 0.3, 0.095, bounds.depth + 0.3]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.95} />
      </mesh>

      {/* 壁線分群 */}
      {property.walls.map((wall) => (
        <WallSegmentMesh
          key={wall.id}
          wall={wall}
          verticesMap={verticesMap}
          defaultCeilingHeight={property.defaultCeilingHeight}
        />
      ))}

      {/* 頂点コーナー柱（壁の継ぎ目を滑らかにする） */}
      {property.vertices.map((v) => (
        <mesh
          key={`corner-${v.id}`}
          position={[v.x, property.defaultCeilingHeight / 2, v.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.145, property.defaultCeilingHeight, 0.145]} />
          <meshStandardMaterial color="#F4F4F0" roughness={0.88} />
        </mesh>
      ))}

      {/* 天井（デフォルト非表示。オン時のみ描画） */}
      {showCeiling && (
        <mesh
          position={[bounds.centerX, property.defaultCeilingHeight + 0.02, bounds.centerZ]}
          receiveShadow
        >
          <boxGeometry args={[bounds.width + 0.16, 0.04, bounds.depth + 0.16]} />
          <meshStandardMaterial
            color="#F8FAFC"
            roughness={0.95}
            transparent
            opacity={0.88}
          />
        </mesh>
      )}
    </group>
  );
}

import type { Point2D, Property, WallSegment, WallVertex } from '@/types/planner';

export interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

/** 2点間の距離 (m) */
export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** 壁線分の長さと角度(rad)を計算 */
export function getWallGeometry(
  wall: WallSegment,
  verticesMap: Map<string, WallVertex>,
): {
  start: WallVertex;
  end: WallVertex;
  length: number;
  angle: number;
  midX: number;
  midZ: number;
} | null {
  const start = verticesMap.get(wall.startVertexId);
  const end = verticesMap.get(wall.endVertexId);
  if (!start || !end) return null;

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;

  // Three.js の rotation.y は +X 軸を -Z 方向へ回転させるため atan2(-dz, dx)
  const angle = Math.atan2(-dz, dx);

  return {
    start,
    end,
    length,
    angle,
    midX: (start.x + end.x) / 2,
    midZ: (start.z + end.z) / 2,
  };
}

/** 物件の間取りバウンディングボックスを算出（間取り図画像がある場合は画像範囲も考慮） */
export function getPropertyBounds(property: Property): Bounds2D {
  const xs: number[] = [];
  const zs: number[] = [];

  for (const v of property.vertices) {
    xs.push(v.x);
    zs.push(v.z);
  }
  for (const f of property.fixtures) {
    xs.push(
      f.position.x - f.dimensions.width / 2,
      f.position.x + f.dimensions.width / 2,
    );
    zs.push(
      f.position.z - f.dimensions.depth / 2,
      f.position.z + f.dimensions.depth / 2,
    );
  }
  if (property.floorplanImage && property.floorplanImage.visible) {
    const imgW =
      property.floorplanImage.widthPx * property.floorplanImage.metersPerPixel;
    const imgD =
      property.floorplanImage.heightPx * property.floorplanImage.metersPerPixel;
    xs.push(property.floorplanImage.offsetX, property.floorplanImage.offsetX + imgW);
    zs.push(property.floorplanImage.offsetZ, property.floorplanImage.offsetZ + imgD);
  }

  if (xs.length === 0 || zs.length === 0) {
    return {
      minX: -3,
      maxX: 3,
      minZ: -3,
      maxZ: 3,
      width: 6,
      depth: 6,
      centerX: 0,
      centerZ: 0,
    };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

/** 3Dの床スラブ用に壁・設備のみのバウンディングボックスを算出 */
export function getRoomStructureBounds(property: Property): Bounds2D {
  const xs: number[] = [];
  const zs: number[] = [];

  for (const v of property.vertices) {
    xs.push(v.x);
    zs.push(v.z);
  }
  for (const f of property.fixtures) {
    xs.push(
      f.position.x - f.dimensions.width / 2,
      f.position.x + f.dimensions.width / 2,
    );
    zs.push(
      f.position.z - f.dimensions.depth / 2,
      f.position.z + f.dimensions.depth / 2,
    );
  }

  if (xs.length === 0 || zs.length === 0) {
    return {
      minX: -3,
      maxX: 3,
      minZ: -3,
      maxZ: 3,
      width: 6,
      depth: 6,
      centerX: 0,
      centerZ: 0,
    };
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export interface SnapResult2D {
  point: Point2D;
  snappedVertexId?: string;
  alignX?: number;
  alignZ?: number;
}

/**
 * 2Dエディタ用スナップ計算:
 * 1. 近接頂点へのスナップ（優先度最高）
 * 2. 他頂点との水平(Z揃え)・垂直(X揃え)アラインスナップ
 * 3. グリッドスナップ (stepMeters)
 */
export function computeSnappedPoint2D(
  rawPoint: Point2D,
  vertices: WallVertex[],
  options?: {
    excludeVertexIds?: string[];
    vertexThresholdMeters?: number;
    alignThresholdMeters?: number;
    gridStepMeters?: number;
    disableSnap?: boolean;
  },
): SnapResult2D {
  if (options?.disableSnap) {
    return { point: rawPoint };
  }

  const exclude = new Set(options?.excludeVertexIds ?? []);
  const vertexThreshold = options?.vertexThresholdMeters ?? 0.22;
  const alignThreshold = options?.alignThresholdMeters ?? 0.14;
  const gridStep = options?.gridStepMeters ?? 0.05;

  // 1. 近接頂点スナップ
  let nearestVertex: WallVertex | null = null;
  let nearestDist = vertexThreshold;

  for (const v of vertices) {
    if (exclude.has(v.id)) continue;
    const dist = distance2D(rawPoint, v);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestVertex = v;
    }
  }

  if (nearestVertex) {
    return {
      point: { x: nearestVertex.x, z: nearestVertex.z },
      snappedVertexId: nearestVertex.id,
      alignX: nearestVertex.x,
      alignZ: nearestVertex.z,
    };
  }

  // 2. 水平・垂直アラインスナップ
  let x = rawPoint.x;
  let z = rawPoint.z;
  let alignX: number | undefined;
  let alignZ: number | undefined;
  let bestDx = alignThreshold;
  let bestDz = alignThreshold;

  for (const v of vertices) {
    if (exclude.has(v.id)) continue;
    const dx = Math.abs(v.x - rawPoint.x);
    if (dx < bestDx) {
      bestDx = dx;
      alignX = v.x;
    }
    const dz = Math.abs(v.z - rawPoint.z);
    if (dz < bestDz) {
      bestDz = dz;
      alignZ = v.z;
    }
  }

  if (alignX !== undefined) {
    x = alignX;
  } else if (gridStep > 0) {
    x = Math.round(x / gridStep) * gridStep;
  }

  if (alignZ !== undefined) {
    z = alignZ;
  } else if (gridStep > 0) {
    z = Math.round(z / gridStep) * gridStep;
  }

  return {
    point: {
      x: Math.round(x * 1000) / 1000,
      z: Math.round(z * 1000) / 1000,
    },
    alignX,
    alignZ,
  };
}

/** 点から線分への最短距離と射影点を求める（壁分割・クリック判定用） */
export function projectPointToSegment(
  point: Point2D,
  a: Point2D,
  b: Point2D,
): { projected: Point2D; t: number; distance: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) {
    return { projected: a, t: 0, distance: distance2D(point, a) };
  }
  const rawT = ((point.x - a.x) * dx + (point.z - a.z) * dz) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = { x: a.x + dx * t, z: a.z + dz * t };
  return { projected, t, distance: distance2D(point, projected) };
}

/** 基準2点間の実寸入力に基づき、物件全体のスケールを補正する */
export function rescalePropertyByReference(
  property: Property,
  pointA: Point2D,
  pointB: Point2D,
  actualDistanceMeters: number,
): Property {
  const currentDist = distance2D(pointA, pointB);
  if (currentDist < 0.001 || actualDistanceMeters <= 0) {
    return property;
  }

  const ratio = actualDistanceMeters / currentDist;
  const now = new Date().toISOString();

  return {
    ...property,
    floorplanImage: property.floorplanImage
      ? {
          ...property.floorplanImage,
          metersPerPixel: property.floorplanImage.metersPerPixel * ratio,
          offsetX: property.floorplanImage.offsetX * ratio,
          offsetZ: property.floorplanImage.offsetZ * ratio,
        }
      : undefined,
    scaleCalibration: {
      pointA: { x: pointA.x * ratio, z: pointA.z * ratio },
      pointB: { x: pointB.x * ratio, z: pointB.z * ratio },
      actualDistanceMeters,
      calibratedAt: now,
    },
    vertices: property.vertices.map((v) => ({
      ...v,
      x: Math.round(v.x * ratio * 1000) / 1000,
      z: Math.round(v.z * ratio * 1000) / 1000,
    })),
    walls: property.walls.map((w) => ({
      ...w,
      openings: w.openings.map((op) => ({
        ...op,
        width: Math.max(0.3, Math.round(op.width * ratio * 1000) / 1000),
      })),
    })),
    zones: property.zones?.map((zone) => ({
      ...zone,
      polygon: zone.polygon.map((pt) => ({
        x: pt.x * ratio,
        z: pt.z * ratio,
      })),
    })),
    fixtures: property.fixtures.map((f) => ({
      ...f,
      position: {
        x: Math.round(f.position.x * ratio * 1000) / 1000,
        y: f.position.y,
        z: Math.round(f.position.z * ratio * 1000) / 1000,
      },
      dimensions: {
        width: Math.max(0.15, Math.round(f.dimensions.width * ratio * 1000) / 1000),
        depth: Math.max(0.15, Math.round(f.dimensions.depth * ratio * 1000) / 1000),
        height: f.dimensions.height,
      },
    })),
    // 配置済み家具は手持ち実寸をそのまま維持しつつ、位置だけ縮尺比に合わせて部屋内へ追従させる
    layouts: property.layouts.map((layout) => ({
      ...layout,
      placements: layout.placements.map((pl) => ({
        ...pl,
        position: {
          x: Math.round(pl.position.x * ratio * 1000) / 1000,
          y: pl.position.y,
          z: Math.round(pl.position.z * ratio * 1000) / 1000,
        },
      })),
      updatedAt: now,
    })),
    updatedAt: now,
  };
}

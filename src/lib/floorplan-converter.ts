import { createId } from '@/lib/seed-data';
import { degToRad } from '@/lib/units';
import type {
  FixedFixture,
  FixedFixtureKind,
  FloorplanAnalysisResult,
  FloorplanImage,
  WallOpening,
  WallSegment,
  WallVertex,
} from '@/types/planner';

const FIXTURE_DEFAULT_COLORS: Record<FixedFixtureKind, string> = {
  kitchen: '#F8FAFC',
  bathtub: '#F1F5F9',
  toilet: '#FFFFFF',
  vanity: '#F8FAFC',
  washing_machine_pan: '#E2E8F0',
  closet: '#E7DAC6',
  shoe_box: '#DECBB1',
  aircon: '#F8FAFC',
  other: '#E2E8F0',
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface FloorplanImageSource {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

/**
 * 画像のみを2Dエディタの背景に敷くときの FloorplanImage を生成する
 */
export function buildFloorplanImageMeta(
  source: FloorplanImageSource,
  estimatedWidthMeters = 8.0,
): FloorplanImage {
  const safeWidthMeters = clamp(estimatedWidthMeters, 3, 30);
  const metersPerPixel = safeWidthMeters / Math.max(1, source.widthPx);
  const worldDepth = source.heightPx * metersPerPixel;

  return {
    dataUrl: source.dataUrl,
    widthPx: source.widthPx,
    heightPx: source.heightPx,
    metersPerPixel,
    offsetX: -safeWidthMeters / 2,
    offsetZ: -worldDepth / 2,
    opacity: 0.45,
    visible: true,
  };
}

/**
 * Gemini API からの正規化座標(0〜1000)解析結果を、
 * ワールド座標(m)ベースの FloorplanImage / vertices / walls / fixtures へ変換する。
 */
export function convertFloorplanAnalysisToWorld(
  analysis: FloorplanAnalysisResult,
  source: FloorplanImageSource,
): {
  floorplanImage: FloorplanImage;
  vertices: WallVertex[];
  walls: WallSegment[];
  fixtures: FixedFixture[];
} {
  const floorplanImage = buildFloorplanImageMeta(
    source,
    analysis.estimatedImageWidthMeters || 8.0,
  );

  const worldWidth = floorplanImage.widthPx * floorplanImage.metersPerPixel;
  const worldDepth = floorplanImage.heightPx * floorplanImage.metersPerPixel;

  const nxToX = (nx: number) =>
    floorplanImage.offsetX + (clamp(nx, 0, 1000) / 1000) * worldWidth;
  const nyToZ = (ny: number) =>
    floorplanImage.offsetZ + (clamp(ny, 0, 1000) / 1000) * worldDepth;

  // 1. 頂点変換＋近接頂点の自動マージ（8cm 以内は同一コーナーとみなす）
  const rawIdToMergedId = new Map<string, string>();
  const vertices: WallVertex[] = [];
  const MERGE_THRESHOLD = 0.08;

  for (const rawV of analysis.vertices) {
    const x = Math.round(nxToX(rawV.nx) * 100) / 100;
    const z = Math.round(nyToZ(rawV.ny) * 100) / 100;

    const existing = vertices.find(
      (v) => Math.hypot(v.x - x, v.z - z) <= MERGE_THRESHOLD,
    );
    if (existing) {
      rawIdToMergedId.set(rawV.id, existing.id);
    } else {
      const id = createId('v');
      vertices.push({ id, x, z });
      rawIdToMergedId.set(rawV.id, id);
    }
  }

  // 2. 壁線分と建具の変換（重複線分・ゼロ長壁を除去）
  const walls: WallSegment[] = [];
  const seenWallKeys = new Set<string>();
  const vertexMap = new Map(vertices.map((v) => [v.id, v]));

  for (const rawWall of analysis.walls) {
    const startId = rawIdToMergedId.get(rawWall.startVertexId);
    const endId = rawIdToMergedId.get(rawWall.endVertexId);
    if (!startId || !endId || startId === endId) continue;

    const s = vertexMap.get(startId);
    const e = vertexMap.get(endId);
    if (!s || !e) continue;
    const wallLen = Math.hypot(e.x - s.x, e.z - s.z);
    if (wallLen < 0.12) continue;

    const pairKey = [startId, endId].sort().join('__');
    if (seenWallKeys.has(pairKey)) continue;
    seenWallKeys.add(pairKey);

    const kind = rawWall.kind ?? 'interior';
    const thickness = kind === 'exterior' ? 0.14 : 0.1;
    const height = kind === 'low_wall' ? 1.1 : undefined;

    const openings: WallOpening[] = (rawWall.openings ?? [])
      .filter((op) => op.widthMeters >= 0.25)
      .map((op) => {
        const isWindow = op.kind === 'window';
        return {
          id: createId('op'),
          kind: op.kind,
          positionRatio: clamp(op.positionRatio, 0.1, 0.9),
          width: clamp(op.widthMeters, 0.4, Math.max(0.45, wallLen - 0.1)),
          height: isWindow ? 1.2 : 2.02,
          sillHeight: isWindow ? 0.9 : 0,
          swingDirection: op.kind === 'door' ? 'left' : 'none',
        };
      });

    walls.push({
      id: createId('w'),
      startVertexId: startId,
      endVertexId: endId,
      thickness,
      height,
      kind,
      openings,
    });
  }

  // 壁に使われている頂点のみ残す
  const usedVertexIds = new Set<string>();
  for (const w of walls) {
    usedVertexIds.add(w.startVertexId);
    usedVertexIds.add(w.endVertexId);
  }
  const activeVertices = vertices.filter((v) => usedVertexIds.has(v.id));

  // 3. 備え付け固定設備（誤操作防止のため初期状態は必ず locked: true）
  const fixtures: FixedFixture[] = (analysis.fixtures ?? []).map((f) => {
    const kind = f.kind;
    const isAircon = kind === 'aircon';
    return {
      id: createId('fix'),
      kind,
      label: f.label?.trim() || '備え付け設備',
      position: {
        x: Math.round(nxToX(f.nx) * 100) / 100,
        y: isAircon ? 2.0 : 0,
        z: Math.round(nyToZ(f.ny) * 100) / 100,
      },
      rotationY: degToRad(f.rotationDeg || 0),
      dimensions: {
        width: clamp(f.widthMeters, 0.25, 4.5),
        depth: clamp(f.depthMeters, 0.2, 3.0),
        height: clamp(f.heightMeters, 0.05, 2.5),
      },
      color: FIXTURE_DEFAULT_COLORS[kind] ?? '#E2E8F0',
      locked: true,
      source: 'ai',
    };
  });

  return {
    floorplanImage,
    vertices: activeVertices,
    walls,
    fixtures,
  };
}

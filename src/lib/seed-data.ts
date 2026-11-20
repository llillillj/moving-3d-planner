import type {
  FixedFixture,
  FurnitureAsset,
  LayoutVariant,
  Property,
  RoomZone,
  WallSegment,
  WallVertex,
} from '@/types/planner';

const SEED_TIME = '2026-01-01T00:00:00.000Z';

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 全物件で共有される初期マイ家具カタログ */
export function createSeedCatalog(): FurnitureAsset[] {
  return [
    {
      id: 'asset_sofa_25',
      name: '2.5人掛けソファ',
      category: 'sofa',
      dimensions: { width: 1.75, depth: 0.84, height: 0.78 },
      model: {
        kind: 'procedural',
        shapeType: 'sofa',
        color: '#5B7489',
        partsHint: ['arms', 'back_cushion', 'wooden_legs'],
      },
      memo: '手持ちのファブリックソファ',
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_bed_sd',
      name: 'セミダブルベッド',
      category: 'bed',
      dimensions: { width: 1.24, depth: 2.05, height: 0.85 },
      model: {
        kind: 'procedural',
        shapeType: 'bed',
        color: '#C7A984',
        partsHint: ['headboard', 'mattress', 'pillows'],
      },
      memo: 'ヘッドボード付き・脚高15cm',
      createdAt: '2026-01-01T00:00:02.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_dining_table',
      name: 'ダイニングテーブル (4人用)',
      category: 'table',
      dimensions: { width: 1.4, depth: 0.8, height: 0.72 },
      model: {
        kind: 'procedural',
        shapeType: 'table',
        color: '#B88C5A',
        partsHint: ['four_legs', 'oak_top'],
      },
      createdAt: '2026-01-01T00:00:03.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_dining_chair',
      name: 'ダイニングチェア',
      category: 'chair',
      dimensions: { width: 0.46, depth: 0.52, height: 0.78 },
      model: {
        kind: 'procedural',
        shapeType: 'chair',
        color: '#A67B51',
        partsHint: ['backrest', 'four_legs'],
      },
      createdAt: '2026-01-01T00:00:04.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_work_desk',
      name: 'ワークデスク',
      category: 'desk',
      dimensions: { width: 1.2, depth: 0.6, height: 0.72 },
      model: {
        kind: 'procedural',
        shapeType: 'desk',
        color: '#7D5A3C',
        partsHint: ['side_drawer', 'steel_legs'],
      },
      memo: '在宅勤務用デスク',
      createdAt: '2026-01-01T00:00:05.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_tv_stand',
      name: 'テレビ台 (150cm)',
      category: 'tv_stand',
      dimensions: { width: 1.5, depth: 0.42, height: 0.45 },
      model: {
        kind: 'procedural',
        shapeType: 'tv_stand',
        color: '#8D6E52',
        partsHint: ['low_board', 'tv_screen'],
      },
      memo: '50インチTV込み目安',
      createdAt: '2026-01-01T00:00:06.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_bookshelf',
      name: 'オープンシェルフ',
      category: 'storage',
      dimensions: { width: 0.9, depth: 0.32, height: 1.75 },
      model: {
        kind: 'procedural',
        shapeType: 'shelf',
        color: '#D7C3A5',
        partsHint: ['five_tiers'],
      },
      createdAt: '2026-01-01T00:00:07.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_fridge',
      name: '冷蔵庫 (3ドア)',
      category: 'appliance',
      dimensions: { width: 0.6, depth: 0.66, height: 1.72 },
      model: {
        kind: 'procedural',
        shapeType: 'refrigerator',
        color: '#D5DCE2',
        partsHint: ['three_doors'],
      },
      createdAt: '2026-01-01T00:00:08.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_washer',
      name: 'ドラム式洗濯機',
      category: 'appliance',
      dimensions: { width: 0.64, depth: 0.62, height: 1.05 },
      model: {
        kind: 'procedural',
        shapeType: 'washing_machine',
        color: '#F1F5F9',
        partsHint: ['drum_door'],
      },
      createdAt: '2026-01-01T00:00:09.000Z',
      updatedAt: SEED_TIME,
    },
    {
      id: 'asset_rug',
      name: 'リビングラグ (200×140)',
      category: 'rug',
      dimensions: { width: 2.0, depth: 1.4, height: 0.02 },
      model: {
        kind: 'procedural',
        shapeType: 'rug',
        color: '#D9CFC1',
        partsHint: ['woven'],
      },
      createdAt: '2026-01-01T00:00:10.000Z',
      updatedAt: SEED_TIME,
    },
  ];
}

/** 物件A：南向き1LDK（約43㎡） */
function createProperty1LDK(): Property {
  const vertices: WallVertex[] = [
    // 北外壁 z = -3.0
    { id: 'v_nw', x: -3.6, z: -3.0 },
    { id: 'v_n1', x: -2.0, z: -3.0 },
    { id: 'v_n2', x: -0.2, z: -3.0 },
    { id: 'v_n3', x: 0.8, z: -3.0 },
    { id: 'v_ne', x: 3.6, z: -3.0 },
    // トイレ南ライン z = -1.8
    { id: 'v_t1', x: -0.2, z: -1.8 },
    { id: 'v_t2', x: 0.8, z: -1.8 },
    // LDK・洋室北ライン z = -1.2
    { id: 'v_m0', x: -3.6, z: -1.2 },
    { id: 'v_m1', x: -2.0, z: -1.2 },
    { id: 'v_m2', x: -0.2, z: -1.2 },
    { id: 'v_m3', x: 0.8, z: -1.2 },
    { id: 'v_m4', x: 3.6, z: -1.2 },
    // 南外壁 z = +3.0
    { id: 'v_sw', x: -3.6, z: 3.0 },
    { id: 'v_s1', x: 0.8, z: 3.0 },
    { id: 'v_se', x: 3.6, z: 3.0 },
  ];

  const walls: WallSegment[] = [
    // 北外壁
    { id: 'w_n1', startVertexId: 'v_nw', endVertexId: 'v_n1', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'w_n2', startVertexId: 'v_n1', endVertexId: 'v_n2', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'w_n3', startVertexId: 'v_n2', endVertexId: 'v_n3', thickness: 0.14, kind: 'exterior', openings: [] },
    {
      id: 'w_n4',
      startVertexId: 'v_n3',
      endVertexId: 'v_ne',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'op_entrance',
          kind: 'door',
          positionRatio: 0.68,
          width: 0.88,
          height: 2.05,
          sillHeight: 0,
          swingDirection: 'left',
        },
      ],
    },
    // 西外壁
    { id: 'w_w1', startVertexId: 'v_nw', endVertexId: 'v_m0', thickness: 0.14, kind: 'exterior', openings: [] },
    {
      id: 'w_w2',
      startVertexId: 'v_m0',
      endVertexId: 'v_sw',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'op_west_win',
          kind: 'window',
          positionRatio: 0.58,
          width: 1.2,
          height: 1.1,
          sillHeight: 0.9,
        },
      ],
    },
    // 東外壁
    { id: 'w_e1', startVertexId: 'v_ne', endVertexId: 'v_m4', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'w_e2', startVertexId: 'v_m4', endVertexId: 'v_se', thickness: 0.14, kind: 'exterior', openings: [] },
    // 南外壁（バルコニー側大窓）
    {
      id: 'w_s1',
      startVertexId: 'v_sw',
      endVertexId: 'v_s1',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'op_ldk_balcony',
          kind: 'window',
          positionRatio: 0.5,
          width: 2.6,
          height: 2.05,
          sillHeight: 0.05,
        },
      ],
    },
    {
      id: 'w_s2',
      startVertexId: 'v_s1',
      endVertexId: 'v_se',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'op_bed_balcony',
          kind: 'window',
          positionRatio: 0.5,
          width: 1.7,
          height: 2.05,
          sillHeight: 0.05,
        },
      ],
    },
    // 水回り間仕切り
    {
      id: 'w_bath_e',
      startVertexId: 'v_n1',
      endVertexId: 'v_m1',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'op_bath_door',
          kind: 'door',
          positionRatio: 0.68,
          width: 0.72,
          height: 1.95,
          sillHeight: 0,
        },
      ],
    },
    { id: 'w_wash_e1', startVertexId: 'v_n2', endVertexId: 'v_t1', thickness: 0.1, kind: 'interior', openings: [] },
    {
      id: 'w_wash_e2',
      startVertexId: 'v_t1',
      endVertexId: 'v_m2',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'op_wash_opening',
          kind: 'opening',
          positionRatio: 0.5,
          width: 0.52,
          height: 2.0,
          sillHeight: 0,
        },
      ],
    },
    { id: 'w_toilet_e', startVertexId: 'v_n3', endVertexId: 'v_t2', thickness: 0.1, kind: 'interior', openings: [] },
    {
      id: 'w_toilet_s',
      startVertexId: 'v_t1',
      endVertexId: 'v_t2',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'op_toilet_door',
          kind: 'door',
          positionRatio: 0.5,
          width: 0.68,
          height: 1.98,
          sillHeight: 0,
        },
      ],
    },
    // 北帯と南帯（LDK・洋室）の区切り
    { id: 'w_mid1', startVertexId: 'v_m0', endVertexId: 'v_m1', thickness: 0.11, kind: 'interior', openings: [] },
    { id: 'w_mid2', startVertexId: 'v_m1', endVertexId: 'v_m2', thickness: 0.11, kind: 'interior', openings: [] },
    {
      id: 'w_mid3',
      startVertexId: 'v_m2',
      endVertexId: 'v_m3',
      thickness: 0.11,
      kind: 'interior',
      openings: [
        {
          id: 'op_ldk_door',
          kind: 'door',
          positionRatio: 0.5,
          width: 0.8,
          height: 2.02,
          sillHeight: 0,
        },
      ],
    },
    {
      id: 'w_mid4',
      startVertexId: 'v_m3',
      endVertexId: 'v_m4',
      thickness: 0.11,
      kind: 'interior',
      openings: [
        {
          id: 'op_bed_door',
          kind: 'door',
          positionRatio: 0.2,
          width: 0.78,
          height: 2.02,
          sillHeight: 0,
        },
      ],
    },
    // LDK と洋室の仕切り（大型引き戸）
    {
      id: 'w_ldk_bed',
      startVertexId: 'v_m3',
      endVertexId: 'v_s1',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'op_sliding',
          kind: 'sliding_door',
          positionRatio: 0.55,
          width: 1.7,
          height: 2.05,
          sillHeight: 0,
        },
      ],
    },
  ];

  const zones: RoomZone[] = [
    {
      id: 'z_ldk',
      name: 'LDK (約11.4畳)',
      floorColor: '#DFC9A8',
      polygon: [
        { x: -3.6, z: -1.2 },
        { x: 0.8, z: -1.2 },
        { x: 0.8, z: 3.0 },
        { x: -3.6, z: 3.0 },
      ],
    },
    {
      id: 'z_bedroom',
      name: '洋室 (約7.2畳)',
      floorColor: '#E4D2B5',
      polygon: [
        { x: 0.8, z: -1.2 },
        { x: 3.6, z: -1.2 },
        { x: 3.6, z: 3.0 },
        { x: 0.8, z: 3.0 },
      ],
    },
    {
      id: 'z_bath',
      name: '浴室',
      floorColor: '#CBD5E1',
      polygon: [
        { x: -3.6, z: -3.0 },
        { x: -2.0, z: -3.0 },
        { x: -2.0, z: -1.2 },
        { x: -3.6, z: -1.2 },
      ],
    },
    {
      id: 'z_wash',
      name: '洗面脱衣室',
      floorColor: '#E2E8F0',
      polygon: [
        { x: -2.0, z: -3.0 },
        { x: -0.2, z: -3.0 },
        { x: -0.2, z: -1.2 },
        { x: -2.0, z: -1.2 },
      ],
    },
    {
      id: 'z_toilet',
      name: 'トイレ',
      floorColor: '#E5E7EB',
      polygon: [
        { x: -0.2, z: -3.0 },
        { x: 0.8, z: -3.0 },
        { x: 0.8, z: -1.8 },
        { x: -0.2, z: -1.8 },
      ],
    },
    {
      id: 'z_hall',
      name: '玄関・廊下',
      floorColor: '#D6C7B2',
      polygon: [
        { x: 0.8, z: -3.0 },
        { x: 3.6, z: -3.0 },
        { x: 3.6, z: -1.2 },
        { x: -0.2, z: -1.2 },
        { x: -0.2, z: -1.8 },
        { x: 0.8, z: -1.8 },
      ],
    },
  ];

  // 備え付け固定設備（誤操作防止のためデフォルト locked: true）
  const fixtures: FixedFixture[] = [
    {
      id: 'fix_1ldk_kitchen',
      kind: 'kitchen',
      label: 'システムキッチン (W225)',
      position: { x: -2.35, y: 0, z: -0.82 },
      rotationY: 0,
      dimensions: { width: 2.25, depth: 0.65, height: 0.85 },
      color: '#F8FAFC',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_bath',
      kind: 'bathtub',
      label: 'ユニットバス浴槽',
      position: { x: -2.8, y: 0, z: -2.52 },
      rotationY: 0,
      dimensions: { width: 1.4, depth: 0.78, height: 0.56 },
      color: '#F1F5F9',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_vanity',
      kind: 'vanity',
      label: '独立洗面台',
      position: { x: -1.48, y: 0, z: -2.64 },
      rotationY: 0,
      dimensions: { width: 0.78, depth: 0.54, height: 0.82 },
      color: '#F8FAFC',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_washer_pan',
      kind: 'washing_machine_pan',
      label: '洗濯機パン',
      position: { x: -0.62, y: 0, z: -2.56 },
      rotationY: 0,
      dimensions: { width: 0.7, depth: 0.7, height: 0.08 },
      color: '#E2E8F0',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_toilet',
      kind: 'toilet',
      label: 'トイレ',
      position: { x: 0.3, y: 0, z: -2.56 },
      rotationY: 0,
      dimensions: { width: 0.44, depth: 0.7, height: 0.78 },
      color: '#FFFFFF',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_closet',
      kind: 'closet',
      label: '洋室クローゼット',
      position: { x: 2.68, y: 0, z: -0.84 },
      rotationY: 0,
      dimensions: { width: 1.65, depth: 0.6, height: 2.2 },
      color: '#E7DAC6',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1ldk_shoebox',
      kind: 'shoe_box',
      label: 'シューズボックス',
      position: { x: 3.34, y: 0, z: -2.05 },
      rotationY: -Math.PI / 2,
      dimensions: { width: 1.05, depth: 0.38, height: 1.15 },
      color: '#DECBB1',
      locked: true,
      source: 'preset',
    },
  ];

  const layout1: LayoutVariant = {
    id: 'layout_1ldk_1',
    name: '案1：リビング広め配置',
    placements: [
      {
        id: 'pl_1_rug',
        assetId: 'asset_rug',
        position: { x: -1.7, y: 0, z: 1.55 },
        rotationY: 0,
      },
      {
        id: 'pl_1_sofa',
        assetId: 'asset_sofa_25',
        position: { x: -1.7, y: 0, z: 0.72 },
        rotationY: 0,
      },
      {
        id: 'pl_1_tv',
        assetId: 'asset_tv_stand',
        position: { x: -1.7, y: 0, z: 2.55 },
        rotationY: Math.PI,
      },
      {
        id: 'pl_1_table',
        assetId: 'asset_dining_table',
        position: { x: -0.15, y: 0, z: 0.3 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_1_chair1',
        assetId: 'asset_dining_chair',
        position: { x: -0.78, y: 0, z: 0.05 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_1_chair2',
        assetId: 'asset_dining_chair',
        position: { x: -0.78, y: 0, z: 0.58 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_1_fridge',
        assetId: 'asset_fridge',
        position: { x: -0.82, y: 0, z: -0.8 },
        rotationY: 0,
      },
      {
        id: 'pl_1_washer',
        assetId: 'asset_washer',
        position: { x: -0.62, y: 0.08, z: -2.56 },
        rotationY: 0,
      },
      {
        id: 'pl_1_bed',
        assetId: 'asset_bed_sd',
        position: { x: 2.48, y: 0, z: 1.38 },
        rotationY: -Math.PI / 2,
      },
      {
        id: 'pl_1_desk',
        assetId: 'asset_work_desk',
        position: { x: 2.9, y: 0, z: 0.1 },
        rotationY: -Math.PI / 2,
      },
    ],
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: SEED_TIME,
  };

  const layout2: LayoutVariant = {
    id: 'layout_1ldk_2',
    name: '案2：在宅ワーク重視配置',
    placements: [
      {
        id: 'pl_2_rug',
        assetId: 'asset_rug',
        position: { x: -2.15, y: 0, z: 1.4 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_2_sofa',
        assetId: 'asset_sofa_25',
        position: { x: -3.05, y: 0, z: 1.4 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_2_tv',
        assetId: 'asset_tv_stand',
        position: { x: -0.5, y: 0, z: 2.55 },
        rotationY: Math.PI,
      },
      {
        id: 'pl_2_desk',
        assetId: 'asset_work_desk',
        position: { x: -2.85, y: 0, z: 2.58 },
        rotationY: Math.PI,
      },
      {
        id: 'pl_2_chair1',
        assetId: 'asset_dining_chair',
        position: { x: -2.85, y: 0, z: 2.02 },
        rotationY: 0,
      },
      {
        id: 'pl_2_shelf',
        assetId: 'asset_bookshelf',
        position: { x: 0.45, y: 0, z: 0.1 },
        rotationY: -Math.PI / 2,
      },
      {
        id: 'pl_2_fridge',
        assetId: 'asset_fridge',
        position: { x: -0.82, y: 0, z: -0.8 },
        rotationY: 0,
      },
      {
        id: 'pl_2_washer',
        assetId: 'asset_washer',
        position: { x: -0.62, y: 0.08, z: -2.56 },
        rotationY: 0,
      },
      {
        id: 'pl_2_bed',
        assetId: 'asset_bed_sd',
        position: { x: 2.2, y: 0, z: 1.55 },
        rotationY: 0,
      },
    ],
    createdAt: '2026-01-01T00:00:02.000Z',
    updatedAt: SEED_TIME,
  };

  return {
    id: 'prop_1ldk_sample',
    name: '物件A：南向き1LDK（サンプル）',
    memo: '約43㎡・駅徒歩8分・南向きバルコニー',
    defaultCeilingHeight: 2.4,
    vertices,
    walls,
    zones,
    fixtures,
    layouts: [layout1, layout2],
    activeLayoutId: layout1.id,
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: SEED_TIME,
  };
}

/** 物件B：駅近1K（約25.6㎡） */
function createProperty1K(): Property {
  const vertices: WallVertex[] = [
    // 北外壁 z = -3.2
    { id: 'k_nw', x: -2.0, z: -3.2 },
    { id: 'k_n1', x: -0.6, z: -3.2 },
    { id: 'k_n2', x: 0.4, z: -3.2 },
    { id: 'k_ne', x: 2.0, z: -3.2 },
    // 浴室南ライン z = -1.6
    { id: 'k_b0', x: -2.0, z: -1.6 },
    { id: 'k_b1', x: -1.0, z: -1.6 },
    { id: 'k_b2', x: -0.6, z: -1.6 },
    { id: 'k_b3', x: 0.4, z: -1.6 },
    // 居室北ライン z = -0.4
    { id: 'k_m0', x: -2.0, z: -0.4 },
    { id: 'k_m1', x: -1.0, z: -0.4 },
    { id: 'k_m2', x: 0.4, z: -0.4 },
    { id: 'k_m3', x: 2.0, z: -0.4 },
    // 南外壁 z = +3.2
    { id: 'k_sw', x: -2.0, z: 3.2 },
    { id: 'k_se', x: 2.0, z: 3.2 },
  ];

  const walls: WallSegment[] = [
    // 北外壁
    { id: 'kw_n1', startVertexId: 'k_nw', endVertexId: 'k_n1', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'kw_n2', startVertexId: 'k_n1', endVertexId: 'k_n2', thickness: 0.14, kind: 'exterior', openings: [] },
    {
      id: 'kw_n3',
      startVertexId: 'k_n2',
      endVertexId: 'k_ne',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'kop_ent',
          kind: 'door',
          positionRatio: 0.5,
          width: 0.85,
          height: 2.05,
          sillHeight: 0,
        },
      ],
    },
    // 西外壁
    { id: 'kw_w1', startVertexId: 'k_nw', endVertexId: 'k_b0', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'kw_w2', startVertexId: 'k_b0', endVertexId: 'k_m0', thickness: 0.14, kind: 'exterior', openings: [] },
    {
      id: 'kw_w3',
      startVertexId: 'k_m0',
      endVertexId: 'k_sw',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'kop_w_win',
          kind: 'window',
          positionRatio: 0.65,
          width: 1.0,
          height: 1.1,
          sillHeight: 0.9,
        },
      ],
    },
    // 東外壁
    { id: 'kw_e1', startVertexId: 'k_ne', endVertexId: 'k_m3', thickness: 0.14, kind: 'exterior', openings: [] },
    { id: 'kw_e2', startVertexId: 'k_m3', endVertexId: 'k_se', thickness: 0.14, kind: 'exterior', openings: [] },
    // 南外壁
    {
      id: 'kw_s1',
      startVertexId: 'k_sw',
      endVertexId: 'k_se',
      thickness: 0.14,
      kind: 'exterior',
      openings: [
        {
          id: 'kop_balcony',
          kind: 'window',
          positionRatio: 0.5,
          width: 2.2,
          height: 2.05,
          sillHeight: 0.05,
        },
      ],
    },
    // 内部間仕切り
    {
      id: 'kw_bath_e',
      startVertexId: 'k_n1',
      endVertexId: 'k_b2',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'kop_bath_door',
          kind: 'door',
          positionRatio: 0.72,
          width: 0.68,
          height: 1.95,
          sillHeight: 0,
        },
      ],
    },
    { id: 'kw_bath_s1', startVertexId: 'k_b0', endVertexId: 'k_b1', thickness: 0.1, kind: 'interior', openings: [] },
    { id: 'kw_bath_s2', startVertexId: 'k_b1', endVertexId: 'k_b2', thickness: 0.1, kind: 'interior', openings: [] },
    { id: 'kw_toi_e', startVertexId: 'k_b1', endVertexId: 'k_m1', thickness: 0.1, kind: 'interior', openings: [
      {
        id: 'kop_toi_door',
        kind: 'door',
        positionRatio: 0.55,
        width: 0.64,
        height: 1.95,
        sillHeight: 0,
      },
    ] },
    {
      id: 'kw_hall_w1',
      startVertexId: 'k_n2',
      endVertexId: 'k_b3',
      thickness: 0.1,
      kind: 'interior',
      openings: [],
    },
    {
      id: 'kw_hall_w2',
      startVertexId: 'k_b3',
      endVertexId: 'k_m2',
      thickness: 0.1,
      kind: 'interior',
      openings: [
        {
          id: 'kop_wash_door',
          kind: 'door',
          positionRatio: 0.5,
          width: 0.7,
          height: 1.98,
          sillHeight: 0,
        },
      ],
    },
    // 居室北壁
    { id: 'kw_m1', startVertexId: 'k_m0', endVertexId: 'k_m1', thickness: 0.11, kind: 'interior', openings: [] },
    { id: 'kw_m2', startVertexId: 'k_m1', endVertexId: 'k_m2', thickness: 0.11, kind: 'interior', openings: [] },
    {
      id: 'kw_m3',
      startVertexId: 'k_m2',
      endVertexId: 'k_m3',
      thickness: 0.11,
      kind: 'interior',
      openings: [
        {
          id: 'kop_room_door',
          kind: 'door',
          positionRatio: 0.48,
          width: 0.78,
          height: 2.02,
          sillHeight: 0,
        },
      ],
    },
  ];

  const zones: RoomZone[] = [
    {
      id: 'kz_room',
      name: '洋室 (約8.8畳)',
      floorColor: '#E1CCA9',
      polygon: [
        { x: -2.0, z: -0.4 },
        { x: 2.0, z: -0.4 },
        { x: 2.0, z: 3.2 },
        { x: -2.0, z: 3.2 },
      ],
    },
    {
      id: 'kz_hall',
      name: 'キッチン・廊下',
      floorColor: '#D6C7B2',
      polygon: [
        { x: 0.4, z: -3.2 },
        { x: 2.0, z: -3.2 },
        { x: 2.0, z: -0.4 },
        { x: 0.4, z: -0.4 },
      ],
    },
    {
      id: 'kz_bath',
      name: '浴室',
      floorColor: '#CBD5E1',
      polygon: [
        { x: -2.0, z: -3.2 },
        { x: -0.6, z: -3.2 },
        { x: -0.6, z: -1.6 },
        { x: -2.0, z: -1.6 },
      ],
    },
    {
      id: 'kz_wash',
      name: '洗面・トイレ',
      floorColor: '#E2E8F0',
      polygon: [
        { x: -2.0, z: -1.6 },
        { x: 0.4, z: -1.6 },
        { x: 0.4, z: -0.4 },
        { x: -2.0, z: -0.4 },
      ],
    },
  ];

  const fixtures: FixedFixture[] = [
    {
      id: 'fix_1k_kitchen',
      kind: 'kitchen',
      label: 'ミニキッチン (W135)',
      position: { x: 1.62, y: 0, z: -1.2 },
      rotationY: -Math.PI / 2,
      dimensions: { width: 1.35, depth: 0.6, height: 0.85 },
      color: '#F8FAFC',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_shoebox',
      kind: 'shoe_box',
      label: 'シューズボックス',
      position: { x: 1.74, y: 0, z: -2.55 },
      rotationY: -Math.PI / 2,
      dimensions: { width: 0.85, depth: 0.36, height: 1.05 },
      color: '#DECBB1',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_bath',
      kind: 'bathtub',
      label: 'ユニットバス浴槽',
      position: { x: -1.32, y: 0, z: -2.74 },
      rotationY: 0,
      dimensions: { width: 1.24, depth: 0.74, height: 0.56 },
      color: '#F1F5F9',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_toilet',
      kind: 'toilet',
      label: 'トイレ',
      position: { x: -1.52, y: 0, z: -1.2 },
      rotationY: 0,
      dimensions: { width: 0.44, depth: 0.68, height: 0.76 },
      color: '#FFFFFF',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_vanity',
      kind: 'vanity',
      label: '洗面台',
      position: { x: -0.52, y: 0, z: -1.3 },
      rotationY: 0,
      dimensions: { width: 0.62, depth: 0.46, height: 0.8 },
      color: '#F8FAFC',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_washer_pan',
      kind: 'washing_machine_pan',
      label: '洗濯機パン',
      position: { x: -0.05, y: 0, z: -2.4 },
      rotationY: 0,
      dimensions: { width: 0.66, depth: 0.66, height: 0.08 },
      color: '#E2E8F0',
      locked: true,
      source: 'preset',
    },
    {
      id: 'fix_1k_closet',
      kind: 'closet',
      label: 'クローゼット',
      position: { x: -1.22, y: 0, z: -0.04 },
      rotationY: 0,
      dimensions: { width: 1.4, depth: 0.58, height: 2.2 },
      color: '#E7DAC6',
      locked: true,
      source: 'preset',
    },
  ];

  const layout1: LayoutVariant = {
    id: 'layout_1k_1',
    name: '案1：基本配置',
    placements: [
      {
        id: 'pl_1k_bed',
        assetId: 'asset_bed_sd',
        position: { x: -1.25, y: 0, z: 1.98 },
        rotationY: 0,
      },
      {
        id: 'pl_1k_desk',
        assetId: 'asset_work_desk',
        position: { x: 1.55, y: 0, z: 1.15 },
        rotationY: -Math.PI / 2,
      },
      {
        id: 'pl_1k_chair',
        assetId: 'asset_dining_chair',
        position: { x: 1.0, y: 0, z: 1.15 },
        rotationY: Math.PI / 2,
      },
      {
        id: 'pl_1k_tv',
        assetId: 'asset_tv_stand',
        position: { x: 1.65, y: 0, z: 2.35 },
        rotationY: -Math.PI / 2,
      },
    ],
    createdAt: '2026-01-01T00:00:01.000Z',
    updatedAt: SEED_TIME,
  };

  return {
    id: 'prop_1k_sample',
    name: '物件B：駅近1K（サンプル）',
    memo: '約25.6㎡・駅徒歩3分・バストイレ別',
    defaultCeilingHeight: 2.4,
    vertices,
    walls,
    zones,
    fixtures,
    layouts: [layout1],
    activeLayoutId: layout1.id,
    createdAt: '2026-01-01T00:00:02.000Z',
    updatedAt: SEED_TIME,
  };
}

/** 初期シードデータ一式 */
export function createInitialSeedData(): {
  properties: Property[];
  catalog: FurnitureAsset[];
  activePropertyId: string;
} {
  const properties = [createProperty1LDK(), createProperty1K()];
  const catalog = createSeedCatalog();
  return {
    properties,
    catalog,
    activePropertyId: properties[0].id,
  };
}

/** 新規追加用のシンプルな四角部屋（約12畳: 5m × 4m） */
export function createBlankProperty(name: string): Property {
  const now = new Date().toISOString();
  const layoutId = createId('layout');
  const v1 = createId('v');
  const v2 = createId('v');
  const v3 = createId('v');
  const v4 = createId('v');

  return {
    id: createId('prop'),
    name,
    memo: '',
    defaultCeilingHeight: 2.4,
    vertices: [
      { id: v1, x: -2.5, z: -2.0 },
      { id: v2, x: 2.5, z: -2.0 },
      { id: v3, x: 2.5, z: 2.0 },
      { id: v4, x: -2.5, z: 2.0 },
    ],
    walls: [
      {
        id: createId('w'),
        startVertexId: v1,
        endVertexId: v2,
        thickness: 0.14,
        kind: 'exterior',
        openings: [
          {
            id: createId('op'),
            kind: 'door',
            positionRatio: 0.8,
            width: 0.82,
            height: 2.02,
            sillHeight: 0,
          },
        ],
      },
      {
        id: createId('w'),
        startVertexId: v2,
        endVertexId: v3,
        thickness: 0.14,
        kind: 'exterior',
        openings: [],
      },
      {
        id: createId('w'),
        startVertexId: v3,
        endVertexId: v4,
        thickness: 0.14,
        kind: 'exterior',
        openings: [
          {
            id: createId('op'),
            kind: 'window',
            positionRatio: 0.5,
            width: 2.0,
            height: 2.0,
            sillHeight: 0.05,
          },
        ],
      },
      {
        id: createId('w'),
        startVertexId: v4,
        endVertexId: v1,
        thickness: 0.14,
        kind: 'exterior',
        openings: [],
      },
    ],
    zones: [
      {
        id: createId('z'),
        name: 'メインルーム',
        floorColor: '#DFC9A8',
        polygon: [
          { x: -2.5, z: -2.0 },
          { x: 2.5, z: -2.0 },
          { x: 2.5, z: 2.0 },
          { x: -2.5, z: 2.0 },
        ],
      },
    ],
    fixtures: [
      {
        id: createId('fix'),
        kind: 'kitchen',
        label: 'キッチン',
        position: { x: -1.3, y: 0, z: -1.6 },
        rotationY: 0,
        dimensions: { width: 1.8, depth: 0.62, height: 0.85 },
        color: '#F8FAFC',
        locked: true,
        source: 'preset',
      },
      {
        id: createId('fix'),
        kind: 'closet',
        label: 'クローゼット',
        position: { x: 1.65, y: 0, z: -1.62 },
        rotationY: 0,
        dimensions: { width: 1.3, depth: 0.58, height: 2.2 },
        color: '#E7DAC6',
        locked: true,
        source: 'preset',
      },
    ],
    layouts: [
      {
        id: layoutId,
        name: '案1',
        placements: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeLayoutId: layoutId,
    createdAt: now,
    updatedAt: now,
  };
}

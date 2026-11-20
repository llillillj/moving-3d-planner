import { NextResponse } from 'next/server';
import { Type, type Schema } from '@google/genai';
import {
  createGeminiClient,
  extractJsonText,
  getGeminiModelName,
  MissingGeminiApiKeyError,
  parseImageDataUrl,
} from '@/lib/gemini';
import type {
  FixedFixtureKind,
  FloorplanAnalysisResult,
  WallOpeningKind,
} from '@/types/planner';

const VALID_OPENING_KINDS = new Set<WallOpeningKind>([
  'door',
  'sliding_door',
  'window',
  'opening',
]);

const VALID_FIXTURE_KINDS = new Set<FixedFixtureKind>([
  'kitchen',
  'bathtub',
  'toilet',
  'vanity',
  'washing_machine_pan',
  'closet',
  'shoe_box',
  'aircon',
  'other',
]);

const FLOORPLAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    estimatedImageWidthMeters: {
      type: Type.NUMBER,
      description:
        '画像全体の横幅（余白含む）の推定実寸（メートル）。1Kなら5〜7、1LDKなら7〜10、2LDKなら9〜13程度を目安に推定する。',
    },
    vertices: {
      type: Type.ARRAY,
      description: '壁の角・交差点・端点の頂点一覧（画像正規化座標 0〜1000）',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'v1, v2 などの一意な頂点ID' },
          nx: {
            type: Type.NUMBER,
            description: '画像左端を0、右端を1000としたX座標',
          },
          ny: {
            type: Type.NUMBER,
            description: '画像上端を0、下端を1000としたY座標',
          },
        },
        required: ['id', 'nx', 'ny'],
      },
    },
    walls: {
      type: Type.ARRAY,
      description: '頂点同士を結ぶ壁の線分一覧',
      items: {
        type: Type.OBJECT,
        properties: {
          startVertexId: { type: Type.STRING },
          endVertexId: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ['exterior', 'interior', 'low_wall'],
            description: '外壁(exterior) / 内部間仕切り(interior) / 腰壁(low_wall)',
          },
          openings: {
            type: Type.ARRAY,
            description: 'この壁の上にあるドア・引き戸・窓・開口部',
            items: {
              type: Type.OBJECT,
              properties: {
                kind: {
                  type: Type.STRING,
                  enum: ['door', 'sliding_door', 'window', 'opening'],
                },
                positionRatio: {
                  type: Type.NUMBER,
                  description: '壁の始点(0.0)〜終点(1.0)に対する開口中心の比率',
                },
                widthMeters: {
                  type: Type.NUMBER,
                  description: '開口幅の推定実寸（メートル）',
                },
              },
              required: ['kind', 'positionRatio', 'widthMeters'],
            },
          },
        },
        required: ['startVertexId', 'endVertexId', 'kind', 'openings'],
      },
    },
    fixtures: {
      type: Type.ARRAY,
      description:
        '間取り図に描かれた備え付け固定設備（キッチン、浴槽、トイレ、洗面台、洗濯機パン、クローゼット・収納、シューズボックス等）',
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: [
              'kitchen',
              'bathtub',
              'toilet',
              'vanity',
              'washing_machine_pan',
              'closet',
              'shoe_box',
              'aircon',
              'other',
            ],
          },
          label: {
            type: Type.STRING,
            description: '日本語の設備名（例: システムキッチン、浴槽、クローゼット）',
          },
          nx: {
            type: Type.NUMBER,
            description: '設備中心のX座標 (0〜1000)',
          },
          ny: {
            type: Type.NUMBER,
            description: '設備中心のY座標 (0〜1000)',
          },
          rotationDeg: {
            type: Type.NUMBER,
            description:
              '設備の向き（度）。正面が画像下向き=0、右向き=90、上向き=180、左向き=270',
          },
          widthMeters: {
            type: Type.NUMBER,
            description: '設備の横幅（正面から見た幅、メートル）',
          },
          depthMeters: {
            type: Type.NUMBER,
            description: '設備の奥行（メートル）',
          },
          heightMeters: {
            type: Type.NUMBER,
            description: '設備の高さ（メートル）',
          },
        },
        required: [
          'kind',
          'label',
          'nx',
          'ny',
          'rotationDeg',
          'widthMeters',
          'depthMeters',
          'heightMeters',
        ],
      },
    },
    notesJa: {
      type: Type.STRING,
      description: '検出した間取りの概要やユーザーへの補正アドバイス（日本語1〜2文）',
    },
  },
  required: [
    'estimatedImageWidthMeters',
    'vertices',
    'walls',
    'fixtures',
    'notesJa',
  ],
};

const FLOORPLAN_PROMPT = `あなたは日本の不動産間取り図を建築CAD構造へ正確に変換する専門家です。
添付された間取り図画像を解析し、壁の頂点・壁線分・建具（ドア/引き戸/窓）・備え付け固定設備を JSON 形式で抽出してください。

【座標と精度のルール】
1. 座標系は画像の左上を (nx=0, ny=0)、右下を (nx=1000, ny=1000) とする正規化座標です。
2. 水平・垂直な壁は極力 nx または ny の値を揃えて直角に構成してください。
3. 同じ角やT字交差を共有する壁は、必ず同じ vertex.id を共有してください（重複頂点を作らないでください）。
4. 外周壁は kind: "exterior"、部屋間の間仕切り壁は kind: "interior" にしてください。バルコニーの外側手すりは含めないか、含める場合は low_wall にしてください。
5. ドア（開き戸: door）、引き戸・襖（sliding_door）、窓・掃き出し窓（window）は、該当する壁線分の openings に配置してください。
6. 備え付け固定設備（システムキッチン/コンロ・シンク、浴槽、トイレ、洗面台、洗濯機置場/パン、クローゼット/押入/収納、玄関シューズボックス等）を fixtures としてすべて抽出してください。
   - 日本の標準寸法を参考にしてください（例: キッチン D=0.65m H=0.85m, 浴槽 H=0.56m, トイレ W=0.44m D=0.70m H=0.78m, 洗面台 D=0.52m H=0.82m, 洗濯機パン W=0.68m D=0.68m H=0.08m, クローゼット D=0.60m H=2.20m）。
   - 向き rotationDeg は、設備の正面（使う人が立つ側）が画像下向きなら 0、右向きなら 90、上向きなら 180、左向きなら 270 にしてください。
7. 畳数表示（例: 6帖、10.5帖）や専有面積、ドア幅（約0.8m）を手がかりに、画像全体（余白含む）の横幅 estimatedImageWidthMeters を現実的な値（メートル）で推定してください。`;

function sanitizeAnalysisResult(raw: unknown): FloorplanAnalysisResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<FloorplanAnalysisResult>;

  const estimatedImageWidthMeters =
    typeof data.estimatedImageWidthMeters === 'number' &&
    Number.isFinite(data.estimatedImageWidthMeters)
      ? Math.min(30, Math.max(3, data.estimatedImageWidthMeters))
      : 8.0;

  const vertices = Array.isArray(data.vertices)
    ? data.vertices
        .filter(
          (v): v is { id: string; nx: number; ny: number } =>
            Boolean(v) &&
            typeof v.id === 'string' &&
            typeof v.nx === 'number' &&
            typeof v.ny === 'number' &&
            Number.isFinite(v.nx) &&
            Number.isFinite(v.ny),
        )
        .map((v) => ({
          id: v.id.trim(),
          nx: Math.min(1000, Math.max(0, v.nx)),
          ny: Math.min(1000, Math.max(0, v.ny)),
        }))
    : [];

  const vertexIds = new Set(vertices.map((v) => v.id));

  const walls = Array.isArray(data.walls)
    ? data.walls
        .filter(
          (w) =>
            Boolean(w) &&
            typeof w.startVertexId === 'string' &&
            typeof w.endVertexId === 'string' &&
            vertexIds.has(w.startVertexId) &&
            vertexIds.has(w.endVertexId) &&
            w.startVertexId !== w.endVertexId,
        )
        .map((w) => ({
          startVertexId: w.startVertexId,
          endVertexId: w.endVertexId,
          kind:
            w.kind === 'exterior' || w.kind === 'interior' || w.kind === 'low_wall'
              ? w.kind
              : ('interior' as const),
          openings: Array.isArray(w.openings)
            ? w.openings
                .filter(
                  (op) =>
                    Boolean(op) &&
                    VALID_OPENING_KINDS.has(op.kind) &&
                    typeof op.positionRatio === 'number' &&
                    typeof op.widthMeters === 'number',
                )
                .map((op) => ({
                  kind: op.kind,
                  positionRatio: Math.min(0.92, Math.max(0.08, op.positionRatio)),
                  widthMeters: Math.min(4.5, Math.max(0.35, op.widthMeters)),
                }))
            : [],
        }))
    : [];

  const fixtures = Array.isArray(data.fixtures)
    ? data.fixtures
        .filter(
          (f) =>
            Boolean(f) &&
            typeof f.nx === 'number' &&
            typeof f.ny === 'number' &&
            Number.isFinite(f.nx) &&
            Number.isFinite(f.ny),
        )
        .map((f) => ({
          kind: VALID_FIXTURE_KINDS.has(f.kind) ? f.kind : ('other' as const),
          label:
            typeof f.label === 'string' && f.label.trim()
              ? f.label.trim()
              : '備え付け設備',
          nx: Math.min(1000, Math.max(0, f.nx)),
          ny: Math.min(1000, Math.max(0, f.ny)),
          rotationDeg:
            typeof f.rotationDeg === 'number' && Number.isFinite(f.rotationDeg)
              ? f.rotationDeg
              : 0,
          widthMeters:
            typeof f.widthMeters === 'number' && Number.isFinite(f.widthMeters)
              ? Math.min(4.5, Math.max(0.25, f.widthMeters))
              : 0.8,
          depthMeters:
            typeof f.depthMeters === 'number' && Number.isFinite(f.depthMeters)
              ? Math.min(3.0, Math.max(0.2, f.depthMeters))
              : 0.6,
          heightMeters:
            typeof f.heightMeters === 'number' && Number.isFinite(f.heightMeters)
              ? Math.min(2.5, Math.max(0.05, f.heightMeters))
              : 0.85,
        }))
    : [];

  return {
    estimatedImageWidthMeters,
    vertices,
    walls,
    fixtures,
    notesJa:
      typeof data.notesJa === 'string' && data.notesJa.trim()
        ? data.notesJa.trim()
        : '間取り図を解析しました。2Dエディタで壁端点の微調整と基準辺の実寸(cm)補正を行ってください。',
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      mimeType?: string;
    };

    if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
      return NextResponse.json(
        { error: '間取り図画像データが見つかりませんでした。' },
        { status: 400 },
      );
    }

    const ai = createGeminiClient();
    const model = getGeminiModelName();
    const { mimeType, base64Data } = parseImageDataUrl(
      body.imageDataUrl,
      body.mimeType || 'image/jpeg',
    );

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        FLOORPLAN_PROMPT,
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: FLOORPLAN_RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json(
        {
          error: 'Gemini API から解析結果を取得できませんでした。別の画像でもう一度お試しください。',
          code: 'EMPTY_RESPONSE',
        },
        { status: 502 },
      );
    }

    const parsedJson = JSON.parse(extractJsonText(rawText)) as unknown;
    const sanitized = sanitizeAnalysisResult(parsedJson);

    return NextResponse.json(sanitized);
  } catch (error) {
    if (error instanceof MissingGeminiApiKeyError) {
      return NextResponse.json(
        { error: error.message, code: 'MISSING_API_KEY' },
        { status: 503 },
      );
    }

    console.error('間取り図AI解析エラー:', error);
    const message =
      error instanceof Error
        ? `間取り図の解析中にエラーが発生しました: ${error.message}`
        : '間取り図の解析中に予期しないエラーが発生しました。';

    return NextResponse.json(
      { error: message, code: 'ANALYSIS_FAILED' },
      { status: 500 },
    );
  }
}

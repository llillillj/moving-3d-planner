'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  Bot,
  Box,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { loadAndResizeImageFile } from '@/lib/image-utils';
import {
  cmToDimensions,
  dimensionsToCm,
  FURNITURE_CATEGORY_LABELS,
  TEMPLATE_PROCEDURAL_SHAPE_LABELS,
} from '@/lib/units';
import { getFurnitureGenerationProvider } from '@/services/furniture/provider';
import { usePlannerStore } from '@/store/usePlannerStore';
import type {
  CustomProceduralModel,
  FurnitureAnalysisMode,
  FurnitureAnalysisResult,
  FurnitureAsset,
  FurnitureCategory,
  FurnitureModelSpec,
  ProceduralPartPrimitive,
  TemplateProceduralShapeType,
} from '@/types/planner';

const FurniturePreview3D = dynamic(
  () =>
    import('./FurniturePreview3D').then((mod) => ({
      default: mod.FurniturePreview3D,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-400">
        3Dプレビューを読み込み中...
      </div>
    ),
  },
);

interface FurnitureRegisterModalProps {
  open: boolean;
  onClose: () => void;
  editingAsset?: FurnitureAsset | null;
}

type RegisterTab = 'ai_photo' | 'manual';
type VisualModelMode = 'custom' | 'template' | 'glb';

const CATEGORY_DEFAULT_SHAPE: Record<FurnitureCategory, TemplateProceduralShapeType> = {
  sofa: 'sofa',
  bed: 'bed',
  table: 'table',
  desk: 'desk',
  chair: 'chair',
  storage: 'shelf',
  tv_stand: 'tv_stand',
  appliance: 'refrigerator',
  rug: 'rug',
  other: 'box',
};

const CATEGORY_DEFAULT_CM: Record<
  FurnitureCategory,
  { width: number; depth: number; height: number }
> = {
  sofa: { width: 170, depth: 82, height: 78 },
  bed: { width: 120, depth: 200, height: 85 },
  table: { width: 135, depth: 80, height: 72 },
  desk: { width: 120, depth: 60, height: 72 },
  chair: { width: 46, depth: 50, height: 78 },
  storage: { width: 90, depth: 35, height: 150 },
  tv_stand: { width: 150, depth: 42, height: 45 },
  appliance: { width: 60, depth: 65, height: 170 },
  rug: { width: 200, depth: 140, height: 2 },
  other: { width: 80, depth: 50, height: 80 },
};

const CATEGORY_PRESETS: Partial<
  Record<
    FurnitureCategory,
    Array<{ label: string; width: number; depth: number; height: number }>
  >
> = {
  bed: [
    { label: 'シングル', width: 98, depth: 200, height: 80 },
    { label: 'セミダブル', width: 122, depth: 200, height: 85 },
    { label: 'ダブル', width: 142, depth: 200, height: 85 },
  ],
  sofa: [
    { label: '2人掛け', width: 145, depth: 80, height: 76 },
    { label: '2.5人掛け', width: 175, depth: 84, height: 78 },
    { label: '3人掛け', width: 200, depth: 88, height: 80 },
  ],
  table: [
    { label: '2人用', width: 80, depth: 80, height: 72 },
    { label: '4人用', width: 140, depth: 80, height: 72 },
    { label: 'ローテーブル', width: 105, depth: 55, height: 38 },
  ],
  desk: [
    { label: '幅100cm', width: 100, depth: 60, height: 72 },
    { label: '幅120cm', width: 120, depth: 60, height: 72 },
    { label: '幅140cm', width: 140, depth: 70, height: 72 },
  ],
};

const COLOR_PRESETS = [
  '#5B7489',
  '#B88C5A',
  '#7D5A3C',
  '#D7C3A5',
  '#475569',
  '#3D6B5E',
  '#A65D57',
  '#E2E8F0',
  '#F8FAFC',
  '#27272A',
];

const PRIMITIVE_LABELS: Record<ProceduralPartPrimitive, string> = {
  box: '直方体',
  rounded_box: '角丸',
  cylinder: '円柱',
  sphere: '球体',
  capsule: 'カプセル',
  cone: '円錐',
  torus: 'リング',
  arch: 'アーチ',
};

function isTemplateShape(value: string): value is TemplateProceduralShapeType {
  return value in TEMPLATE_PROCEDURAL_SHAPE_LABELS;
}

export function FurnitureRegisterModal({
  open,
  onClose,
  editingAsset = null,
}: FurnitureRegisterModalProps) {
  const addFurnitureAsset = usePlannerStore((s) => s.addFurnitureAsset);
  const updateFurnitureAsset = usePlannerStore((s) => s.updateFurnitureAsset);
  const placeFurnitureFromCatalog = usePlannerStore(
    (s) => s.placeFurnitureFromCatalog,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const manualPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<RegisterTab>('ai_photo');

  // 画像 & AI解析・構築状態
  const [analysisMode, setAnalysisMode] = useState<FurnitureAnalysisMode>('reconstruct');
  const [analysisImageDataUrl, setAnalysisImageDataUrl] = useState<string | null>(null);
  const [analysisImageMime, setAnalysisImageMime] = useState<string>('image/jpeg');
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [fileName, setFileName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<FurnitureAnalysisResult | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // フォーム共通値（cm文字列で保持して未入力状態を明確に表現）
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory>('sofa');
  const [visualMode, setVisualMode] = useState<VisualModelMode>('template');
  const [templateShapeType, setTemplateShapeType] =
    useState<TemplateProceduralShapeType>('sofa');
  const [customModel, setCustomModel] = useState<CustomProceduralModel | null>(null);
  const [color, setColor] = useState('#5B7489');
  const [partsHint, setPartsHint] = useState<string[]>([]);
  const [glbUrl, setGlbUrl] = useState('');
  const [widthCmStr, setWidthCmStr] = useState('170');
  const [depthCmStr, setDepthCmStr] = useState('82');
  const [heightCmStr, setHeightCmStr] = useState('78');
  const [memo, setMemo] = useState('');
  const [placeImmediately, setPlaceImmediately] = useState(true);
  const [reconstructHint, setReconstructHint] = useState('');
  const [showPartsList, setShowPartsList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(editingAsset);

  // モーダル開閉／編集対象切替時に状態を初期化
  useEffect(() => {
    if (!open) return;
    setError(null);
    setAnalyzing(false);
    setReconstructing(false);
    setSubmitting(false);
    setReconstructHint('');
    setShowPartsList(false);

    if (editingAsset) {
      const dimsCm = dimensionsToCm(editingAsset.dimensions);
      setTab('manual');
      setAnalysisMode('reconstruct');
      setName(editingAsset.name);
      setCategory(editingAsset.category);
      setThumbnailDataUrl(editingAsset.thumbnailDataUrl);
      setAnalysisImageDataUrl(null);
      setAnalysisImageMime('image/jpeg');
      setFileName('');
      setAnalysis(null);
      setWidthCmStr(String(Math.round(dimsCm.width)));
      setDepthCmStr(String(Math.round(dimsCm.depth)));
      setHeightCmStr(String(Math.round(dimsCm.height)));
      setMemo(editingAsset.memo ?? '');

      if (editingAsset.model.kind === 'glb') {
        setVisualMode('glb');
        setGlbUrl(editingAsset.model.url);
        setCustomModel(null);
        setTemplateShapeType(CATEGORY_DEFAULT_SHAPE[editingAsset.category]);
      } else {
        const existingCustom =
          editingAsset.model.customModel &&
          editingAsset.model.customModel.parts.length > 0
            ? editingAsset.model.customModel
            : null;
        setCustomModel(existingCustom);
        setColor(editingAsset.model.color);
        setPartsHint(editingAsset.model.partsHint ?? []);
        setGlbUrl('');

        if (editingAsset.model.shapeType === 'custom' && existingCustom) {
          setVisualMode('custom');
          setTemplateShapeType(CATEGORY_DEFAULT_SHAPE[editingAsset.category]);
        } else {
          setVisualMode('template');
          setTemplateShapeType(
            isTemplateShape(editingAsset.model.shapeType)
              ? editingAsset.model.shapeType
              : CATEGORY_DEFAULT_SHAPE[editingAsset.category],
          );
        }
      }
    } else {
      setTab('ai_photo');
      setAnalysisMode('reconstruct');
      setName('');
      setCategory('sofa');
      setVisualMode('template');
      setTemplateShapeType('sofa');
      setCustomModel(null);
      setColor('#5B7489');
      setPartsHint([]);
      setGlbUrl('');
      setWidthCmStr('170');
      setDepthCmStr('82');
      setHeightCmStr('78');
      setMemo('');
      setPlaceImmediately(true);
      setAnalysisImageDataUrl(null);
      setAnalysisImageMime('image/jpeg');
      setThumbnailDataUrl(undefined);
      setFileName('');
      setAnalysis(null);
    }
  }, [open, editingAsset]);

  // プレビュー用の実寸 (未入力項目はAI目安または既定値で仮表示)
  const previewDimensions = useMemo(() => {
    const fallbackW =
      analysis?.estimatedDimensionsCm.width ??
      customModel?.designDimensionsCm.width ??
      120;
    const fallbackD =
      analysis?.estimatedDimensionsCm.depth ??
      customModel?.designDimensionsCm.depth ??
      60;
    const fallbackH =
      analysis?.estimatedDimensionsCm.height ??
      customModel?.designDimensionsCm.height ??
      75;
    const w = Number(widthCmStr) > 0 ? Number(widthCmStr) : fallbackW;
    const d = Number(depthCmStr) > 0 ? Number(depthCmStr) : fallbackD;
    const h = Number(heightCmStr) > 0 ? Number(heightCmStr) : fallbackH;
    return cmToDimensions({ width: w, depth: d, height: h });
  }, [widthCmStr, depthCmStr, heightCmStr, analysis, customModel]);

  const previewAsset = useMemo<FurnitureAsset>(() => {
    let model: FurnitureModelSpec;
    if (visualMode === 'glb' && glbUrl.trim()) {
      model = { kind: 'glb', url: glbUrl.trim(), normalizeScale: true };
    } else if (visualMode === 'custom' && customModel && customModel.parts.length > 0) {
      model = {
        kind: 'procedural',
        shapeType: 'custom',
        color,
        partsHint,
        customModel,
      };
    } else {
      model = {
        kind: 'procedural',
        shapeType: templateShapeType,
        color,
        partsHint,
        ...(customModel ? { customModel } : {}),
      };
    }

    return {
      id: 'preview',
      name: name || 'プレビュー',
      category,
      dimensions: previewDimensions,
      model,
      createdAt: '',
      updatedAt: '',
    };
  }, [
    visualMode,
    glbUrl,
    customModel,
    templateShapeType,
    color,
    partsHint,
    name,
    category,
    previewDimensions,
  ]);

  if (!open) return null;

  const activePhotoForReconstruct = analysisImageDataUrl ?? thumbnailDataUrl ?? null;

  const handleCategoryChange = (nextCategory: FurnitureCategory) => {
    setCategory(nextCategory);
    if (!analysis) {
      setTemplateShapeType(CATEGORY_DEFAULT_SHAPE[nextCategory]);
      const dims = CATEGORY_DEFAULT_CM[nextCategory];
      setWidthCmStr(String(dims.width));
      setDepthCmStr(String(dims.depth));
      setHeightCmStr(String(dims.height));
    }
  };

  const handleImageSelected = async (
    file: File | undefined,
    options?: { resetAnalysis?: boolean },
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('PNG・JPEG・WebP などの画像ファイルを選択してください。');
      return;
    }

    setError(null);
    if (options?.resetAnalysis !== false) {
      setAnalysis(null);
      setCustomModel(null);
    }
    try {
      const [forAnalysis, forThumb] = await Promise.all([
        loadAndResizeImageFile(file, { maxDimension: 1024, quality: 0.85 }),
        loadAndResizeImageFile(file, { maxDimension: 320, quality: 0.82 }),
      ]);
      setAnalysisImageDataUrl(forAnalysis.dataUrl);
      setAnalysisImageMime(forAnalysis.mimeType);
      setThumbnailDataUrl(forThumb.dataUrl);
      setFileName(file.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '画像の読み込みに失敗しました。',
      );
    }
  };

  // FurnitureGenerationProvider 経由で家具画像を解析（AI構築 or 定型判定）
  const handleRunAiAnalysis = async () => {
    if (!analysisImageDataUrl) return;
    setAnalyzing(true);
    setError(null);

    try {
      const provider = getFurnitureGenerationProvider();
      const result = await provider.analyzeImage(
        analysisImageDataUrl,
        analysisImageMime,
        { mode: analysisMode },
      );
      setAnalysis(result);
      setName(result.suggestedName);
      setCategory(result.category);
      setColor(result.primaryColor);
      setPartsHint(result.partsHint);

      const fallbackTemplate: TemplateProceduralShapeType =
        result.fallbackTemplateShapeType &&
        isTemplateShape(result.fallbackTemplateShapeType)
          ? result.fallbackTemplateShapeType
          : isTemplateShape(result.shapeType)
            ? result.shapeType
            : CATEGORY_DEFAULT_SHAPE[result.category];
      setTemplateShapeType(fallbackTemplate);

      if (result.customModel && result.customModel.parts.length > 0) {
        setCustomModel(result.customModel);
        setVisualMode('custom');
      } else {
        setCustomModel(null);
        setVisualMode('template');
      }

      // 対話型サイズ入力のため、実寸入力欄はいったん空欄にしてユーザー入力を促す
      setWidthCmStr('');
      setDepthCmStr('');
      setHeightCmStr('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '家具画像の解析中にエラーが発生しました。',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // 添付写真（または既存サムネイル）からカスタム3Dパーツ構成を構築・再構築
  const handleRunReconstruct = async () => {
    if (!activePhotoForReconstruct) {
      setError('3D構築に使う家具の写真をアップロードしてください。');
      return;
    }

    setReconstructing(true);
    setError(null);

    try {
      const provider = getFurnitureGenerationProvider();
      const parsedW = Number(widthCmStr);
      const parsedD = Number(depthCmStr);
      const parsedH = Number(heightCmStr);

      const dimsCm =
        parsedW > 0 && parsedD > 0 && parsedH > 0
          ? { width: parsedW, depth: parsedD, height: parsedH }
          : analysis?.estimatedDimensionsCm ?? customModel?.designDimensionsCm;

      const reconstructed = await provider.reconstructFromImage({
        imageDataUrl: activePhotoForReconstruct,
        mimeType: analysisImageMime || 'image/jpeg',
        suggestedName: name.trim() || analysis?.suggestedName,
        category,
        dimensionsCm: dimsCm,
        userHint: reconstructHint.trim() || undefined,
      });

      setCustomModel(reconstructed);
      setVisualMode('custom');
      if (analysis) {
        setAnalysis({
          ...analysis,
          shapeType: 'custom',
          customModel: reconstructed,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '家具の3D構築中にエラーが発生しました。',
      );
    } finally {
      setReconstructing(false);
    }
  };

  const handleUpdatePartColor = (partIndex: number, nextColor: string) => {
    setCustomModel((prev) => {
      if (!prev) return prev;
      const nextParts = prev.parts.map((part, idx) =>
        idx === partIndex ? { ...part, color: nextColor.toUpperCase() } : part,
      );
      return { ...prev, parts: nextParts };
    });
  };

  const applyEstimatedDimensions = () => {
    if (!analysis) return;
    setWidthCmStr(String(analysis.estimatedDimensionsCm.width));
    setDepthCmStr(String(analysis.estimatedDimensionsCm.depth));
    setHeightCmStr(String(analysis.estimatedDimensionsCm.height));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const widthCm = Number(widthCmStr);
    const depthCm = Number(depthCmStr);
    const heightCm = Number(heightCmStr);

    if (!trimmedName) {
      setError('家具名を入力してください。');
      return;
    }
    if (
      !Number.isFinite(widthCm) ||
      !Number.isFinite(depthCm) ||
      !Number.isFinite(heightCm) ||
      widthCm <= 0 ||
      depthCm <= 0 ||
      heightCm <= 0
    ) {
      setError('幅・奥行・高さ（cm）をすべて 1cm 以上の数値で入力してください。');
      return;
    }
    if (visualMode === 'glb' && !glbUrl.trim()) {
      setError('GLB モデルの URL を入力してください。');
      return;
    }
    if (visualMode === 'custom' && (!customModel || customModel.parts.length === 0)) {
      setError(
        'AI画像再現モデルがまだ構築されていません。写真から「AIで3D構築」を実行するか、定型3Dを選択してください。',
      );
      return;
    }

    const dimensions = cmToDimensions({
      width: widthCm,
      depth: depthCm,
      height: heightCm,
    });

    setSubmitting(true);
    setError(null);
    try {
      let model: FurnitureModelSpec;

      if (tab === 'ai_photo' && analysis) {
        // GEMINI.md 必須要件: FurnitureGenerationProvider インターフェース経由でモデル仕様を生成
        const provider = getFurnitureGenerationProvider();
        model = await provider.generateModel({
          analysis: {
            ...analysis,
            suggestedName: trimmedName,
            category,
            primaryColor: color,
            shapeType: visualMode === 'custom' ? 'custom' : templateShapeType,
            fallbackTemplateShapeType: templateShapeType,
            partsHint,
            customModel: customModel ?? undefined,
          },
          dimensions,
          imageDataUrl: analysisImageDataUrl ?? undefined,
        });
      } else if (visualMode === 'glb') {
        model = {
          kind: 'glb',
          url: glbUrl.trim(),
          normalizeScale: true,
        };
      } else if (visualMode === 'custom' && customModel) {
        model = {
          kind: 'procedural',
          shapeType: 'custom',
          color,
          partsHint,
          customModel,
        };
      } else {
        model = {
          kind: 'procedural',
          shapeType: templateShapeType,
          color,
          partsHint,
          ...(customModel ? { customModel } : {}),
        };
      }

      if (editingAsset) {
        updateFurnitureAsset(editingAsset.id, {
          name: trimmedName,
          category,
          dimensions,
          model,
          thumbnailDataUrl,
          memo: memo.trim() || undefined,
        });
      } else {
        const created = addFurnitureAsset({
          name: trimmedName,
          category,
          dimensions,
          model,
          thumbnailDataUrl,
          memo,
        });
        if (placeImmediately) {
          placeFurnitureFromCatalog(created.id);
        }
      }

      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '家具モデルの生成・登録に失敗しました。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const dimensionInputsReady =
    Number(widthCmStr) > 0 && Number(depthCmStr) > 0 && Number(heightCmStr) > 0;
  const presets = CATEGORY_PRESETS[category];
  const hasCustomModel = Boolean(customModel && customModel.parts.length > 0);

  const previewBadge =
    visualMode === 'custom' && hasCustomModel
      ? `AI画像再現 (${customModel!.parts.length}パーツ)`
      : visualMode === 'glb'
        ? 'GLB 3Dモデル'
        : `定型: ${TEMPLATE_PROCEDURAL_SHAPE_LABELS[templateShapeType]}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing
                ? `家具を編集: ${editingAsset?.name}`
                : 'マイ家具カタログに登録'}
            </h2>
            <p className="text-xs text-slate-500">
              登録した家具は全物件で共有され、いつでもサイズ感を比較できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 登録方法タブ（新規時のみ） */}
        {!isEditing && (
          <div className="grid grid-cols-2 gap-1.5 border-b border-slate-100 bg-slate-50/70 px-5 py-2">
            <button
              type="button"
              onClick={() => {
                setTab('ai_photo');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'ai_photo'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              写真からAI登録・3D構築
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('manual');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                tab === 'manual'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              手動入力 / GLB URL
            </button>
          </div>
        )}

        {/* 本文フォーム */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-semibold">{error}</p>
                  {tab === 'ai_photo' && !analysis && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('manual');
                        setError(null);
                      }}
                      className="font-semibold text-blue-700 underline"
                    >
                      この写真のまま手動入力フォームへ進む →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ==================== タブ1: 写真からAI登録・3D構築 ==================== */}
            {tab === 'ai_photo' && !isEditing ? (
              <div className="space-y-4">
                {/* Step 1: 写真アップロード & 生成方式選択 */}
                {!analysis ? (
                  <div className="space-y-3.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                        1
                      </span>
                      手持ち家具の写真をアップロード
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        void handleImageSelected(e.dataTransfer.files?.[0]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
                        isDraggingFile
                          ? 'border-blue-500 bg-blue-50/70'
                          : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          void handleImageSelected(e.target.files?.[0])
                        }
                      />
                      {analysisImageDataUrl ? (
                        <div className="space-y-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={analysisImageDataUrl}
                            alt="アップロードした家具"
                            className="mx-auto max-h-52 rounded-lg border border-slate-200 bg-white object-contain shadow-2xs"
                          />
                          <p className="text-xs text-slate-500">
                            {fileName} — クリックで別の写真に変更
                          </p>
                        </div>
                      ) : (
                        <>
                          <Upload className="mb-2 h-7 w-7 text-slate-400" />
                          <p className="text-sm font-semibold text-slate-700">
                            家具の写真をドラッグ＆ドロップ、またはクリックして選択
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            スマホで撮った写真や通販の商品画像（PNG / JPEG / WebP）に対応
                          </p>
                        </>
                      )}
                    </div>

                    {/* 3D生成方式の選択 */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700">
                        3Dモデルの生成方式（解析後いつでも切替できます）
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setAnalysisMode('reconstruct')}
                          className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                            analysisMode === 'reconstruct'
                              ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-300'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              analysisMode === 'reconstruct'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Cpu className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                              画像から3D構築（AI再現）
                              <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                                おすすめ
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                              写真固有の形状・脚・棚・色分け・素材感をAIが複数パーツで立体再現します
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAnalysisMode('template')}
                          className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                            analysisMode === 'template'
                              ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-300'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              analysisMode === 'template'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Box className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900">
                              定型テンプレート判定
                            </div>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                              12種類の基本形状から最も近い形と代表色を選びます（シンプル・高速）
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!analysisImageDataUrl || analyzing}
                        onClick={() => void handleRunAiAnalysis()}
                        className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-45 ${
                          analysisMode === 'reconstruct'
                            ? 'bg-indigo-600 hover:bg-indigo-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {analyzing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {analysisMode === 'reconstruct'
                              ? 'Gemini で写真を解析し 3D パーツを構築中...'
                              : 'Gemini で家具の特徴を解析中...'}
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            {analysisMode === 'reconstruct'
                              ? 'AIで解析して写真から3D構築する'
                              : 'AIで種類・色・形状を判定する'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Step 2: 対話型サイズ入力 & 3D再現確認・切替 UI */
                  <div className="space-y-4">
                    {/* AI アシスタントの対話吹き出し */}
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-blue-950">
                            {hasCustomModel
                              ? 'AI 解析・3D構築完了 — 実寸サイズ（cm）を教えてください'
                              : 'AI 判定完了 — 実寸サイズ（cm）を教えてください'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAnalysis(null);
                              setCustomModel(null);
                              setReconstructHint('');
                              setShowPartsList(false);
                            }}
                            className="text-[11px] font-medium text-blue-700 hover:underline"
                          >
                            写真をやり直す
                          </button>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-700">
                          {analysis.summaryJa}
                        </p>
                        {customModel?.structureSummaryJa && visualMode === 'custom' && (
                          <p className="rounded-lg border border-indigo-200/80 bg-indigo-50/80 px-2.5 py-1.5 text-[11px] leading-relaxed text-indigo-900">
                            <span className="font-bold">3D構築内容:</span>{' '}
                            {customModel.structureSummaryJa}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs">
                            カテゴリ: {FURNITURE_CATEGORY_LABELS[category]}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300"
                              style={{ backgroundColor: color }}
                            />
                            {color}
                          </span>
                          {partsHint.map((hint) => (
                            <span
                              key={hint}
                              className="rounded bg-blue-100/80 px-1.5 py-0.5 text-[10px] text-blue-800"
                            >
                              #{hint}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 写真＋3Dプレビュー 横並び */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex h-48 flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                        {thumbnailDataUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnailDataUrl}
                            alt="アップロード家具"
                            className="max-h-40 rounded-lg object-contain"
                          />
                        )}
                        <span className="mt-1 text-[10px] text-slate-400">
                          アップロード写真（カタログサムネイルに保存）
                        </span>
                      </div>
                      <FurniturePreview3D
                        asset={previewAsset}
                        dimensions={previewDimensions}
                        badgeText={previewBadge}
                        heightClassName="h-48"
                      />
                    </div>

                    {/* 3Dモデル方式の切替 & AI再構築コントロール */}
                    <div className="space-y-2.5 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <Layers className="h-3.5 w-3.5 text-indigo-600" />
                          3Dモデルの表現方式
                        </span>
                        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (hasCustomModel) {
                                setVisualMode('custom');
                              } else {
                                void handleRunReconstruct();
                              }
                            }}
                            disabled={reconstructing}
                            className={`flex items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                              visualMode === 'custom' && hasCustomModel
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {hasCustomModel ? 'AI画像再現' : '写真からAI構築'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisualMode('template')}
                            className={`flex items-center justify-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                              visualMode === 'template'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Box className="h-3 w-3" />
                            定型テンプレート
                          </button>
                        </div>
                      </div>

                      {visualMode === 'custom' && hasCustomModel ? (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1.5 sm:flex-row">
                            <input
                              type="text"
                              value={reconstructHint}
                              onChange={(e) => setReconstructHint(e.target.value)}
                              placeholder="微調整ヒント（任意）例: 脚を黒い細アイアンに、棚を4段に、天板を丸く"
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={reconstructing || !activePhotoForReconstruct}
                              onClick={() => void handleRunReconstruct()}
                              className="flex shrink-0 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {reconstructing ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  再構築中...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  AIで再構築
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            実寸（cm）を入力した後に「AIで再構築」を押すと、確定した縦横比に合わせてパーツ構成を作り直せます。
                          </p>

                          {/* 構成パーツ一覧とパーツ色調整 */}
                          <div>
                            <button
                              type="button"
                              onClick={() => setShowPartsList((v) => !v)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline"
                            >
                              {showPartsList ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                              構成パーツを確認・色調整する ({customModel!.parts.length}パーツ)
                            </button>
                            {showPartsList && (
                              <div className="mt-2 grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-2">
                                {customModel!.parts.map((part, idx) => (
                                  <div
                                    key={`${idx}-${part.name}`}
                                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/70 px-2 py-1 text-[11px]"
                                  >
                                    <div className="min-w-0 truncate">
                                      <span className="font-medium text-slate-800">
                                        {part.name}
                                      </span>
                                      <span className="ml-1 text-[10px] text-slate-400">
                                        ({PRIMITIVE_LABELS[part.primitive]})
                                      </span>
                                    </div>
                                    <input
                                      type="color"
                                      value={part.color}
                                      onChange={(e) =>
                                        handleUpdatePartColor(idx, e.target.value)
                                      }
                                      title={`${part.name} の色を変更`}
                                      className="h-5 w-7 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                          <span>
                            {hasCustomModel
                              ? '定型テンプレートで表示中です。「AI画像再現」で写真から構築したモデルへ戻せます。'
                              : '写真の形状・構造そのものをパーツ組み立てで再現することもできます。'}
                          </span>
                          {!hasCustomModel && (
                            <button
                              type="button"
                              disabled={reconstructing || !activePhotoForReconstruct}
                              onClick={() => void handleRunReconstruct()}
                              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {reconstructing ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  3D構築中...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  写真から3D構築を実行
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 対話型サイズ入力カード */}
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                            2
                          </span>
                          必要なサイズを入力してください（cm）
                        </div>
                        <button
                          type="button"
                          onClick={applyEstimatedDimensions}
                          className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Wand2 className="h-3 w-3" />
                          AI目安値を使う ({analysis.estimatedDimensionsCm.width}×
                          {analysis.estimatedDimensionsCm.depth}×
                          {analysis.estimatedDimensionsCm.height}cm)
                        </button>
                      </div>

                      {presets && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">
                            定番サイズ:
                          </span>
                          {presets.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => {
                                setWidthCmStr(String(p.width));
                                setDepthCmStr(String(p.depth));
                                setHeightCmStr(String(p.height));
                                setError(null);
                              }}
                              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                            >
                              {p.label} ({p.width}×{p.depth}×{p.height})
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        {analysis.requiredDimensionFields.map((field) => {
                          const value =
                            field.key === 'width'
                              ? widthCmStr
                              : field.key === 'depth'
                                ? depthCmStr
                                : heightCmStr;
                          const setter =
                            field.key === 'width'
                              ? setWidthCmStr
                              : field.key === 'depth'
                                ? setDepthCmStr
                                : setHeightCmStr;
                          const filled = Number(value) > 0;

                          return (
                            <div
                              key={field.key}
                              className={`flex flex-col gap-1.5 rounded-lg border p-2.5 sm:flex-row sm:items-center sm:justify-between ${
                                filled
                                  ? 'border-emerald-200 bg-emerald-50/40'
                                  : 'border-slate-200 bg-slate-50/60'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                  {filled && (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  )}
                                  {field.label}
                                </div>
                                {field.hint && (
                                  <p className="text-[11px] text-slate-500">
                                    測り方: {field.hint}
                                  </p>
                                )}
                              </div>
                              <div className="relative w-full shrink-0 sm:w-32">
                                <input
                                  type="number"
                                  min={1}
                                  max={600}
                                  step={1}
                                  value={value}
                                  onChange={(e) => {
                                    setter(e.target.value);
                                    setError(null);
                                  }}
                                  placeholder={`目安 ${field.placeholderCm}`}
                                  className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-2.5 text-right text-sm font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                                />
                                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">
                                  cm
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 家具名・（定型選択時のみ）形状＆カラー微調整 */}
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                          家具名（変更可）
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                        />
                      </div>

                      {visualMode === 'template' && (
                        <>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                              定型3D形状タイプ
                            </label>
                            <select
                              value={templateShapeType}
                              onChange={(e) =>
                                setTemplateShapeType(
                                  e.target.value as TemplateProceduralShapeType,
                                )
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                            >
                              {(
                                Object.entries(TEMPLATE_PROCEDURAL_SHAPE_LABELS) as Array<
                                  [TemplateProceduralShapeType, string]
                                >
                              ).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                              カラー調整
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                              />
                              <div className="flex flex-wrap gap-1">
                                {COLOR_PRESETS.slice(0, 6).map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setColor(preset)}
                                    className="h-5 w-5 rounded-full border border-slate-300"
                                    style={{ backgroundColor: preset }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ==================== タブ2: 手動入力 / GLB URL / 既存家具編集 ==================== */
              <div className="space-y-4">
                <FurniturePreview3D
                  asset={previewAsset}
                  dimensions={previewDimensions}
                  badgeText={previewBadge}
                  heightClassName="h-48"
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      家具名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="例: 無印2.5シーターソファ、IKEA本棚"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      カテゴリ
                    </label>
                    <select
                      value={category}
                      onChange={(e) =>
                        handleCategoryChange(e.target.value as FurnitureCategory)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                    >
                      {(
                        Object.entries(FURNITURE_CATEGORY_LABELS) as Array<
                          [FurnitureCategory, string]
                        >
                      ).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      3Dモデル種別
                    </label>
                    <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setVisualMode('custom')}
                        className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition ${
                          visualMode === 'custom'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        <Sparkles className="h-3 w-3" />
                        AI再現
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualMode('template')}
                        className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition ${
                          visualMode === 'template'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        <Box className="h-3 w-3" />
                        定型3D
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisualMode('glb')}
                        className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition ${
                          visualMode === 'glb'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        <Globe className="h-3 w-3" />
                        GLB
                      </button>
                    </div>
                  </div>
                </div>

                {visualMode === 'custom' ? (
                  <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-indigo-950">
                          写真からAIで3Dモデルを構築・再構築
                        </div>
                        <p className="text-[11px] text-slate-600">
                          家具の写真を読み込んで、パーツ構成による立体モデルを生成します
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => manualPhotoInputRef.current?.click()}
                        className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {activePhotoForReconstruct ? '写真を変更' : '写真を選択'}
                      </button>
                      <input
                        ref={manualPhotoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          void handleImageSelected(e.target.files?.[0], {
                            resetAnalysis: false,
                          })
                        }
                      />
                    </div>

                    {activePhotoForReconstruct && (
                      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={activePhotoForReconstruct}
                          alt="参照写真"
                          className="h-14 w-14 shrink-0 rounded-md border border-slate-200 bg-slate-50 object-contain"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <input
                            type="text"
                            value={reconstructHint}
                            onChange={(e) => setReconstructHint(e.target.value)}
                            placeholder="微調整ヒント（任意）例: 脚を細く、肘掛けを追加"
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={reconstructing}
                            onClick={() => void handleRunReconstruct()}
                            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {reconstructing ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Gemini で3D構築中...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                {hasCustomModel
                                  ? 'この写真でAI再構築する'
                                  : 'この写真からAIで3D構築する'}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {hasCustomModel && customModel && (
                      <div className="space-y-1.5">
                        {customModel.structureSummaryJa && (
                          <p className="text-[11px] text-indigo-900">
                            <span className="font-semibold">構築済み:</span>{' '}
                            {customModel.structureSummaryJa}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowPartsList((v) => !v)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline"
                        >
                          {showPartsList ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          構成パーツの色を調整 ({customModel.parts.length}パーツ)
                        </button>
                        {showPartsList && (
                          <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-2">
                            {customModel.parts.map((part, idx) => (
                              <div
                                key={`${idx}-${part.name}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/70 px-2 py-1 text-[11px]"
                              >
                                <span className="min-w-0 truncate font-medium text-slate-800">
                                  {part.name}
                                </span>
                                <input
                                  type="color"
                                  value={part.color}
                                  onChange={(e) =>
                                    handleUpdatePartColor(idx, e.target.value)
                                  }
                                  className="h-5 w-7 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : visualMode === 'template' ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        定型プロシージャル形状
                      </label>
                      <select
                        value={templateShapeType}
                        onChange={(e) =>
                          setTemplateShapeType(
                            e.target.value as TemplateProceduralShapeType,
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                      >
                        {(
                          Object.entries(TEMPLATE_PROCEDURAL_SHAPE_LABELS) as Array<
                            [TemplateProceduralShapeType, string]
                          >
                        ).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-700">
                        カラー
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setColor(preset)}
                            className={`h-6 w-6 rounded-full border transition ${
                              color.toLowerCase() === preset.toLowerCase()
                                ? 'scale-110 border-blue-600 ring-2 ring-blue-300'
                                : 'border-slate-300'
                            }`}
                            style={{ backgroundColor: preset }}
                            aria-label={`色 ${preset}`}
                          />
                        ))}
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                          title="カスタムカラーを選択"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      GLB ファイル URL（自動で実寸フィットされます）
                    </label>
                    <input
                      type="url"
                      value={glbUrl}
                      onChange={(e) => setGlbUrl(e.target.value)}
                      placeholder="https://example.com/models/sofa.glb"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* 実寸サイズ入力 (すべて cm 表記) */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    実寸サイズ (cm)
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">
                        幅 (W)
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={600}
                          step={1}
                          value={widthCmStr}
                          onChange={(e) => setWidthCmStr(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 py-1.5 pr-8 pl-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">
                          cm
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">
                        奥行 (D)
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={600}
                          step={1}
                          value={depthCmStr}
                          onChange={(e) => setDepthCmStr(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 py-1.5 pr-8 pl-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">
                          cm
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-[11px] text-slate-500">
                        高さ (H)
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={350}
                          step={1}
                          value={heightCmStr}
                          onChange={(e) => setHeightCmStr(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 py-1.5 pr-8 pl-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-slate-400">
                          cm
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* メモ＆即時配置オプション（AI Step 2 または 手動/編集時） */}
            {(tab === 'manual' || Boolean(analysis) || isEditing) && (
              <div className="space-y-2.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    メモ（任意）
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="例: 搬入時は脚取り外し可、コンセント左後ろ"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {!isEditing && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={placeImmediately}
                      onChange={(e) => setPlaceImmediately(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    登録と同時に現在開いている部屋へ配置する
                  </label>
                )}
              </div>
            )}
          </div>

          {/* フッターボタン */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </button>

            {(tab === 'manual' || Boolean(analysis) || isEditing) && (
              <button
                type="submit"
                disabled={
                  submitting ||
                  reconstructing ||
                  (!dimensionInputsReady && tab === 'ai_photo')
                }
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    処理中...
                  </>
                ) : isEditing ? (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    変更を保存
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    マイ家具カタログに登録
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

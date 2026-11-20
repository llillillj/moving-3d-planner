'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  buildFloorplanImageMeta,
  convertFloorplanAnalysisToWorld,
} from '@/lib/floorplan-converter';
import {
  loadAndResizeImageFile,
  type ProcessedImageData,
} from '@/lib/image-utils';
import { FIXTURE_KIND_LABELS } from '@/lib/units';
import { usePlannerStore } from '@/store/usePlannerStore';
import type { FloorplanAnalysisResult } from '@/types/planner';

interface FloorplanUploadModalProps {
  open: boolean;
  onClose: () => void;
}

export function FloorplanUploadModal({ open, onClose }: FloorplanUploadModalProps) {
  const applyFloorplanAnalysis = usePlannerStore((s) => s.applyFloorplanAnalysis);
  const setFloorplanImage = usePlannerStore((s) => s.setFloorplanImage);
  const editorMode = usePlannerStore((s) => s.editorMode);
  const setEditorMode = usePlannerStore((s) => s.setEditorMode);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [image, setImage] = useState<ProcessedImageData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FloorplanAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  if (!open) return null;

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('PNG・JPEG・WebP などの画像ファイルを選択してください。');
      return;
    }

    setError(null);
    setAnalysis(null);
    try {
      const processed = await loadAndResizeImageFile(file, {
        maxDimension: 1600,
        quality: 0.86,
      });
      setImage(processed);
      setFileName(file.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '画像の読み込みに失敗しました。',
      );
    }
  };

  const handleRunAiAnalysis = async () => {
    if (!image) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch('/api/analyze-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: image.dataUrl,
          mimeType: image.mimeType,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | FloorplanAnalysisResult
        | { error?: string };

      if (!response.ok) {
        const message =
          'error' in payload && payload.error
            ? payload.error
            : `間取り図のAI解析に失敗しました (HTTP ${response.status})`;
        setError(message);
        return;
      }

      setAnalysis(payload as FloorplanAnalysisResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? `通信エラーが発生しました: ${err.message}`
          : '通信エラーが発生しました。',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAnalysis = () => {
    if (!image || !analysis) return;
    const converted = convertFloorplanAnalysisToWorld(analysis, {
      dataUrl: image.dataUrl,
      widthPx: image.widthPx,
      heightPx: image.heightPx,
    });
    applyFloorplanAnalysis(converted);
    if (editorMode === '3d') setEditorMode('2d');
    handleResetAndClose();
  };

  const handleApplyImageOnly = () => {
    if (!image) return;
    const floorplanImage = buildFloorplanImageMeta(
      {
        dataUrl: image.dataUrl,
        widthPx: image.widthPx,
        heightPx: image.heightPx,
      },
      8.0,
    );
    setFloorplanImage(floorplanImage);
    if (editorMode === '3d') setEditorMode('2d');
    handleResetAndClose();
  };

  const handleResetAndClose = () => {
    setError(null);
    setAnalyzing(false);
    onClose();
  };

  const totalOpenings = analysis
    ? analysis.walls.reduce((sum, w) => sum + w.openings.length, 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ImagePlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                間取り図アップロード ＆ AI解析
              </h2>
              <p className="text-xs text-slate-500">
                Gemini API で壁・ドア/窓・備え付け設備を抽出し、2Dエディタ上で微修正できます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* ファイル選択 / ドロップゾーン */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              void handleFileSelected(e.dataTransfer.files?.[0]);
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
              onChange={(e) => void handleFileSelected(e.target.files?.[0])}
            />
            {image ? (
              <div className="w-full space-y-2">
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.dataUrl}
                    alt="アップロードした間取り図"
                    className="max-h-56 rounded-lg border border-slate-200 bg-white object-contain shadow-2xs"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {fileName}（{image.widthPx} × {image.heightPx} px）— クリックで別画像に変更
                </p>
              </div>
            ) : (
              <>
                <Upload className="mb-2 h-7 w-7 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">
                  間取り図画像をドラッグ＆ドロップ、またはクリックして選択
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  PNG / JPEG / WebP 対応（自動で扱いやすい解像度に最適化されます）
                </p>
              </>
            )}
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-semibold">{error}</p>
                <p className="text-amber-800/90">
                  APIキー未設定の場合でも、下の「画像のみを2D背景に配置」を使えば、間取り図をなぞって壁や設備を作成できます。
                </p>
              </div>
            </div>
          )}

          {/* AI解析結果プレビュー */}
          {analysis && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                AI解析が完了しました
              </div>
              {analysis.notesJa && (
                <p className="text-xs leading-relaxed text-emerald-900/90">
                  {analysis.notesJa}
                </p>
              )}

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-white p-2 shadow-2xs">
                  <div className="text-[10px] text-slate-500">壁頂点</div>
                  <div className="text-sm font-bold text-slate-800">
                    {analysis.vertices.length}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2 shadow-2xs">
                  <div className="text-[10px] text-slate-500">壁線分</div>
                  <div className="text-sm font-bold text-slate-800">
                    {analysis.walls.length}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2 shadow-2xs">
                  <div className="text-[10px] text-slate-500">ドア・窓</div>
                  <div className="text-sm font-bold text-slate-800">
                    {totalOpenings}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-2 shadow-2xs">
                  <div className="text-[10px] text-slate-500">推定横幅</div>
                  <div className="text-sm font-bold text-blue-600">
                    {Math.round(analysis.estimatedImageWidthMeters * 100)} cm
                  </div>
                </div>
              </div>

              {analysis.fixtures.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-emerald-900">
                    検出された備え付け固定設備（ロック状態で初期配置されます）:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.fixtures.map((f, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                      >
                        {f.label || FIXTURE_KIND_LABELS[f.kind]}（
                        {Math.round(f.widthMeters * 100)}×
                        {Math.round(f.depthMeters * 100)}cm）
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-600">
                ※ 反映後、2Dエディタで壁端点の微修正と「縮尺補正 (cm)」を行うと正確なサイズ感になります。
              </p>
            </div>
          )}
        </div>

        {/* フッターアクション */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            disabled={!image || analyzing}
            onClick={handleApplyImageOnly}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            画像のみを2D背景に配置（手動編集）
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetAndClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
            >
              キャンセル
            </button>

            {analysis ? (
              <button
                type="button"
                onClick={handleApplyAnalysis}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                この解析結果を2Dエディタへ反映
              </button>
            ) : (
              <button
                type="button"
                disabled={!image || analyzing}
                onClick={() => void handleRunAiAnalysis()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Gemini で解析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    AIで壁・設備を自動抽出
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

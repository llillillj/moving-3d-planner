'use client';

import { useEffect, useState } from 'react';
import { Ruler, X } from 'lucide-react';
import { distance2D } from '@/lib/geometry';
import { cmToMeters, metersToCm } from '@/lib/units';
import type { Point2D } from '@/types/planner';

interface ScaleCalibrationModalProps {
  open: boolean;
  pointA: Point2D | null;
  pointB: Point2D | null;
  onClose: () => void;
  onConfirm: (actualDistanceMeters: number) => void;
}

const REFERENCE_PRESETS_CM = [
  { label: 'ドア幅 (80cm)', cm: 80 },
  { label: '半間 (90cm)', cm: 90 },
  { label: '一間 (180cm)', cm: 180 },
  { label: '6畳短辺 (270cm)', cm: 270 },
  { label: '6畳長辺 (360cm)', cm: 360 },
];

export function ScaleCalibrationModal({
  open,
  pointA,
  pointB,
  onClose,
  onConfirm,
}: ScaleCalibrationModalProps) {
  const currentMeters = pointA && pointB ? distance2D(pointA, pointB) : 0;
  const currentCm = Math.round(metersToCm(currentMeters));

  const [targetCm, setTargetCm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && currentCm > 0) {
      setTargetCm(String(currentCm));
      setError(null);
    }
  }, [open, currentCm]);

  if (!open || !pointA || !pointB) return null;

  const parsedCm = Number(targetCm);
  const ratio =
    Number.isFinite(parsedCm) && parsedCm > 0 && currentCm > 0
      ? parsedCm / currentCm
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(parsedCm) || parsedCm < 10 || parsedCm > 5000) {
      setError('10cm 〜 5000cm の範囲で実寸を入力してください。');
      return;
    }
    onConfirm(cmToMeters(parsedCm));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Ruler className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                基準区間の実寸入力（縮尺確定）
              </h2>
              <p className="text-[11px] text-slate-500">
                入力した長さに合わせて背景図・全壁・固定設備を一括スケーリングします
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <span className="text-slate-500">選択区間の現在サイズ</span>
            <span className="font-bold text-slate-800">{currentCm} cm</span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              実際の実寸 (cm)
            </label>
            <div className="relative">
              <input
                type="number"
                min={10}
                max={5000}
                step={1}
                value={targetCm}
                onChange={(e) => {
                  setTargetCm(e.target.value);
                  setError(null);
                }}
                autoFocus
                className="w-full rounded-lg border border-slate-300 py-2 pr-10 pl-3 text-base font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-slate-400">
                cm
              </span>
            </div>

            {ratio !== null && (
              <p className="mt-1.5 text-[11px] text-blue-700">
                全体倍率: <strong>×{ratio.toFixed(3)}</strong>
                （家具の実寸は変わらず、間取り全体が実寸に補正されます）
              </p>
            )}
          </div>

          {/* よくある住宅寸法プリセット */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-slate-500">
              目安プリセット:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REFERENCE_PRESETS_CM.map((preset) => (
                <button
                  key={preset.cm}
                  type="button"
                  onClick={() => {
                    setTargetCm(String(preset.cm));
                    setError(null);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              この実寸で縮尺を確定
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

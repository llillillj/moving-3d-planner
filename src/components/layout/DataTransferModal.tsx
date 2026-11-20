'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  Upload,
  X,
} from 'lucide-react';
import {
  buildExportPayload,
  downloadPlannerJson,
  formatBytes,
  parseAndValidateImportJson,
  type ImportValidationResult,
} from '@/lib/storage-io';
import { usePlannerStore } from '@/store/usePlannerStore';

interface DataTransferModalProps {
  open: boolean;
  onClose: () => void;
}

export function DataTransferModal({ open, onClose }: DataTransferModalProps) {
  const properties = usePlannerStore((s) => s.properties);
  const catalog = usePlannerStore((s) => s.catalog);
  const activePropertyId = usePlannerStore((s) => s.activePropertyId);
  const importPlannerData = usePlannerStore((s) => s.importPlannerData);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] =
    useState<ImportValidationResult | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const exportStats = useMemo(() => {
    if (!open) {
      return {
        propertyCount: 0,
        catalogCount: 0,
        totalPlacements: 0,
        estimatedBytes: 0,
      };
    }
    const payload = buildExportPayload({ catalog, properties, activePropertyId });
    const bytes = new Blob([JSON.stringify(payload)]).size;
    const totalPlacements = properties.reduce(
      (sum, p) =>
        sum + p.layouts.reduce((lsum, l) => lsum + l.placements.length, 0),
      0,
    );
    return {
      propertyCount: properties.length,
      catalogCount: catalog.length,
      totalPlacements,
      estimatedBytes: bytes,
    };
  }, [open, catalog, properties, activePropertyId]);

  if (!open) return null;

  const handleExport = () => {
    const payload = buildExportPayload({ catalog, properties, activePropertyId });
    downloadPlannerJson(payload);
    setSuccessMessage('全データの JSON ファイルをエクスポートしました。');
    setError(null);
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSuccessMessage(null);
    setImportPreview(null);

    try {
      const text = await file.text();
      const validated = parseAndValidateImportJson(text);
      setImportPreview(validated);
      setImportFileName(file.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'JSON ファイルの読み込みに失敗しました。',
      );
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview) return;
    if (
      importMode === 'replace' &&
      !window.confirm(
        '現在の物件・マイ家具カタログをすべて置き換えて復元します。よろしいですか？',
      )
    ) {
      return;
    }

    setImporting(true);
    setError(null);
    try {
      await importPlannerData(importPreview.payload, importMode);
      setSuccessMessage(
        importMode === 'replace'
          ? 'JSON データからすべての物件・マイ家具カタログを復元しました。'
          : 'JSON データの物件・マイ家具カタログを追加マージしました。',
      );
      setImportPreview(null);
      setImportFileName('');
    } catch (err) {
      setError(
        err instanceof Error
          ? `インポートに失敗しました: ${err.message}`
          : 'インポートに失敗しました。',
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <FileJson className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                データの JSON エクスポート / インポート
              </h2>
              <p className="text-xs text-slate-500">
                全物件（間取り図・設備・配置案）とマイ家具カタログを丸ごとバックアップ・移行できます
              </p>
            </div>
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

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              {successMessage}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. エクスポート */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  JSON バックアップを書き出し
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  別ブラウザや別PCへの引き継ぎ、作業前のバックアップに利用できます。
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <Download className="h-3.5 w-3.5" />
                JSON 出力
              </button>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                <div className="text-[10px] text-slate-500">物件数</div>
                <div className="text-sm font-bold text-slate-800">
                  {exportStats.propertyCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                <div className="text-[10px] text-slate-500">マイ家具</div>
                <div className="text-sm font-bold text-slate-800">
                  {exportStats.catalogCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                <div className="text-[10px] text-slate-500">配置家具</div>
                <div className="text-sm font-bold text-slate-800">
                  {exportStats.totalPlacements}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                <div className="text-[10px] text-slate-500">概算サイズ</div>
                <div className="text-sm font-bold text-blue-600">
                  {formatBytes(exportStats.estimatedBytes)}
                </div>
              </div>
            </div>
          </section>

          {/* 2. インポート */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                JSON ファイルから読み込み
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                このアプリで書き出した `.json` ファイルを選択すると、内容を確認してから取り込めます。
              </p>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFileChange(e.dataTransfer.files?.[0]);
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  void handleFileChange(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Upload className="mb-1.5 h-6 w-6 text-slate-400" />
              <p className="text-xs font-semibold text-slate-700">
                JSON ファイルをドラッグ＆ドロップ、またはクリックして選択
              </p>
              {importFileName && (
                <p className="mt-1 text-[11px] text-blue-600">
                  選択中: {importFileName}
                </p>
              )}
            </div>

            {importPreview && (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-900">
                    読み込み内容のプレビュー
                  </span>
                  <span className="text-[11px] text-slate-500">
                    出力日時:{' '}
                    {new Date(importPreview.summary.exportedAt).toLocaleString('ja-JP')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                  <span className="rounded bg-white px-2 py-0.5 font-semibold shadow-2xs">
                    物件 {importPreview.summary.propertyCount} 件
                  </span>
                  <span className="rounded bg-white px-2 py-0.5 font-semibold shadow-2xs">
                    マイ家具 {importPreview.summary.catalogCount} 点
                  </span>
                  <span className="rounded bg-white px-2 py-0.5 font-semibold shadow-2xs">
                    レイアウト案 {importPreview.summary.totalLayouts} 件
                  </span>
                </div>

                {importPreview.summary.propertyNames.length > 0 && (
                  <div className="text-[11px] text-slate-600">
                    含まれる物件: {importPreview.summary.propertyNames.join('、')}
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-700">
                    取り込み方法:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs transition ${
                        importMode === 'merge'
                          ? 'border-blue-500 bg-white text-blue-900 shadow-2xs'
                          : 'border-slate-200 bg-white/60 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div>
                        <div className="font-bold">現在のデータに追加</div>
                        <div className="text-[10px] text-slate-500">
                          既存物件を残したまま追加します
                        </div>
                      </div>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs transition ${
                        importMode === 'replace'
                          ? 'border-amber-500 bg-white text-amber-950 shadow-2xs'
                          : 'border-slate-200 bg-white/60 text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 accent-amber-600"
                      />
                      <div>
                        <div className="font-bold">すべて置き換え復元</div>
                        <div className="text-[10px] text-slate-500">
                          現在のデータを上書きします
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void handleExecuteImport()}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs disabled:opacity-50 ${
                      importMode === 'replace'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {importing
                      ? '読み込み中...'
                      : importMode === 'replace'
                        ? 'すべて置き換えて復元'
                        : '現在のデータへ追加マージ'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

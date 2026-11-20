'use client';

import { useState } from 'react';
import {
  Building2,
  Columns2,
  Copy,
  Cuboid,
  FileJson,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { usePlannerStore } from '@/store/usePlannerStore';
import { DataTransferModal } from './DataTransferModal';

export function HeaderBar() {
  const properties = usePlannerStore((s) => s.properties);
  const activePropertyId = usePlannerStore((s) => s.activePropertyId);
  const editorMode = usePlannerStore((s) => s.editorMode);

  const setActiveProperty = usePlannerStore((s) => s.setActiveProperty);
  const addProperty = usePlannerStore((s) => s.addProperty);
  const duplicateProperty = usePlannerStore((s) => s.duplicateProperty);
  const renameProperty = usePlannerStore((s) => s.renameProperty);
  const deleteProperty = usePlannerStore((s) => s.deleteProperty);

  const setActiveLayout = usePlannerStore((s) => s.setActiveLayout);
  const addLayoutVariant = usePlannerStore((s) => s.addLayoutVariant);
  const duplicateLayoutVariant = usePlannerStore((s) => s.duplicateLayoutVariant);
  const renameLayoutVariant = usePlannerStore((s) => s.renameLayoutVariant);
  const deleteLayoutVariant = usePlannerStore((s) => s.deleteLayoutVariant);

  const setEditorMode = usePlannerStore((s) => s.setEditorMode);
  const resetToSeedData = usePlannerStore((s) => s.resetToSeedData);

  const [renamingTarget, setRenamingTarget] = useState<'property' | 'layout' | null>(
    null,
  );
  const [renameText, setRenameText] = useState('');
  const [dataModalOpen, setDataModalOpen] = useState(false);

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) ?? properties[0];
  const activeLayout =
    activeProperty?.layouts.find((l) => l.id === activeProperty.activeLayoutId) ??
    activeProperty?.layouts[0];

  const startRename = (target: 'property' | 'layout') => {
    if (target === 'property' && activeProperty) {
      setRenameText(activeProperty.name);
      setRenamingTarget('property');
    } else if (target === 'layout' && activeLayout) {
      setRenameText(activeLayout.name);
      setRenamingTarget('layout');
    }
  };

  const commitRename = () => {
    if (!renameText.trim()) {
      setRenamingTarget(null);
      return;
    }
    if (renamingTarget === 'property' && activeProperty) {
      renameProperty(activeProperty.id, renameText);
    } else if (renamingTarget === 'layout' && activeLayout) {
      renameLayoutVariant(activeLayout.id, renameText);
    }
    setRenamingTarget(null);
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 shadow-2xs">
      {/* 左：アプリ名 ＋ 物件切替 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-slate-900">間取り3Dプランナー</h1>
            <p className="text-[10px] text-slate-500">引っ越し家具配置シミュレーター</p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* 物件セレクタ・複製・追加・削除 */}
        {activeProperty && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <span className="px-1.5 text-[11px] font-semibold text-slate-500">
              物件
            </span>
            {renamingTarget === 'property' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  autoFocus
                  className="w-44 rounded border border-blue-400 bg-white px-2 py-0.5 text-xs text-slate-900 focus:outline-none"
                />
              </form>
            ) : (
              <select
                value={activeProperty.id}
                onChange={(e) => setActiveProperty(e.target.value)}
                className="max-w-[200px] rounded-md border border-transparent bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                aria-label="物件を選択"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => startRename('property')}
              title="物件名を変更"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => addProperty()}
              title="新規物件を追加"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => duplicateProperty(activeProperty.id)}
              title="現在の物件を複製"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={properties.length <= 1}
              onClick={() => {
                if (
                  window.confirm(
                    `「${activeProperty.name}」を削除しますか？この操作は取り消せません。`,
                  )
                ) {
                  deleteProperty(activeProperty.id);
                }
              }}
              title={
                properties.length <= 1
                  ? '最後の物件は削除できません'
                  : '現在の物件を削除'
              }
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* レイアウト案切替・複製・追加・削除 */}
        {activeProperty && activeLayout && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <span className="px-1.5 text-[11px] font-semibold text-slate-500">
              配置案
            </span>
            {renamingTarget === 'layout' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <input
                  type="text"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={commitRename}
                  autoFocus
                  className="w-36 rounded border border-blue-400 bg-white px-2 py-0.5 text-xs text-slate-900 focus:outline-none"
                />
              </form>
            ) : (
              <div className="flex items-center gap-1">
                {activeProperty.layouts.length <= 4 ? (
                  activeProperty.layouts.map((layout) => {
                    const isActive = layout.id === activeLayout.id;
                    return (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => setActiveLayout(layout.id)}
                        className={`max-w-[130px] truncate rounded-md px-2 py-1 text-xs font-medium transition ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {layout.name}
                      </button>
                    );
                  })
                ) : (
                  <select
                    value={activeLayout.id}
                    onChange={(e) => setActiveLayout(e.target.value)}
                    className="max-w-[160px] rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs"
                  >
                    {activeProperty.layouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => startRename('layout')}
              title="配置案名を変更"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => duplicateLayoutVariant(activeLayout.id)}
              title="現在の配置案を複製して別パターンを作成"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => addLayoutVariant()}
              title="空の配置案を追加"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={activeProperty.layouts.length <= 1}
              onClick={() => {
                if (
                  window.confirm(`配置案「${activeLayout.name}」を削除しますか？`)
                ) {
                  deleteLayoutVariant(activeLayout.id);
                }
              }}
              title={
                activeProperty.layouts.length <= 1
                  ? '最後の配置案は削除できません'
                  : '現在の配置案を削除'
              }
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 右：3D / 2D モード切替 ＋ サンプルリセット */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setEditorMode('3d')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition ${
              editorMode === '3d'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cuboid className="h-3.5 w-3.5" />
            3D 家具配置
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('2d')}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition ${
              editorMode === '2d'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            2D 間取り編集
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('split')}
            title="左に2D間取り編集、右に3Dリアルタイム表示"
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition ${
              editorMode === 'split'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            2D+3D 同時
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDataModalOpen(true)}
          title="全データをJSONファイルでエクスポート／インポート"
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileJson className="h-3.5 w-3.5 text-blue-600" />
          JSON保存/読込
        </button>

        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'IndexedDB の保存データを初期サンプル状態（物件A・物件B・初期家具）にリセットしますか？',
              )
            ) {
              void resetToSeedData();
            }
          }}
          title="サンプルデータに戻す"
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          初期化
        </button>
      </div>

      <DataTransferModal
        open={dataModalOpen}
        onClose={() => setDataModalOpen(false)}
      />
    </header>
  );
}

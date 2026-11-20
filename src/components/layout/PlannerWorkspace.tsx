'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { FloorplanEditor2D } from '@/components/editor2d/FloorplanEditor2D';
import { usePlannerStore } from '@/store/usePlannerStore';
import { HeaderBar } from './HeaderBar';
import { InspectorPanel } from './InspectorPanel';
import { LeftSidebar } from './LeftSidebar';

const RoomCanvas3D = dynamic(
  () =>
    import('../viewport3d/RoomCanvas3D').then((mod) => ({
      default: mod.RoomCanvas3D,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        3D空間を準備しています...
      </div>
    ),
  },
);

export function PlannerWorkspace() {
  const hydrated = usePlannerStore((s) => s.hydrated);
  const properties = usePlannerStore((s) => s.properties);
  const catalog = usePlannerStore((s) => s.catalog);
  const activePropertyId = usePlannerStore((s) => s.activePropertyId);
  const editorMode = usePlannerStore((s) => s.editorMode);
  const initialize = usePlannerStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const activeProperty =
    properties.find((p) => p.id === activePropertyId) ?? properties[0];

  if (!hydrated || !activeProperty) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        データを読み込んでいます...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <HeaderBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar />
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          {editorMode === '3d' && (
            <div className="h-full w-full">
              <RoomCanvas3D property={activeProperty} catalog={catalog} />
            </div>
          )}

          {editorMode === '2d' && (
            <div className="h-full w-full">
              <FloorplanEditor2D property={activeProperty} catalog={catalog} />
            </div>
          )}

          {editorMode === 'split' && (
            <div className="grid h-full w-full grid-cols-2 divide-x divide-slate-300">
              <div className="min-w-0 overflow-hidden">
                <FloorplanEditor2D property={activeProperty} catalog={catalog} />
              </div>
              <div className="min-w-0 overflow-hidden">
                <RoomCanvas3D property={activeProperty} catalog={catalog} />
              </div>
            </div>
          )}
        </main>
        <InspectorPanel />
      </div>
    </div>
  );
}

import Dexie, { type EntityTable } from 'dexie';
import type { FurnitureAsset, Property } from '@/types/planner';

interface AppMetaRecord {
  key: string;
  value: string;
}

class MovingPlannerDatabase extends Dexie {
  properties!: EntityTable<Property, 'id'>;
  catalog!: EntityTable<FurnitureAsset, 'id'>;
  appMeta!: EntityTable<AppMetaRecord, 'key'>;

  constructor() {
    super('moving-3d-planner-db');
    this.version(1).stores({
      properties: 'id, updatedAt',
      catalog: 'id, category, updatedAt',
      appMeta: 'key',
    });
  }
}

export const db = new MovingPlannerDatabase();

export interface PersistedPlannerState {
  properties: Property[];
  catalog: FurnitureAsset[];
  activePropertyId: string | null;
}

export async function loadPlannerState(): Promise<PersistedPlannerState> {
  const [properties, catalog, activeMeta] = await Promise.all([
    db.properties.toArray(),
    db.catalog.toArray(),
    db.appMeta.get('activePropertyId'),
  ]);

  // 作成順（古い順）で安定した並び順を保つ
  properties.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  catalog.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    properties,
    catalog,
    activePropertyId: activeMeta?.value ?? null,
  };
}

export async function saveAllPlannerState(state: PersistedPlannerState): Promise<void> {
  await db.transaction('rw', db.properties, db.catalog, db.appMeta, async () => {
    await db.properties.clear();
    await db.catalog.clear();
    if (state.properties.length > 0) {
      await db.properties.bulkPut(state.properties);
    }
    if (state.catalog.length > 0) {
      await db.catalog.bulkPut(state.catalog);
    }
    if (state.activePropertyId) {
      await db.appMeta.put({ key: 'activePropertyId', value: state.activePropertyId });
    } else {
      await db.appMeta.delete('activePropertyId');
    }
  });
}

export async function upsertPropertyRecord(property: Property): Promise<void> {
  await db.properties.put(property);
}

export async function deletePropertyRecord(propertyId: string): Promise<void> {
  await db.properties.delete(propertyId);
}

export async function upsertFurnitureAssetRecord(asset: FurnitureAsset): Promise<void> {
  await db.catalog.put(asset);
}

export async function deleteFurnitureAssetRecord(assetId: string): Promise<void> {
  await db.catalog.delete(assetId);
}

export async function saveActivePropertyId(propertyId: string | null): Promise<void> {
  if (propertyId) {
    await db.appMeta.put({ key: 'activePropertyId', value: propertyId });
  } else {
    await db.appMeta.delete('activePropertyId');
  }
}

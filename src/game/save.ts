import { type SaveData, deserializeWorld, serializeWorld } from '../sim/serialize';
import { pack, unpack } from './packing';
import type { World } from '../sim/world';

const DB_NAME = 'letzteschicht';
const STORE = 'saves';

interface SaveRecord {
  name: string;
  time: number;
  creative: boolean;
  /** alte Spielstände: unkomprimiert */
  data?: SaveData;
  /** gzip-komprimiertes JSON (fflate) */
  z?: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveWorld(name: string, world: World, creative: boolean): Promise<void> {
  const rec: SaveRecord = { name, time: Date.now(), creative, z: pack(serializeWorld(world)) };
  await tx('readwrite', (s) => s.put(rec));
}

export async function loadWorld(name: string): Promise<{ world: World; creative: boolean } | null> {
  const rec = await tx<SaveRecord | undefined>('readonly', (s) => s.get(name));
  if (!rec) return null;
  const data = rec.z ? unpack<SaveData>(rec.z) : rec.data!;
  return { world: deserializeWorld(data), creative: rec.creative };
}

export async function listSaves(): Promise<{ name: string; time: number }[]> {
  const all = await tx<SaveRecord[]>('readonly', (s) => s.getAll());
  return all.map((r) => ({ name: r.name, time: r.time })).sort((a, b) => b.time - a.time);
}

export async function deleteSave(name: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(name));
}

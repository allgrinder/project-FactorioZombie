import { Assets, type Spritesheet, Texture } from 'pixi.js';

export interface SpriteInfo {
  group: string;
  frames: string[];
  w: number;
  h: number;
  anchor: [number, number];
  fps?: number;
  meta?: { reach?: number; pivotLift?: number; blend?: string; scale?: number; angles?: number; handLift?: number; wireLift?: number };
}

export interface Manifest {
  version: number;
  tileSize: number;
  generator: string;
  atlases: { group: string; file: string }[];
  /** Halbe Auflösung (Standard): 1 Pixel je Welteinheit. */
  atlasesSd?: { group: string; file: string }[];
  sprites: Record<string, SpriteInfo>;
}

/** Zugriff auf alle Sprites aus public/assets/manifest.json. */
export class SpriteLib {
  private readonly tex = new Map<string, Texture[]>();
  constructor(readonly manifest: Manifest, sheets: Spritesheet[]) {
    const all: Record<string, Texture> = {};
    for (const s of sheets) Object.assign(all, s.textures);
    for (const [name, info] of Object.entries(manifest.sprites)) {
      this.tex.set(name, info.frames.map((f) => all[f] ?? Texture.WHITE));
    }
    // Normal-Maps („<name>.nrm“, Bild 0) für alle Bilder eines Sprites
    for (const [name, list] of this.tex) {
      const n = this.tex.get(`${name}.nrm`);
      if (n?.[0] && n[0] !== Texture.WHITE) for (const t of list) this.normals.set(t, n[0]);
    }
  }

  private readonly normals = new Map<Texture, Texture>();

  /** Normal-Map zu einem Bild (für das Nachtlicht), sonst null. */
  normalOf(t: Texture): Texture | null {
    return this.normals.get(t) ?? null;
  }

  get hasNormals(): boolean {
    return this.normals.size > 0;
  }

  has(name: string): boolean {
    return this.tex.has(name);
  }

  frames(name: string): Texture[] {
    return this.tex.get(name) ?? [Texture.WHITE];
  }

  frame(name: string, i = 0): Texture {
    const f = this.frames(name);
    return f[((i % f.length) + f.length) % f.length];
  }

  info(name: string): SpriteInfo | undefined {
    return this.manifest.sprites[name];
  }

  /** Anzahl Varianten mit Präfix, z. B. "ground." -> 8 */
  countPrefix(prefix: string): number {
    let n = 0;
    while (this.tex.has(`${prefix}${n}`)) n++;
    return n;
  }

  /** Data-URL eines Frames für das DOM-HUD (Icons). */
  iconUrl(name: string): string {
    return this.iconCache.get(name) ?? '';
  }
  readonly iconCache = new Map<string, string>();
}

export type Quality = 'sd' | 'hd';

/** Grafikqualität: ?hd=1 / ?sd=1 in der Adresse, sonst gespeicherte Wahl, sonst Standard (sd). */
export function graphicsQuality(): Quality {
  const p = new URLSearchParams(location.search);
  if (p.has('hd')) return 'hd';
  if (p.has('sd')) return 'sd';
  try {
    return localStorage.getItem('letzteschicht.grafik') === 'hd' ? 'hd' : 'sd';
  } catch {
    return 'sd';
  }
}

export function setGraphicsQuality(q: Quality): void {
  try {
    localStorage.setItem('letzteschicht.grafik', q);
  } catch {
    /* Speicher gesperrt: gilt nur für diese Sitzung über ?hd */
  }
}

export async function loadSprites(base = './assets/', onProgress?: (done: number, total: number) => void): Promise<SpriteLib> {
  const res = await fetch(`${base}manifest.json`);
  const manifest = (await res.json()) as Manifest;
  const list = graphicsQuality() === 'sd' && manifest.atlasesSd?.length ? manifest.atlasesSd : manifest.atlases;
  let done = 0;
  onProgress?.(0, list.length);
  const sheets = await Promise.all(list.map(async (a) => {
    const sh = await Assets.load<Spritesheet>(`${base}${a.file}`);
    onProgress?.(++done, list.length);
    return sh;
  }));
  const lib = new SpriteLib({ ...manifest, atlases: list }, sheets);
  await buildIconUrls(lib, base, { ...manifest, atlases: list });
  return lib;
}

/** Item- und Statussymbole als Data-URLs für das DOM ausschneiden. */
async function buildIconUrls(lib: SpriteLib, base: string, manifest: Manifest): Promise<void> {
  const groups = new Set(['items']);
  for (const a of manifest.atlases) {
    if (!groups.has(a.group)) continue;
    const json = await (await fetch(`${base}${a.file}`)).json();
    const dir = a.file.includes('/') ? a.file.slice(0, a.file.lastIndexOf('/') + 1) : '';
    const img = new Image();
    img.src = `${base}${dir}${json.meta.image}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    for (const [name, info] of Object.entries(manifest.sprites)) {
      const fr = json.frames[info.frames[0]];
      if (!fr) continue;
      // beschnittene Frames wieder auf die volle Größe setzen
      const src = fr.sourceSize ?? { w: fr.frame.w, h: fr.frame.h };
      const off = fr.spriteSourceSize ?? { x: 0, y: 0 };
      canvas.width = src.w;
      canvas.height = src.h;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, fr.frame.x, fr.frame.y, fr.frame.w, fr.frame.h, off.x, off.y, fr.frame.w, fr.frame.h);
      lib.iconCache.set(name, canvas.toDataURL());
    }
  }
}

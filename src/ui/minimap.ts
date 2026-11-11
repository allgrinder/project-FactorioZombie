import { FLOOR_BY_ID } from '../data/floors';
import { MAPGEN } from '../data/mapgen';
import { RESOURCE_BY_INDEX } from '../data/resources';
import { MINIMAP } from '../data/ui';
import type { BiomeField } from '../render/biome';
import type { World } from '../sim/world';

interface TerrainChunk {
  canvas: HTMLCanvasElement;
  frame: number;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Farbe multiplizieren (Bodenton × Landschaftsfarbe). */
function mul(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Übersichtskarte: Gelände je Chunk zwischengespeichert (Landschaftsfarbe, Wasser, Erz), darüber Gebäude,
 * Bänder, Spieler und der sichtbare Ausschnitt. Ohne Spieler (Sandkasten/Demo) verschiebt ein Klick die Kamera.
 */
/** Farbe unerkundeter Abschnitte. */
const MINIMAP_FOG = '#0d0c0a';

export class Minimap {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain = new Map<number, TerrainChunk>();
  private frame = 0;
  private sizeIdx = 0;
  private center = { x: 0, y: 0 };
  /** Klick auf die Karte (Weltkoordinaten). */
  onPick: ((x: number, y: number) => void) | null = null;

  constructor(parent: HTMLElement, private readonly biome: () => BiomeField | null) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    parent.appendChild(this.el);
    this.ctx = this.el.getContext('2d')!;
    this.applySize();
    this.el.addEventListener('pointerdown', (e) => {
      if (!this.onPick) return;
      const r = this.el.getBoundingClientRect();
      const s = MINIMAP.sizes[this.sizeIdx];
      const x = this.center.x + (e.clientX - r.left - s.px / 2) / s.scale;
      const y = this.center.y + (e.clientY - r.top - s.px / 2) / s.scale;
      this.onPick(x, y);
      e.stopPropagation();
    });
  }

  get visible(): boolean {
    return this.sizeIdx < MINIMAP.sizes.length;
  }

  /** Klein → groß → aus → klein. */
  toggle(): void {
    this.sizeIdx = (this.sizeIdx + 1) % (MINIMAP.sizes.length + 1);
    this.applySize();
    this.frame = 0;
  }

  private applySize(): void {
    if (!this.visible) {
      this.el.style.display = 'none';
      return;
    }
    const s = MINIMAP.sizes[this.sizeIdx];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.width = Math.round(s.px * dpr);
    this.el.height = Math.round(s.px * dpr);
    this.el.style.width = `${s.px}px`;
    this.el.style.height = `${s.px}px`;
    this.el.style.display = 'block';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private chunkCanvas(world: World, cx: number, cy: number): HTMLCanvasElement {
    const key = (cx + 32768) * 65536 + (cy + 32768);
    let t = this.terrain.get(key);
    if (t && this.frame - t.frame < MINIMAP.terrainRefresh) return t.canvas;
    const CS = MAPGEN.chunkSize;
    const canvas = t?.canvas ?? document.createElement('canvas');
    canvas.width = CS;
    canvas.height = CS;
    const c = canvas.getContext('2d')!;
    const img = c.createImageData(CS, CS);
    const chunk = world.map.getChunk(cx, cy);
    const bio = this.biome();
    for (let i = 0; i < CS * CS; i++) {
      const tx = cx * CS + (i % CS);
      const ty = cy * CS + Math.floor(i / CS);
      let col: number;
      if (chunk.water[i]) {
        col = MINIMAP.water;
      } else if (chunk.cliff[i]) {
        col = MINIMAP.cliff;
      } else if (world.map.floorAt(tx, ty) && !chunk.amount[i]) {
        col = FLOOR_BY_ID[world.map.floorAt(tx, ty)].mapColor;
      } else if (chunk.amount[i] > 0) {
        col = RESOURCE_BY_INDEX[chunk.resource[i]]?.mapColor ?? MINIMAP.groundBase;
      } else {
        col = mul(MINIMAP.groundBase, bio ? bio.color(tx, ty) : 0xffffff);
        // feine Körnung, damit die Fläche nicht glatt wirkt
        const n = (chunk.ground[i] & 7) - 3;
        col = ((Math.max(0, Math.min(255, ((col >> 16) & 255) + n)) << 16) | (Math.max(0, Math.min(255, ((col >> 8) & 255) + n)) << 8) | Math.max(0, Math.min(255, (col & 255) + n)));
      }
      img.data[i * 4] = (col >> 16) & 255;
      img.data[i * 4 + 1] = (col >> 8) & 255;
      img.data[i * 4 + 2] = col & 255;
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    if (t) t.frame = this.frame;
    else this.terrain.set(key, (t = { canvas, frame: this.frame }));
    return canvas;
  }

  /** view: sichtbarer Bereich in Feldern (für den Rahmen). */
  update(world: World, cx: number, cy: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (!this.visible) return;
    if (this.frame++ % MINIMAP.every !== 0) return;
    const s = MINIMAP.sizes[this.sizeIdx];
    this.center = { x: cx, y: cy };
    this.draw(this.ctx, world, s.px, s.px, cx, cy, s.scale, view, false);
  }

  /**
   * Karte zeichnen (Minimap und große Kartenansicht): Gelände, Gebäude, Verschmutzung, Gegner,
   * bei detail zusätzlich Stromnetze (Versorgungsflächen und Kabel) und einzelne Gegner.
   */
  draw(ctx: CanvasRenderingContext2D, world: World, wpx: number, hpx: number, cx: number, cy: number, scale: number,
    view: { x0: number; y0: number; x1: number; y1: number } | null, detail: boolean): void {
    const x0 = cx - wpx / 2 / scale;
    const y0 = cy - hpx / 2 / scale;
    const x1 = x0 + wpx / scale;
    const y1 = y0 + hpx / scale;
    const toX = (x: number) => (x - x0) * scale;
    const toY = (y: number) => (y - y0) * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d1b17';
    ctx.fillRect(0, 0, wpx, hpx);
    const CS = MAPGEN.chunkSize;
    // Nebel (Wiki „Radar“): unerkundete Abschnitte schwarz, nicht beobachtete leicht abgedunkelt
    const chart = world.chart;
    const charted = (x: number, y: number) => chart.isCharted(Math.floor(x), Math.floor(y));
    for (let gy = Math.floor(y0 / CS); gy <= Math.floor(y1 / CS); gy++) {
      for (let gx = Math.floor(x0 / CS); gx <= Math.floor(x1 / CS); gx++) {
        if (!chart.chunkCharted(gx, gy)) {
          ctx.fillStyle = MINIMAP_FOG;
          ctx.fillRect(toX(gx * CS), toY(gy * CS), CS * scale + 0.5, CS * scale + 0.5);
          continue;
        }
        ctx.drawImage(this.chunkCanvas(world, gx, gy), toX(gx * CS), toY(gy * CS), CS * scale + 0.5, CS * scale + 0.5);
        if (!chart.chunkLive(gx, gy, world.tick)) {
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(toX(gx * CS), toY(gy * CS), CS * scale + 0.5, CS * scale + 0.5);
        }
      }
    }
    // Stromnetz: Versorgungsflächen der Masten (nur Kartenansicht)
    if (detail) {
      ctx.fillStyle = 'rgba(90,170,255,0.10)';
      for (const e of world.entities.values()) {
        if (e.kind !== 'pole') continue;
        const r = (e.def as { supplyRadius?: number }).supplyRadius ?? 2.5;
        if (e.cx + r < x0 || e.cy + r < y0 || e.cx - r > x1 || e.cy - r > y1) continue;
        ctx.fillRect(toX(e.cx - r), toY(e.cy - r), 2 * r * scale, 2 * r * scale);
      }
    }
    for (const e of world.entities.values()) {
      if (e.x + e.w < x0 || e.y + e.h < y0 || e.x > x1 || e.y > y1 || !charted(e.cx, e.cy)) continue;
      ctx.fillStyle = css(e.kind === 'belt' || e.kind === 'underground' || e.kind === 'splitter' ? MINIMAP.belt
        : e.kind === 'rail' ? 0x8a8a8a : e.kind === 'turret' || e.kind === 'wall' ? 0xb0b0a0 : MINIMAP.building);
      ctx.fillRect(toX(e.x), toY(e.y), Math.max(1, e.w * scale), Math.max(1, e.h * scale));
    }
    if (detail) {
      ctx.strokeStyle = 'rgba(120,190,255,0.7)';
      ctx.lineWidth = 1;
      for (const [a, b] of world.power.wires) {
        const pa = world.entities.get(a);
        const pb = world.entities.get(b);
        if (!pa || !pb) continue;
        if (Math.max(pa.cx, pb.cx) < x0 || Math.min(pa.cx, pb.cx) > x1 || Math.max(pa.cy, pb.cy) < y0 || Math.min(pa.cy, pb.cy) > y1) continue;
        ctx.beginPath();
        ctx.moveTo(toX(pa.cx), toY(pa.cy));
        ctx.lineTo(toX(pb.cx), toY(pb.cy));
        ctx.stroke();
      }
    }
    // Fundorte (Häuser, Wracks) und Lärm (Ringe), dann Zombies
    ctx.fillStyle = '#c9b58a';
    for (const st of world.sites.sites) {
      if (st.x < x0 || st.y < y0 || st.x > x1 || st.y > y1 || !charted(st.x, st.y)) continue;
      const r = Math.max(2, st.r * 0.35 * scale);
      ctx.fillRect(toX(st.x) - r, toY(st.y) - r, r * 2, r * 2);
    }
    ctx.strokeStyle = 'rgba(255,190,90,0.55)';
    ctx.lineWidth = 1;
    for (const n of world.noise.recent) {
      if (n.x + n.r < x0 || n.y + n.r < y0 || n.x - n.r > x1 || n.y - n.r > y1) continue;
      ctx.beginPath();
      ctx.arc(toX(n.x), toY(n.y), Math.max(1, n.r * scale), 0, Math.PI * 2);
      ctx.stroke();
    }
    {
      ctx.fillStyle = '#ff6a50';
      for (const u of world.enemies.units.values()) {
        if (u.x < x0 || u.y < y0 || u.x > x1 || u.y > y1) continue;
        if (!chart.chunkLive(Math.floor(u.x / CS), Math.floor(u.y / CS), world.tick)) continue;
        ctx.fillRect(toX(u.x) - 1, toY(u.y) - 1, 2, 2);
      }
    }
    // sichtbarer Ausschnitt
    if (view) {
      ctx.strokeStyle = MINIMAP.view;
      ctx.lineWidth = 1;
      ctx.strokeRect(toX(view.x0) + 0.5, toY(view.y0) + 0.5, (view.x1 - view.x0) * scale, (view.y1 - view.y0) * scale);
    }
    const p = world.player;
    if (p) {
      ctx.fillStyle = css(MINIMAP.player);
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(toX(p.px / 256), toY(p.py / 256), detail ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/**
 * Große Kartenansicht (Taste M, wie im Original): bildschirmfüllend, Mausrad zoomt, Ziehen verschiebt,
 * Doppelklick setzt die Kamera (ohne Spieler). Zeigt Stromnetze, Verschmutzung, Nester und Gegner.
 */
export class MapView {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 2;
  private cx = 0;
  private cy = 0;
  private drag: { x: number; y: number } | null = null;
  open = false;
  onPick: ((x: number, y: number) => void) | null = null;

  constructor(parent: HTMLElement, private readonly mini: Minimap) {
    this.el = document.createElement('canvas');
    this.el.className = 'mapview';
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.ctx = this.el.getContext('2d')!;
    this.el.addEventListener('wheel', (e) => {
      this.scale = Math.max(0.25, Math.min(8, this.scale * Math.pow(0.85, Math.sign(e.deltaY))));
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    this.el.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.cx -= (e.clientX - this.drag.x) / this.scale;
      this.cy -= (e.clientY - this.drag.y) / this.scale;
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (this.drag = null));
    this.el.addEventListener('dblclick', (e) => {
      const r = this.el.getBoundingClientRect();
      this.onPick?.(this.cx + (e.clientX - r.left - r.width / 2) / this.scale, this.cy + (e.clientY - r.top - r.height / 2) / this.scale);
    });
  }

  toggle(cx: number, cy: number): void {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
    if (this.open) {
      this.cx = cx;
      this.cy = cy;
    }
  }

  update(world: World, view: { x0: number; y0: number; x1: number; y1: number }): void {
    if (!this.open) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.el.width !== Math.round(w * dpr) || this.el.height !== Math.round(h * dpr)) {
      this.el.width = Math.round(w * dpr);
      this.el.height = Math.round(h * dpr);
      this.el.style.width = `${w}px`;
      this.el.style.height = `${h}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mini.draw(this.ctx, world, w, h, this.cx, this.cy, this.scale, view, true);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(20,18,16,0.85)';
    ctx.fillRect(12, h - 40, 520, 28);
    ctx.fillStyle = '#e8dfcf';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Karte · ${this.scale >= 1 ? this.scale.toFixed(1) : this.scale.toFixed(2)} px/Feld · Mausrad zoomen · Ziehen verschieben · M/Esc schließen`, 22, h - 21);
  }
}

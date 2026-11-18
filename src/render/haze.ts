import { Container, DisplacementFilter, Graphics, type Renderer, RenderTexture, Sprite, Texture } from 'pixi.js';
import { EMITTERS, HAZE } from '../data/fx';
import { Status } from '../sim/entity';
import type { World } from '../sim/world';
import type { Camera } from './renderer';

const TILT_LIFT = Math.tan(Math.PI / 6);

/** Rauschfleck für die Verzerrung: Rot/Grün = Versatz, zum Rand hin neutral (128). */
function blobTexture(): Texture {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * 2 - 1;
      const v = (y / N) * 2 - 1;
      const f = Math.max(0, 1 - (u * u + v * v));
      const fall = f * f;
      const nx = Math.sin(u * 9.1 + Math.sin(v * 6.3) * 1.7) * Math.cos(v * 7.7 - u * 2.1);
      const ny = Math.sin(v * 10.3 + Math.cos(u * 5.9) * 1.3) * Math.cos(u * 8.2 + v * 1.7);
      const i = (y * N + x) * 4;
      img.data[i] = 128 + nx * 127 * fall;
      img.data[i + 1] = 128 + ny * 127 * fall;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255 * fall;
    }
  }
  g.putImageData(img, 0, 0);
  return Texture.from(c);
}

/**
 * Hitzeflimmern über arbeitenden Öfen, Kesseln und Reaktoren: eine Verzerrungskarte in Viertelauflösung
 * (neutral grau, darüber aufsteigende Rauschflecken) für einen DisplacementFilter auf der Welt.
 */
export class HeatHaze {
  readonly mapSprite: Sprite;
  readonly filter: DisplacementFilter;
  private rt: RenderTexture;
  private readonly scene = new Container();
  private readonly bg = new Graphics();
  private readonly blobs: Sprite[] = [];
  private readonly tex = blobTexture();
  active = false;

  constructor(private readonly renderer: Renderer, private readonly tile: number) {
    this.rt = RenderTexture.create({ width: 16, height: 16, resolution: 1 });
    this.mapSprite = new Sprite(this.rt);
    this.scene.addChild(this.bg);
    this.filter = new DisplacementFilter({ sprite: this.mapSprite, scale: HAZE.strength });
  }

  update(world: World, cam: Camera, w: number, h: number, time: number): void {
    const q = HAZE.downscale;
    const W = Math.max(1, Math.ceil(w / q));
    const H = Math.max(1, Math.ceil(h / q));
    if (this.rt.width !== W || this.rt.height !== H) this.rt.resize(W, H);
    const T = (this.tile * cam.zoom) / q;
    const toX = (x: number) => W / 2 + (x - cam.x) * T;
    const toY = (y: number) => H / 2 + (y - cam.y) * T;
    let n = 0;
    const spot = (x: number, y: number, size: number, id: number) => {
      const sx = toX(x);
      const sy = toY(y);
      const R = size * T * 2;
      if (sx < -R || sy < -R * 2 || sx > W + R || sy > H + R) return;
      for (let k = 0; k < HAZE.blobs; k++) {
        // Flecken steigen auf und vergehen, jeder mit eigener Phase
        const ph = (time / HAZE.period + k / HAZE.blobs + (id % 7) * 0.13) % 1;
        let s = this.blobs[n];
        if (!s) {
          s = new Sprite(this.tex);
          s.anchor.set(0.5);
          this.blobs.push(s);
          this.scene.addChild(s);
        }
        s.visible = true;
        s.position.set(sx + Math.sin(time * 1.7 + k * 2 + id) * T * 0.15, sy - ph * HAZE.rise * T);
        s.rotation = time * 0.6 + k * 1.9 + id;
        s.scale.set((size * T * (0.7 + ph * 0.8)) / this.tex.width);
        s.alpha = Math.sin(Math.PI * ph);
        n++;
      }
    };
    for (const e of world.entities.values()) {
      if (e.status !== Status.Working) continue;
      if (e.x > cam.x + w / (this.tile * cam.zoom) || e.x + e.w < cam.x - w / (this.tile * cam.zoom)) continue;
      if (e.kind !== 'furnace' && e.kind !== 'boiler') continue;
      const ems = EMITTERS[e.name];
      const sm = ems?.find((m) => m.kind === 'smoke');
      if (!sm) {
        spot(e.cx, e.cy - e.h * 0.5, 1.1, e.id);
        continue;
      }
      let [bx, by] = [sm.at[0], sm.at[1]];
      for (let r = 0; r < e.dir; r++) [bx, by] = [by, -bx];
      spot(e.cx + bx, e.cy - by - sm.at[2] * TILT_LIFT - 0.3, 1.0, e.id);
    }
    for (let i = n; i < this.blobs.length; i++) this.blobs[i].visible = false;
    this.active = n > 0;
    if (!this.active) return;
    this.bg.clear().rect(0, 0, W, H).fill(0x808080);
    this.renderer.render({ container: this.scene, target: this.rt, clear: true });
  }
}

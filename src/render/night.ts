import { Container, Filter, GlProgram, type Renderer, RenderTexture, Sprite, UniformGroup } from 'pixi.js';
import { NIGHT } from '../data/fx';
import { Status } from '../sim/entity';
import type { World } from '../sim/world';
import type { Entity } from '../sim/machines';
import { DAY } from '../data/time';
import type { SpritePool } from './pools';
import type { Camera } from './renderer';
import type { SpriteLib } from './assets';

/** Höchstzahl gleichzeitig berechneter Lichter. */
const MAX_LIGHTS = 64;

const vertex = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vPos;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vPos = aPosition;
}`;

/**
 * Licht je Bildpunkt: Normal-Map (Kameraraum: x rechts, y oben, z zur Kamera) gegen Punktlichter in Bodennähe.
 * Bodenrichtungen im Kameraraum bei 30° Neigung: Osten (1,0,0), Süden (0,−cos,sin), oben (0,sin,cos).
 */
const fragment = `in vec2 vTextureCoord;
in vec2 vPos;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uScreen;
uniform vec3 uAmbient;
uniform float uCount;
uniform vec2 uTilt;
uniform vec4 uPos[${MAX_LIGHTS}];
uniform vec4 uCol[${MAX_LIGHTS}];
uniform vec4 uDir[${MAX_LIGHTS}];
void main(void) {
  vec2 px = vPos * uScreen;
  vec4 t = texture(uTexture, vTextureCoord);
  vec3 n = t.a > 0.01 ? normalize(t.rgb / t.a * 2.0 - 1.0) : vec3(0.0, uTilt.x, uTilt.y);
  vec3 light = uAmbient;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (float(i) >= uCount) break;
    vec4 p = uPos[i];
    vec2 d = px - p.xy;
    float r = length(d) / p.z;
    if (r >= 1.0) continue;
    float att = 1.0 - r * r;
    att *= att;
    float h = uDir[i].z;
    vec3 L = normalize(vec3(-d.x, d.y * uTilt.y + h * uTilt.x, -d.y * uTilt.x + h * uTilt.y));
    float diff = 0.3 + 0.7 * max(dot(n, L), 0.0);
    float cone = 1.0;
    if (uCol[i].w > -1.5) {
      float c = dot(d / max(length(d), 0.001), uDir[i].xy);
      cone = smoothstep(uCol[i].w, uCol[i].w + uDir[i].w, c) + max(0.0, 1.0 - length(d) / (p.z * 0.12));
      cone = min(cone, 1.0);
    }
    light += uCol[i].rgb * (p.w * att * diff * cone);
  }
  finalColor = vec4(min(light, vec3(1.0)), 1.0);
}`;

/**
 * Nachtlicht: Die Gebäude werden ein zweites Mal mit ihren Normal-Maps (aus Blender) in eine Bildschirmtextur
 * gezeichnet; ein Shader berechnet daraus je Bildpunkt Umgebungslicht plus farbige Punkt- und Kegellichter
 * (Lampen, Feuer, Taschenlampe, Zugscheinwerfer). Das Ergebnis wird mit der Welt multipliziert.
 */
export class NightLayer {
  readonly sprite: Sprite;
  private rt: RenderTexture;
  private readonly scene = new Container();
  private readonly mirrors = new Container();
  private readonly pool: Sprite[] = [];
  private readonly uniforms: UniformGroup;
  private readonly pos = new Float32Array(MAX_LIGHTS * 4);
  private readonly col = new Float32Array(MAX_LIGHTS * 4);
  private readonly dir = new Float32Array(MAX_LIGHTS * 4);

  constructor(private readonly sprites: SpriteLib, private readonly renderer: Renderer, private readonly tile: number) {
    this.rt = RenderTexture.create({ width: 16, height: 16, resolution: 1 });
    this.sprite = new Sprite(this.rt);
    this.sprite.visible = false;
    this.mirrors.sortableChildren = true;
    this.scene.addChild(this.mirrors);
    const tilt = (NIGHT.tiltDeg * Math.PI) / 180;
    this.uniforms = new UniformGroup({
      uScreen: { value: new Float32Array([16, 16]), type: 'vec2<f32>' },
      uAmbient: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
      uCount: { value: 0, type: 'f32' },
      uTilt: { value: new Float32Array([Math.sin(tilt), Math.cos(tilt)]), type: 'vec2<f32>' },
      uPos: { value: this.pos, type: 'vec4<f32>', size: MAX_LIGHTS },
      uCol: { value: this.col, type: 'vec4<f32>', size: MAX_LIGHTS },
      uDir: { value: this.dir, type: 'vec4<f32>', size: MAX_LIGHTS },
    });
    const f = new Filter({
      glProgram: GlProgram.from({ vertex, fragment, name: 'night-light' }),
      resources: { lightUniforms: this.uniforms },
      resolution: 1,
    });
    f.blendMode = 'multiply';
    this.sprite.filters = [f];
  }

  /**
   * @param root Weltcontainer (Kameratransformation)
   * @param ents Gebäude-Sprites (deren Normal-Maps gespiegelt werden)
   * @param facing Blickrichtung der Figur als Einheitsvektor (Bildschirm)
   */
  update(world: World, cam: Camera, w: number, h: number, root: Container, ents: SpritePool, facing: { x: number; y: number }): void {
    const d = world.darkness;
    // Goldene Stunde: warmes Licht um die Dämmerung (abends orange, morgens rosig)
    const t = world.daytime;
    const ge = Math.max(0, 1 - Math.abs(t - (DAY.dusk + NIGHT.goldenShift)) / NIGHT.goldenWidth);
    const gm = Math.max(0, 1 - Math.abs(t - (DAY.dawn - NIGHT.goldenShift)) / NIGHT.goldenWidth);
    const golden = Math.max(ge, gm) * NIGHT.goldenStrength;
    const gc = ge >= gm ? NIGHT.goldenEvening : NIGHT.goldenMorning;
    if (d < 0.01 && golden < 0.01) {
      this.sprite.visible = false;
      return;
    }
    if (this.rt.width !== w || this.rt.height !== h) this.rt.resize(w, h);
    // 1) Normalen der Gebäude (leer = flacher Boden, siehe Shader)
    this.mirrors.position.copyFrom(root.position);
    this.mirrors.scale.copyFrom(root.scale);
    let n = 0;
    ents.forEachUsed((s) => {
      if (!s.visible) return;
      const nt = this.sprites.normalOf(s.texture);
      if (!nt) return;
      let m = this.pool[n];
      if (!m) {
        m = new Sprite(nt);
        this.pool.push(m);
        this.mirrors.addChild(m);
      }
      m.texture = nt;
      m.visible = true;
      m.anchor.copyFrom(s.anchor);
      m.position.copyFrom(s.position);
      m.scale.copyFrom(s.scale);
      m.rotation = s.rotation;
      m.zIndex = s.zIndex;
      m.alpha = s.alpha;
      n++;
    });
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
    this.renderer.render({ container: this.scene, target: this.rt, clear: true, clearColor: [0, 0, 0, 0] });

    // 2) Lichter sammeln (Bildschirmkoordinaten)
    const T = this.tile * cam.zoom;
    const toX = (x: number) => w / 2 + (x - cam.x) * T;
    const toY = (y: number) => h / 2 + (y - cam.y) * T;
    let k = 0;
    const add = (x: number, y: number, r: number, a: number, color: number, cone?: { dx: number; dy: number; cos: number }) => {
      if (k >= MAX_LIGHTS) return;
      const sx = toX(x);
      const sy = toY(y);
      const R = r * T;
      if (sx < -R || sy < -R || sx > w + R || sy > h + R) return;
      const i = k * 4;
      this.pos[i] = sx;
      this.pos[i + 1] = sy;
      this.pos[i + 2] = R;
      this.pos[i + 3] = a * d;
      this.col[i] = ((color >> 16) & 255) / 255;
      this.col[i + 1] = ((color >> 8) & 255) / 255;
      this.col[i + 2] = (color & 255) / 255;
      this.col[i + 3] = cone ? cone.cos : -2;
      this.dir[i] = cone?.dx ?? 0;
      this.dir[i + 1] = cone?.dy ?? 0;
      this.dir[i + 2] = NIGHT.lightHeight * T;
      this.dir[i + 3] = 0.12;
      k++;
    };
    const p = world.player;
    if (p && !p.inCar) {
      const px = p.px / 256;
      const py = p.py / 256 - 0.4;
      add(px, py, NIGHT.playerRadius, 0.55, NIGHT.playerColor);
      // Taschenlampe: Lichtkegel in Blickrichtung (wie im Original)
      add(px, py, NIGHT.flashlightRange, 1.1, NIGHT.flashlightColor, { dx: facing.x, dy: facing.y, cos: Math.cos((NIGHT.flashlightAngle * Math.PI) / 360) });
    }
    // Pritschenwagen: Scheinwerfer, solange der Motor läuft
    for (const c of world.cars.cars) {
      if (!c.running) continue;
      const dx = Math.cos(c.angle);
      const dy = Math.sin(c.angle);
      add(c.x + dx * 1.4, c.y + dy * 1.4, NIGHT.headlightRange, 1.2, NIGHT.flashlightColor, { dx, dy, cos: Math.cos((NIGHT.headlightAngle * Math.PI) / 360) });
    }
    // Kerzen bei Bewohnern, die zu Hause sind oder schlafen; Fackeln der Plünderer
    for (const w of world.community.workers) {
      const fl = 0.85 + 0.15 * Math.sin(world.tick * 0.31 + w.id * 7);
      if (w.faction === 'raider') add(w.x, w.y - 0.5, NIGHT.torchRadius * fl, 0.95, NIGHT.fireColor);
      else if (w.resident && (w.state === 'home' || w.state === 'sleep')) add(w.x, w.y - 0.3, NIGHT.candleRadius * fl, 0.8, NIGHT.candleColor);
    }
    // Lampen zuerst (falls mehr Lichter als Plätze), dann Feuer und Masten
    const poles = world.research.bonus('pole-light') > 0 && d >= DAY.lampOn;
    const rest: Entity[] = [];
    for (const e of world.entities.values()) {
      if (e.kind === 'lamp') {
        if (e.status === Status.Working) {
          const r = e.def.lightRadius;
          add(e.cx, e.cy, r ?? NIGHT.lampRadius, r ? NIGHT.lampStrength * 1.25 : NIGHT.lampStrength, r ? NIGHT.floodColor : NIGHT.lampColor);
        }
      } else if (e.kind === 'fire') {
        // Feuer flackert
        if (e.status === Status.Working) {
          const fl = 0.85 + 0.15 * Math.sin(world.tick * 0.37 + e.id) * Math.sin(world.tick * 0.11 + e.id * 3);
          add(e.cx, e.cy - 0.2, e.def.lightRadius * fl, 1.05, NIGHT.fireColor);
        }
      } else if (e.status === Status.Working || e.kind === 'pole') rest.push(e);
    }
    for (const e of rest) {
      if (e.kind === 'furnace' || e.kind === 'boiler') add(e.cx, e.cy + e.h * 0.4, NIGHT.fireRadius, 0.9, NIGHT.fireColor);
    }
    if (poles) {
      for (const e of rest) {
        if (e.kind !== 'pole' || !((world.power.netOf.get(e.id)?.potential ?? 0) > 0)) continue;
        add(e.cx, e.cy, NIGHT.poleRadius, NIGHT.poleStrength, NIGHT.poleColor);
      }
    }
    const amb = NIGHT.alpha * d;
    const ac = NIGHT.ambient;
    const u = this.uniforms.uniforms as { uScreen: Float32Array; uAmbient: Float32Array; uCount: number };
    u.uScreen[0] = w;
    u.uScreen[1] = h;
    const gold = (sh: number) => 1 - golden + golden * (((gc >> sh) & 255) / 255);
    u.uAmbient[0] = (1 - amb + amb * (((ac >> 16) & 255) / 255)) * gold(16);
    u.uAmbient[1] = (1 - amb + amb * (((ac >> 8) & 255) / 255)) * gold(8);
    u.uAmbient[2] = (1 - amb + amb * ((ac & 255) / 255)) * gold(0);
    u.uCount = k;
    this.uniforms.update();
    this.sprite.visible = true;
  }
}

import { Container, Particle, ParticleContainer, Sprite, type Texture } from 'pixi.js';

/** Wiederverwendbare Partikel für viele gleichartige Sprites (ein Atlas pro Container). */
export class ParticlePool {
  readonly container: ParticleContainer;
  private readonly pool: Particle[] = [];
  private n = 0;

  constructor(texture: Texture) {
    this.container = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, uvs: true, vertex: true, color: true, rotation: true },
    });
  }

  begin(): void {
    this.n = 0;
  }

  push(tex: Texture, x: number, y: number, scale = 1, alpha = 1, rotation = 0, tint = 0xffffff): void {
    let p = this.pool[this.n];
    if (!p) {
      p = new Particle({ texture: tex });
      this.pool.push(p);
    }
    p.texture = tex;
    p.x = x;
    p.y = y;
    p.scaleX = scale;
    p.scaleY = scale;
    p.anchorX = tex.defaultAnchor?.x ?? 0.5;
    p.anchorY = tex.defaultAnchor?.y ?? 0.5;
    p.alpha = alpha;
    p.rotation = rotation;
    p.tint = tint;
    this.n++;
  }

  end(): void {
    const children = this.container.particleChildren;
    if (children.length !== this.n || children[this.n - 1] !== this.pool[this.n - 1]) {
      children.length = 0;
      for (let i = 0; i < this.n; i++) children.push(this.pool[i]);
    }
    this.container.update();
  }

  get count(): number {
    return this.n;
  }
}

/** Pool normaler Sprites (für unterschiedliche Atlanten, Drehung, Tönung). */
export class SpritePool {
  readonly container = new Container();
  private readonly pool: Sprite[] = [];
  private n = 0;

  begin(): void {
    this.n = 0;
  }

  get(tex: Texture): Sprite {
    let s = this.pool[this.n];
    if (!s) {
      s = new Sprite(tex);
      this.pool.push(s);
      this.container.addChild(s);
    }
    s.texture = tex;
    s.visible = true;
    s.alpha = 1;
    s.tint = 0xffffff;
    s.rotation = 0;
    s.scale.set(1);
    if (s.skew.x !== 0) s.skew.x = 0;
    s.anchor.copyFrom(tex.defaultAnchor ?? { x: 0.5, y: 0.5 });
    s.zIndex = 0;
    this.n++;
    return s;
  }

  end(): void {
    for (let i = this.n; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  /** Anzahl bisher in diesem Bild benutzter Sprites. */
  get used(): number {
    return this.n;
  }

  /** i-tes benutztes Sprite. */
  at(i: number): Sprite {
    return this.pool[i];
  }

  /** In diesem Bild benutzte Sprites (nach end()). */
  forEachUsed(fn: (s: Sprite) => void): void {
    for (let i = 0; i < this.n; i++) fn(this.pool[i]);
  }
}

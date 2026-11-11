import { ColorMatrixFilter } from 'pixi.js';
import type { Grade } from '../data/look';

type M = number[];
/** 4×5-Farbmatrix (Zeilen R, G, B, A; Spalten r, g, b, a, Summand) verketten: erst a, dann b. */
function mul(b: M, a: M): M {
  const out = new Array<number>(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? b[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += b[r * 5 + k] * (c === 4 ? a[k * 5 + 4] : a[k * 5 + c]);
      out[r * 5 + c] = v;
    }
  }
  return out;
}
const diag = (r: number, g: number, b: number, o: [number, number, number] = [0, 0, 0]): M =>
  [r, 0, 0, 0, o[0], 0, g, 0, 0, o[1], 0, 0, b, 0, o[2], 0, 0, 0, 1, 0];

/** Farbmatrix einer Abstimmung: Sättigung → Kontrast → Helligkeit → Farbstich/Schattenanhebung. */
export function gradeMatrix(g: Grade): M {
  const s = g.saturation;
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const sat: M = [
    lr + (1 - lr) * s, lg - lg * s, lb - lb * s, 0, 0,
    lr - lr * s, lg + (1 - lg) * s, lb - lb * s, 0, 0,
    lr - lr * s, lg - lg * s, lb + (1 - lb) * s, 0, 0,
    0, 0, 0, 1, 0,
  ];
  const c = g.contrast;
  const off = g.pivot * (1 - c);
  const con = diag(c, c, c, [off, off, off]);
  const bri = diag(g.brightness, g.brightness, g.brightness);
  const tone = diag(g.gain[0], g.gain[1], g.gain[2], [g.lift[0], g.lift[1], g.lift[2]]);
  return mul(tone, mul(bri, mul(con, sat)));
}

export function gradeFilter(g: Grade): ColorMatrixFilter {
  const f = new ColorMatrixFilter();
  f.matrix = gradeMatrix(g) as unknown as typeof f.matrix;
  return f;
}

/** Leuchteffekte (Bloom): Menü bzw. `?bloom=0`; Standard an. */
export function bloomEnabled(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('bloom');
    if (q !== null) return q !== '0';
    return localStorage.getItem('letzteschicht.bloom') !== '0';
  } catch {
    return true;
  }
}

export function setBloomEnabled(on: boolean): void {
  try {
    localStorage.setItem('letzteschicht.bloom', on ? '1' : '0');
  } catch { /* privat */ }
}

/** Farbabstimmung an (Standard) oder aus (`?look=0`, zum Vergleichen). */
export function lookEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).get('look') !== '0';
  } catch {
    return true;
  }
}

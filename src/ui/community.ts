import { CONSUMABLES } from '../data/survival';
import { COMMUNITY, JOB_ORDER, JOBS } from '../data/scavenge';
import type { World } from '../sim/world';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * Fenster „Gemeinschaft“ (Taste K): Bewohner mit früherem Beruf, Leben, Tätigkeit und Aufgabe (Knöpfe; ★ = gelernt),
 * dazu der Vorrat (Essen für wie viele Tage, Magazine, Verbände) und wie viele Überlebende noch draußen warten.
 */
export class CommunityView {
  readonly root: HTMLDivElement;
  private key = '';

  constructor(private readonly icon: (name: string, cls?: string) => HTMLElement, private readonly onClose: () => void) {
    this.root = el('div', 'community-body');
  }

  render(w: World, force = false): void {
    const c = w.community;
    const res = c.residents;
    const food = c.supply(w, (it) => (CONSUMABLES[it]?.hunger ?? 0) > 0);
    const mags = c.supply(w, (it) => it === 'firearm-magazine' || it === 'piercing-rounds-magazine');
    const med = c.supply(w, (it) => it === 'bandage' || it === 'first-aid-kit' || it === 'antibiotics');
    const key = JSON.stringify([res.map((k) => [k.id, k.job, Math.ceil(k.hp), c.doing(k), k.hunger]), food, mags, med, c.survivors.length, !!w.base]);
    if (!force && key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    const head = el('div', 'win-head', this.root);
    head.textContent = `Gemeinschaft – ${res.length} ${res.length === 1 ? 'Bewohner' : 'Bewohner'}`;
    const close = el('button', 'close', head);
    close.textContent = '×';
    close.onclick = () => this.onClose();
    const body = el('div', 'win-body', this.root);
    const sum = el('div', 'comm-sum', body);
    const days = res.length ? Math.floor(food / res.length) : 0;
    sum.innerHTML = `<span>Essen: <b>${food}</b>${res.length ? ` (reicht ${days} ${days === 1 ? 'Tag' : 'Tage'})` : ''}</span>`
      + `<span>Magazine: <b>${mags}</b></span><span>Verbandszeug: <b>${med}</b></span>`;
    if (!w.base) el('p', 'dim', body).textContent = 'Ohne Lagerfeuer gibt es keine Basis – Bewohner brauchen ein Feuer als Mitte.';
    else if (!c.depot(w)) el('p', 'dim', body).textContent = `Tipp: Ein Vorratslager (Forschung „Vorratslager“) sammelt die Ausbeute. Bis dahin legen die Bewohner sie in Kisten im Umkreis von ${COMMUNITY.baseRadius} Feldern um das Feuer.`;
    if (!res.length) {
      el('p', '', body).textContent = 'Noch niemand. In Dörfern und Städten warten Überlebende (blaue Punkte auf der Karte) – geh hin, sie folgen dir zum Lagerfeuer und schließen sich an.';
    }
    for (const k of res) {
      const row = el('div', 'comm-row', body);
      const who = el('div', 'comm-who', row);
      el('b', '', who).textContent = k.name;
      el('span', 'dim', who).textContent = ` · früher: ${JOBS[k.skill].past}`;
      const hp = el('div', 'comm-hp', who);
      const bar = el('div', '', hp);
      bar.style.width = `${Math.max(0, (k.hp / COMMUNITY.health) * 100)}%`;
      el('div', 'comm-doing dim', who).textContent = c.doing(k) + (k.hunger ? ` · hungrig (${k.hunger} ${k.hunger === 1 ? 'Tag' : 'Tage'})` : '');
      const jobs = el('div', 'comm-jobs', row);
      for (const j of JOB_ORDER) {
        const b = el('button', `comm-job${k.job === j ? ' active' : ''}`, jobs);
        b.appendChild(this.icon(`item.${JOBS[j].icon}`));
        el('span', '', b).textContent = JOBS[j].name + (k.skill === j ? ' ★' : '');
        b.title = `${JOBS[j].name}: ${JOBS[j].hint}${k.skill === j ? ' – gelernt: arbeitet besser' : ''}`;
        b.onclick = () => {
          c.assign(k, j);
          this.render(w, true);
        };
      }
    }
    const out = c.survivors.filter((k) => k.state === 'wait').length;
    if (out) el('p', 'dim', body).textContent = `${out} bekannte Überlebende warten noch auf Hilfe (blau auf der Karte).`;
    el('p', 'dim', body).textContent = 'Morgens isst jeder Bewohner ein Essen aus dem Vorrat. Hungrige arbeiten langsamer und gehen nach drei Tagen. ★ = früherer Beruf: diese Aufgabe gelingt besser.';
  }
}

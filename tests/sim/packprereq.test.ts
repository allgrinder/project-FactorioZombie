import { describe, expect, it } from 'vitest';
import { TECHS, TECH_BY_ID } from '../../src/data/tech';

describe('Forschung: Pakete brauchen ihre Freischalt-Forschung (wie im Original)', () => {
  it('Jede Forschung hat die Forschung ihrer Wissenschaftspakete unter den Vorgängern', () => {
    const packTech = new Map<string, string>();
    for (const t of TECHS) for (const u of t.unlocks) if (u.endsWith('-science-pack') && !packTech.has(u)) packTech.set(u, t.id);
    const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
      for (const p of TECH_BY_ID[id].prerequisites) if (!seen.has(p)) {
        seen.add(p);
        ancestors(p, seen);
      }
      return seen;
    };
    for (const t of TECHS) {
      const anc = ancestors(t.id);
      for (const pk of t.packs) {
        const pt = packTech.get(pk)!;
        if (pt !== t.id) expect(anc.has(pt), `${t.id} braucht ${pt}`).toBe(true);
      }
    }
    // schwarzes Paket: Stufe 3 von Projektilschaden und Feuerrate verlangt Militär-Wissenschaft
    expect(TECH_BY_ID['physical-projectile-damage-3'].prerequisites).toContain('military-science-pack');
    expect(TECH_BY_ID['weapon-shooting-speed-3'].prerequisites).toContain('military-science-pack');
    expect(TECH_BY_ID['physical-projectile-damage-4'].prerequisites).not.toContain('military-science-pack');
  });
});

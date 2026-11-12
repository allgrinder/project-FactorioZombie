# Letzte Schicht – Projektregeln

Zombie-Überlebensspiel im Browser auf Grundlage des Fabrikspiels „Eisenwerk“ (`allgrinder/Webgame`, Remote `upstream`).
Schlanke Produktion, Schwerpunkt Überleben und Verteidigung. Konzept und Werte: `docs/KONZEPT.md`.
Namen der Vorbilder nie im Spiel verwenden.

## Regeln
- Vite, TypeScript strict, PixiJS 8, Vitest, Playwright. Kein Backend, kein React; HUD als DOM-Overlay (`src/ui/`).
- `src/sim/` kennt weder DOM noch PixiJS, läuft headless, deterministisch, 60 Ticks/s, ganzzahlige Bandlogik.
  Speichern/Laden muss den Lauf exakt fortsetzen (Eigenschaftstest in `tests/sim/properties.test.ts`).
- Alle Zahlenwerte in `src/data/`. Werte des Vorgängers haben ihre Quelle in `docs/GAME_DATA.md`; neue Werte
  (Zombies, Lärm, Überleben, Beute, Trümmerfelder) sind eigene Festlegungen und stehen in `docs/KONZEPT.md`.
- Produktion bewusst flach halten: keine neuen Fabrikstufen. Neue Tiefe gehört ins Überleben und in die Verteidigung.
- Bänder: Transportlinien mit Abständen (`src/sim/belts.ts`), nie Items einzeln pro Tick bewegen.
- Grafik nur aus Blender-Skripten (`assets/blender/`), keine fremden Grafiken/Icons/Sounds.
  Ergebnis: PNG-Arbeitsatlanten in `assets/atlas/` und daraus WebP in `public/assets/{hd,sd}`, Liste in `manifest.json`.
  Neue Modelle in eigenen Bibliotheken anlegen; bestehende Bibliotheken nur ändern, wenn nötig (jede Änderung lässt
  alle abhängigen Modelle neu rendern). Einzelne Modelle: `npm run assets -- --only <modell>`.
- Stil „Endzeit“: verwittert, gedeckt, Notbau (`docs/ART_STYLE.md`). Natur über die Gartenwerk-Generatoren.
- Meilenstein fertig erst, wenn `npm run build`, `npm test` und `npm run e2e` durchlaufen.
- Erweiterbarkeit: neue Gebäude/Rezepte nur über `src/data/` + `kind`-Verhalten in `src/sim/entities/`.

## Konventionen
- Richtungen 0=N,1=E,2=S,3=W; y wächst nach Süden. Gebäude-`dir` = Ausgaberichtung (Greifarm: Ablagerichtung).
- Bandspur 0 = links, 1 = rechts in Laufrichtung. Positionen 256 pro Feld.
- Spielstand: `src/sim/serialize.ts` (JSON), IndexedDB „letzteschicht“ in `src/game/save.ts`.
- Szenen über `?scene=freeplay|demo|sandbox|stress`; Gottmodus (Testhilfe, unsichtbar für Zombies) über `?god`.
- Karteneinstellungen (`MapSettings`): `LEGACY_MAP_SETTINGS` (Tests, Demo) hat keine Zombies, Bedürfnisse, Fundorte
  und reine Rohstofffelder; `DEFAULT_MAP_SETTINGS` schaltet alles ein.
- Item-IDs des Vorgängers bleiben (z. B. `iron-ore` heißt im Spiel „Eisenschrott“, `burner-mining-drill` „Schrottgreifer“).

## Stand Letzte Schicht
- Zombies (`src/sim/enemies.ts`, Werte `src/data/enemies.ts`): Schlurfer, Läufer, Brocken, Schreier; Zustände ruhen /
  nachsehen / verfolgen / Horde; Flussfeld-Wegsuche; Besiedlung je Zelle; Horden in der Dämmerung.
- Lärm (`src/sim/noise.ts`) statt Verschmutzung; Lockvogel als Wurfgegenstand (`src/sim/capsules.ts`).
- Überleben (`src/data/survival.ts`, `src/sim/player.ts`): Hunger, Durst, Müdigkeit/Schlaf, Blutung, Infektion, Tod.
- Nahkampf mit Haltbarkeit, Schusswaffen laut (X wechselt), Stacheldraht/Nagelfalle (Wirkung in `EnemySystem.move`).
- Fundorte (`src/sim/sites.ts`, Beute `src/data/loot.ts`, Gebäude `src/sim/entities/survival.ts`).
- Trümmerfelder (`RUBBLE` in `src/data/mapgen.ts`, `GameMap.rubbleAt`), Förderer je Material (`DrillDef.mines`).
- Neue Gebäude: Holzbarrikade, Tor, Stacheldraht, Nagelfalle, Feldbett, Gemüsebeet, Regentonne, Funkturm, Schuttbrecher.
- Rezepte/Forschung zusammengestrichen (`KEPT` in `src/data/recipes.ts`, `RAW_TECHS` in `src/data/tech.ts`).
  Der Code gestrichener Systeme (Züge, Roboter, Schaltungsnetz, Kernkraft, Öl, Module, Rakete) liegt noch im Projekt,
  ist im Spiel nicht erreichbar und soll entfernt werden.
- Modelle: `lib/zombie.py`, `ruinen.py`, `lager.py`, `kram.py`, `truemmer.py`; `models/zombies.py`, `ruinen.py`, `lager.py`.
- Tests: `zombies.test.ts`, `survival.test.ts`, `rubble.test.ts`.

## Stand des Vorgängers (Eisenwerk)
- M1 Bänder: fertig.
- M2 Blender-Pipeline: fertig (9 Modelle, 154 Sprites; Boden als periodische 8×8-Fläche).
- M3 Produktionskette: fertig (`?scene=demo`, Tests für Bohrer/Ofen/Greifarm/Kette/Speichern).
- M4 Spielbare Runde: fertig (Freeplay-Start, Handabbau, Inventar, Handwerk mit Zwischenprodukten,
  Gebäudefenster, Speichern/Laden in IndexedDB, Playwright-Ablauftest).
- Natürlicher Boden: Steppenwiese (periodisch 16×16), Decals (Erd-/Kiesflecken, Kiesel, Blüten, Grasbüschel),
  Flora (Sträucher, Findlinge, Bäume mit Schattenebene) per Seed in `src/render/decor.ts`, Parameter in `src/data/decor.ts`.
- Wasser (Seen/Teiche) in `src/sim/map.ts`, Darstellung nach Ecken-Prinzip (`water.<Fall>.<Variante>`).
- Sprites mit 128 px pro Feld (Atlas-Auflösung 2), Spielwelt weiter 64 Einheiten pro Feld.
- Phase B Komfort: fertig (Eisenkiste, Bodenitems, Rückgängig, gerade Linie, Autosave/Export/Import).
- Phase C fertig: Kupfer/Ziegel/Kabel/Schaltkreis; Flüssigkeiten (`src/sim/fluids.ts`, Netze wie Rohrsegmente) und
  Strom (`src/sim/power.ts`, Puffer je Verbraucher); Montagemaschine und Labor (`src/sim/entities/production.ts`),
  Forschung (`src/sim/research.ts`, Daten `src/data/tech.ts`, gesperrte Rezepte); Logistik: schnelles Band
  (Geschwindigkeit je Linie), Untergrundband (Teil der Transportlinie), Splitter (`src/sim/entities/logistics.ts`).
- Gebäudeklassen in `src/sim/entities/` (Registry `registry.ts`); Modelle der neuen Anlagen in `assets/blender/lib/anlagen.py`.
- Blender: bpy-Modul 5.2 in `.venv-blender` (mit OIDN-Denoiser, halbe Samples); `EISEN_PREVIEW=1` für schnelle Probeläufe.
- Phase A: Effekte (`src/render/effects.ts`, `src/data/fx.ts`), Figur 8 Richtungen (`models/player.py`), Nadelbäume/Felsgruppen
  (`models/landscape.py`, nutzt die Blender-Add-ons Sapling und Rock Generator aus /usr/share/blender als Werkzeug),
  Tooltips/Minimap (`src/ui/tooltip.ts`, `src/ui/minimap.ts`).
- Karte: Feuchte-Feld (`GameMap.moistureAt`), Seen (verzerrtes fbm), Flüsse mit Furten, Startsee; Landschaftsräume
  in der Darstellung (`src/render/biome.ts`: Bodenfarbe, Deko-Gewichtung `fertility`). Wolkenschatten `src/render/clouds.ts`.
- Freies Spiel: zufälliger Seed je neuer Runde, Startdialog „Weiterspielen“, Autosave alle 5 min und beim Verlassen der Seite.
- Asset-Pipeline rendert ein Modell nur neu, wenn sein Skript oder eine importierte Bibliothek sich ändert (`npm run assets -- --deps`).
- Phase E (Wiki-Abgleich): Korrekturen (Kessel 1:10, Greifarm-Takt/Energie, Füllgrenzen, Splitter-Vorrang/Filter,
  Auslöser-Forschung), fällbare Bäume/Holz, frühe Phase (Stahl, Masten, Lampe, Montage 2, Motor, Pumpe, Tank,
  Rohr unterirdisch, Landaufschüttung), Tag/Nacht (`DAY` in `src/data/time.ts`, Nachtebene `src/render/night.ts`).
  Tests: `tests/sim/wiki.test.ts`, `trees.test.ts`, `early.test.ts`. Gegner bewusst zurückgestellt.
- Blöcke 1–4 (Wunsch „1 bis 4 umsetzen“): Öl/Chemie (`entities/fluidplus.ts`, Modelle `models/oil.py`), Solar/Akku
  (Stromvorrang in `src/sim/power.ts`), Statistik (`src/sim/stats.ts`, `src/ui/stats.ts`), Forschungswarteschlange,
  Blaupausen/Geister (`src/sim/blueprint.ts`), Module/Leuchtfeuer (`src/sim/modules.ts`, `src/data/modules.ts`),
  Roboter (`src/sim/robots.ts`, `src/data/robots.ts`), Schaltungsnetz (`src/sim/circuit.ts`, Taste G),
  Züge (`src/sim/rails.ts`, `src/sim/trains.ts`, Gleise auf 2er-Raster, R wechselt Gleisform), Raketensilo
  (`entities/rocket.ts`). Vereinfachungen in `docs/WIKI_ABGLEICH.md` Abschnitt 4. Modelle: `lib/spaet.py`, `lib/bahn.py`.
- Gegner (Phase H): Verschmutzung `src/sim/pollution.ts`, Nester/Krabbler/Angriffe `src/sim/enemies.ts`, Türme/Mauern
  `src/sim/entities/military.ts`, Werte `src/data/enemies.ts`, Modelle `lib/kampf.py`/`models/gegner.py`; Karteneinstellungen
  (Rohstoffe, Gegner) in `src/data/mapgen.ts` und im Spielstand. Leertaste schießt, Reparaturset per Linksklick halten.
- Stil „Endzeit-Industrie“ in drei Ausbaustufen (Notbau → Werkstatt → Hochtechnik): `docs/ART_STYLE.md`, Baukasten
  `assets/blender/lib/kit.py`; Pilot Montagemaschinen 1–3 (`lib/stufen.py`, `models/montage.py`). Neue/überarbeitete
  Modelle folgen der Stilbibel.
- Phase I: Geräusche `src/audio/sound.ts` (ZzFX, Ereignisse `src/sim/events.ts`), Spielstände gzip (`src/game/packing.ts`),
  Bloom (pixi-filters, Menü/`?bloom=0`), Partikel-Ausbrüche (`render/effects.ts`), Flussfeld-Wegsuche (`src/sim/flowfield.ts`),
  Eigenschafts-Tests (fast-check). Wiki ist direkt erreichbar (Umgebung „Webgame“).
- Phase J: Kleinteile neu (`lib/kleinteile.py`), Klippen (`GameMap.isCliff`, `models/cliffs.py`), Wurfgegenstände
  (`src/sim/capsules.ts`), Bodenbeläge (`src/data/floors.ts`, `GameMap.floorAt`, `models/floors.py`), bewegtes Wasser
  (Reflexe und Uferschaum in `models/water.py`). Klippen nur in neuen Karten (Einstellung `cliffs`).
- Phase K: Forschungs-Boni/unendliche Forschung, Massen-/Filtergreifarm, Fässer, Leiche, Band im Schaltungsnetz,
  Kernkraft (`src/sim/heat.ts`, `entities/nuclear.ts`, Modelle `lib/kernkraft.py`), diagonale Gleise (`src/sim/rails.ts`,
  Tab wechselt Gleisform), Nachtlicht mit Normal-Maps (`src/render/night.ts`; Blender schreibt `<name>.nrm`),
  Hitzeflimmern (`src/render/haze.ts`), Bau-Animationen (`src/render/life.ts`).
- Handbuch (Taste J): Rezepte, Verwendung, Verhältnis-Rechner und Faustregeln (`src/sim/ratio.ts`, `src/ui/handbook.ts`).
- Phase L: Radar/Kartenaufdeckung (`src/sim/chart.ts`), Rohstoff-Häufigkeit, Community-Blaupausen (`src/sim/foreignbp.ts`),
  Rüstung und persönlicher Roboterhangar (`src/data/armor.ts`, `src/sim/armor.ts`, Roboter in `src/sim/robots.ts`).
- Weiterer Plan: `docs/ROADMAP.md` (Grafik zuerst, dann Komfort, dann neue Systeme).
- Offene Messvorschläge siehe `docs/GAME_DATA.md` (Füllgrenzen Greifarm, Spurzuordnung Seiteneinspeisen).

## Prüfen
- `npm run build && npm test && npm run e2e`
- Nach Grafikänderungen: `npm run assets && npm run assets:preview`, dann `assets/preview/*.png` ansehen.

# Letzte Schicht – Konzept

Leitlinie (Wunsch 11.11.2026): **das Beste aus dem Fabrikspiel und das Beste aus einem Zombie-Überlebensspiel.**
Die Produktion bleibt flach; die Spieltiefe liegt im Überleben und in der Verteidigung.

## Was vom Vorgänger bleibt – und was nicht

| Bleibt (schlank) | Gestrichen |
|---|---|
| Handabbau, Förderer, Stein-/Stahlofen | Öl, Chemie, Kunststoff, Schwefel, Batterien |
| gelbes Band, Untergrundband, Splitter | schnelle und Express-Bänder |
| Greifarme (Brennstoff, normal, lang, schnell) | Massengreifarm, Kapazitätsforschung |
| eine Montagemaschine, Labor | Montagemaschine 2/3, Module, Leuchtfeuer |
| Dampfkraft, Masten, Lampe, Solar, Akku | Kernkraft, Umspannwerk, großer Mast |
| Radar, Kisten, Steinpflaster, Landaufschüttung | Roboter, Logistikkisten, Schaltungsnetz |
| drei Wissenschaftspakete (Werkstatt, Technik, Wehr) | Züge, Raketensilo, weitere Pakete |

Der Code der gestrichenen Systeme liegt noch im Projekt (nicht erreichbar, ohne Tests) und wird in einem eigenen
Aufräumschritt entfernt – siehe „Offen“.

## Zombies (`src/data/enemies.ts`, `src/sim/enemies.ts`)

| Art | Leben | Tempo | Besonderheit | ab Tag |
|---|---|---|---|---|
| Schlurfer | 36 | 0,045 | häufig, langsam | 1 |
| Läufer | 24 | 0,125 | fast so schnell wie die Figur (0,15) | 3 |
| Schreier | 48 | 0,06 | Schrei lockt Zombies aus 45 Feldern | 4 |
| Brocken | 450 | 0,055 | gepanzert, reißt Mauern ein (45 je Schlag) | 6 |

- **Zustände:** ruht (streift um einen Heimatpunkt), geht einem Geräusch nach, verfolgt die Figur, zieht als Horde.
- **Sicht:** 11 Felder am Tag, 7 in der Nacht. Außer Sicht verliert er nach 4 s die Spur.
- **Wegsuche:** Flussfelder um das Ziel; Mauern kosten einen Umweg von 8 Feldern, sonst werden sie eingerissen.
  Fundorte der alten Welt (Häuser, Wracks) greifen Zombies nie an.
- **Besiedlung:** je 32×32-Zelle, dichter mit der Entfernung vom Start und rund um Fundorte; 45 Felder um den Start frei.
- **Horden:** ab Tag 2 bei Einbruch der Dämmerung, Größe 5 + 2,5 je Tag, jede 7. Nacht × 2,5.

## Lärm (`src/sim/noise.ts`)

Ersetzt die Verschmutzung des Vorgängers. Hörradius in Feldern: Pistole 30, MP 34, MG-Turm 36, Granate 55,
Schrottgreifer/Schuttbrecher 20, Sortieranlage 15, Dampfmaschine 24, Montagemaschine 11, Kessel 9, Öfen 5–6,
Funkturm 70; Nahkampf 5, Fällen 10. Mehrere Maschinen im selben 8×8-Block sind lauter (+18 % je Verdopplung).
Solarpanel, Akku, Bänder und Greifarme sind still.

## Überleben (`src/data/survival.ts`)

Ein Tag dauert 10 Minuten. Hunger reicht 2,6 Tage, Durst 1,6, Wachsein 1,9. Ab 75 % Müdigkeit ist die Figur
langsamer. Heilung nur satt, nicht durstig und ohne Blutung. Zombietreffer reißen mit 25 % eine Wunde
(0,35 Leben/s bis zum Verband) und infizieren mit 4 % (tödlich nach 1,5 Tagen, nur Antibiotika heilen).
Tod: endgültig (Standard) oder Wiedereinstieg am Lager.

## Trümmerfelder (`RUBBLE` in `src/data/mapgen.ts`)

Wunsch 12.11.2026: Rohstoffe sollen wie Trümmer aussehen; jedes Feld kann alles enthalten, ist aber in einem
Material ergiebiger; Förderer gibt es je Material.

| Feldart | Eisenschrott | Kupferschrott | Bauschutt | Kohle |
|---|---|---|---|---|
| Schrottplatz | 66 % | 14 % | 15 % | 5 % |
| Kabel- und Elektroschrott | 24 % | 60 % | 16 % | – |
| Bauschutt | 20 % | 7 % | 64 % | 9 % |
| Kohlehalde | 8 % | – | 20 % | 72 % |

Schrottgreifer: Eisen- und Kupferschrott. Schuttbrecher: Bauschutt und Kohle. Sortieranlage (elektrisch, Forschung):
alles. Material liegt in Nestern von etwa 2×2 Feldern.

## Fundorte (`src/sim/sites.ts`, `src/data/loot.ts`)

Dorf (Straße, Häuser, Laden, Werkstatt, Wracks), Hof, Werkstatt mit Wracks, Lager mit Militärkiste, einzelnes Wrack;
dazu ein Startfundort in Sichtweite. Durchsuchen dauert 1–6 s; Ausschlachten liefert Eisenschrott, Holz, Ziegel,
Zahnräder (mit Brecheisen doppelt so schnell). Seltene Beute (Waffen, Antibiotika, Funkteile) wird mit der
Entfernung vom Start wahrscheinlicher.

## Offen

- **Aufräumen:** Code gestrichener Systeme entfernen (Züge, Roboter, Schaltungsnetz, Kernkraft, Öl, Module, Rakete).
- **Schuttbrecher** nutzt vorerst das Bild des Schrottgreifers (getönt); eigenes Modell fehlt.
- **Feinschliff Kampf:** Angriffsanimation der Figur, Zombies ohne Überlappen, Sichtlinie (Mauern verdecken).
- **Später:** Häuser betreten, Kochen, Fahrzeuge, Fähigkeiten, Scheinwerfer, Flammenwerfer-Turm.
- **Balance** der Horden, Beute und Bedürfnisse nach den ersten gespielten Runden.

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
| Schlurfer | 36 | 0,045 | häufig, langsam; 7 Schaden je 1,2 s | 1 |
| Läufer | 24 | 0,125 | fast so schnell wie die Figur (0,15) | 3 |
| Schreier | 48 | 0,06 | Schrei lockt Zombies aus 45 Feldern | 4 |
| Brocken | 450 | 0,055 | gepanzert, reißt Mauern ein (45 je Schlag) | 6 |

- **Zustände:** ruht (streift um einen Heimatpunkt), geht einem Geräusch nach, verfolgt die Figur, zieht als Horde.
- **Sicht:** 11 Felder am Tag, 7 in der Nacht. Außer Sicht verliert er nach 4 s die Spur.
- **Wegsuche:** Flussfelder um das Ziel; Mauern kosten einen Umweg von 8 Feldern, sonst werden sie eingerissen.
  Fundorte der alten Welt (Häuser, Wracks) greifen Zombies nie an.
- **Besiedlung:** je 32×32-Zelle, dichter mit der Entfernung vom Start und rund um Fundorte; 45 Felder um den Start frei.
- **Horden:** ab Tag 2 bei Einbruch der Dämmerung, Größe 4 + 2,5 je Tag, jede 7. Nacht × 2,5. Probelauf ohne Spieler-
  eingriff: hinter Barrikaden mit einem MG-Turm (40 Magazine) übersteht die Figur vier Nächte; ohne Turm überrennt
  schon die erste Horde eine reglos stehende Figur – man muss also kämpfen, zurückweichen oder schießen.

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

## Plündern statt Bergbau (Wunsch 17.11.2026: „Minen klappen so nicht“)

Es gibt keine Rohstofffelder und keine Förderer mehr. Material kommt aus drei Quellen:

1. **Schrotthaufen** (`src/data/scavenge.ts`): von Hand Stück für Stück ausschlachten (rechte Maustaste halten),
   mit Brecheisen doppelt so schnell. Jeder Zug ist etwas laut.

   | Haufen | Ausbeute (gewichtet) | Menge |
   |---|---|---|
   | Schrotthaufen | Eisenschrott 55, Kupferschrott 14, Eisenstangen 10, Zahnräder 8, Kabel 7, Rohre 4, Stahl 2 | 50–90 |
   | Schutthaufen | Bauschutt 64, Ziegel 14, Eisenschrott 12, Holz 10 | 50–90 |
   | Kohlenhaufen | Kohle 88, Bauschutt 12 | 60–110 |
   | Holzstapel | Holz 90, Eisenstangen 10 | 30–50 |
   | Autoteile | Eisen 34, Kupfer 18, Zahnräder 16, Kabel 14, Rohre 10, Schaltkreise 5, Stahl 3 | 35–65 |
   | Elektroschrott | Kupfer 42, Kabel 24, Eisen 18, Schaltkreise 12, Funkteile 1 | 35–65 |

   Lage: fünf Haufen am Startfundort, Holz und Kohle bzw. Schutt an jedem Hof, Schutt hinter Häusern und Autoteile an
   Werkstätten in den Orten, vereinzelt am Wegesrand – und auf eingezäunten **Schrottplätzen** (acht Haufen zwischen
   Wracks): zwei nahe am Start, je einer bei jedem Ort.
2. **Fundorte** (Häuser, Läden, Wracks, Kisten) durchsuchen und ausschlachten.
3. **Sammeltrupps** (wie die Erntefahrzeuge eines Echtzeit-Strategiespiels, `src/sim/scavengers.ts`): Die
   **Sammelstelle** (Forschung „Sammeltrupps“) stellt je **Sammler-Ausrüstung** (bis 3) einen Sammler. Er sucht den
   nächsten Haufen im Umkreis von 80 Feldern, an dem kein Zombie steht, läuft hin (um Mauern herum, durch Tore),
   sammelt 20 Stück und bringt sie ins Lager der Sammelstelle; Greifarme entnehmen sie. Jeder Gang kostet ein Stück
   Verpflegung. Zombies sehen und jagen Sammler; kommt einer näher als 8 Felder, flieht der Sammler heim (und zieht die
   Zombies womöglich hinter sich her). Stirbt er, liegt seine Last am Boden und die Ausrüstung ist verloren.

## Basis (eigene Ideen)

- **Lagerfeuer** (Startausrüstung): das älteste ist die Mitte der Basis – Neustartpunkt einer neuen Figur, Ziel der
  Horden, Schlaf daneben so erholsam wie im Feldbett. Brennt ab der Dämmerung mit Holz oder Kohle und leuchtet.
- **Licht:** Nachts schrumpft die Reichweite der Türme um bis zu 40 %, außer sie stehen im Licht eines Feuers, einer
  Lampe, einer **Feuerschale** (ohne Strom) oder eines **Scheinwerfers** (16 Felder).
- **Wachturm:** Holzgerüst mit Schützen; Reichweite 24, 1,3 Schuss/s, 2,6-facher Munitionsschaden, etwas leiser als
  der MG-Turm.
- **Versorgungsabwürfe** (`src/sim/drops.ts`): ab Tag 2 etwa alle 12 Minuten landet eine Kiste am Fallschirm 60–150
  Felder von der Basis (Richtung und Entfernung werden gemeldet, Karte blinkt). Inhalt: Munition, Medizin,
  Verpflegung, selten Sammler-Ausrüstung, Rucksack oder Maschinenpistole. Die Landung ist sehr laut.
- **Ziele** (`src/sim/goals.ts`): zwölf Etappen von „Lagerfeuer entzünden“ bis „Die Rettung rufen“, links oben.
- **Rucksack** (Beute oder Handwerk): +20 Inventarplätze; Grundinventar 50 Plätze, damit Ausflüge sich lohnen und man
  zurückkehren muss.

## Besondere Orte

Am Ortsrand stehen **Polizeiwache** (Munition, Pistole, selten Maschinenpistole und Schutzweste, Granaten),
**Arztpraxis** (Verbände, Verbandskästen, Antibiotika) und **Tankstelle** (Knabberzeug, Limonade, Konserven, Kohle,
Reparatursets): Aschbach und Moorbrück eine Tankstelle, Dornfeld eine Arztpraxis, Eisenrode Polizei und Tankstelle,
Grauenfurt Polizei und Arztpraxis. Dort lungern mehr Zombies als an gewöhnlichen Häusern.

## Überlebende (eigene Idee)

In jedem Dorf wartet ein Überlebender, in jeder Stadt zwei, einer am Militärposten (blau auf der Karte). Solange er
wartet, ist er verbarrikadiert und sicher. Geht man zu ihm, folgt er der Figur – jetzt sehen und jagen ihn Zombies.
Erreicht er das Lagerfeuer, wird er Sammler: eine Sammler-Ausrüstung landet in der Sammelstelle (sonst im Inventar).
Bleibt er mehr als 40 Felder zurück, wartet er wieder.

## Pritschenwagen (eigene Idee, `src/sim/cars.ts`, Werte `src/data/vehicles.ts`)

Am Startfundort steht ein defekter Pritschenwagen. Reparatur per Linksklick: 20 Eisenplatten, 8 Zahnräder, 10 Kabel.
Tank: Benzinkanister (25 MJ; Tankstellen, Autowracks, Werkstätten, Abwürfe), Motor 60 kW bei Vollgas, Leerlauf ein
Zehntel. Asphalt 0,42 Felder/Tick, Gelände 0,26, rückwärts 0,08. W/S Gas/Bremse, A/D lenken, V ein- und aussteigen,
Klick auf den Wagen öffnet Tank und Ladefläche (30 Plätze). Insassen nehmen 30 % Schaden, ohne Wunden/Infektion.
Zombies werden überfahren (60 Schaden bei Höchsttempo), Hindernisse beschädigen ihn ab 0,15 Felder/Tick.
Der Motor ist laut (Lärm 26 alle 30 Ticks). 600 Lebenspunkte; zerstört fällt die Ladung heraus.

## Nacht

Zombies laufen nachts bis zu 25 % schneller und sehen kürzer (7 statt 11 Felder); Türme ohne Licht schießen kürzer.

## Ortsbild

Ortsstraßen haben Gehwege und eine gestrichelte Mittellinie, Ortsschilder an den Enden und Laternen; Landstraßen
verlaufen gerade mit rechtwinkligen Kurven, Mittellinie, Holzmasten und liegengebliebenen Autos; Höfe einen eingezäunten Acker mit Heuballen; Schrottplätze einen Maschendrahtzaun mit Einfahrt.
Requisiten (`kind: 'prop'`) blockieren, werden aber von Zombies nicht angegriffen.

## Fundorte (`src/sim/sites.ts`, `src/data/loot.ts`)

Dorf (Straße, Häuser, Laden, Werkstatt, Wracks), Hof, Werkstatt mit Wracks, Lager mit Militärkiste, einzelnes Wrack;
dazu ein Startfundort in Sichtweite. Durchsuchen dauert 1–6 s; Ausschlachten liefert Eisenschrott, Holz, Ziegel,
Zahnräder (mit Brecheisen doppelt so schnell). Seltene Beute (Waffen, Antibiotika, Funkteile) wird mit der
Entfernung vom Start wahrscheinlicher.

## Feste Welt (`src/data/world.ts`, `src/sim/sites.ts`)

Wunsch 12.11.2026: eine persistente, lebensechte Welt statt Zufallskarten. Das freie Spiel ist immer derselbe
„Kreis Aschland“ (fester Karten-Seed 326, gewählt, weil Orte und Straßen dort fast ganz auf Land liegen):

| Ort | Größe | Lage vom Start | Besonderheit |
|---|---|---|---|
| Aschbach | Weiler | 105 Felder Nordost | erster Ort hinter der Waldhütte, Straßenkreuzung |
| Dornfeld | Dorf | 205 West | Bauerndorf |
| Moorbrück | Dorf | 270 Südost | am Fluss |
| Eisenrode | Stadt | 410 Ost | Industrie: Werkstätten, Wracks |
| Grauenfurt | Stadt | 360 Nord | Kreisstadt, viele Läden, die meisten Zombies |
| Kaltenhain | Dorf | 450 West | abgelegen |
| Posten 7 | Militärposten | 505 Südost | Militärkisten, stark bewacht |

- **Landstraßen** verbinden die Orte (zwei Felder Asphalt, über Flüsse als Damm); alle 85 Felder liegt ein Hof daneben.
- **Orte** haben eine Hauptstraße (Ortskern: Läden, Werkstätten) und Querstraßen (Wohnhäuser, Schuppen; in
  Eisenrode Werkstätten). Wasser und Klippen unter Straßen und Gebäuden werden eingeebnet.
- **Wildnis:** nur noch vereinzelt Wracks und verlassene Lager.
- Die Karte (M) zeigt Straßen und Ortsnamen von Anfang an, wie eine Straßenkarte.
- **Die Welt überdauert den Tod:** Nach dem endgültigen Tod kommt eine neue Figur mit Startausrüstung in dieselbe
  Welt (`World.newCharacter`). Lager, geplünderte Häuser, Tageszähler und die Leiche mit dem Inventar bleiben; die alte
  Figur steht als Zombie wieder auf. „Neue Welt“ im Menü setzt alles zurück.
- Zufallskarten gibt es weiter über `MapSettings.plan = false` (Tests) bzw. anderes Gelände über `?seed=`.

## Offen

- **Aufräumen:** Code gestrichener Systeme entfernen (Züge, Roboter, Schaltungsnetz, Kernkraft, Öl, Module, Rakete).
- **Feinschliff Kampf:** Angriffsanimation der Figur, Zombies ohne Überlappen, Sichtlinie (Mauern verdecken).
- **Welt:** Felder und Zäune um Höfe, Ortsschilder, Brücken als eigenes Bauwerk, Bahnhof/Tankstelle als besondere Orte.
- **Später:** Häuser betreten, Kochen, Fahrzeuge, Fähigkeiten, Scheinwerfer, Flammenwerfer-Turm.
- **Balance** der Horden, Beute und Bedürfnisse nach den ersten gespielten Runden.

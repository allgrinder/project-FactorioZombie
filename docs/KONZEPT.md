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
3. **Sammler der Gemeinschaft** (`src/sim/community.ts`): Bewohner mit der Aufgabe „Sammeln“ suchen selbstständig
   den nächsten Haufen im Umkreis (80 Felder um das Vorratslager, ohne Lager 60 um das Feuer), an dem kein Zombie
   steht, laufen hin (um Mauern herum, durch Tore), sammeln 20 Stück und bringen sie ins Vorratslager (sonst in Kisten
   am Feuer). Zombies jagen Sammler; kommt einer näher als 8 Felder, flieht der Sammler heim. Stirbt er, liegt seine
   Last am Boden.

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

## Gemeinschaft (Wunsch 18.11.2026, `src/sim/community.ts`, Werte `src/data/scavenge.ts`)

Am Startschuppen wartet der erste Überlebende, in jedem Dorf einer, in jeder Stadt zwei, einer am Militärposten (blau
auf der Karte). Solange er wartet, ist er verbarrikadiert und sicher. Geht man zu ihm, folgt er der Figur – jetzt
jagen ihn Zombies. Bleibt er mehr als 40 Felder zurück, wartet er wieder. Erreicht er das Lagerfeuer, wird er
**Bewohner** mit Namen, früherem Beruf und einer **Aufgabe** (Fenster „Gemeinschaft“, Taste K):

| Aufgabe | Wirkung |
|---|---|
| Sammeln | wie oben (Sammler) |
| Wache | Posten im Ring (5 Felder) ums Feuer; Reichweite 13 (nachts ohne Licht kürzer wie Türme), 9 Schaden je 40 Ticks, 10 Schuss je Magazin aus dem Vorrat (panzerbrechend 20); ohne Munition Nahkampf 6 |
| Gärtnern | pflegt Beete im Lager (+100 % Wachstum), erntet ins Vorratslager (3 Stück je Gang); ohne Beet alle 150 s ein Gemüse (Wildkräuter) |
| Ausbessern | bessert das am stärksten beschädigte Gebäude im Lager (22 Felder) aus, 8 LP/s |
| Sanitäter | heilt die Figur im Lager 2 LP/s, verbindet Wunden (Verband aus dem Vorrat), gibt Antibiotika; Bewohner am Feuer +1 LP/s |
| Ruhen | bleibt am Feuer |

Passt die Aufgabe zum früheren Beruf (★), arbeitet er 50 % besser. Morgens (Tageszeit 0,75) isst jeder Bewohner ein
Essen aus dem Vorrat (Vorratslager, Kisten im Lager); wer leer ausgeht, ist hungrig (60 % Leistung) und verlässt die
Gemeinschaft nach drei Tagen ohne Essen. Bewohner haben 60 LP, heilen am Feuer 0,5 LP/s und werden von Zombies
gejagt – auch am Lager. Die Sammelstelle heißt jetzt **Vorratslager** (Verpflegung 4 Plätze, Vorrat 24).

## Begehbare Häuser (Wunsch 18.11.2026, `SiteSystem.house`, Modelle `lib/haus.py`)

Häuser bestehen aus echten Bauteilen: Wände (Ziegel 650 LP, Putz 500, Bretter 280, Beton 1100; Abriss liefert Stein
bzw. Holz), Fenster (60 LP, manche zerbrochen) und Haustüren (220 LP; Figur und Bewohner gehen durch, Zombies nicht).
Innen Räume mit Durchgängen (Wohnhaus bis zu zwei Teilungen), Dielen bzw. Fliesen und Möbel an der Nordwand: Küche,
Herd, Kühlschrank, Kleiderschrank, Regal, Bad, Schreibtisch (alle durchsuchbar mit eigener Beute), Bett (Schlafen),
Sofa, Tisch. Läden haben Regalreihen, Werkstätten Werkbänke und Spinde, Scheunen Heu und Holz. Das Dach (Ziegel,
Schiefer, Wellblech, Flachdach mit Attika) blendet aus, sobald die Figur drinnen ist. Zombies suchen sich ihren Weg
über Fenster und Türen (Mauerwerk meiden sie). **Verbarrikadieren:** Holz in der Hand, Klick auf Fenster oder Tür –
je Brett 2 Holz, 90 LP, höchstens 3 Bretter; Schaden trifft erst die Bretter. In 22 % der Häuser wartet ein Zombie.

## Organische Orte und Sonderorte

Querstraßen an unregelmäßigen Stellen und zu beiden Seiten nach Los, unterschiedlich lang, oft mit Stichweg; Vorgärten
unterschiedlicher Tiefe, Gartenzäune, verwilderte Gemüsebeete, Dorfplatz mit Baum und Kirche (ab Dorfgröße); 15 % der
Wohnhäuser, 20 % der Läden und 35 % der Werkstätten sind ausgebrannte Ruinen. Sonderorte (`WORLD.places`, Zufahrt
von der Landstraße): **JVA Aschland** (Betonmauer mit Tor, Stacheldraht, vier Wachtürme, Zellentrakt mit Pritschen,
Verwaltung mit Spinden, Kantine; zwei Überlebende), **Kraftwerk** (Kühltürme, Turbinenhalle, Schornstein, Trafohof
mit durchsuchbaren Trafos, Kohlenhalde), **Gewerbegebiet Eisenrode** (Lagerhallen, Container mit Beute, acht
Schrotthaufen), **Gut Lindenhof** und **Hof Birkenrain** (Bauernhaus, begehbare Scheune, Silos, Felder, Beete).

## Selbstverteidigung der Bewohner (`DEFENSE` in `src/data/scavenge.ts`)

Alle Bewohner und folgende Überlebende schlagen zurück, wenn ein Zombie in Reichweite steht: mit der besten
Nahkampfwaffe aus dem Vorrat (Axt, Brecheisen, Schläger, Speer, Messer – genommen, wenn sie am Feuer sind), sonst mit
den Fäusten; Schaden × 0,8, Takt × 1,5 gegenüber der Figur. Unter 35 % Leben fliehen sie heim, Unbewaffnete brechen
Gänge beim ersten Biss ab. Bewaffnete mit mindestens halbem Leben eilen Menschen im Umkreis von 9 Feldern zu Hilfe, an
denen ein Zombie näher als 2,2 Felder steht – auch der Figur.

## Fremde: Plünderbande und Händler (`src/sim/strangers.ts`, Werte `src/data/strangers.ts`)

Die **Krähen** leben im Barrikadenlager westlich der JVA (sechs Plünderer, Nachwuchs alle 1,5 Tage, solange einer
lebt). Ab Tag 4 zieht in der Dämmerung alle 2,5 Tage ein Trupp (bis 4) zum Lagerfeuer, kämpft (Pistole 7 Schaden alle
50 Ticks, Reichweite 11, laut; sonst Schläger 8), stiehlt 10 Stück aus dem Vorrat (1 je 30 Ticks) und zieht ab; unter
35 % Leben fliehen sie. Kommt die Figur dem Bandenlager näher als 22 Felder, greift die ganze Bande an. Tote lassen
Pistole und Magazine fallen. Figur, Türme, Wachen und Bewohner zielen auf den nächsten Feind (`World.foe`: Zombie oder
Plünderer); Zombies jagen auch Plünderer und Händler.

**Händler** kommen ab Tag 3 alle 2 Tage ans Lagerfeuer (Start 55 Felder entfernt), bleiben ein Vierteltag und bieten
4 von 12 Tauschgeschäften (je 3-mal) an: Klick auf den Händler öffnet das Tauschfenster.

## Wohnen, Schlaf, Moral, Gefolge (`HOME`, `ESCORT` in `src/data/scavenge.ts`)

Bewohner beziehen ein freies Bett im Lager (Feldbett, Bett, Pritsche; Umkreis 22 um das Feuer) und halten sich tagsüber
daneben auf. Nachts (Dunkelheit ≥ 0,6) schlafen alle außer Wachen und Gefolge (1,2 LP/s). Moral 0–100 (Start 60):
morgens +6 mit Essen bzw. −20 ohne, +6 mit Bett bzw. −8 ohne, −15 je Toten des Tages, −10 bei jedem Überfall; unter
30 arbeiten sie mit 75 %, über 75 mit 115 %; zwei Morgen in Folge bei 0 gehen sie. **Mitkommen** (Fenster K): Der
Bewohner folgt der Figur (Wegsuche), nimmt eine Pistole und Magazine aus dem Vorrat (10 Schuss, 8 Schaden, Reichweite
10) und kämpft mit; Wachen nehmen ebenfalls Pistolen.

## Selbst bauen (Block C)

Steinmauern und Holzbarrikaden verbinden sich optisch wie Hauswände. Herstellbar: Bretterwand (3 Holz), Ziegelwand
(4 Steinziegel), Holzfenster (3 Holz), Ziegelfenster (2 Steinziegel, 1 Holz), Tür (4 Holz, 1 Eisenplatte); Fenster und
Türen mit R drehen. Schließen Wände einen rechteckigen Innenraum (bis 144 Felder) ein, bekommt er ein Dach (Wellblech,
bei Ziegel- und Putzwänden Ziegel), das ausblendet, wenn die Figur drinnen ist; fehlt eine Wand, verschwindet es.

## Geschwungene Landstraßen, L-Häuser, Feldwege (Block D)

Landstraßen (`roadPaths` in `src/data/world.ts`) sind Catmull-Rom-Kurven durch die Wegpunkte mit sanftem Schlängeln
(bis 3,5 Felder, Wellenlänge 70), alle 0,5 Felder abgetastet. In Orten laufen sie auf das Ende der Hauptstraße zu,
Zufahrten beginnen am nächsten Punkt einer früheren Straße. Im Boden liegt der Belag „Landstraße“ (Radius 1,3; Tempo
wie Asphalt); gezeichnet wird die Straße aus gedrehten Querschnitts-Stücken mit Mittellinie (`lib/strasse.py`).
Wracks alle 60, Masten alle 14 Felder, Alleen entlang der Kurve. Wohnhäuser haben zu 55 % einen Anbau nach hinten
(L-Form, eigener Raum mit Durchgang); Höfe haben begehbare Bauernhäuser und Feldwege zur Straße und zum Acker.

## Wetter, Jahreszeiten, Funk (Block E, `src/sim/weather.ts`, Werte `src/data/weather.ts`)

Jahreszeiten zu je 7 Tagen (Frühling, Sommer, Herbst, Winter). Das Wetter wechselt alle 4–14 Spielstunden nach
Gewichten der Jahreszeit: klar, Regen (Lärm × 0,7, Sicht der Zombies × 0,85, Regentonnen füllen sich schneller),
Nebel (Sicht × 0,55, Reichweite von Türmen und Wachen × 0,6), Gewitter (Lärm × 0,5, Blitze), Schnee. Im Winter wachsen
keine Beete, die Figur wird 35 % schneller hungrig, Boden und Dächer sind verschneit. Funksprüche ab Tag 2 alle 1,25
Tage: Notruf (ein Überlebender wartet 70–200 Felder entfernt, blau blinkend auf der Karte), angekündigter Abwurf,
Händler unterwegs, Hordenwarnung (nächste Horde × 1,5), Plünderer gesichtet (Überfall heute Nacht). Nur in der festen
Welt; Tests und Sandkasten haben immer klares Wetter.

## Neue Aufgaben

- **Plündern:** durchsucht Fundorte mit Beute im Umkreis von 90 Feldern ums Feuer (Suchzeit × 1,5), nimmt bis 16
  Stück, zieht zum nächsten Fundort in 14 Feldern weiter, solange Platz ist, meidet Zombies (12 Felder).
- **Gärtnern:** legt mit 8 Holz aus dem Vorrat neue Beete an (bis 3 je Gärtner, Bauzeit 30 s), Ernte geht vor.
- **Wache:** besetzt zuerst Wach- und MG-Türme im Lager (daneben, Reichweite × 1,4), dann Posten innen an der
  Mauer in seiner Richtung, sonst den Ring ums Feuer.

## Natürliche Welt

Bäume (`MAPGEN.trees`) stehen gehäuft in Wäldern (Rauschen Maßstab 60, Schwelle 0,5), dazu pflanzt der Weltaufbau
(`TreeField.plant`, im Spielstand als Pflanzliste): Alleen an 70 % der Landstraßenabschnitte (alle 6 Felder, beidseitig,
15 % Lücken; sonst einzelne Bäume alle 13 Felder), Feldhecken auf zwei bis drei Seiten der Äcker, Hof- und Obstbäume
an den Höfen, Gartenbäume hinter den Häusern der Orte. Boden-Flecken (Sand, Erde, Kies) sind seltener.

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

## Dichte Natur (`models/wildwuchs.py`, `src/data/decor.ts`)
- Baumdichte etwa verdreifacht (`MAPGEN.trees`: Laubbaum Raster 4, Hain-Schwelle 0,42): echte Wälder mit Lichtungen.
- 16 neue Laubbäume (`flora.tree.8–23`): Birken, Esskastanien, Alteichen, Rosskastanien, Walnuss, Apfel, Birne, Kirsche,
  Jungbäume. Wilde Bäume wählen ihre Art über großräumige Artenflecken (Birkenhain, Mischwald, Eichenwald,
  Kastanienwald, Ufergehölz, 14 % Jungwuchs; `TREE_GROUPS`, `TREE_PATCH`). Gepflanzte Bäume tragen die Gruppe in der
  Variante (100 + Gruppe·10 + v): Alleen (Rosskastanie), Gärten, Hofbäume (Eiche, Kastanie), Streuobstwiesen.
- Unterholz als Deko: hohes Gras, Wildblumen, Farne, Brombeeren/Wildsträucher, Dickicht, Stümpfe, Totholz, Pilze; Boden:
  Laub- bzw. Nadelstreu unter jedem Baum, Moos, Pfützen, Unkraut in Ritzen von Straßen und Gehwegen.
- Wind: Bäume und Gras wiegen sich (Scherung, Böenwelle; bei Regen/Sturm stärker, `WIND`).
- Bodenfarbe je Jahreszeit (`SEASON_GROUND`), goldene Stunde in der Dämmerung (`NIGHT.golden*`), Vignette (`VIGNETTE`).

## Wildtiere (`src/sim/wildlife.ts`, Werte `src/data/wildlife.ts`, Modelle `lib/tiere.py`)
- Rehe (Rudel 2–4), Hasen, Wildschweine leben auf fruchtbarem Land abseits der Orte, erscheinen außer Sicht (34–56 Felder)
  und verschwinden über 80 Felder. Sie fliehen vor Figur, Bewohnern und Zombies (nachts weniger scheu, im Wagen doppelt).
- Jagd mit Nahkampf oder Schusswaffe (nur wenn kein Gegner näher ist). Beute: Reh 4 Fleisch + Fell, Hase 1 Fleisch,
  Wildschwein 5 Fleisch + Fell. Verletzte Wildschweine greifen an (12 Schaden, alle 70 Ticks).
- Rohes Fleisch (Hunger 8, Durst −6), Braten aus 2 Fleisch + 1 Holz (Hunger 42), Fell zu 3 Stoff.
- Umgebungsleben (nur Darstellung, `src/render/ambient.ts`): Krähenschwärme auf Feldern und bei Kadavern fliegen auf,
  Schmetterlinge (Frühling/Sommer), Glühwürmchen in Sommernächten, fallendes Herbstlaub.

## Flur, Friedhof, Notlager (`models/flur.py`, `lib/staetten.py`)
- Feldfrüchte auf jedem Acker (nur Darstellung, `drawCrops`): Weizen, Mais, Sonnenblumen oder Rüben je Acker; Frühling
  jung, Sommer reif, Herbst dürr, Winter Stoppeln; 12 % Lücken; wiegen im Wind.
- Hecken (`hedge`, Hainbuche/Liguster/Thuja) statt Zaun an 45 % der Gartengrenzen und um Friedhöfe.
- Seerosen auf Wasser nahe dem Ufer (Deko `lily`, Flag `water`).
- Friedhof neben der Kirche (Dorf und Stadt): Hecke, Weg, Grabsteine, Kreuze, offene und frische Gräber, zwei Eiben.
- Evakuierungs-Sammelstellen (`kind: 'evac'`: Notlager Nord, Sammelstelle Moorbrück): Bauzaun, Sandsäcke, 2 Zeltreihen
  (Armee- und Sanitätszelte als Fundorte, Tabellen `tent`/`medtent`), Militär-Lastwagen, Dixi-Klos, Feldbetten,
  Leichensäcke (`bodies`), Kisten; Zombie-Gewicht 6.
- Leichen (`corpse`, Fundort ohne Kollision, Tabelle `bodies`) neben Wracks, auf Gehwegen, an Landstraßen und im Notlager.
- Kriecher (Zombie ohne Beine, ab Tag 2, 5–12 %): 22 Leben, langsam (0,022), Biss 9 mit 45 % Blutung; im Gras halb
  unsichtbar, bis man auf 4 Felder heran ist; nie in Horden.
- Atmosphäre: Rauch über 35 % der ausgebrannten Häuser, Bodennebel morgens und bei Nebel, Kerzenlicht bei Bewohnern zu
  Hause, Fackeln der Plünderer, Pfützen nur nach Regen satt, Flachdächer mit Unkraut/Laub/Unrat, verkohlte Möbel,
  großräumige Wiesenfarben (grün bis strohgelb, `LOOK.macro.hue*`).

## Stillgelegte Bahn (`RAILWAY` in `src/data/world.ts`, `lib/strecke.py`)
- Gerade West–Ost-Strecke (y 174, x −520 … 520) im Schotterbett (Belag 14), über Seen als Bahndamm, an Straßen ebenerdig.
- Bahnhof Moorbrück: Ziegel-Empfangsgebäude, Bahnsteig mit zwei Dächern, Bänken, Schild.
- Entgleister Güterzug: Diesellok und sechs Wagen (Güter- und Kesselwagen als Fundorte, Tabellen `freight`, `loco`,
  `drums`), manche aus dem Gleis gesprungen, verstreute Fracht; Zombie-Gewicht 4.

## Feinschliff Welt
- Laub aller Bäume und Sträucher um gut ein Fünftel aufgehellt (Wälder wirkten fast schwarz).
- Trampelpfade (nur Darstellung, `TRAILS`): wo Figur und Bewohner oft gehen, wird das Gras zu Erde; verblasst langsam.
- Hubschrauber-Überflüge (nur Darstellung, `lib/himmel.py`, etwa einmal je Tag) mit Bodenschatten und Rotorgeräusch.
- Naturgeräusche (ZzFX): Vögel am Tag, Grillen in Sommernächten, Krähen, Regen, Donner bei Sturm, Zombie-Stöhnen.
- Ruderboote an Seeufern (`rowboat`, Tabelle `boat`, 45 % der Zellen mit Ufer), verlassene Zeltplätze in der Wildnis
  (Kuppelzelte um eine kalte Feuerstelle, Tabelle `camping`, `lib/ufer.py`).
- Jahreszeiten im Bild: Herbst tauscht 75 % der Laubbäume gegen eigene Herbstbäume (gelb, orange, rot; `models/jahreszeit.py`),
  im Winter stehen alle Laubbäume kahl; Schnee auf den Dächern; Nebelschleier nachts dunkel.
- Ortsparks in Dörfern und Städten (Brunnen, Rutsche, Sandkasten, Klettergerüst, Schaukel, Bänke; `lib/park.py`), Bootsstege
  bei Ruderbooten.
- Freileitungen zwischen den Holzmasten an Landstraßen; ferne Schüsse, Hundegebell, Explosionen; Brocken und Schreier in je zwei
  weiteren Kleidungen, Läufer in drei.
- Obstbäume (Streuobst, Gärten) geben beim Fällen im Sommer und Herbst 3–6 Obst (`FRUIT_TREE`, Hunger 10, Durst 6).
- Innenräume: Böden je Haus getönt, Teppiche in Wohnhäusern, Papiere und Glasscherben (`models/innen.py`).
- 15 % der Wohnhäuser sind schon verrammelt (Bretter vor den Fenstern, `SITES.fortified`), Türen bleiben frei.
- Gemalte Hilferufe (`models/schrift.py`, „SOS“, „HILFE“, „INFIZIERT“, „LEBEN HIER“, „NICHT BETRETEN“) auf 8 % der Dächer.
- Übersichtskarte zeigt Bäume und damit Wälder; Läden haben öfter Spitzdächer, Flachdächer mehr Farbtöne.

## Ortsbild 2
- Zombies in 8 weiteren Kleidungen (`models/zombievolk.py`: Warnweste, Polizei, Kittel, Latzhose, Anzug, Flecktarn …).
- Ausgebrannte Häuser (10 %, nur Darstellung): verkohlte Wände, Dach mit Löchern, Ruß am Boden (`HOUSES`).

## Vielfalt (`lib/vielfalt.py`, `models/vielfalt.py`)
- Wracks als Fundorte: Lieferwagen (3 Farben), Streifenwagen, Krankenwagen, Linienbus, Traktor (2 Farben); Beute je
  Fahrzeug (Tabellen `van`, `police`, `ambulance`, `bus`, `tractor`). Mülltonne, Gartenhütte, Ölfässer ebenfalls Beute.
- Kram als Requisiten (`kind: 'prop'`, Varianten `<name>.v<n>`): Briefkasten, Picknicktisch, Schaukel, Wäscheleine,
  Hundehütte, Bank, Bushaltestelle, Telefonzelle, Paletten, Reifenstapel, Pylon, Absperrung, Sandsäcke, Baumstamm.
- Verteilung (`SiteSystem.street` u. a.): Vorgarten mit Briefkasten, Tonne und 0–2 Gartenstücken; Gehwegmöbel alle
  7–12 Felder; Straßensperren am Ortsrand; gemischte Wracks auf Landstraßen; Höfe, Gewerbe, Gefängnis, Posten mit
  eigenem Kram; umgestürzte Stämme im Wald.
- Darstellung: Farbe je Haus (Putz, Ziegel, Holz, Beton) und Dach, Dachaufbauten (Schornstein, Antenne, Solar, Schüssel,
  Oberlicht), Zombies und Menschen mit Farb- und Größenstreuung, Bäume nach Jahreszeit (Herbstfarben je Baum, Winter
  kahl/bereift), Bodenflecken (Blut, Müll, Laub, Brandstellen, Reifenspuren).
- Erstes Wetter immer klar, damit der Start nicht im Nebel liegt.

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

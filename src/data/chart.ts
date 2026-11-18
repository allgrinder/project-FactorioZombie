/**
 * Kartenaufdeckung (Wiki „Radar“, „Map structure“): Abschnitte (Chunks) zu 32×32 Feldern.
 * Die Figur deckt 5×5 Abschnitte auf, Radar 7×7 ständig (Puls je Sekunde) und erkundet
 * 29×29 Abschnitte: je 10 MJ (33,3 s bei 300 kW) ein entfernter Abschnitt, Unerkundetes zuerst.
 * Ein aufgedeckter Abschnitt gilt 10 s als „live“ (Gegner sichtbar), danach zeigt die Karte den letzten Stand.
 */
export const CHART = {
  chunk: 32,
  /** Radius in Abschnitten: Figur 2 (5×5), Radar nah 3 (7×7), Radar fern 14 (29×29). */
  playerRadius: 2,
  radarNearRadius: 3,
  radarFarRadius: 14,
  /** Energie je erkundetem Abschnitt (J). */
  scanEnergy: 10_000_000,
  /** Sekunden, die ein Abschnitt nach dem Aufdecken „live“ bleibt. */
  liveSeconds: 10,
  /** Startgebiet beim Spielbeginn (Radius in Abschnitten, Messvorschlag). */
  startRadius: 3,
} as const;

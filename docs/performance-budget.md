# Rendering-Profiler und Performancebudgets

Stand: 1. August 2026  
Messdaten: [`performance-results.json`](performance-results.json)

## Reproduzierbare Messung

```powershell
npm run profile
```

Das Script startet den lokalen statischen Testserver, öffnet für jeden Lauf einen kalten Browser-Kontext und erzeugt drei synthetische Datensätze mit 385, 1.200 und 5.000 Personen. Jede Größe wird dreimal gemessen. Der Bericht enthält alle Einzelwerte, Median, schlechtesten Wert, Long Tasks und DOM-Mengen. Standardziel ist die ignorierte Datei `docs/performance-results-current.json`; ein historischer Nachweis wird explizit mit `--output=...` erzeugt.

Vor Pan/Zoom wartet das Script 250 ms auf verzögerte Startarbeit; bei mehr als 1.200 Personen zusätzlich auf die fertige, gecachte Familienübersicht. Vor der Suche wartet es 250 ms auf die geöffnete Sheet-Endposition. Long Tasks aus Start und Interaktionen werden getrennt erfasst. Dadurch misst ein Interaktionswert nicht versehentlich die 220-ms-Sheetanimation, einen noch laufenden Worker oder das verzögerte Start-`fit()`.

Referenzgerät: Windows 10.0.26200 x64, Intel Core i7-1360P (16 logische CPUs), 31,7 GiB RAM, Node 24.12.0, Chrome/Chromium 150.0.7871.188, headless, 1440 × 900. Die Angaben werden bei jedem Lauf neu in die JSON-Datei geschrieben.

## Budgets

| Messgröße | Ziel |
|---|---:|
| Interaktion, empirisches p95 | < 100 ms |
| Suche | < 150 ms |
| Längster Long Task bei 385 Personen | < 200 ms |

Bei drei Stichproben entspricht der dokumentierte schlechteste Wert dem konservativen empirischen p95. Initiales Laden besitzt noch kein hartes Budget; es wird als Trendwert erfasst.

## Baseline vor S4-07

| Personen | Initial Median / schlecht. | Pan/Zoom Median / schlecht. | Suche Median / schlecht. | Detail Median / schlecht. | längster Task | DOM / Karten / Linien (Median) |
|---:|---:|---:|---:|---:|---:|---:|
| 385 | 835,5 / 1.288,0 ms | 31,6 / 38,5 ms | 251,9 / 265,1 ms | 209,7 / 316,1 ms | 167 ms | 5.828 / 385 / 767 |
| 1.200 | 1.046,3 / 1.084,0 ms | 105,8 / 112,8 ms | 195,5 / 318,2 ms | 830,1 / 841,5 ms | 528 ms | 16.810 / 1.200 / 2.398 |
| 5.000 | 1.871,9 / 1.968,2 ms | 104,5 / 119,1 ms | 181,2 / 202,4 ms | 257,3 / 264,6 ms | 629 ms | 3.617 / 118 / 0 |

Bewertung: Das Long-Task-Budget für den normalen 385er-Datensatz und Pan/Zoom bestehen. Suche und Detailöffnung verfehlen dort das Ziel. Bei 1.200 Personen wird ohne Kartenvirtualisierung die höchste DOM-Menge erzeugt. Bei 5.000 Personen begrenzt die vorhandene Viewportvirtualisierung die Karten auf 118; die Datenableitung und der initiale Aufbau erzeugen dennoch lange Tasks.

## Gemessene Hotspots

1. `render()` leert `nodes`, `lines` und Generationsbänder vollständig. Karten, Innenmarkup, Event-Listener und SVG-Verbindungen werden danach neu erzeugt.
2. `openSheet()` ruft `render()` auf, obwohl eine reine Detailöffnung weder Layout noch Baumdaten ändert. Das erklärt den hohen Detailwert besonders bei 1.200 Karten.
3. `updateMinimap()` baut Haupt-Minimap und mobilen Überblick samt SVG-Knoten und – bis 1.200 Personen – Linien bei jedem Vollrender neu auf.
4. `renderSearchResults()` scannt und sortiert den gesamten aktiven Datensatz, ersetzt die Trefferliste per `innerHTML` und registriert Listener neu.
5. Der Initialpfad erstellt Datenindizes und Beziehungskomponenten und führt danach denselben kompletten DOM-/SVG-Aufbau aus. Die Viewportvirtualisierung greift erst oberhalb des 1.200er-Falls.

S4-06 enthält absichtlich keine Optimierung. Die Baseline dient als Vorhermessung für S4-07; neue Messungen müssen mit demselben Script und Referenzgerät erfolgen.

## Ergebnis nach S4-07

Messdaten: [`performance-results-after-s4-07.json`](performance-results-after-s4-07.json)

| Personen | Initial Median / schlecht. | Pan/Zoom Median / schlecht. | Suche Median / schlecht. | Detail Median / schlecht. | längster Interaktions-/Starttask | DOM / Karten / Linien (Median) |
|---:|---:|---:|---:|---:|---:|---:|
| 385 | 668,7 / 1.385,3 ms | 23,5 / 23,5 ms | 66,9 / 71,4 ms | 69,3 / 109,9 ms | 0 / 172 ms | 5.828 / 385 / 767 |
| 1.200 | 626,3 / 627,6 ms | 54,5 / 55,5 ms | 27,4 / 33,3 ms | 65,8 / 71,3 ms | 55 / 147 ms | 6.105 / 80 / 56 |
| 5.000 | 533,9 / 581,2 ms | 46,6 / 48,2 ms | 31,3 / 31,6 ms | 62,6 / 62,7 ms | 0 / 168 ms | 3.617 / 118 / 0 |

Die S4-06-Rohdatei bleibt unverändert erhalten; der Profiler wurde für die Nachhermessung um die beschriebenen Phasengrenzen ergänzt. Daher gelten absolute Vorher-/Nachherwerte als Trend und die finalen Budgetprüfungen als maßgeblich.

- Suche erfüllt das 150-ms-Budget in allen neun Nachherläufen.
- Pan/Zoom erfüllt das 100-ms-Interaktionsbudget in allen neun Nachherläufen.
- Detail erfüllt das Budget bei 1.200 und 5.000 Personen; beim 385er-Datensatz liegt ein Kaltlauf mit 109,9 ms knapp darüber, Median 69,3 ms. Gegenüber der Baseline (Median 209,7 ms) ist das messbar verbessert; eine weitere Kaltlaufoptimierung ist P2.
- Bei 385 Personen bleibt der längste Starttask mit 172 ms unter 200 ms; nach der Startphase wurde dort kein Long Task registriert.
- Der frühere 1.200er-Fallback mit 1.200 Karten wurde auf 80 sichtbare beziehungsweise fokusrelevante Karten begrenzt. Fokus und Auswahl bleiben dabei erhalten.

S4-07 trennt nun Datenindizes, Renderableitung und DOM-Patch: Suchtext und Sortierung werden bei Datenänderung abgeleitet, Karten werden über stabile Einzel-/Paar-Keys wiederverwendet, Beziehungen/Generationsbänder/Minimap nur bei geänderter Signatur aufgebaut und reine Detail-/Spotlight-Aktionen patchen nur ihren Zustand.

## Ergebnis nach der Großbaum-Navigationsarchitektur

Stand: 2. August 2026

Messdaten: [`performance-results-large-tree.json`](performance-results-large-tree.json)

| Personen | Initial Median / schlecht. | Pan/Zoom Median / schlecht. | Suche Median / schlecht. | Detail Median / schlecht. | längster Interaktions-/Starttask | DOM / Karten / Linien (Median) |
|---:|---:|---:|---:|---:|---:|---:|
| 385 | 737,5 / 1.636,5 ms | 19,3 / 19,7 ms | 14,3 / 16,2 ms | 55,3 / 58,5 ms | 0 / 171 ms | 6.075 / 385 / 767 |
| 1.200 | 647,9 / 666,9 ms | 49,7 / 49,9 ms | 27,9 / 32,4 ms | 74,4 / 78,5 ms | 59 / 142 ms | 6.227 / 80 / 56 |
| 5.000 | 814,7 / 930,3 ms | 13,7 / 14,7 ms | 31,2 / 31,5 ms | 54,7 / 69,6 ms | 0 / 194 ms | 2.434 / 160 / 117 |

Bei mehr als 1.200 aktiven Personen startet die Anwendung nun in der semantischen Familienübersicht. Die Clusterberechnung läuft in einem Modul-Worker und wird anhand der Beziehungstopologie gecacht. Die klassische Ansicht ist auf einen bearbeitbaren Nahbereich begrenzt; eine versehentliche globale Auto-Anordnung wird dort verhindert. Die Minimap rendert Familiencluster und ihre Beziehungen statt tausender Einzelpunkte.

- Alle gemessenen Interaktionen bleiben unter 100 ms.
- Suche bleibt in allen neun Läufen deutlich unter 150 ms.
- Der 5.000er-Start umfasst die vollständig berechnete Worker-Übersicht und bleibt im schlechtesten Lauf unter einer Sekunde.
- Pan/Zoom bei 5.000 Personen sinkt gegenüber S4-07 von 46,6 ms auf 13,7 ms Median.
- Die 5.000er-Ansicht hält den DOM trotz vollständiger aktiver Datenmenge bei 2.434 Elementen und höchstens 160 gerenderten Detailkarten.

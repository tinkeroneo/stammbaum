# Rendering-Profiler und Performancebudgets

Stand: 1. August 2026  
Messdaten: [`performance-results.json`](performance-results.json)

## Reproduzierbare Messung

```powershell
npm run profile
```

Das Script startet den lokalen statischen Testserver, öffnet für jeden Lauf einen kalten Browser-Kontext und erzeugt drei synthetische Datensätze mit 385, 1.200 und 5.000 Personen. Jede Größe wird dreimal gemessen. Der Bericht enthält alle Einzelwerte, Median, schlechtesten Wert, Long Tasks und DOM-Mengen.

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

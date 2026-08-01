# UX-/UI-Abnahme nach Sprint 4

Abnahmedatum: 1. August 2026
Referenzsystem: Windows 10.0.26200 x64, Chrome/Chromium 150.0.7871.188, Playwright 1.61.1
Zielgrößen: 390 × 844, 768 × 1024 und 1440 × 900 CSS-Pixel

## Ergebnis

Die technische Sprint-Abnahme ist bestanden. Es gibt keine bekannte offene P0- oder P1-Abweichung. Alle Kernflows sind mit Maus beziehungsweise Touchsimulation und die zentralen Fokuspfade zusätzlich per Tastatur geprüft. Der Modusschalter zeigt weiterhin ausgeschrieben „Ansehen | Bearbeiten“ und ist in allen drei Größen sichtbar.

Während der visuellen und automatisierten Abschlussprüfung wurden drei zuvor nicht sichtbare Fehler gefunden und direkt behoben:

1. Das geschlossene Personenverzeichnis blieb auf Mobile wegen einer inhaltsabhängigen Translate-Strecke teilweise sichtbar und konnte Klicks abfangen. Geschlossene Personen- und Verzeichnissheets sind nun zusätzlich `visibility:hidden` und `pointer-events:none`.
2. Bei 768 px konnte ein Fokuswechsel den mit `overflow:hidden` angelegten Arbeitsbereich programmatisch um 818 px scrollen. `main` und Bühne verwenden nun `overflow:clip`, da ihre Navigation ausschließlich über Canvas-Transforms erfolgt.
3. Die pauschale Sheet-Transition verzögerte beim Öffnen auch `visibility`; dadurch konnte das Personenverzeichnis seinen Anfangsfokus verlieren. Die Transition animiert nun ausschließlich den Transform, macht geöffnete Sheets sofort fokussierbar und verbirgt sie erst nach der Schließbewegung.

## Automatisierte Regression

- Vollsuite: 112 von 112 Playwright-Tests bestanden.
- Fokus-Stabilität: der komplette Dialogmanager-Satz zusätzlich fünfmal wiederholt, 15 von 15 Durchläufen bestanden.
- JavaScript-Konsole: in den drei Abnahme-Kernflows keine unbehandelten Laufzeitfehler.

## Abnahmematrix

| Flow / Zustand | 390 × 844 | 768 × 1024 | 1440 × 900 | Nachweis | Ergebnis |
|---|---|---|---|---|---|
| App öffnen / Einstieg fortsetzen | ja | ja | ja | `final-acceptance`, `startup-state` | bestanden |
| Neue Hauptnavigation verstehen | ja | ja | ja | Start-Screenshots, Landmarktests | bestanden |
| Person suchen | ja | ja | ja | `final-acceptance`, `search` | bestanden |
| Person ansehen | ja | ja | ja | Person-Screenshots, `person-detail` | bestanden |
| Bearbeiten aktivieren | ja | ja | ja | `final-acceptance`, Modus-ARIA-Prüfung | bestanden |
| Person speichern | ja | ja | ja | `final-acceptance`, `smoke` | bestanden |
| Undo / Redo | ja | ja | ja | `final-acceptance`, `undo-redo-ui`, `command-history` | bestanden |
| JSON importieren | – | ja | – | echter File-Chooser in `final-acceptance`, Importtest in `command-history` | bestanden |
| Root nach Import wählen | – | ja | – | Root-Screenshot, `root-selection` | bestanden |
| JSON exportieren | ja | ja | ja | Export-Screenshots, `export-dialog`, `privacy-export` | bestanden |
| Speicherfehler / Memory-only | unabhängig | unabhängig | unabhängig | `persistence-state`, `startup-state` | bestanden |
| Mobile-Überblick | ja | – | – | Überblick-Screenshot, Hoch-/Querformat-Test | bestanden |
| Tastatur-only: Suche, Dialog, Canvas, Undo | ja | ja | ja | `final-acceptance`, `canvas-keyboard`, `dialog-manager`, `undo-redo-ui` | bestanden |
| 200 % / 400 % Textzoom | ja | – | ja | `contrast-zoom`, `form-sections`, `people-directory` | bestanden |
| Import-/Export-Kompatibilität | ja | ja | ja | Modul-, Export-, Privacy- und Commandtests | bestanden |

## Screenshot-Nachweise

Alle Dateien liegen in [`ux-acceptance-screenshots`](ux-acceptance-screenshots):

- Startansicht: `start-390x844.png`, `start-768x1024.png`, `start-1440x900.png`
- Personenansicht: `person-390x844.png`, `person-768x1024.png`, `person-1440x900.png`
- Exportdialog: `export-390x844.png`, `export-768x1024.png`, `export-1440x900.png`
- Root-Auswahl: `root-selection-768x1024.png`
- Mobile-Überblick: `overview-390x844.png`

Visuelle Stichprobe: keine verdeckte Hauptnavigation, keine gleichzeitig sichtbaren geschlossenen Sheets, keine horizontal abgeschnittene Kernaktion. Der mobile Exportdialog scrollt erwartungsgemäß vertikal; die Exportaktion ist per Browsertest erreichbar und ausführbar.

## Offene Punkte mit Priorität

- P2 – Performance-Kaltlauf: Beim 385er-Datensatz lag eine von drei Detailöffnungen bei 109,9 ms, Median 69,3 ms. Das ist gegenüber 209,7 ms Baseline deutlich verbessert; siehe [`performance-budget.md`](performance-budget.md).
- P2 – Moderierte Erfolgsmessung: Die im Sprintplan vorgesehenen Tests mit mindestens fünf externen, nicht an der Entwicklung beteiligten Personen benötigen reale Teilnehmende. Die technische Vorbereitung ist abgeschlossen; Erfolgsquoten dürfen bis zur Durchführung nicht behauptet werden.

Keine stillen Known Issues: Weitere bekannte technische P0/P1-Abweichungen bestehen zum Abnahmezeitpunkt nicht.

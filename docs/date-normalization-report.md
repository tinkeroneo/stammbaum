# Datumsnormalisierung der Stammbaum-JSONs

Stand: 2. August 2026

## Bearbeitete Dateien

| Datei | Personen | geänderte Datumswerte | erhaltene unsichere Originalangaben | anschließend unverarbeitbar |
| --- | ---: | ---: | ---: | ---: |
| lokaler Ausgangsstammbaum | 385 | 9 | 0 | 0 |
| `stammbaum-mit-bildern.json` | 385 | 9 | 0 | 0 |
| `familienbuch_bodensteiner_full_extension_v4.json` | 3.980 | 5.820 | 570 | 0 |
| `stammbaum_mit_familienbuch_full_v4.json` | 4.365 | 5.829 | 570 | 0 |
| `stammbaum_mit_familienbuch_full_v5_bereinigt.json` | 4.338 | 5.797 | 571 | 0 |
| **Gesamt** |  | **17.464** | **1.711** | **0** |

Insgesamt wurden 19.694 nichtleere Geburts-, Sterbe- und Heiratsangaben direkt mit `parseBirthValue` aus `modules/selectors.js` geprüft.

## Regeln

- Englische Tagesdaten wie `April 20, 1923` wurden zu `20.04.1923`.
- Englische Monatsdaten wie `October 1944` wurden zu `10.1944`.
- Numerische Trenner wurden auf Punkte vereinheitlicht und Tag/Monat zweistellig geschrieben.
- Reine Geburtstage wie `11.09` wurden als `11.09.` vereinheitlicht.
- `About ...` und `Before ...` wurden auf den enthaltenen verarbeitbaren Datumswert reduziert.
- Bereiche wie `Between 1979 and 2007` verwenden für Sortierung und Verarbeitung die erste Grenze `1979`.
- Bei Näherungen, Vorher-Angaben und Bereichen steht die vollständige ursprüngliche Angabe zusätzlich im Personenhinweis.
- Ein offensichtlicher Feldfehler mit einem Geburtsnamen im Sterbedatumsfeld wurde in das Geburtsnamensfeld verschoben und im Personenhinweis dokumentiert.
- Quellen-/Erwähnungsdaten wurden nicht verändert, da sie freie Quellenbeschreibungen und keine von der Datumsauswertung verwendeten Lebensdaten sind.

## Absicherung

- Vorherige Versionen aller fünf Dateien liegen unter `C:\tmp\stammbaum-date-backup-20260802`.
- Ein struktureller Vorher-/Nachher-Vergleich bestätigt identische Personenzahlen und IDs.
- Es wurden keine Namen, Beziehungen, Root-IDs oder Positionen verändert.
- Der Normalisierungslauf ist idempotent: Ein zweiter Prüflauf meldet in allen Dateien `0 geändert` und `0 ungeklärt`.
- Playwright: Import, Modulgrenzen und bereinigter US-Zweig, 9/9 Tests bestanden.

Reproduzierbarer Prüfbefehl:

```powershell
node scripts\normalize-genealogy-dates.cjs --check <lokale-stammbaumdateien.json>
```

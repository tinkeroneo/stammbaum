# Historische UX/UI-Baseline S0-01

## Datenschutzkorrektur vom 2. August 2026

Die ursprüngliche Baseline dokumentierte sieben Bedienabläufe mit einem realen Stammbaum. Ihre Screenshots enthielten Namen, vollständige Geburtsdaten und Familienbeziehungen vermutlich lebender Personen. Die komplette Bildserie `docs/ux-baseline-screenshots/` wurde deshalb aus dem aktuellen Veröffentlichungsstand entfernt.

Die funktionalen Beobachtungen bleiben als historische Testnotiz erhalten; die Bilder sind kein zulässiges Veröffentlichungsartefakt. Aktuelle, datenschutzsichere Screenshots mit ausschließlich synthetischen Testpersonen liegen in `docs/ux-acceptance-screenshots/` und werden durch `tests/final-acceptance.spec.js` reproduzierbar erzeugt.

## Dokumentierte Abläufe

1. **App öffnen:** Startansicht ohne geöffnetes Personen-Sheet.
2. **Person suchen:** Suchoberfläche öffnen, Begriff eingeben und Trefferliste prüfen.
3. **Person ansehen:** Treffer beziehungsweise Personenkarte öffnen und Detailansicht prüfen.
4. **Bearbeiten aktivieren:** vom Ansichts- in den Bearbeitungsmodus wechseln.
5. **Person speichern:** Eingabe speichern, Sheet-Schließung und erneut lesbare Detailansicht prüfen.
6. **JSON importieren:** isolierten synthetischen Testdatensatz über den Datei-Input laden.
7. **JSON exportieren:** Export auslösen und Download beziehungsweise Dateisystem-Fallback prüfen.

## Aktuelle visuelle Nachweise

- Startansicht: `ux-acceptance-screenshots/start-390x844.png`, `start-768x1024.png`, `start-1440x900.png`
- Personenansicht: `ux-acceptance-screenshots/person-390x844.png`, `person-768x1024.png`, `person-1440x900.png`
- Exportdialog: `ux-acceptance-screenshots/export-390x844.png`, `export-768x1024.png`, `export-1440x900.png`
- Root-Auswahl: `ux-acceptance-screenshots/root-selection-768x1024.png`
- Mobile Übersicht: `ux-acceptance-screenshots/overview-390x844.png`

Die Testdaten heißen unter anderem „Anna Abnahme“, „Paul Partner“ und „Clara Kernflow“ und sind ausschließlich für die automatisierte Abnahme erfunden.

## Hinweis zur Git-Historie

Das Entfernen aus dem aktuellen Branch verhindert die Auslieferung dieser Dateien durch den aktuellen Veröffentlichungsstand. Frühere Commits können die alten Dateien weiterhin enthalten, bis die Repository-Historie ausdrücklich bereinigt und anschließend mit einem Force-Push ersetzt wird.

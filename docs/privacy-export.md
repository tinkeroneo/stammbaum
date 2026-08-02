# Datenschutzexport für vermutlich lebende Personen

Stand: 1. August 2026  
Regelversion: Kalenderjahr des geöffneten Exportdialogs

## Fachliche Einordnung

„Vermutlich lebend“ ist keine Tatsachenbehauptung und keine heimliche Klassifikation im gespeicherten Stammbaum. Die Einstufung wird ausschließlich für die Vorschau und die vom Nutzer bewusst aktivierte Exportkopie berechnet. Sie wird weder gespeichert noch zurück in Personendaten geschrieben.

Eine Person gilt für den Export als vermutlich lebend, wenn kein Sterbedatum eingetragen ist und eine der folgenden Bedingungen zutrifft:

- das Geburtsjahr fehlt, oder
- die Person wäre im Regeljahr jünger als 110 Jahre.

Ein vorhandenes Sterbedatum beendet die Vermutung. Ohne Sterbedatum gelten Personen ab 110 Jahren als historisch und werden nicht automatisch gekürzt. Fehlende Geburts- und Sterbedaten werden aus Datenschutzsicht vorsichtig als vermutlich lebend behandelt. Das Regeljahr und die Jahresgrenze stehen im Exportdialog; beim Öffnen des Dialogs wird das Jahr fixiert, sodass Vorschau und Datei dieselbe Regel verwenden.

## Bewusst wählbare Änderungen

Der Datenschutzfilter ist für neue Exporte standardmäßig aktiviert. Wer für einen ausschließlich privaten, lokalen Zweck bewusst eine unveränderte Arbeitskopie benötigt, kann ihn im Dialog abwählen. Drei Schutzoptionen sind einzeln abwählbar:

- Geburtsdatum vermutlich Lebender auf das vierstellige Jahr kürzen; ohne erkennbares Jahr wird es entfernt.
- Notiz, Quellen-/Erwähnungszeilen und Personenlink vermutlich Lebender entfernen.
- Personenbild vermutlich Lebender entfernen.

Die bestehende Option „Personenbilder einschließen“ bleibt übergeordnet: Ist sie aus, werden Bilder aller Personen entfernt. Der Dialog zeigt vor der Bestätigung Gesamtzahl, Anzahl vermutlich Lebender, tatsächlich betroffene Personen und geschätzte Dateigröße.

Auch mit aktivem Filter bleiben Namen und Familienbeziehungen erhalten. Ein solcher Export ist daher nicht automatisch zur öffentlichen Veröffentlichung geeignet und muss vor jeder Weitergabe fachlich geprüft werden.

## Technische Garantien

`createPrivacyExport` in `modules/data-model.js` arbeitet auf einer strukturierten Kopie. Bei identischem Datensatz, Optionssatz und Regeljahr ist das Ergebnis deterministisch. Die Originaldaten, Command-Historie und Persistenzrevision bleiben unverändert. Tests decken vorhandenes Sterbedatum, fehlendes Geburtsdatum, sehr alte Personen, gekürzte volle Geburtsdaten sowie die globale Bildoption ab.

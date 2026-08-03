# Familienbuch V5 – Bereinigung und Einordnung

## Ergebnis

- Ausgang: `stammbaum_mit_familienbuch_full_v4.json` mit 4365 Personen.
- Aktueller Ergebnisstand: `stammbaum_mit_familienbuch_full_v5_bereinigt.json` mit 4297 Personen.
- Hochsichere Duplikate zusammengeführt: 35.
- Vermischte/fehlende Identitäten aufgespalten bzw. ergänzt: 7.
- Unplausible Elternreferenzen entfernt: 62.
- Eindeutige zweite Elternteile ergänzt: 12.
- Unbelegte oder chronologisch unmögliche Partnerpaare entfernt: 13.
- Entfernte Seitenkopf-Artefakte: 706.
- Aktiv eingeordnete Personen insgesamt: 3257; im Vorrat verbleiben 1040 Personen.
- Verbleibende exakte Name-plus-Geburtsdatum-Gruppen: 0.
- Verbleibende strukturelle Vorratsdubletten mit gleichem Namen und demselben Partner: 0.
- Verknüpfte Vorratspersonen, deren Eltern-, Kind- oder Partnerbeziehung bereits in den aktiven Stammbaum führt: 0.

## Anschluss an den aktiven Bodensteiner-Zweig

Der Familienbuch-Zweig beginnt belegt bei Joseph Bodensteiner (ca. 1734, Unterlind). Die Quelle nennt seine Eltern nicht. Deshalb wurde keine scheinbar sichere direkte Elternschaft erzeugt. Der Datensatz `fbbridge0001` verbindet den Zweig sichtbar mit Adam und Barbara Bodensteiner, ist aber mit niedriger Sicherheit und einem deutlichen Hypothesenhinweis versehen. Diese Brücke muss später durch Kirchenbuch-/Archivbelege bestätigt, verschoben oder entfernt werden.

## Aktive Einordnung und Positionierung

Aktiv sind jetzt ausnahmslos alle Personen, die über Eltern-, Kind- oder Partnerbeziehungen mit dem aktiven Bodensteiner-Stammbaum verbunden sind. Der Vorrat wird nicht als Performanceablage verwendet: Dort verbleiben nur noch 350 derzeit unverbundene Arbeitskomponenten mit insgesamt 1040 Personen. 53 Komponenten bestehen aus einer Einzelperson, die größte Komponente aus 15 Personen. Beim Import berechnet die App den aktiven Zusammenhang mit ihrem Auto-Layout; die aktuelle Laufzeitpositionierung wurde ohne Koordinatenüberlagerung geprüft.

Eine automatische Eingliederung der restlichen Komponenten wäre fachlich nicht sauber. Namensähnlichkeiten ohne eindeutiges Datum oder einen eindeutigen Beziehungsanker liefern bei mehreren möglichen aktiven Personen keine belastbare Zuordnung. Solche Kandidaten bleiben als bewusst ungeklärte Zweige im Vorrat, bis ein Nachweis oder eine eindeutige Beziehung vorliegt.

## Belegte manuelle Aufspaltungen und Zusammenführungen

Sieben vermischte oder fehlende Identitäten wurden anhand der lokalen Quelldaten manuell getrennt beziehungsweise ergänzt. In der ersten Bereinigungsphase wurden 35 nur bei übereinstimmendem bereinigtem Namen und Geburtsdatum erkannte Dubletten zusammengeführt. Der anschließende Vorratsabgleich führte zehn eindeutig identifizierte aktiv-/vorratsübergreifende Dubletten und weitere 34 strukturelle Dubletten innerhalb des Vorrats zusammen. Bei Letzteren stimmen vollständiger Name und derselbe eindeutige Partner überein; gleichnamige Personen ohne diesen Beziehungsanker bleiben getrennt. Fünf zunächst im Vorrat liegende Angehörige wurden dadurch eindeutig angeschlossen und aktiviert.

## Prüfhintergrund und Grenzen

Die frühen Korrekturen wurden gegen die veröffentlichte Fassung „Joseph Bodensteiner - Kuennen - Hollerbach Family History“ geprüft. Automatisch zusammengeführt wurde nur anhand strenger Identitäts- oder Beziehungsmerkmale. Ähnliche Namen, bloß gleiche Jahreszahlen oder zwei namenlose Geschwisterdatensätze bleiben getrennt. Die hypothetische Verbindung vor Joseph 1734 ist keine genealogische Tatsachenbehauptung.

## Reproduzierbare Prüfungen

```powershell
node scripts/reconcile-v5-pool.cjs stammbaum_mit_familienbuch_full_v5_bereinigt.json
node scripts/activate-connected-v5-branches.cjs stammbaum_mit_familienbuch_full_v5_bereinigt.json --check
node scripts/audit-familybook-v5.cjs
```

Der Abgleich ist idempotent: Bei einem erneuten Lauf werden bereits entfernte Dubletten übersprungen. Der Audit schlägt unter anderem bei fehlenden Referenzen, asymmetrischen Partnern, Elternzyklen, unplausiblen Elternaltern, exakten Dubletten, strukturellen Vorratsdubletten oder aktiven Koordinatenüberlagerungen fehl.

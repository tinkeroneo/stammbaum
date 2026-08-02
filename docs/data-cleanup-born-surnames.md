# Datenbereinigung: fehlerhafter Nachname „born“

Stand: 2. August 2026

## Ursache

Beim Import des englischen Familienbuch-PDFs wurden Satzanfänge wie
`He was born` und `She was born` teilweise an den Personennamen angehängt.
Die nachfolgende Namenszerlegung interpretierte dadurch `born` als Nachnamen.

## Ergebnis

Bereinigt wurden jeweils 304 Personen in:

- `familienbuch_bodensteiner_full_extension_v4.json`
- `stammbaum_mit_familienbuch_full_v4.json`
- `stammbaum_mit_familienbuch_full_v5_bereinigt.json`

Dabei wurden `name`, `firstName` und `lastName` neu aus dem bereinigten Namen
gebildet. Zwei im Namensfeld enthaltene Ortsangaben wurden in `location`
übernommen. Das nicht eindeutig zuordenbare Datum `November 18, 1967` wurde
nicht als Geburts- oder Heiratsdatum geraten, sondern als
`[Namensbereinigung]`-Hinweis in der betroffenen Notiz erhalten.

Nach der Bereinigung:

- 0 verbliebene PDF-Satzfragmente `He/She was born` in Personennamen
- 0 fehlerhafte Personen mit Nachname `born`
- 1 echter Familienname `Born`: `Michael Born` (`fbx9913`)

## Reproduzierbare Prüfung

```powershell
node scripts\clean-born-surname-artifacts.cjs --check
npx playwright test tests/born-surname-cleanup.spec.js tests/familybook-v5.spec.js --workers=1
```

Die Bereinigung kann mit folgendem Befehl erneut auf die drei lokalen
Familienbuchdateien angewendet werden; sie ist idempotent:

```powershell
node scripts\clean-born-surname-artifacts.cjs
```

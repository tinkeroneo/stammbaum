# Stammbaum

Mobile-first family tree viewer and editor. Open `index.html` in a browser to use the app. Data can be imported and exported as JSON.

## Datenschutz der veröffentlichten Fassung

- `Bodensteiner.json` ist ein vollständig synthetischer Demo-Stammbaum. Alle darin enthaltenen Namen, Daten und Beziehungen sind frei erfunden.
- Reale Stammbaumdateien im Klartext werden durch `.gitignore` vom Repository ausgeschlossen. Der optionale Remote-Privatbestand liegt ausschließlich als AES-256-GCM-Chiffretext vor; sein zufälliges Passwort wird nicht eingecheckt.
- Importierte Daten werden lokal im Browser verarbeitet. Die App enthält keine Telemetrie oder externen Datendienste.
- Der Datenschutzfilter für vermutlich lebende Personen ist beim JSON-Export standardmäßig aktiviert.
- Technische Einzelheiten stehen in [`datenschutz.html`](datenschutz.html). Betreiberangaben und eine rechtlich vollständige Datenschutzerklärung müssen für die konkrete Domain separat ergänzt werden.

## Wichtige Dateien

- `index.html` – App-Shell
- `style.css` – Layout und visuelle Gestaltung
- `app.js` / `modules/` – Anwendungslogik
- `Bodensteiner.json` – ausschließlich fiktive Demo-Daten
- `private/Bodensteiner.enc.json` – verschlüsselter Privatbestand ohne Passwort

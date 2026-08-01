# Modularchitektur ohne Frameworkwechsel

Stand: 1. August 2026

## Einstieg und Abhängigkeiten

`index.html` lädt ausschließlich `app.js` als ES-Modul. `app.js` ist der Bootstrap, importiert die App-Shell und startet die Runtime. Die Runtime orchestriert Zustand und bestehende UI-Flows; alle extrahierten Module sind Leaf-Module und importieren weder Runtime noch einander. Damit gibt es keine zyklischen Imports.

```text
index.html
  └─ app.js (Bootstrap)
       ├─ modules/app-shell.js
       └─ modules/app-runtime.js (Orchestrierung)
            ├─ data-model.js
            ├─ selectors.js
            ├─ commands.js
            ├─ persistence.js
            ├─ viewport.js
            ├─ layout.js
            ├─ render.js
            └─ dialogs.js
```

Alle Dateien liegen lokal im Repository; zum Betrieb und für Tests werden keine CDN-, API- oder sonstigen Netzwerkressourcen benötigt. Der unterstützte Offlinebetrieb erfolgt über den lokalen statischen Server (`node tests/server.cjs`), damit Browser ES-Module mit korrektem Origin und MIME-Typ laden.

## Öffentliche Schnittstellen

| Modul | Exporte | Verantwortung |
|---|---|---|
| `data-model` | `uniqueIds`, `normalizeImportedPositions`, `normalizeTreeData` | Importkompatibilität und kanonisches Personenmodell |
| `selectors` | `parseBirthValue`, `buildSearchIndex` | reine Datumsableitung und Suchindex |
| `commands` | `cloneCommandValue` | unveränderliche Command-Snapshots |
| `persistence` | `readJsonStorage`, `serializeTree` | fehlertolerantes Lesen und kompatible JSON-Serialisierung |
| `viewport` | `clampViewport` | reine Viewport-Grenzberechnung |
| `layout` | `groupRowsByTolerance` | reine Gruppierung für Generationslayout |
| `render` | `escapeHtml`, `reconcileKeyedChildren` | sicheres Markup und inkrementeller DOM-Patch |
| `dialogs` | `dialogFocusableSelector`, `dialogFocusableElements` | Fokusziele innerhalb modaler Oberflächen |
| `app-shell` | `startApp` | expliziter Abschluss des Bootstrap-Lebenszyklus |

`modules/app-runtime.js` ist absichtlich kein frei konsumierbares API-Modul. Es kapselt die noch zustandsreichen Controller und direkten DOM-Zugriffe. Weitere Extraktionen können damit pro Verantwortung erfolgen, ohne Bootstrap, Datenformat oder bestehende Flows erneut umzubauen.

## Regeln für weitere Änderungen

- Leaf-Module bleiben zustandsfrei und greifen nicht global auf das DOM zu; nur `dialogs` erhält ein konkretes Dialogelement.
- Abhängigkeiten zeigen von Runtime zu Leaf-Modulen, nie zurück.
- Neue persistierte Felder werden zuerst in `data-model` normalisiert und mit einer alten JSON-Fixture getestet.
- DOM-Patches nutzen stabile Keys über `render.reconcileKeyedChildren`.
- Der Modulgraph-Test verhindert Zyklen und ein Anwachsen des Bootstrap-Files.

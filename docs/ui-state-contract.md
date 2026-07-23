# UI State-Vertrag (Sprint 0-06)

## 1. Zweck

Dieses Dokument definiert den minimalen UI-Status-Statusvertrag für `app.js`, damit
die App stabiler getestet und inkrementell geändert werden kann.

Ziel:
- eindeutiger Zugriff auf Kernzustände,
- dokumentierte Invarianten,
- Verifikation der wichtigsten Flussübergänge.

## 2. Strukturierter Zustand

### 2.1 Datenzustand

- `data`: aktuelle Datengrundlage (`{ people, rootIds, ... }`)
- `personById`: Lookup der Personen nach `id` (`Map`)
- `nonPoolPeople`: Personen ohne `pool`
- `pooledPeopleCount`
- `persistence`
  - `hasPersistedTreeData`  
  - `persistenceMode` (`local` | `indexeddb` | `memory`)
- `workingFileHandle`: geöffnete Arbeitsdatei (optional)
- `focusMode`, `focusId`: Fokusgebiet der Ansicht
- `activeFamily`: aktiver Familienfilter

### 2.2 Viewportzustand

- `view`: `{ x, y, s }`
- `focusMode`, `focusId`
- `layoutMode` (`classic`, `tree`, `radial`)
- `compactMode`, `nameMode`
- `drag`, `pan`, `pinch`
- `selectionRect`, `selection`
- `renderVirtualizationActive`

### 2.3 Moduszustand

- `editMode` (`true` = Bearbeitungsmodus, `false` = Ansichtmodus)
- `focusMode` und `focusId`
- `compactMode`, `nameMode`, `layoutMode`
- `activeFamily`

### 2.4 Auswahlzustand

- `selected`: aktuell betroffene Person-ID (oder `null`)
- `pendingNewPos`: Platzhalter für neue Person (optional)
- `listViewMode` (`tree` | `pool`)
- `listReturnMode`
- Hilfszustände für Form-Editierung:
  - `sheetSnapshot`
  - `imageDraft`
  - `mentionsDraft`
  - `removedPartnerDraft`
  - `marriageDraft`

### 2.5 Oberflächen-/Dialogzustand

- `sheet` (`open`: Personenblatt)
- `sideNav` (Navigator)
- `searchSheet`
- `birthdaySheet`
- `scrollSheet`
- `checkSheet`
- `listSheet`
- `fileMenu`
- `settingsMenu`

Weitere UI-Layer:
- `backdrop`

### 2.6 Persistenzzustand

- `persistenceMode`
- `hasPersistedTreeData`
- `workingFileHandle`
- `busyDepth` (Busy-Indikator aktiv/pausiert)
- `persistenceNoticeShown`

### 2.7 Startup-Entscheidung (S1-01)

- Eingangssignale: `hasWorkingFile`, `hasLocalSnapshot`, `hasIndexedDbSnapshot`, `hasDemoData`, `hasStorageFailure`.
- Präzedenz:
  - `working-file`
  - `returning-local` (bei lokalem oder IndexedDB-Snapshot)
  - `memory-only` (nur bei Fehlerzuständen ohne validen Snapshot)
  - `demo` (wenn Demo-Daten geladen wurden)
  - `first-visit` (sonst)

`computeStartupStateFromSignals(signals)` liefert deterministisch einen dieser fünf Werte, ohne DOM- oder Seiteneffektzugriffe.

## 3. Zentrale Zugriffsschicht

### 3.1 `uiState` (bestehender Code)

`app.js` besitzt ab jetzt einen zentralen, nicht-mutierenden Zugriff:

- `uiState.data`
- `uiState.viewport`
- `uiState.mode`
- `uiState.selection`
- `uiState.surfaces`
- `uiState.persistence`

`uiState` liest ausschließlich bestehende Variablen und erzeugt keine Seiteneffekte.

### 3.2 Hilfsfunktionen

- `isUiSurfaceOpen(id)`: prüft, ob ein UI-Overlay die Klasse `open` trägt.
- `uiInvariants()`: liefert Kerninvarianten als Prüfdaten.

## 4. Invarianten

Folgende Invarianten gelten:

1. **Einzelner Overlay-Typ offen**
   - Nicht mehr als ein Overlay/Dienstoberfläche ist `open` zugleich.
2. **Auswahlkonsistenz**
   - `selected` ist entweder leer oder referenziert eine bestehende Person (`person(selected)`).
3. **Sheet-Selection**
   - Ist das Personenblatt offen, ist `selected` gesetzt (oder wird durch Öffnen/Schließen kontrolliert).
4. **Persistenzkonsistenz**
   - `persistenceMode` `memory` nur als Notbetrieb, ansonsten wird ein Datenspeicher (localStorage/indexedDB/Arbeitsdatei) geführt.
5. **Wurzel-Limit**
   - Es werden maximal zwei Hauptwurzeln gehalten (`rootIds.length <= 2`).

## 5. Übergänge (nicht-blockierende Anforderungen)

- `Moduswechsel`: Editiermodus kann getoggelt werden; bei offenem Sheet bleibt die Selektionsbasis erhalten.
- `Suche → Detail → Zurück`: Suche öffnet Personenansicht; Schließen stellt den Basisfluss wieder her.
- `Liste → Detail → Zurück`: Listeneditor öffnet Personen, Rückkehr geht über bestehende Rücksprunglogik ohne Datenverlust.

## 6. Offene Ausnahmen (nicht im Zielumfang von S0-06)

- Keine vollständige Datenmodell-/Renderer-Migration.
- Keine Verlagerung in ein State-Management-Modul.
- Kein vollständiger Dialog-Manager (nur Basisschicht für Zustandseinblick).

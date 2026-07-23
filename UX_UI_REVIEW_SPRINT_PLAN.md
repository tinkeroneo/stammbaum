# UX/UI-Experten- und Architektur-Review: Stammbaum

Stand: 15. Juli 2026  
Ziel: Vom funktionsreichen Werkzeug zu einer verständlichen, sicheren und auf Mobilgeräten souverän bedienbaren Stammbaum-App.  
Umfang: Heuristisches UX-Review, visuelle Desktop-/Mobile-Prüfung, statische Code- und Datenanalyse sowie ein kleinteiliger Umsetzungsplan für GPT-SPARK.

## 1. Kurzfazit

Die App hat bereits ungewöhnlich viel fachliche Tiefe: Baum- und Radiallayout, Fokusansicht, Suche, Listeneditor, Personenvorrat, Datenprüfung, Geburtstagssicht, Import/Export, lokale Persistenz und Bildexport. Das Kernproblem ist deshalb nicht ein Mangel an Funktionen, sondern deren Präsentation.

Die wichtigsten Entscheidungen für die nächste Version sind:

1. Der Baum bleibt die visuelle Hauptfläche, erhält aber eine klarere App-Shell mit vier verständlichen Hauptzielen: **Start**, **Suchen**, **Personen**, **Mehr**.
2. Der Einstieg wird zustandsabhängig: **letzten Baum fortsetzen**, **Datei öffnen**, **neuen Baum anlegen** oder **Demo ansehen**. Persönliche Beispieldaten werden nicht mehr kommentarlos geladen.
3. Ansehen und Bearbeiten werden deutlicher getrennt. Im Ansichtsmodus öffnet eine kompakte Personendetailansicht; Bearbeiten ist eine bewusste Aktion mit sichtbarem Speicherstatus.
4. Auf Mobilgeräten wird Orientierung vor Informationsdichte priorisiert: Fokus auf eine Person, sichtbare Positionsanzeige, ein erreichbarer Überblick und keine abgeschnittenen Karten ohne Hinweis.
5. Änderungen werden sicher: Rückgängig/Wiederholen, nachvollziehbare Löschfolgen, Inline-Validierung und ein sichtbarer Persistenzstatus.
6. Die Oberfläche bekommt ein kleines Designsystem. Weniger Schatten, weniger gleichgewichtige Pillen, verständliche SVG-Symbole mit Textlabels und kontraststarke Aktionsfarben.

## 2. Review-Grundlage und Grenzen

Geprüft wurden:

- `index.html` als Informationsarchitektur und Dialogstruktur,
- `style.css` als Responsive- und Designsystem-Grundlage,
- `app.js` mit rund 4.500 Zeilen als Zustands-, Rendering-, Persistenz- und Interaktionsschicht,
- der Default-Datensatz `Bodensteiner.json` mit 385 Personen,
- ein statischer Startzustand bei 1440 × 900 px und 390 × 844 px.

Visuelle Referenzen:

![Desktop-Startzustand](ux-review-desktop.png)

![Mobiler Startzustand](ux-review-mobile.png)

Die Screenshots zeigen den eingebauten Fallback-Datensatz. Das ist selbst ein Befund: Die README fordert zum direkten Öffnen von `index.html` auf, während der echte Default-Datensatz per `fetch()` geladen wird. Unter `file://` fällt die App dadurch auf die Demo zurück. Ein echter Touch-, Screenreader- und Fokus-Trap-Test bleibt Teil des Sprint-Plans.

## 3. Bestandsaufnahme

### 3.1 Was bereits gut ist

- Die Baumdarstellung ist warm, eigenständig und emotional passender als ein nüchternes Admin-UI.
- Karten zeigen Personen, Paare, Generationen und Beziehungen auf einen Blick.
- Der Ansichtsmodus ist standardmäßig aktiv; Bearbeitungsfunktionen werden bereits teilweise ausgeblendet.
- Touchgesten, Zoom, Pan, Tastatur-Zoom und Pfeiltasten sind grundsätzlich vorhanden.
- Suche, Listenansicht und Fokusmodus bieten bereits drei Wege durch große Datenmengen.
- `localStorage`, IndexedDB und eine optionale Arbeitsdatei bilden eine solide technische Persistenzbasis.
- Formulare besitzen Labels und viele Buttons besitzen `aria-label`.
- Fokusumrisse sind vorhanden.
- Die App reagiert auf kleine Displays mit Sheets statt Desktop-Seitenleisten.

### 3.2 Datenrealität

Der mitgelieferte Datensatz enthält:

- 385 Personen,
- 292 Personen mit Geburtsangabe,
- 70 Personen mit Sterbeangabe,
- 264 Personen mit mindestens einem Elternbezug,
- 18 Personen im Vorrat,
- nur eine Person mit Bild,
- keine als Hauptwurzel markierte Person.

Diese Realität ist wichtig: Die App darf nicht so gestaltet werden, als bestünde ein typischer Baum aus fünf vollständig gepflegten Karten. Fehlende Daten, mehrere Familienzweige, gleiche Namen, unvollständige Beziehungen und große Distanzen sind Normalzustand.

## 4. Heuristische Bewertung

Die Skala ist eine fachliche Heuristik von 1 (kritisch) bis 5 (sehr gut), keine gemessene Nutzerstudie.

| Bereich | Wert | Begründung |
|---|---:|---|
| Fachliche Funktionen | 4,5 | Sehr breites Funktionsangebot und brauchbare Genealogie-Werkzeuge. |
| Ersteinstieg | 1,5 | Keine Auswahl, kein Zielbild, technischer Hinweis statt Orientierung. |
| Navigation/Auffindbarkeit | 2,0 | Viele unbeschriftete Symbole mit gleicher visueller Priorität. |
| Mobile Orientierung | 2,0 | Übersichtskarte wird entfernt; Karten können außerhalb des Sichtbereichs liegen. |
| Lesbarkeit/visuelle Hierarchie | 3,0 | Sympathische Basis, aber zu viele Schatten, Pillen und sehr kleine Sekundärtexte. |
| Bearbeitungssicherheit | 2,0 | Kein Undo/Redo, viele Browser-Dialoge, Speicherstatus nicht sichtbar. |
| Barrierefreiheit | 2,0 | Gute Ansätze, aber Dialogrollen, Fokusführung, Reduktion von Bewegung und semantische Navigation fehlen. |
| Technische UI-Architektur | 2,0 | Monolithische Zustands- und Renderinglogik erschwert sichere UX-Änderungen. |

## 5. Priorisierte Befunde

### F-01 · P0 · Einstieg erklärt weder Zustand noch nächstes Ziel

**Beobachtung:** Der Start zeigt sofort einen Baum, einen kurzlebigen technischen Tipp und Symbole. Der Hinweis verschwindet nach acht Sekunden (`app.js:4531`). Der reale Datensatz besitzt keine Hauptwurzel; `preferredLandingPersonId()` wählt dann eine technisch plausible Person statt einer vom Nutzer verstandenen Startperson (`app.js:1504`).

**Risiko:** Neue Nutzer wissen nicht, ob sie eine Demo, ihre Daten oder eine veröffentlichte Familienansicht sehen. Wiederkehrende Nutzer erkennen nicht, ob ihr letzter Stand sicher gespeichert wurde.

**Zielbild:** Zustandsabhängiger Einstieg mit klarer Primäraktion und sichtbarem Baum-/Speicherstatus.

### F-02 · P0 · Die Steuerung folgt Funktionen statt Nutzerzielen

**Beobachtung:** Die untere Leiste enthält bis zu elf gleichgewichtige Symbolbuttons (`index.html:62–80`). Nur „Fokus“ trägt sichtbaren Text. Unicode-Zeichen wie `◫`, `⌕`, `☰`, `⎇`, `⊙` und `◎` müssen gelernt werden.

**Risiko:** Hohe Erkennungs- und Entscheidungslast, schlechte Wiederauffindbarkeit und uneinheitliche Darstellung je Betriebssystemschrift.

**Zielbild:** Vier stabile Hauptziele; seltene Funktionen gruppiert in „Mehr“; kontextuelle Aktionen an der ausgewählten Person.

### F-03 · P0 · Mobile Orientierung bricht bei breiten oder großen Bäumen

**Beobachtung:** Auf Mobilgeräten wird die Minimap ausgeblendet (`style.css:256`). Im geprüften 390-px-Zustand liegt bereits eine Kinderkarte teilweise außerhalb des sichtbaren Bereichs. `fit()` begrenzt bei mehr als zwölf Personen den Zoom auf mindestens `0.42` (`app.js:2164–2176`); dadurch kann „Anpassen“ große Bäume absichtlich nicht vollständig zeigen, ohne diesen Kompromiss zu erklären.

**Risiko:** Nutzer verlieren ihre Position, interpretieren abgeschnittene Äste als fehlende Daten oder wissen nicht, in welche Richtung sie weiterwischen müssen.

**Zielbild:** Mobile Fokusansicht als Standard, kompakter Überblick auf Abruf, Richtungsindikatoren für Inhalte außerhalb des Viewports und zwei getrennte Befehle „Lesbar zentrieren“ und „Gesamten Baum zeigen“.

### F-04 · P0 · Bearbeitung ist mächtig, aber nicht ausreichend fehlertolerant

**Beobachtung:** Änderungen werden direkt persistiert; Zweige können verschoben, Beziehungen geändert und Personen gelöscht werden. Es gibt kein Undo/Redo. Kritische Abläufe verwenden `alert()`, `confirm()` und `prompt()` (`app.js:3292–3660`, `app.js:4347–4505`).

**Risiko:** Fehlbedienungen sind schwer rückgängig zu machen. Browserdialoge erklären Konsequenzen schlecht und sind visuell nicht in den Arbeitsfluss integriert.

**Zielbild:** Command-basierte Mutationen mit Undo/Redo, konkrete Folgen in App-Dialogen und ein sichtbarer „Gespeichert/ungespeichert/Fehler“-Status.

### F-05 · P1 · Ansichts- und Bearbeitungsmodus sind semantisch nicht klar genug

**Beobachtung:** Der Modusschalter ist zunächst nur ein grüner Stift, im Bearbeitungsmodus ein Auge (`app.js:1383`). Die Bedeutung des grünen Zustands ist ohne Tooltip nicht sichtbar. Personenkarten öffnen in beiden Modi dasselbe große Sheet; Felder werden im Ansichtsmodus nur versteckt.

**Risiko:** Nutzer können Modus, aktuellen Zustand und Konsequenzen einer Aktion verwechseln.

**Zielbild:** Beschrifteter Umschalter „Ansehen | Bearbeiten“ und getrennte, auf ihren Zweck zugeschnittene Detail- und Bearbeitungsansichten.

### F-06 · P1 · Dialog- und Fokusarchitektur ist unvollständig

**Beobachtung:** Nur Personen- und Listen-Sheet besitzen `role="dialog"`; die fünf seitlichen Sheets sind einfache `aside`-Elemente (`index.html:106–145`). `aria-labelledby` fehlt. Beim Öffnen wird nur bei Suche, Navigator und Liste verzögert fokussiert; ein Fokus-Trap und eine Rückgabe zum Auslöser fehlen (`app.js:3493–3772`).

**Risiko:** Tastatur- und Screenreader-Nutzer können hinter einem Modal weiter navigieren oder verlieren nach dem Schließen ihre Position.

**Zielbild:** Ein zentraler Dialogmanager mit Rolle, Label, Initialfokus, Fokus-Trap, Escape-Verhalten und Fokus-Rückgabe.

### F-07 · P1 · Farb- und Formhierarchie ist sympathisch, aber zu weich

**Beobachtung:** Nahezu jede Aktion ist eine weiße Pille mit Schatten. Karten, Menüs, Buttons und Hinweise konkurrieren über Schatten statt über klare Ebenen. Weiß auf dem aktuellen Grün `#6B8F71` erreicht etwa 3,63:1 und ist für normalen Buttontext zu schwach.

**Risiko:** Primäraktionen heben sich wenig ab; auf hellen Displays verschwimmen Grenzen; Kontrastanforderungen werden verfehlt.

**Zielbild:** Weniger Schatten, klare Oberflächenstufen, ein dunkleres Aktionsgrün `#476A50` (etwa 6,10:1 zu Weiß), neutrale Sekundärbuttons und Farbe nie als einziges Beziehungssignal.

### F-08 · P1 · Statusfeedback bleibt technisch und reaktiv

**Beobachtung:** Die Persistenz ist technisch robust, aber der Nutzer sieht nicht dauerhaft, ob in `localStorage`, IndexedDB, einer Arbeitsdatei oder nur im Speicher gearbeitet wird (`app.js:400–486`). Erst im Problemfall erscheint ein langer Alert.

**Risiko:** Nutzer überschätzen Datensicherheit oder exportieren unnötig oft.

**Zielbild:** Kompakter Status im Header: „Gespeichert“, „Speichert …“, „Nur in diesem Browser“, „Arbeitsdatei verbunden“ oder „Speicherfehler – sichern“.

### F-09 · P1 · Die technische Struktur erhöht UX-Risiko

**Beobachtung:** Daten, Viewport, Dialogzustände, Formulare, Layoutalgorithmen, Persistenz und Events liegen in einer IIFE in `app.js`. `render()` leert Karten und Linien vollständig (`app.js:1715–1742`). Virtualisierung beginnt erst ab 900 Personen (`app.js:2192`).

**Risiko:** Kleine UI-Änderungen können unerwartet Fokus, Auswahl, Viewport oder Persistenz beeinflussen. Regressionen sind ohne Tests schwer sichtbar.

**Zielbild:** Expliziter App-State, Command-Schicht, getrennte Renderer und automatisierte Kernfluss-Tests. Kein Frameworkwechsel als Selbstzweck.

### F-10 · P1 · Datenschutz ist für Familieninhalte nicht sichtbar genug

**Beobachtung:** Bilder und persönliche Lebensdaten können exportiert werden; der Export fragt nur nach Bildern. Es gibt keinen sichtbaren Privatsphäre-Modus für lebende Personen und keine Zusammenfassung des Exportumfangs.

**Risiko:** Nutzer teilen versehentlich sensible Angaben.

**Zielbild:** Exportvorschau, Option „Daten vermutlich lebender Personen reduzieren“ und klare Anzeige, ob Bilder/Notizen/Quellen enthalten sind.

## 6. Ziel-Informationsarchitektur

### 6.1 App-Shell

**Header**

- Zeile 1: Baumname, optionaler Familienname und Speicherstatus.
- Rechts: beschrifteter Modusschalter „Ansehen | Bearbeiten“.
- Überlaufmenü nur für Datei, Export, Einstellungen und Hilfe.

**Primärnavigation auf Mobilgeräten**

1. **Start** – ausgewählte Hauptperson/Fokus und „Ansicht zentrieren“.
2. **Suchen** – globale Personensuche; sofortiger Fokus im Suchfeld.
3. **Personen** – Liste, Sortierung, Vorrat als Filter.
4. **Mehr** – Geburtstage, Datenprüfung, Ansicht/Layout, Import/Export, Einstellungen.

Jeder Eintrag bekommt SVG-Icon plus sichtbares Textlabel. Der aktive Bereich erhält neben Farbe auch Form/Füllung und `aria-current`.

**Desktop**

- Dieselben vier Ziele als kompakte linke Rail oder beschriftete untere Leiste.
- Zoomsteuerung bleibt am Canvas.
- Personendetails erscheinen rechts; Baum bleibt sichtbar.

### 6.2 Kontextaktionen

Nach Auswahl einer Person:

- Primär: „Details ansehen“ oder im Bearbeitungsmodus „Person bearbeiten“.
- Sekundär: „Fokus“, „Kind hinzufügen“, „Partnerperson hinzufügen“, „Eltern hinzufügen“.
- Diese Aktionen gehören in die Personenansicht, nicht dauerhaft in die globale Toolbar.

### 6.3 „Mehr“-Struktur

- **Daten:** Öffnen, Importieren, Exportieren, JSON kopieren, Arbeitsdatei.
- **Prüfen:** Datenprüfung, unvollständige Personen, mögliche Dubletten.
- **Ansicht:** Klassisch/Baum/Radial, Detailgrad, Zweige ein-/ausklappen.
- **Entdecken:** Geburtstage, Familienzweige, Scrollansicht.
- **Hilfe:** Kurzanleitung, Tastatur/Gesten, Datenschutz.

## 7. Ziel-Einstieg

### 7.1 Erstbesuch

Eine ruhige Startkarte über dem leeren Canvas:

- Überschrift: „Deine Familiengeschichte auf einen Blick“.
- Primäraktion: „Bestehenden Stammbaum öffnen“.
- Sekundäraktion: „Neuen Stammbaum anlegen“.
- Tertiäraktion: „Demo ansehen“.
- Kurzhinweis: „Die Daten bleiben standardmäßig auf diesem Gerät.“

### 7.2 Wiederkehrender Besuch

- Baumname, Personenzahl und Zeitpunkt der letzten lokalen Speicherung anzeigen.
- Primär: „Weiterarbeiten“.
- Sekundär: „Andere Datei öffnen“.
- Bei rein flüchtigem Speicher gelbe Warnung vor dem Eintritt, nicht erst nach einem Fehler.

### 7.3 Nach dem Laden

1. Wenn eine Hauptwurzel existiert: auf sie zentrieren.
2. Wenn keine Hauptwurzel existiert: eine kurze Auswahl „Mit wem soll der Baum starten?“ anzeigen.
3. Danach höchstens drei kontextuelle Hinweise: bewegen/zoomen, Person suchen, Bearbeiten aktivieren.
4. Hinweise bleiben über „Hilfe“ erneut erreichbar und verschwinden nicht ausschließlich zeitgesteuert.

## 8. Ziel-Designsystem

### 8.1 Farbrollen

| Token | Vorschlag | Zweck |
|---|---|---|
| `--canvas` | `#F7F4EE` | ruhige Baumfläche |
| `--surface-1` | `#FFFCF6` | Karten, Sheets |
| `--surface-2` | `#F1E9DE` | Sekundärflächen |
| `--text` | `#2F2A24` | Haupttext |
| `--text-muted` | `#6F675F` | Sekundärtext mit ausreichendem Kontrast |
| `--primary` | `#476A50` | Primäraktion, aktiver Modus |
| `--accent` | `#9A5636` | besondere, nicht destruktive Hervorhebung |
| `--danger` | `#B84A3D` | destruktive Aktion |
| `--focus` | `#255B86` | Fokusindikator, unabhängig von Familienfarben |

Familienfarben bleiben für Zuordnung erhalten, werden aber nur als Rand/Marker genutzt und immer durch Namen, Initialen oder Beziehungstext ergänzt.

### 8.2 Typografie und Dichte

- Fließ- und Buttontext mindestens 14 px.
- Hilfstext mindestens 12 px und nicht heller als `--text-muted`.
- Personenkarten: Name 14–15 px/700, Lebensdaten 12 px, maximal zwei Textzeilen.
- Interaktive Ziele mindestens 44 × 44 CSS-Pixel.
- Mobile Kartenbreite in lesbarer Fokusansicht 156–176 px; Paarkarten dürfen nicht ohne Offscreen-Hinweis abgeschnitten werden.

### 8.3 Form und Bewegung

- Nur schwebende Ebenen erhalten großen Schatten; Standardbuttons erhalten keinen Dauerschatten.
- Primärbuttons gefüllt, Sekundärbuttons mit ruhigem Rand, Tertiäraktionen als Textbutton.
- Einheitlicher Radius: 12 px Kontrollen, 16 px Karten, 20 px große Sheets.
- Animationen 160–220 ms; bei `prefers-reduced-motion: reduce` ohne Transformation/Puls.

## 9. Funktionszielbild

### Muss in den nächsten Sprints

- Zustandsabhängiger Einstieg.
- Neu strukturierte Hauptnavigation mit Labels.
- Mobile Orientierung und explizite Fit-Modi.
- Sichtbarer Speicherstatus.
- Detailansicht getrennt vom Bearbeitungsformular.
- Inline-Validierung und verständliche Konsequenzdialoge.
- Undo/Redo für Datenmutationen und Positionsänderungen.
- Vollständige Dialog-/Fokusarchitektur.
- Kontrast- und Reduced-Motion-Korrekturen.
- Smoke-Tests für Öffnen, Suchen, Ansehen, Bearbeiten, Rückgängig, Import und Export.

### Danach sinnvoll

- Privatsphäre-Modus für lebende Personen.
- Geführte Dubletten-Zusammenführung.
- Quellenqualität und Ereignis-Timeline.
- Teilbarer Nur-Lese-Export.
- Personalisierbarer Startfokus pro Baum.

### Nicht jetzt

- Frameworkwechsel.
- Nutzerkonto/Cloud-Synchronisation ohne eigenes Sicherheits- und Datenschutzkonzept.
- KI-generierte genealogische Beziehungen ohne überprüfbare Quellen.

## 10. Modellklassen für die Umsetzung

### `[SPARK]`

Geeignet für klar begrenzte Änderungen an einem bis drei Dateien, wenn Markup, Text, Zustände und Akzeptanzkriterien bereits feststehen. Pro Lauf genau eine Aufgabe ausführen.

### `[NICHT-SPARK · SOL-HIGH]`

Für zusammenhängende Zustands-, Rendering-, Persistenz- oder Datenmodelländerungen sowie für erneute Produkt-/UX-Entscheidungen nach Nutzertests. Empfohlen: **GPT-5.6 Sol mit High oder Extra High**. Das aktuelle Codex-Handbuch beschreibt Sol als Wahl für komplexe, offene und hochwertige Aufgaben. GPT-5.3-Codex-Spark ist dagegen ein separates, schnelles und weniger leistungsfähiges Preview-Modell für enge Iterationen. Siehe auch die [OpenAI-Modellübersicht](https://developers.openai.com/api/docs/models).

## 11. Arbeitsregeln für GPT-SPARK

Jeder Spark-Lauf erhält genau eine Aufgaben-ID und diese Regeln:

1. Nur die in der Aufgabe genannten Dateien und direkt benötigte Tests ändern.
2. Keine neue Bibliothek und kein Framework ohne ausdrückliche Freigabe.
3. Bestehende Datenformate abwärtskompatibel halten.
4. Deutsche UI-Texte verwenden; keine unbeschrifteten neuen Unicode-Symbole.
5. Jeden interaktiven Zustand für Maus, Touch und Tastatur abdecken.
6. Bei Dialogen Fokus und Escape berücksichtigen.
7. Nach Abschluss die angegebenen Akzeptanzkriterien einzeln prüfen.
8. Wenn eine Aufgabe eine nicht beschriebene Zustands- oder Datenmodellentscheidung erfordert: stoppen und an `SOL-HIGH` eskalieren.
9. Keine Aufgabe „nebenbei“ refaktorieren.
10. Im Abschlussbericht nennen: geänderte Dateien, bestandene Checks, offene Abweichungen.

## 12. Sprint-Plan

Die Dauerannahmen beziehen sich auf konzentrierte Implementierungszeit. Sprint 0 ist als kurze Grundlagenwoche gedacht; die Sprints 1–4 sind thematische Zwei-Wochen-Sprints für eine implementierende Instanz mit Review. Bei geringerer Kapazität wird ein Sprint geteilt, ohne Aufgaben parallel auszuführen. Aufgaben innerhalb eines Sprints werden in der angegebenen Reihenfolge abgearbeitet.

---

# Sprint 0 · Sicherheitsnetz und UI-Grundlage

**Sprintziel:** Veränderungen messbar und risikoarm machen. Noch keine große Navigation umstellen.

## S0-01 · Baseline-Flows dokumentieren `[SPARK]` · 0,5 Tag

**Abhängigkeit:** keine  
**Dateien:** neu `docs/ux-baseline.md`, optional Screenshot-Ordner

**Umsetzung:**

- Dokumentiere die Flows: App öffnen, Person suchen, Person ansehen, Bearbeiten aktivieren, Person speichern, JSON importieren, JSON exportieren.
- Halte für 390 × 844, 768 × 1024 und 1440 × 900 jeweils Startzustand und geöffnetes Personen-Sheet fest.
- Notiere sichtbare Browserdialoge und Fokuspositionen.

**Akzeptanz:** Alle sieben Flows haben Ausgangszustand, Aktionen, erwartetes Ergebnis und Screenshotreferenz. Keine Produktdatei wurde geändert.

**Test:** Dokument gegen die aktuelle App einmal vollständig durchgehen.

## S0-02 · Testbare UI-Selektoren ergänzen `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S0-01  
**Dateien:** `index.html`, `app.js`

**Umsetzung:**

- Ergänze stabile `data-testid` nur für App-Shell, Hauptnavigation, Speicherstatus, Dialoge, Suchergebnisse und Personenkarte.
- Verwende fachliche Namen wie `app-mode-toggle`, `person-search`, `person-dialog`.
- Bestehende IDs und Styles nicht umbenennen.

**Akzeptanz:** Jeder Baseline-Flow kann ohne CSS-Klassen oder sichtbare Symbolzeichen lokalisiert werden. Keine doppelte Test-ID.

**Test:** Mit `rg "data-testid"` auf Eindeutigkeit prüfen; App visuell unverändert.

## S0-03 · Smoke-Test-Grundgerüst `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S0-02  
**Dateien:** Testkonfiguration, `tests/` oder vorhandene äquivalente Struktur

**Umsetzung:**

- Wähle die kleinste zum statischen Projekt passende Browser-Testlösung.
- Automatisiere Laden, Suche, Personendetail, Moduswechsel und Speichern einer neu angelegten Testperson.
- Testdaten isolieren; echten `Bodensteiner.json` nicht verändern.
- Tests müssen mit lokalem Server laufen, nicht über `file://`.

**Akzeptanz:** Ein dokumentierter Befehl führt alle Smoke-Tests reproduzierbar aus; Tests hinterlassen weder LocalStorage noch geänderte JSON-Dateien im Repo.

**Test:** Testlauf zweimal nacheinander; beide Läufe grün.

## S0-04 · Design-Tokens normalisieren `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S0-01  
**Dateien:** `style.css`

**Umsetzung:**

- Ersetze Farbdirektwerte schrittweise durch die Tokens aus Abschnitt 8.1.
- Setze `--primary: #476A50`, `--focus: #255B86` und getrennte Surface-Tokens.
- Familienfarben und Linienfarben nicht semantisch verändern.
- Entferne noch keine Komponentenstyles.

**Akzeptanz:** Primärbutton mit weißem Text erreicht mindestens 4,5:1; Fokusfarbe ist unabhängig von Familienfarben; Startansicht bleibt strukturell gleich.

**Test:** Desktop/Mobile-Screenshotvergleich und Kontrastprüfung für Primär-, Danger- und Muted-Text.

## S0-05 · Bewegungsreduktion `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S0-04  
**Dateien:** `style.css`

**Umsetzung:**

- Ergänze `@media (prefers-reduced-motion: reduce)`.
- Deaktiviere Spotlight-Puls, Spinnerrotation und transformbasierte Sheet-Animationen oder reduziere sie auf sofortige Zustandswechsel.
- Funktionale Zustände müssen weiterhin sichtbar sein.

**Akzeptanz:** Bei reduzierter Bewegung gibt es keine pulsierende Person und keine gleitenden Sheets; Busy-Zustand bleibt durch Text erkennbar.

**Test:** Betriebssystem-/DevTools-Einstellung wechseln und Suche, Sheet und Busy-Indikator prüfen.

## S0-06 · UI-State-Vertrag definieren `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S0-03  
**Dateien:** neu `docs/ui-state-contract.md`, anschließend gezielte Teile von `app.js`

**Umsetzung:**

- Dokumentiere getrennt: Datenzustand, Viewportzustand, Modus, Auswahl, aktive Oberfläche/Dialog, Persistenzstatus.
- Lege Invarianten fest: höchstens ein Modal, Auswahl darf unabhängig vom offenen Dialog bestehen, Moduswechsel verliert keine ungespeicherten Daten, Rendern ändert keinen Datenzustand.
- Führe zunächst nur einen zentralen `uiState`-Container oder äquivalente Getter ein; keine Komplettmigration.

**Akzeptanz:** Invarianten sind testbar; vorhandene Smoke-Tests bleiben grün; keine Datenformatänderung.

**Test:** Moduswechsel, Suche→Detail→Zurück und Liste→Detail→Zurück.

---

# Sprint 1 · Einstieg und globale Navigation

**Sprintziel:** Ein Nutzer versteht in höchstens zehn Sekunden, welchen Baum er sieht und welche vier Hauptwege existieren.

## S1-01 · Startzustände als reine Entscheidungsfunktion `[NICHT-SPARK · SOL-HIGH]` · 0,75 Tag

**Abhängigkeit:** S0-06  
**Dateien:** `app.js`, Tests

**Umsetzung:**

- Implementiere eine reine Funktion für `first-visit`, `returning-local`, `working-file`, `demo`, `memory-only`.
- Eingaben sind nur Persistenzsignale; DOM-Zugriffe bleiben außerhalb.
- Füge Unit-Tests für jeden Zustand hinzu.

**Akzeptanz:** Jeder Zustand ist deterministisch; fehlgeschlagenes IndexedDB wird nicht als sicher gespeichert dargestellt.

**Test:** Alle Zustandskombinationen als Tabelle testen.

## S1-02 · Welcome-Surface-Markup `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-01  
**Dateien:** `index.html`, `style.css`

**Umsetzung:**

- Baue eine semantische Startkarte mit Überschrift, Erklärung und den drei Aktionen „Bestehenden Stammbaum öffnen“, „Neuen Stammbaum anlegen“, „Demo ansehen“.
- Ergänze den lokalen Datenschutzhinweis.
- Verwende echte Buttons, sichtbare Labels und ein beschriftetes Modal/Overlay.

**Akzeptanz:** Reihenfolge und Texte entsprechen Abschnitt 7.1; alle Aktionen sind per Tab erreichbar; 320 px ohne horizontales Scrollen.

**Test:** 320, 390, 768 und 1440 px; Screenreadername der Startkarte prüfen.

## S1-03 · Welcome-Surface verdrahten `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-02  
**Dateien:** `app.js`

**Umsetzung:**

- Zeige die Startkarte nur bei `first-visit`.
- „Öffnen“ nutzt den vorhandenen Import/Arbeitsdatei-Flow.
- „Neu“ startet mit leerem Datensatz und öffnet die Hauptpersonenerfassung.
- „Demo“ lädt ausschließlich den eingebauten kleinen Fallback-Datensatz.

**Akzeptanz:** Keine Aktion lädt still `Bodensteiner.json`; Abbruch eines Dateidialogs lässt die Startkarte offen; Demo ist sichtbar als „Demo“ gekennzeichnet.

**Test:** Drei Aktionen einzeln in frischem Browserprofil.

## S1-04 · Wiederkehrer-Karte `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-01, S1-02  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Zeige Baumname/Fallbackname, Personenzahl, letzte Speicherung und Speichertyp.
- Aktionen: „Weiterarbeiten“ und „Andere Datei öffnen“.
- `memory-only` zeigt vor „Weiterarbeiten“ eine Warnung mit Exportaktion.

**Akzeptanz:** Status wird nicht nur über Farbe vermittelt; Zeitangabe ist verständlich; Warnung verhindert das Weiterarbeiten nicht.

**Test:** Zustände `returning-local`, `working-file`, `memory-only` simulieren.

## S1-05 · Baumname und Speicherstatus im Header `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-04  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Ersetze den alleinigen Titel durch Baumname plus kompakte Statuszeile.
- Statuswerte: „Gespeichert“, „Speichert …“, „Nur in diesem Browser“, „Arbeitsdatei verbunden“, „Sichern erforderlich“.
- Statuscontainer erhält `aria-live="polite"`, ohne jede Eingabe einzeln anzusagen.

**Akzeptanz:** Statuswechsel erfolgt nach realem Persistenzergebnis; Fehlerzustand enthält eine erreichbare Sicherungsaktion; Header bleibt bei 320 px stabil.

**Test:** Speichern, künstlicher Speicherfehler, Arbeitsdatei, Mobile.

## S1-06 · Hauptnavigation-Markup `[SPARK]` · 1 Tag

**Abhängigkeit:** S0-04  
**Dateien:** `index.html`, `style.css`

**Umsetzung:**

- Ersetze die horizontale Symbolmenge durch vier Buttons: Start, Suchen, Personen, Mehr.
- Nutze einheitliche lokale SVG-Icons mit `aria-hidden="true"` plus sichtbare Textlabels.
- Nutze `nav` mit verständlichem `aria-label` und `aria-current` für den aktiven Bereich.

**Akzeptanz:** Alle vier Ziele sind bei 320 px gleichzeitig sichtbar; Mindestziel 44 × 44 px; kein horizontales Scrollen; keine Emoji-/Fontabhängigkeit.

**Test:** 320/390/768/1440 px und 200 % Textzoom.

## S1-07 · Hauptnavigation verdrahten `[SPARK]` · 1 Tag

**Abhängigkeit:** S1-06  
**Dateien:** `app.js`

**Umsetzung:**

- Start zentriert auf Fokus-/Hauptperson und schließt offene sekundäre Oberflächen.
- Suchen öffnet die vorhandene Suche und fokussiert das Eingabefeld.
- Personen öffnet den Listeneditor im normalen Modus.
- Mehr öffnet ein neues gruppiertes Sheet; keine alte Funktion entfernen.

**Akzeptanz:** Höchstens eine Oberfläche offen; aktiver Zustand korrekt; Schließen gibt Fokus an den auslösenden Navigationsbutton zurück.

**Test:** Alle vier Ziele per Maus und Tastatur; Escape; wiederholtes Antippen.

## S1-08 · „Mehr“-Sheet strukturieren `[SPARK]` · 1 Tag

**Abhängigkeit:** S1-07  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Gruppiere bestehende Funktionen exakt nach Abschnitt 6.3.
- Jeder Eintrag erhält Text, optional kurze Erklärung und ein konsistentes SVG-Icon.
- Bearbeitungsfunktionen sind im Ansichtsmodus sichtbar erklärt oder sauber verborgen; keine leeren Gruppen.

**Akzeptanz:** Jede bisherige Toolbar-/Datei-/Einstellungsfunktion ist genau einmal erreichbar; Gruppenüberschriften sind semantisch; Sheet scrollt intern.

**Test:** Funktionsinventar gegen alte IDs prüfen; Mobile mit 200 % Textzoom.

## S1-09 · Modusschalter beschriften `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S1-05  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Ersetze Stift/Auge durch einen beschrifteten Umschalter „Ansehen | Bearbeiten“.
- Nutze `aria-pressed` oder Radiogruppen-Semantik konsistent, nicht beides.
- Bei ungespeicherten Änderungen bleibt die bestehende Abbruchlogik erhalten.

**Akzeptanz:** Aktiver Modus ist ohne Farbe verständlich; 320 px zeigt mindestens den aktiven Text; Screenreader sagt Zustand an.

**Test:** Beide Modi, Tastaturaktivierung, offenes Formular mit Änderungen.

## S1-10 · Startwurzel-Auswahl `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S1-03, S1-07  
**Dateien:** `app.js`, `index.html`, Tests

**Umsetzung:**

- Wenn kein `rootId` existiert, zeige nach dem Laden eine suchbare Personenauswahl.
- Erkläre, dass dies nur den Einstieg/Fokus festlegt und keine Beziehung verändert.
- Erlaube „Später“; dann verwende die bestehende technische Auswahl, zeige sie aber als temporären Start.

**Akzeptanz:** Auswahl ändert maximal zwei Root-IDs nach bestehender Regel; Abbruch verliert keine Daten; Auswahl ist rückgängig änderbar.

**Test:** Datensatz ohne Root, mit einem Root, mit zwei Roots und leerer Datensatz.

---

# Sprint 2 · Erkunden, Finden und Verstehen

**Sprintziel:** Eine bekannte Person ist in höchstens drei Aktionen auffindbar; die eigene Position im Baum bleibt verständlich.

## S2-01 · Personendetail und Bearbeitungsformular trennen `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S0-06, S1-09  
**Dateien:** `index.html`, `app.js`, `style.css`, Tests

**Umsetzung:**

- Extrahiere eine reine Detaildarstellung aus dem bisherigen gemeinsamen Sheet.
- Detailansicht zeigt Identität, Lebensdaten, Eltern, Partner, Kinder, Quellen und Notiz nur wenn vorhanden.
- „Bearbeiten“ öffnet das Formular; „Zurück“ kehrt zur Detailansicht derselben Person zurück.
- Auswahl im Canvas bleibt beim Schließen erhalten.

**Akzeptanz:** Ansichtsmodus enthält keine deaktivierten/versteckten Formularreste; Beziehungen sind als Buttons navigierbar; Fokus bleibt logisch.

**Test:** Person mit vollständigen, unvollständigen und keinen Beziehungsdaten.

## S2-02 · Detailansicht visuell priorisieren `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S2-01  
**Dateien:** `style.css`, Detailmarkup

**Umsetzung:**

- Hero mit Name, Lebensspanne und optional Bild.
- Beziehungen in klar getrennten Abschnitten statt gleichgewichtigen Boxen.
- Nur eine Primäraktion; Zusatzaktionen als Sekundär-/Textbuttons.

**Akzeptanz:** Wichtigste Identität ist ohne Scrollen sichtbar; leere Bereiche werden nicht gerendert; 320 px ohne abgeschnittene Texte.

**Test:** drei Datenprofile und 200 % Textzoom.

## S2-03 · Suche mit Ergebniszuständen `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-07  
**Dateien:** `app.js`, `style.css`

**Umsetzung:**

- Vor Eingabe: „Name, Jahr, Ort oder Familienname suchen“.
- Während Eingabe: Trefferzahl und hervorgehobene passende Textteile.
- Keine Treffer: klare Meldung plus „Personenliste öffnen“.
- Treffer zeigt Name, Lebensdaten und eine unterscheidende Beziehung/Ort, sofern vorhanden.

**Akzeptanz:** Ergebnisliste bleibt bei gleichen Namen unterscheidbar; leere Suche rendert nicht 385 beliebige Treffer; Suchbegriff bleibt beim Zurückkehren erhalten.

**Test:** eindeutiger Name, Dublette, Jahr, Ort, kein Treffer, Sonderzeichen.

## S2-04 · Suchsprung mit sichtbarem Ergebnis `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S2-03  
**Dateien:** `app.js`, `style.css`

**Umsetzung:**

- Nach Trefferwahl: Sheet schließen, Person lesbar zentrieren, auswählen und Detail öffnen.
- Spotlight respektiert Reduced Motion; ohne Animation bleibt ein Fokusrahmen für mindestens denselben Zeitraum sichtbar.
- Zurück führt zur Suche mit vorheriger Scrollposition.

**Akzeptanz:** Gewählte Person ist nie außerhalb des Viewports; kein doppeltes Öffnen; Tastaturfluss funktioniert.

**Test:** Treffer weit außerhalb des aktuellen Viewports, Fokusmodus an/aus.

## S2-05 · Zwei Fit-Befehle `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S0-03  
**Dateien:** `app.js`, `index.html`, Tests

**Umsetzung:**

- Trenne „Lesbar zentrieren“ von „Gesamten Baum zeigen“.
- „Lesbar“ darf Mindestzoom verwenden und zentriert Fokus/Hauptperson.
- „Gesamt“ darf bis `minZoom` verkleinern und zeigt eine Mini-/Punktdarstellung.
- Benenne den bisherigen Home-Button entsprechend.

**Akzeptanz:** Beide Befehle haben deterministische Zoomgrenzen; Gesamtansicht enthält alle sichtbaren Knoten; Lesbaransicht zeigt Hauptperson mit lesbarem Namen.

**Test:** 5, 50, 385 und synthetisch 1.200 Personen auf Mobile/Desktop.

## S2-06 · Mobile Überblicksfläche `[SPARK]` · 1 Tag

**Abhängigkeit:** S2-05  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Ersetze `display:none` der Minimap auf Mobile durch einen „Überblick“-Button.
- Button öffnet eine größere, touchfreundliche Überblicksfläche als Sheet/Popover.
- Tippen auf eine Stelle verschiebt den Viewport; Schließen gibt Fokus zurück.

**Akzeptanz:** Minimap blockiert nicht dauerhaft den kleinen Canvas; Zielbereich mindestens 44 px; Überblick zeigt aktuellen Ausschnitt klar.

**Test:** 390 × 844, Hoch-/Querformat, Tippen an vier Kartenränder.

## S2-07 · Offscreen-Indikatoren `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S2-05  
**Dateien:** `app.js`, `style.css`, Tests

**Umsetzung:**

- Berechne für direkte Beziehungen der ausgewählten Person, ob sie außerhalb des Viewports liegen.
- Zeige maximal vier Randindikatoren mit Richtung und Anzahl, z. B. „2 Kinder rechts“.
- Aktivierung pannt zur nächsten zugehörigen Person.

**Akzeptanz:** Keine Indikatoren ohne Auswahl; keine Überlagerung mit Navigation/Zoom; Richtung aktualisiert sich nach Pan/Zoom.

**Test:** Beziehungen links/rechts/oben/unten, Zoomwechsel, Mobile Safe Areas.

## S2-08 · Fokusmodus verständlich benennen `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S2-01  
**Dateien:** UI-Texte in `index.html`/`app.js`

**Umsetzung:**

- Ersetze „Fokus 2/2“ durch „Nahbereich zeigen“.
- Im aktiven Zustand: „Gesamten Baum zeigen“.
- Ergänze in der Detailansicht einen Hilfstext „zeigt zwei Generationen davor und danach“.

**Akzeptanz:** Kein sichtbarer Text „2/2“ bleibt; Zustand ist ohne Symbol verständlich.

**Test:** Aktivieren/deaktivieren über Detailansicht und Startnavigation.

## S2-09 · Personenliste als echtes Verzeichnis `[SPARK]` · 1 Tag

**Abhängigkeit:** S1-07  
**Dateien:** `app.js`, `style.css`

**Umsetzung:**

- Sortierung als beschriftete Auswahl „Name | Geburt | Familie“ mit sichtbarem aktivem Zustand.
- Vorrat wird Filter/Tab innerhalb der Personenliste statt eigenes globales Symbol.
- Zeige Gesamt-/Trefferzahl.
- Pro Zeile nur „Öffnen“ als Primäraktion; Hinzufügen-Aktionen in ein Zeilenmenü.

**Akzeptanz:** Zeilen bleiben bei 320 px übersichtlich; Sortierzustand ist semantisch erkennbar; Vorratspersonen klar gekennzeichnet.

**Test:** 385 Personen, 18 Vorratspersonen, Tastatur und 200 % Zoom.

## S2-10 · Hilfesystem statt Acht-Sekunden-Tipp `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S1-08  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Entferne das rein zeitgesteuerte Ausblenden des Hinweises.
- Erstelle drei dismissible Hinweise für Pan/Zoom, Suche und Bearbeiten.
- Speichere „gesehen“ lokal pro App-Version.
- Mache die Hinweise über Mehr→Hilfe erneut erreichbar.

**Akzeptanz:** Hinweise verschwinden nur durch Nutzeraktion; sie verdecken keine Primärnavigation; Screenreader kann sie lesen und schließen.

**Test:** Erstbesuch, Wiederkehrer, Hilfe erneut öffnen, 320 px.

---

# Sprint 3 · Bearbeiten, Vertrauen und Fehlerkorrektur

**Sprintziel:** Nutzer können Beziehungen und Personendaten ändern, ohne Angst vor Datenverlust oder irreversiblen Fehlgriffen.

## S3-01 · Formular in Abschnitte gliedern `[SPARK]` · 1 Tag

**Abhängigkeit:** S2-01  
**Dateien:** `index.html`, `style.css`

**Umsetzung:**

- Abschnitte: Basisdaten, Lebensdaten, Beziehungen, Weitere Angaben, Quellen/Bild, Verwaltung.
- Basis- und Lebensdaten initial offen; seltene Bereiche einklappbar.
- Hauptwurzel und Vorrat in „Verwaltung“, nicht zwischen Personendaten.

**Akzeptanz:** Name, Geburt, Tod und Speichern sind auf 390 px mit höchstens einem kurzen Scroll erreichbar; Accordionbuttons haben `aria-expanded`.

**Test:** Neu- und Bearbeiten-Flow, Tastatur, 200 % Textzoom.

## S3-02 · Inline-Validierung `[SPARK]` · 1 Tag

**Abhängigkeit:** S3-01  
**Dateien:** `app.js`, `style.css`

**Umsetzung:**

- Ersetze Fehler-Alerts aus `validatePersonForm()` durch feldnahe Meldungen.
- Verknüpfe Meldungen mit `aria-describedby`; setze `aria-invalid`.
- Beim Speichern Fokus auf das erste fehlerhafte Feld; zusätzlich kompakte Fehlerzusammenfassung oben.

**Akzeptanz:** Kein Validierungsfehler benötigt `alert()`; Meldung erklärt Korrektur; gültige Werte entfernen alte Fehler sofort oder nach erneutem Speichern konsistent.

**Test:** ungültiges Datum, identische Eltern, Selbstbezug, ungültige Partnerschaft.

## S3-03 · Eigene Bestätigungsdialoge `[SPARK]` · 1 Tag

**Abhängigkeit:** S3-01, S0-06  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Baue einen wiederverwendbaren Dialog für Verwerfen, Auto-Layout, Vorratverschiebung und Reset.
- Titel nennt Aktion; Text nennt konkrete Folge; Buttons tragen Verben statt „OK/Abbrechen“.
- Destruktive Aktion ist nicht initial fokussiert.

**Akzeptanz:** Für diese vier Flows bleibt kein `confirm()`; Escape bricht ab; Fokus kehrt zum Auslöser zurück.

**Test:** alle vier Flows per Tastatur und Maus.

## S3-04 · Exportdialog statt Prompt-Kette `[SPARK]` · 1 Tag

**Abhängigkeit:** S3-03  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Ein Dialog wählt JSON/Bild, PNG/SVG, Qualität und Bilder einschließen.
- Zeige Zusammenfassung: Personenzahl, Bilder, Notizen/Quellen, geschätzte Dateigröße wenn praktikabel.
- Dateiname vor Export sichtbar.

**Akzeptanz:** Bildexport nutzt kein `prompt()`; JSON-Bilderwahl nutzt kein `confirm()`; Abbruch erzeugt keine Datei.

**Test:** JSON mit/ohne Bild, PNG 2×/3×/4×, SVG, Fehlerfallback.

## S3-05 · Persistenzzustandsautomat `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S1-05, S0-06  
**Dateien:** `app.js`, Tests

**Umsetzung:**

- Zustände: `clean`, `dirty`, `saving`, `saved-local`, `saved-file`, `degraded-indexeddb`, `memory-only`, `error`.
- Übergänge aus realen Promise-Ergebnissen, nicht aus dem Aufruf von `save()` ableiten.
- Parallelwrites serialisieren und veraltete Erfolgsmeldungen verhindern.
- Status an den Headeradapter liefern.

**Akzeptanz:** Status lügt bei fehlgeschlagenem Dateischreiben nicht; schneller Mehrfachinput endet im Status der letzten Version; Tests decken Fehlerpfade ab.

**Test:** LocalStorage voll, IndexedDB verfügbar/nicht verfügbar, Dateischreibfehler, schnelle Änderungen.

## S3-06 · Command-Schicht und Undo/Redo `[NICHT-SPARK · SOL-HIGH]` · 2 Tage

**Abhängigkeit:** S0-06, S3-05  
**Dateien:** `app.js` oder neue Module, Tests

**Umsetzung:**

- Führe Commands für Person speichern, Beziehung ändern, Person/Zweig verschieben, Pool ändern, Layout anwenden und Löschen ein.
- Jeder Command speichert minimalen Vorher-/Nachherzustand und besitzt `do/undo`.
- Maximal 50 Schritte oder speicherbegrenzte Historie; Import/Reset beginnen eine neue Historie.
- Persistiere nur aktuellen Datenstand, nicht zwingend Historie.

**Akzeptanz:** Undo/Redo stellt Daten, Beziehungen und Positionen exakt wieder her; neuer Command nach Undo verwirft Redo-Zweig; keine zyklische Datenreferenz im Export.

**Test:** Sequenz aus zehn gemischten Commands komplett zurück und wieder vor.

## S3-07 · Undo/Redo-UI `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S3-06  
**Dateien:** `index.html`, `style.css`, `app.js`

**Umsetzung:**

- Desktop: beschriftete oder klar tooltipte Buttons im Bearbeitungsheader.
- Mobile: Einträge im Bearbeitungs-Aktionsbereich; letzter Vorgang als Text, z. B. „Löschen rückgängig“.
- Shortcuts `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`; nicht in Textfeldern abfangen.

**Akzeptanz:** Deaktivierter Zustand korrekt; Aktion wird per `aria-live` bestätigt; Shortcuts respektieren Formular-Undo.

**Test:** Maus, Touch, beide Shortcuts, Fokus in Textfeld.

## S3-08 · Löschauswirkung berechnen `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S3-06  
**Dateien:** `app.js`, Tests

**Umsetzung:**

- Reine Analysefunktion liefert betroffene Partner-, Eltern-, Kind- und Root-Verknüpfungen.
- Löschen entfernt keine weiteren Personen implizit.
- Dialog bietet „Person löschen“ und sichere Alternative „In Vorrat verschieben“, wenn passend.

**Akzeptanz:** Dialog nennt Anzahl und Arten betroffener Beziehungen; Undo stellt alles wieder her; Root-Löschung führt zu Root-Auswahlhinweis.

**Test:** Einzelperson, Root, Person mit mehreren Partnern, Elternteil vieler Kinder.

## S3-09 · Beziehungseditor als eigener Flow `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S2-01, S3-06  
**Dateien:** `index.html`, `style.css`, `app.js`, Tests

**Umsetzung:**

- Trenne „Personendaten“ und „Beziehungen ändern“.
- Beziehungstyp wählen, vorhandene Person suchen oder neue anlegen, Zusammenfassung bestätigen.
- Gegenseitigkeit intern konsistent erzwingen; die heutige Frage „auch bei der anderen Person eintragen?“ entfernen.
- Heiratsdatum bleibt Eigenschaft der Paarbeziehung.

**Akzeptanz:** Keine einseitige Partnerschaft über UI erzeugbar; Selbst-/Zyklusbezüge blockiert; neue Person kann ohne Verlust zum Ausgang zurückkehren.

**Test:** Eltern, Kind, Partner, mehrere Partnerschaften, Abbruch in jedem Schritt.

## S3-10 · Datenprüfung in Bearbeitung einbinden `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S3-02  
**Dateien:** `app.js`, `style.css`

**Umsetzung:**

- Zeige nach Speichern nicht-blockierende Hinweise für fehlendes Geburtsdatum, unklaren Nachnamen und nur ein Elternteil.
- Biete „Jetzt ergänzen“ oder „Später“.
- Harte Konsistenzfehler bleiben blockierend.

**Akzeptanz:** Unvollständige historische Daten dürfen gespeichert werden; Hinweise erklären Unsicherheit ohne Fehlerton; keine Alert-Kette.

**Test:** vollständige, unvollständige und inkonsistente Person.

---

# Sprint 4 · Barrierefreiheit, Performance und Abschluss

**Sprintziel:** Die neue Struktur ist robust, zugänglich und bei realen Datenmengen schnell genug.

## S4-01 · Zentraler Dialogmanager `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S0-06, S2-01, S3-03  
**Dateien:** `app.js` oder neues UI-Modul, `index.html`, Tests

**Umsetzung:**

- Einheitliche API `openDialog(id, trigger, initialFocus)` / `closeDialog(result)`.
- Setze Rolle, `aria-modal`, `aria-labelledby`, Initialfokus, Fokus-Trap und Fokus-Rückgabe.
- Hintergrund mit `inert` deaktivieren, falls unterstützt; sauberer Fallback.
- Nur oberster Dialog reagiert auf Escape.

**Akzeptanz:** Tab verlässt keinen Dialog; Schließen fokussiert Trigger; keine zwei Backdrops oder offenen modalen Sheets.

**Test:** jeder Dialog vorwärts/rückwärts tabben; verschachtelter Beziehungsschritt; Escape.

## S4-02 · Landmarks und Überschriften `[SPARK]` · 0,5 Tag

**Abhängigkeit:** S4-01  
**Dateien:** `index.html`, dynamische Markupteile in `app.js`

**Umsetzung:**

- Eindeutige `header`, `nav`, `main`, ergänzende Bereiche und Dialogtitel.
- Pro Oberfläche genau eine sinnvolle Hauptüberschriftsebene.
- Dynamische Listen mit verständlichem Namen/Status.

**Akzeptanz:** Landmark-Liste ist verständlich; keine unbeschrifteten Dialoge; Überschriftenfolge ohne Sprünge innerhalb einer Oberfläche.

**Test:** Browser Accessibility Tree oder Screenreader-Rotor.

## S4-03 · Tastaturbedienung des Canvas `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S2-01, S4-01  
**Dateien:** `app.js`, Tests

**Umsetzung:**

- Roving Tabindex für sichtbare Personenkarten.
- Pfeile navigieren räumlich zur nächsten Karte; Enter öffnet Detail; Escape schließt.
- Pan-Shortcuts bleiben nur aktiv, wenn Canvas selbst und keine Karte fokussiert ist.
- Beim Virtualisieren darf Fokus nicht kommentarlos entfernt werden.

**Akzeptanz:** Jede sichtbare Karte ohne Maus erreichbar; Fokusindikator gut sichtbar; Reihenfolge bleibt nach Render stabil.

**Test:** drei Generationen, Paar, eingeklappter Ast, Fokusmodus, Virtualisierung.

## S4-04 · Touchziele und Gestenkonflikte `[SPARK]` · 0,75 Tag

**Abhängigkeit:** S2-06  
**Dateien:** `style.css`, kleine Eventanpassungen in `app.js`

**Umsetzung:**

- Alle globalen Buttons und Collapse-Aktionen mindestens 44 × 44 px.
- Karten-Drag startet erst nach klarer Bewegungsschwelle; normales Tippen öffnet Detail.
- Keine doppelte Aktivierung durch `click` plus `touchend`.

**Akzeptanz:** Ein Tap löst genau eine Aktion aus; Scrollen in Sheets zieht keine Karte; Collapse-Ziel ist 44 px.

**Test:** echte oder emulierte Touchgeräte, schnelles Tippen, leichtes Wischen, Long Press.

## S4-05 · Kontrast- und Zoom-Audit `[SPARK]` · 1 Tag

**Abhängigkeit:** S0-04, alle UI-Sprints  
**Dateien:** `style.css`

**Umsetzung:**

- Prüfe Text/Icons nach WCAG-AA-Kontrast; normale Texte mindestens 4,5:1, große Texte 3:1.
- Fokusindikator mindestens 3:1 zur angrenzenden Fläche.
- 200 % Browserzoom ohne Funktionsverlust; 400 % für Kernflows soweit Weblayout praktikabel.
- Familienfarben nicht als einziger Zustand.

**Akzeptanz:** Dokumentierte Kontrastmatrix ohne bekannte AA-Verstöße in Kernflows; Navigation und Dialogaktionen bleiben bei 200 % erreichbar.

**Test:** automatisierter Scan plus manuelle Stichprobe der dynamischen Familienfarben.

## S4-06 · Rendering-Profiler und Budgets `[NICHT-SPARK · SOL-HIGH]` · 1 Tag

**Abhängigkeit:** S0-03  
**Dateien:** Performance-Test/Script, `docs/performance-budget.md`

**Umsetzung:**

- Messe initiales Rendern, Pan/Zoom, Suche und Öffnen eines Details mit 385/1.200/5.000 synthetischen Personen.
- Budgets festlegen: Interaktion p95 unter 100 ms ohne Datenmutation; Suche unter 150 ms; kein Long Task über 200 ms im normalen 385er-Datensatz.
- Identifiziere Full-Render-Hotspots und DOM-Menge.

**Akzeptanz:** Reproduzierbare Messung mit Hardware-/Browserangabe; konkrete Hotspotliste; noch keine spekulative Optimierung.

**Test:** drei Datensätze jeweils dreimal, Median und schlechtester Wert dokumentiert.

## S4-07 · Inkrementelles Rendering `[NICHT-SPARK · SOL-HIGH]` · 2 Tage

**Abhängigkeit:** S4-06, S3-06  
**Dateien:** `app.js` oder neue Renderer-Module, Tests

**Umsetzung:**

- Trenne Datenableitung, Layout und DOM-Patch.
- Karten anhand stabiler Personen-/Paar-Keys wiederverwenden statt `nodes.innerHTML = ''`.
- Linien und Generationen nur bei relevanter Änderung neu berechnen.
- Fokus und Auswahl über Patches erhalten.

**Akzeptanz:** Funktionsgleichheit laut Smoke-Tests; keine Fokusverluste; Performancebudgets für 385/1.200 Personen erfüllt oder messbar verbessert.

**Test:** Profiler vor/nach, Undo/Redo, Pan/Zoom, Layoutwechsel.

## S4-08 · Modulgrenzen ohne Frameworkwechsel `[NICHT-SPARK · SOL-HIGH]` · 2 Tage

**Abhängigkeit:** S3-06, S4-07  
**Dateien:** neue ES-Module, `index.html`, Tests

**Umsetzung:**

- Zielmodule: `data-model`, `selectors`, `commands`, `persistence`, `viewport`, `layout`, `render`, `dialogs`, `app-shell`.
- In kleinen Schritten extrahieren; keine Big-Bang-Neuschreibung.
- Öffentliche Schnittstellen dokumentieren; zyklische Imports vermeiden.

**Akzeptanz:** `app.js` ist Bootstrap/Orchestrierung statt Gesamtsystem; alle Tests grün; direkte globale DOM-Zugriffe auf UI-Module begrenzt.

**Test:** Modulgraph prüfen, App offline laden, Import/Export-Kompatibilität.

## S4-09 · Datenschutz-Exportoption `[NICHT-SPARK · SOL-HIGH]` · 1,5 Tage

**Abhängigkeit:** S3-04  
**Dateien:** Konzeptnotiz, anschließend Exportlogik und Dialog

**Umsetzung:**

- Zuerst fachlich festlegen, wie „vermutlich lebend“ bestimmt und transparent erklärt wird; keine heimliche Datenklassifikation.
- Danach Exportoptionen: Lebensdaten kürzen, Notizen/Quellen entfernen, Bilder entfernen.
- Vorschau zeigt Anzahl betroffener Personen und exakte Regeln.

**Akzeptanz:** Originaldaten bleiben unverändert; Export ist deterministisch; Nutzer bestätigt Umfang bewusst.

**Test:** Grenzfälle ohne Geburts-/Sterbedatum und sehr alte Personen.

## S4-10 · Abschluss-E2E und Abnahme `[SPARK]` · 1 Tag

**Abhängigkeit:** alle vorherigen Aufgaben  
**Dateien:** Tests, `docs/ux-acceptance.md`

**Umsetzung:**

- Führe alle Baseline-Flows plus Einstieg, Root-Auswahl, Mobile-Überblick, Undo/Redo, Exportdialog und Speicherfehler aus.
- Teste 390 × 844, 768 × 1024 und 1440 × 900 sowie Tastatur-only.
- Dokumentiere nur echte Abweichungen; keine stillen „known issues“ ohne Priorität.

**Akzeptanz:** Keine offene P0/P1-Abweichung; alle Smoke-/E2E-Tests grün; Screenshots zeigen neue Navigation und Kernzustände.

**Test:** vollständige Abnahmematrix mit Datum, Browser und Ergebnis.

## 13. Sprint-Definition-of-Done

Ein Sprint ist nur abgeschlossen, wenn:

- alle zugehörigen automatisierten Tests grün sind,
- neue Interaktionen Maus, Touch und Tastatur berücksichtigen,
- Desktop und Mobile visuell geprüft wurden,
- keine bestehende Import-/Exportdatei unlesbar wird,
- keine neue Aktion nur durch Farbe oder ein unbeschriftetes Symbol erklärt wird,
- Fokus nach Dialogen und Navigation nachvollziehbar bleibt,
- Abweichungen mit Priorität und nächster Aufgabe dokumentiert sind.

## 14. Erfolgsmessung nach Sprint 4

In moderierten Tests mit mindestens fünf Personen, die die App nicht entwickelt haben:

- 4/5 verstehen den Startzustand und wählen innerhalb von 10 Sekunden eine passende Primäraktion.
- 4/5 finden eine genannte Person ohne Hilfe in höchstens 30 Sekunden.
- 4/5 können eine Eltern- oder Partnerbeziehung korrekt ergänzen.
- 5/5 erkennen, ob ihre Änderung gespeichert wurde.
- 5/5 können eine versehentliche Löschung rückgängig machen.
- Auf Mobile verliert keine Testperson dauerhaft die Orientierung; „Überblick“ wird ohne Hinweis gefunden.

Technische Zielwerte:

- keine bekannten WCAG-AA-Kontrastverstöße in Kernflows,
- kein Fokusverlust beim Öffnen/Schließen von Dialogen,
- keine horizontale Seitenscrollbar bei 320 px,
- Suche im 385er-Datensatz unter 150 ms auf Referenzgerät,
- Interaktions-Long-Tasks im 385er-Datensatz unter 200 ms,
- Import und Export bestehender JSON-Daten bleiben kompatibel.

## 15. Empfohlene Ausführungsreihenfolge

Wenn nur ein Teil umgesetzt werden kann, ist die Reihenfolge:

1. S0-01 bis S0-06: Sicherheitsnetz.
2. S1-01 bis S1-10: Einstieg und Navigation.
3. S2-05, S2-06, S2-01, S2-03, S2-04: mobile Orientierung und Kernsuche.
4. S3-05 bis S3-08: Vertrauen, Undo und Löschsicherheit.
5. S4-01 bis S4-05: Barrierefreiheit.
6. Restliche Detail-, Performance- und Datenschutzaufgaben.

Die ersten sichtbaren Verbesserungen entstehen bereits in Sprint 1. Die risikoreichsten Änderungen sind S3-06, S3-09, S4-01, S4-03, S4-07 und S4-08; sie dürfen ausdrücklich nicht von GPT-SPARK allein umgesetzt werden.

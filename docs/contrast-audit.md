# Kontrast- und Zoom-Audit

Stand: 1. August 2026  
Referenz: WCAG 2.2 AA, Chrome/Chromium unter Windows

## Prüfmethode

Die relativen Luminanzen wurden nach WCAG berechnet. Normaler Text muss mindestens 4,5:1, großer Text mindestens 3:1 und der Fokusindikator mindestens 3:1 zur angrenzenden Fläche erreichen. Zusätzlich prüfen automatisierte Browsertests die Kernnavigation und Dialogaktionen bei 200 % sowie den Such-/Detailflow bei 400 % Textzoom.

## Kontrastmatrix

| Verwendung | Vordergrund | Hintergrund | Verhältnis | Ergebnis |
|---|---:|---:|---:|---|
| Standardtext | `#2F2A24` | `#FFFCF6` | 13,88:1 | AA bestanden |
| Sekundärtext | `#6F675F` | `#FFFCF6` | 5,42:1 | AA bestanden |
| Primäraktion | `#FFFFFF` | `#476A50` | 6,10:1 | AA bestanden |
| Akzentaktion | `#FFFFFF` | `#9A5636` | 5,59:1 | AA bestanden |
| Bearbeitungsmodus | `#FFFFFF` | `#8A4F32` | 6,47:1 | AA bestanden |
| Destruktive Aktion | `#FFFFFF` | `#B84A3D` | 5,14:1 | AA bestanden |
| Fokusindikator | `#255B86` | `#FFFCF6` | 7,02:1 | 3:1 bestanden |
| Tagtext | `#6B5642` | `#EFE1CD` | 5,38:1 | AA bestanden |
| Linktext in Details | `#5E4937` | `#EFE1CD` | 6,57:1 | AA bestanden |

Die zehn Familienfarben liegen mit weißem Text zwischen 5,09:1 und 6,86:1. Avatare verwenden deshalb eine einfarbige, ausreichend dunkle Fläche; ein aufhellender Verlauf wird nicht mehr hinter weißen Initialen eingesetzt.

## Zustände ohne reine Farbcodierung

- Aktiver Navigationspunkt: Farbe plus `aria-current="page"`.
- Gewählte Person: sichtbarer Fokus/Umriss plus `aria-current` und Detailzustand.
- Neben-, Partner- und gefilterte Zweige: unterschiedliche Rahmenarten beziehungsweise Sättigung statt transparenter, kontrastarmer Gesamtkarten.
- Modus: ausgeschriebener Schalter „Ansehen | Bearbeiten“, `aria-pressed` und Farbe.

## Zoom-Ergebnis

- 200 %: Hauptnavigation, Personenansicht, Formular, Verzeichnis und Dialogaktionen bleiben ohne horizontale Dokument-Scrollleiste erreichbar.
- 400 %: Suche, Treffer, Personenansicht und Schließen-Aktion bleiben im Kernflow erreichbar; Sheets und Dialoge wachsen über `rem`, sind auf die Viewportbreite begrenzt und vertikal scrollbar.
- 320 CSS-Pixel: keine horizontale Seitenscrollbar in den getesteten Kernoberflächen.

Bekannte AA-Verstöße in den automatisiert und manuell geprüften Kernflows: keine.

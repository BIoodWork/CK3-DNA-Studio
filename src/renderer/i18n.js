/* Only interface text is translated; DNA, user content and identifiers remain exact. */
(() => {
const copy = Object.fromEntries(`
subtitle|Edit, convert and manage character DNA|Charakter-DNA bearbeiten, konvertieren und verwalten
loadingLibrary|Loading your library…|Bibliothek wird geladen…
libraryLoadFailed|The library could not be loaded. Your saved data has not been removed.|Die Bibliothek konnte nicht geladen werden. Deine gespeicherten Daten wurden nicht entfernt.
retryLibrary|Try again|Erneut versuchen
macGatewayTitle|Direct game access is not available in the macOS alpha|Direkter Spielzugriff ist in der macOS-Alpha nicht verfügbar
macGatewayHelp|Use DNA Code to copy or export Ruler Designer text and paste it into CK3. Library, gene editing and conversion work with your installed game and mod definitions.|Kopiere oder exportiere den Ruler-Designer-Text unter DNA-Code und füge ihn in CK3 ein. Bibliothek, Gen-Editor und Konvertierung verwenden deine installierten Spiel- und Moddefinitionen.
language|Language|Sprache
library|Library|Bibliothek
edit|Edit DNA|DNA bearbeiten
connection|CK3 Gateway|CK3 Gateway
settings|Settings|Einstellungen
newDna|New DNA|Neue DNA
localLibrary|Local library|Lokale Bibliothek
entries|{count} characters|{count} Charaktere
libraryIntro|Your characters, in one place.|Deine Charaktere an einem Ort.
import|Import library or profile|Bibliothek oder Profil importieren
exportAll|Export library|Bibliothek exportieren
searchLibrary|Search name or note…|Name oder Notiz suchen…
allProfiles|All profiles|Alle Profile
allSexes|All sexes|Alle Geschlechter
favorites|Favorites only|Nur Favoriten
recent|Recently updated|Zuletzt geändert
nameAZ|Name A–Z|Name A–Z
femaleFirst|Female first|Weiblich zuerst
maleFirst|Male first|Männlich zuerst
emptyLibrary|Make room for your next dynasty.|Platz für deine nächste Dynastie.
emptyLibraryHelp|Add DNA, a name and a portrait to start your collection. Existing .ck3dna libraries can be imported.|Füge DNA, einen Namen und ein Porträt hinzu. Vorhandene .ck3dna-Bibliotheken kannst du importieren.
noMatches|No characters match your filters.|Keine Charaktere passen zu deinen Filtern.
clearFilters|Clear filters|Filter zurücksetzen
selectEntry|Choose a character to see its details.|Wähle einen Charakter für weitere Details.
female|Female|Weiblich
male|Male|Männlich
unspecified|Unspecified|Ohne Angabe
unknown|Unknown|Unbekannt
unverified|Unverified original|Ungeprüftes Original
original|Original|Original
current|Working DNA|Arbeits-DNA
encoded|DNA string (Base64)|DNA-String (Base64)
ruler_designer|Ruler Designer text|Ruler-Designer-Text
format|Format|Format
profile|Profile|Profil
sex|Sex|Geschlecht
name|Name|Name
note|Note|Notiz
noNote|No note added.|Keine Notiz hinzugefügt.
favorite|Favorite|Favorit
unfavorite|Remove favorite|Favorit entfernen
duplicate|Duplicate|Duplizieren
export|Export .ck3dna|.ck3dna exportieren
delete|Delete|Löschen
openOriginal|Open original in editor|Original im Editor öffnen
copyOriginal|Copy original|Original kopieren
copyCurrent|Copy working DNA|Arbeits-DNA kopieren
openEditor|Open in editor|Im Editor öffnen
prepare|Prepare for CK3|Für CK3 vorbereiten
editMetadata|Edit details|Details bearbeiten
created|Created|Erstellt
updated|Updated|Geändert
addPortrait|Add portrait|Porträt hinzufügen
portraitHelp|Drop an image, click to upload, or paste with Ctrl+V.|Bild ablegen, zum Hochladen klicken oder mit Strg+V einfügen.
removePortrait|Remove portrait|Porträt entfernen
chooseImage|Choose image|Bild auswählen
pasteImage|Paste image|Bild einfügen
imageTooLarge|Choose an image smaller than 12 MB.|Wähle ein Bild mit weniger als 12 MB.
invalidImage|This file is not a supported image.|Diese Datei ist kein unterstütztes Bild.
newIntro|Paste character DNA. Format and profile are checked as you type.|Füge Charakter-DNA ein. Format und Profil werden während der Eingabe geprüft.
pasteDna|Paste DNA here…|DNA hier einfügen…
dna|DNA|DNA
loadFile|Open DNA file|DNA-Datei öffnen
pasteClipboard|Paste clipboard|Zwischenablage einfügen
detecting|Checking DNA…|DNA wird geprüft…
awaitingDna|Waiting for DNA|Warte auf DNA
detected|Recognized · {count} genes|Erkannt · {count} Gene
ambiguous|Choose the source profile to continue.|Wähle das Quellprofil, um fortzufahren.
unsupported|This DNA cannot be edited with the installed definitions. You can keep the exact original in your library.|Diese DNA kann mit den installierten Definitionen nicht bearbeitet werden. Du kannst das unveränderte Original in der Bibliothek aufbewahren.
autoDetect|Detect automatically|Automatisch erkennen
sourceProfile|Source profile|Quellprofil
createEntry|Create entry|Eintrag erstellen
openDna|Open DNA|DNA öffnen
archiveOriginal|Keep original in library|Original in Bibliothek speichern
cancel|Cancel|Abbrechen
save|Save|Speichern
requiredName|Please enter a character name.|Bitte gib einen Charakternamen ein.
requiredDna|Please paste DNA first.|Bitte füge zuerst DNA ein.
untitled|Untitled character|Unbenannter Charakter
emptyEditor|One character. Every detail.|Ein Charakter. Jedes Detail.
emptyEditorHelp|Open DNA from your library or paste a new character to inspect and edit its genes.|Öffne DNA aus deiner Bibliothek oder füge einen neuen Charakter ein, um seine Gene zu bearbeiten.
browseLibrary|Browse library|Bibliothek öffnen
overview|Overview|Übersicht
genes|Genes|Gene
code|DNA Code|DNA-Code
saved|Saved|Gespeichert
unsaved|Unsaved|Ungespeichert
edits|{count} changed genes|{count} geänderte Gene
saveLibrary|Save to library|In Bibliothek speichern
saveVariant|Save as new entry|Als neuen Eintrag speichern
undo|Undo|Rückgängig
redo|Redo|Wiederholen
resetGenes|Reset gene edits|Genänderungen zurücksetzen
characterDetails|Character details|Charakterdetails
dnaSummary|DNA at a glance|DNA auf einen Blick
geneCount|Genes|Gene
changedGenes|Changed genes|Geänderte Gene
unknownGenes|Unknown genes|Unbekannte Gene
noPreview|Your portrait is a reference image. DNA changes do not generate a new preview.|Dein Porträt dient als Referenzbild. DNA-Änderungen erzeugen keine neue Vorschau.
originalKept|The exact original stays with this character. Gene edits affect the working DNA.|Das exakte Original bleibt bei diesem Charakter erhalten. Genänderungen betreffen die Arbeits-DNA.
conversion|Convert a variant|Variante konvertieren
conversionHelp|Create a separate variant for another profile or format. Review differences before saving.|Erstelle eine separate Variante für ein anderes Profil oder Format. Prüfe Abweichungen vor dem Speichern.
targetProfile|Target profile|Zielprofil
outputFormat|Output format|Ausgabeformat
allowLossy|Allow reported replacements|Ausgewiesene Ersetzungen erlauben
convert|Preview conversion|Konvertierung prüfen
converting|Converting…|Wird konvertiert…
conversionReady|Variant ready · {count} differences|Variante bereit · {count} Abweichungen
saveConverted|Save converted variant|Konvertierte Variante speichern
changes|Differences|Abweichungen
preserved|Preserved genes|Erhaltene Gene
searchGenes|Search genes or template tokens…|Gene oder Vorlagen-Token suchen…
allCategories|All categories|Alle Kategorien
changedOnly|Changed only|Nur geänderte
unknownOnly|Unknown / unsupported|Unbekannt / nicht unterstützt
dominant|Dominant allele|Dominantes Allel
recessive|Recessive allele|Rezessives Allel
template|Template token|Vorlagen-Token
strength|Strength|Stärke
approximation|Approximate color from the installed palette|Ungefähre Farbe aus der installierten Palette
coordX|Palette X|Palette X
coordY|Palette Y|Palette Y
paletteHelp|Color genes store two palette positions (X / Y, 0–255). These are not RGBA colors.|Farbgene speichern zwei Palettenpositionen (X / Y, 0–255). Dies sind keine RGBA-Farben.
readOnly|Preserved · read only|Erhalten · schreibgeschützt
unknownPreserved|Unknown genes remain in the original text and are retained in text output.|Unbekannte Gene bleiben im Originaltext und werden in der Textausgabe erhalten.
noGeneMatches|No genes match these filters.|Keine Gene passen zu diesen Filtern.
resetGene|Reset this gene|Dieses Gen zurücksetzen
encoding|Updating working DNA…|Arbeits-DNA wird aktualisiert…
encodeError|The edit could not be encoded. Correct it or undo before saving.|Die Änderung konnte nicht kodiert werden. Korrigiere sie oder mache sie vor dem Speichern rückgängig.
geneUnavailable|Gene editing is unavailable for this original. Choose the correct profile or install its definitions in Settings.|Für dieses Original ist keine Genbearbeitung verfügbar. Wähle das richtige Profil oder installiere seine Definitionen unter Einstellungen.
codeHelp|Inspect the exact original or edit the working DNA. Apply code changes explicitly to update the gene editor.|Prüfe das exakte Original oder bearbeite die Arbeits-DNA. Übernimm Code-Änderungen ausdrücklich, um den Geneditor zu aktualisieren.
copy|Copy|Kopieren
exportText|Save text file|Textdatei speichern
applyCode|Apply code changes|Code-Änderungen übernehmen
discardCode|Discard code changes|Code-Änderungen verwerfen
codeDirty|Unapplied code changes|Nicht übernommene Code-Änderungen
immutable|Exact original · read only|Exaktes Original · schreibgeschützt
working|Working copy|Arbeitskopie
connectionIntro|Use the selected character in your paused game.|Verwende den ausgewählten Charakter im pausierten Spiel.
connectionHelp|Open the normal character window in CK3. Name and ID follow your selection automatically.|Öffne das normale Charakterfenster in CK3. Name und ID folgen deiner Auswahl automatisch.
connected|Connected|Verbunden
disconnected|Not connected|Nicht verbunden
checking|Checking…|Wird geprüft…
noCharacter|No character selected|Kein Charakter ausgewählt
selectedCharacter|Selected in CK3|In CK3 ausgewählt
readCharacter|Read DNA into editor|DNA im Editor öffnen
copyGame|Copy game DNA|Spiel-DNA kopieren
refresh|Refresh|Aktualisieren
preparedDna|Prepared DNA|Vorbereitete DNA
chooseSaved|Choose a saved character…|Gespeicherten Charakter wählen…
prepareHelp|Prepare working DNA from the editor, or choose a saved entry. Compatibility is checked against the selected character.|Bereite Arbeits-DNA aus dem Editor vor oder wähle einen gespeicherten Eintrag. Die Kompatibilität wird mit dem ausgewählten Charakter geprüft.
compatible|Compatible with the selected character.|Mit dem ausgewählten Charakter kompatibel.
incompatible|This entry is not compatible with the selected character.|Dieser Eintrag ist nicht mit dem ausgewählten Charakter kompatibel.
applyPrepared|Apply prepared DNA|Vorbereitete DNA anwenden
clipboardTransfer|Clipboard transfer|Übertragung per Zwischenablage
clipboardHelp|Explicitly apply DNA already on your clipboard to the selected character.|Übertrage DNA aus deiner Zwischenablage ausdrücklich auf den ausgewählten Charakter.
applyClipboard|Apply clipboard DNA|DNA aus Zwischenablage anwenden
gameApplied|DNA applied and verified. Reopen the character window in CK3 to refresh the portrait.|DNA angewendet und geprüft. Öffne das Charakterfenster in CK3 erneut, um das Porträt zu aktualisieren.
noPrepared|Select a saved entry and a character in CK3.|Wähle einen gespeicherten Eintrag und einen Charakter in CK3.
actionsFor|Actions for {name}|Aktionen für {name}
expandAll|Expand all|Alle aufklappen
collapseAll|Collapse all|Alle zuklappen
representation|DNA representation|DNA-Darstellung
representationUnavailable|This representation is unavailable|Diese Darstellung ist nicht verfügbar
cannotRepresent|This DNA cannot be represented without discarding or replacing genes. Use text DNA to retain all values.|Diese DNA kann ohne Verlust oder Ersetzung von Genen nicht dargestellt werden. Verwende Text-DNA, um alle Werte zu erhalten.
finishCodeFirst|Apply or discard your code changes before changing representation.|Übernimm oder verwirf die Code-Änderungen vor dem Wechsel der Darstellung.
syntheticMetadata|This text was generated from gene-only DNA. It uses male / id=0 defaults; your preserved original stays unchanged.|Dieser Text wurde aus reiner Gen-DNA erzeugt und verwendet male / id=0 als Standardwerte. Dein gespeichertes Original bleibt unverändert.
choosePalette|Choose palette color|Palettenfarbe auswählen
applyPalette|Apply palette positions|Palettenpositionen übernehmen
paletteBoth|Apply selection to both alleles|Auswahl auf beide Allele anwenden
paletteAxes|X increases from left to right. Y increases from top to bottom. Coordinates: 0–255.|X verläuft von links nach rechts. Y verläuft von oben nach unten. Koordinaten: 0–255.
paletteKeyboard|Click or drag to choose a color. Arrow keys move one palette position.|Klicken oder ziehen, um eine Farbe zu wählen. Pfeiltasten bewegen die Auswahl um eine Palettenposition.
paletteApproximate|Installed game palette · approximate preview|Installierte Spielpalette · ungefähre Vorschau
paletteUnavailable|The installed color palette could not be loaded.|Die installierte Farbpalette konnte nicht geladen werden.
about|About|Über diese App
aboutDescription|Edit, convert and manage character DNA for Crusader Kings III, Vanilla, EPE and AGOT.|Charakter-DNA für Crusader Kings III, Vanilla, EPE und AGOT bearbeiten, konvertieren und verwalten.
versionLabel|Version|Version
technology|Technology|Technik
icons|Icons|Symbole
aboutUnofficial|An unofficial community tool. Not affiliated with or endorsed by Paradox Interactive or the supported mod teams.|Ein inoffizielles Community-Werkzeug. Es besteht keine Verbindung zu Paradox Interactive oder den unterstützten Mod-Teams und keine Unterstützung durch diese.
aboutOffline|DNA, portraits and the library are processed and stored locally. The app works offline.|DNA, Porträts und Bibliothek werden lokal verarbeitet und gespeichert. Die App funktioniert offline.
details|Details|Details
settingsIntro|Language and installed gene definitions.|Sprache und installierte Gen-Definitionen.
installation|Game & mod folders|Spiel- und Mod-Ordner
pathHelp|CK3, EPE and AGOT are detected automatically. Select folders for a custom installation.|CK3, EPE und AGOT werden automatisch erkannt. Für eine abweichende Installation kannst du Ordner auswählen.
baseGame|CK3 base game|CK3-Basisspiel
automatic|Automatic detection|Automatische Erkennung
chooseFolder|Choose folder|Ordner auswählen
resetPaths|Use automatic detection|Automatische Erkennung verwenden
definitions|Installed definitions|Installierte Definitionen
unavailable|Unavailable|Nicht verfügbar
version|Version {version}|Version {version}
refreshed|Folders saved and definitions refreshed.|Ordner gespeichert und Definitionen aktualisiert.
updating|Updating definitions…|Definitionen werden aktualisiert…
copied|Copied to clipboard.|In Zwischenablage kopiert.
stored|Character saved to the library.|Charakter in der Bibliothek gespeichert.
imported|Imported {count} entries.|{count} Einträge importiert.
exported|Export complete.|Export abgeschlossen.
duplicated|Character duplicated.|Charakter dupliziert.
copySuffix|copy|Kopie
deleted|Character deleted.|Charakter gelöscht.
deleteTitle|Delete “{name}”?|„{name}“ löschen?
deleteHelp|This removes the saved entry and its portrait from your local library.|Der gespeicherte Eintrag und sein Porträt werden aus deiner lokalen Bibliothek entfernt.
replaceTitle|Replace the working character?|Arbeitscharakter ersetzen?
replaceHelp|Your character has unsaved changes. Save it first, or replace it.|Dein Charakter enthält ungespeicherte Änderungen. Speichere ihn zuerst oder ersetze ihn.
replace|Replace|Ersetzen
resetTitle|Reset all gene edits?|Alle Genänderungen zurücksetzen?
resetHelp|Return the working genes to the values from when this character was opened.|Setze die Gene auf die Werte beim Öffnen dieses Charakters zurück.
reset|Reset|Zurücksetzen
unavailableApi|This action is unavailable in this app version.|Diese Aktion ist in dieser App-Version nicht verfügbar.
failed|The action could not be completed.|Die Aktion konnte nicht abgeschlossen werden.
savedMetadata|Details saved.|Details gespeichert.
currentPortrait|Character portrait|Charakterporträt
loading|Loading…|Wird geladen…
chooseProfile|Choose profile|Profil auswählen
ready|Ready|Bereit
notReady|Not ready|Nicht bereit
convertedSuffix|variant|Variante
archiveHelp|Archived originals remain exportable and can be checked again after installing matching definitions.|Archivierte Originale bleiben exportierbar und können nach Installation passender Definitionen erneut geprüft werden.
`.trim().split('\n').map(line => {const [key,...values] = line.split('|');return [key,values];}));
let language='en';
const studioDiagnostics=Object.fromEntries(`
Unsupported DNA profile. Choose Vanilla, EPE or AGOT.|Unbekanntes DNA-Profil. Wähle Vanilla, EPE oder AGOT.
Paste DNA before opening the editor.|Füge vor dem Öffnen des Editors DNA ein.
DNA input is too large.|Die DNA-Eingabe ist zu groß.
DNA text is empty.|Der DNA-Text ist leer.
Unexpected closing brace in DNA text.|Unerwartete schließende Klammer im DNA-Text.
Unclosed DNA text block.|Ein Block im DNA-Text ist nicht geschlossen.
Expected a named assignment in DNA text.|Im DNA-Text wird eine benannte Zuweisung erwartet.
DNA assignment extends outside its block.|Eine DNA-Zuweisung reicht über ihren Block hinaus.
Paste one DNA character or genes block at a time.|Füge jeweils nur einen Charakter oder genes-Block ein.
DNA text must contain a genes block, not a save-game DNA reference.|Der DNA-Text muss einen genes-Block enthalten; ein DNA-Verweis aus einem Spielstand reicht nicht aus.
portrait_info must be a block.|portrait_info muss ein Block sein.
DNA text does not contain a genes block.|Der DNA-Text enthält keinen genes-Block.
genes must be a block.|genes muss ein Block sein.
The genes block is empty.|Der genes-Block ist leer.
Select a DNA profile before opening the gene catalog.|Wähle vor dem Öffnen des Genkatalogs ein DNA-Profil.
This DNA matches multiple installed profiles. Choose the source profile; no profile was guessed.|Diese DNA passt zu mehreren installierten Profilen. Wähle das Quellprofil; es wurde keines angenommen.
No matching installed schema. Older or external DNA needs named text exported from its original game/mod version; no legacy field order was guessed.|Keine passende installierte Gen-Definition gefunden. Ältere oder externe DNA benötigt benannten Text aus ihrer ursprünglichen Spiel- oder Mod-Version. Eine ältere Gen-Reihenfolge wurde nicht angenommen.
Unsupported genes/templates remain unchanged in text and are read-only. Raw DNA export requires exactly the supported ordinary gene set.|Nicht unterstützte Gene und Vorlagen bleiben im Text unverändert und schreibgeschützt. Der Export als DNA-String benötigt genau den unterstützten normalen Gensatz.
Select a source profile before applying edits.|Wähle vor dem Übernehmen der Änderungen ein Quellprofil.
This DNA does not match the selected profile. No edits were applied.|Diese DNA passt nicht zum ausgewählten Profil. Es wurden keine Änderungen übernommen.
Gene edits must be a list of named allele values.|Genänderungen müssen als Liste benannter Allelwerte vorliegen.
Each gene edit needs a name and values.|Jede Genänderung benötigt einen Namen und Werte.
Unsupported target DNA format.|Das Ziel-DNA-Format wird nicht unterstützt.
Raw DNA has no character metadata. Text export uses male/id=0 defaults.|Ein DNA-String enthält keine Charakter-Metadaten. Der Textexport verwendet die Standardwerte male/id=0.
Raw DNA contains genes only. Character metadata stays in the preserved original text.|Ein DNA-String enthält nur Gene. Die Charakter-Metadaten bleiben im erhaltenen Originaltext.
`.trim().split('\n').map(line=>line.split('|')));
function diagnostic(source){if(language==='de'){if(studioDiagnostics[source])return studioDiagnostics[source];const patterns=[[/^Duplicate DNA field: (.+)\.$/,'Doppeltes DNA-Feld: $1.'],[/^(.+) needs exactly four allele values\.$/,'$1 benötigt genau vier Allelwerte.'],[/^(.+): allele values must be integers from 0 to 255\.$/,'$1: Allelwerte müssen ganze Zahlen von 0 bis 255 sein.'],[/^(.+): select an installed template; unknown templates are not guessed\.$/,'$1: Wähle eine installierte Vorlage; unbekannte Vorlagen werden nicht angenommen.'],[/^Duplicate gene edit: (.+)\.$/,'Doppelte Genänderung: $1.'],[/^Unknown gene (.+) is preserved read-only; it cannot be edited or added\.$/,'Das unbekannte Gen $1 bleibt schreibgeschützt erhalten und kann nicht bearbeitet oder hinzugefügt werden.']];for(const [pattern,replacement] of patterns)if(pattern.test(source))return source.replace(pattern,replacement);}return window.DiagnosticI18n?.translate(source,language)??source;}

function t(key,values={}){const s=copy[key]?.[language==='de'?1:0]??diagnostic(String(key??''));return s.replace(/\{(\w+)\}/g,(m,k)=>values[k]==null?m:String(values[k]));}
window.I18n={t,setLanguage(value){language=value==='de'?'de':'en';document.documentElement.lang=language;},get language(){return language;},get locale(){return language==='de'?'de-DE':'en-GB';}};
})();

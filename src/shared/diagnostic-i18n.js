/* Diagnostics only: never translate DNA, identifiers, user names or file paths.
 * Keep the original backend message in the caller so language changes are lossless. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DiagnosticI18n = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // [German, English]. Both spellings emitted by the backend are intentional.
  const pairs = [
    ["Original-DNA muss ausdrücklich als ungeprüft gespeichert werden.", "Original DNA must be explicitly saved as unverified."],
    ["Ungültiger Prüfstatus für Arbeits-DNA.", "Invalid verification status for working DNA."],
    ["Ungeprüfte Original-DNA darf keine abweichende Arbeitsfassung oder geprüfte Schema-Daten enthalten.", "Unverified original DNA cannot contain a different working version or validated schema information."],
    ["Dieses Original ist ungeprüft. Zuerst in eine geprüfte Arbeitsfassung umwandeln.", "This original is unverified. Create a validated working version first."],
    ["Historische Farbpaletten-Prüfsummen fehlen. Bitte die gespeicherte DNA im Konverter erneut prüfen und als neuen Eintrag speichern.", "Historical color palette checksums are missing. Check the saved DNA again in the converter and save it as a new entry."],
    ["Die DNA-Bibliothek wird geschlossen.", "The DNA library is closing."],
    ["Die PNG-Prüfsumme ist ungültig.", "The PNG checksum is invalid."],
    ["Der PNG-Bildkopf ist ungültig.", "The PNG header is invalid."],
    ["Die PNG-Farbpalette ist ungültig.", "The PNG color palette is invalid."],
    ["Die PNG-Bilddaten sind ungültig.", "The PNG image data is invalid."],
    ["Das PNG enthält unbekannte Pflichtdaten.", "The PNG contains unknown required data."],
    ["Die PNG-Bilddaten sind beschädigt.", "The PNG image data is corrupt."],
    ["Die PNG-Bilddaten haben eine ungültige Länge.", "The PNG image data has an invalid length."],
    ["Das PNG enthält einen ungültigen Bildfilter.", "The PNG contains an invalid image filter."],
    ["Dieses Bibliothekspaket wird nicht unterstützt.", "This library package is not supported."],
    ["Das Bibliothekspaket enthält zu viele Einträge.", "The library package contains too many entries."],
    ["Ein Importeintrag ist unvollständig.", "An imported entry is incomplete."],
    ["Ein Importzeitstempel ist ungültig.", "An import timestamp is invalid."],
    ["Die Porträt-Prüfsumme ist ungültig.", "The portrait checksum is invalid."],
    ["Das Importporträt enthält ungültiges Base64.", "The imported portrait contains invalid Base64."],
    ["Der Importeintrag enthält ungültige Daten.", "The imported entry contains invalid data."],
    ["Das Bibliothekspaket ist größer als 64 MB.", "The library package exceeds 64 MB."],
    ["Das Importporträt enthält nichtkanonisches Base64.", "The imported portrait contains non-canonical Base64."],
    ["Die Porträt-Prüfsumme stimmt nicht überein.", "The portrait checksum does not match."],
    ["Die Bibliothek bietet nicht genügend Platz für alle Importeinträge.", "The library does not have enough room for all imported entries."],
    ["Die Prüfung nutzt die Launcher-Konfiguration und installierte Dateien. Das ist kein Nachweis der im laufenden Spiel geladenen Mods.", "The check uses the launcher configuration and installed files. It does not verify which mods are loaded in the running game."],
    ["Historische Farbpaletten-Prüfsummen fehlen. Bitte den gespeicherten Originalinhalt laden, erneut konvertieren und als neuen Eintrag speichern.", "Historical color palette checksums are missing. Load the saved original DNA, convert it again and save it as a new entry."],
    ["Die Farbpaletten haben sich seit dem Speichern geändert. Bitte den gespeicherten Originalinhalt laden und erneut konvertieren.", "The color palettes have changed since this entry was saved. Load the saved original DNA and convert it again."],
    ["Profil, Gen-Definitionen, Farbpaletten und Länge passen zur aktuellen Auswahl.", "Profile, gene definitions, color palettes and length match the current selection."],
    ["Bitte den laufenden Vorgang abwarten.", "Please wait for the current operation to finish."],
    ["Bitte vor dem Ändern der Installationspfade den laufenden Vorgang abschließen lassen.", "Please wait for the current operation to finish before changing installation paths."],
    ["Die Installationspfade werden aktualisiert. Bitte gleich erneut versuchen.", "The installation paths are being updated. Please try again shortly."],
    ["Ungültiger Installationsordner.", "Invalid installation folder."],
    ["Der gewählte Ordner enthält keine common/genes-Definitionen. Bitte den CK3-Spielordner oder Mod-Ordner auswählen.", "The selected folder contains no common/genes definitions. Choose the CK3 game folder or the mod folder."],
    ["Das Bibliothekspaket ist zu groß.", "The library package is too large."],
    ["Das Bibliothekspaket enthält kein gültiges JSON.", "The library package contains invalid JSON."],
    ["DNA muss reines, korrekt aufgefülltes Base64 sein.", "DNA must be plain, correctly padded Base64."],
    ["Die Base64-DNA ist nicht kanonisch oder enthält unvollständige Gene.", "The Base64 DNA is non-canonical or contains incomplete genes."],
    ["Text-DNA enthält unausgeglichene Klammern.", "Text DNA contains unbalanced braces."],
    ["Text-DNA muss einen vollständigen genes-Block enthalten.", "Text DNA must contain a complete genes block."],
    ["Porträts können nur über die Bildauswahl gespeichert werden.", "Portraits can only be saved using the image picker."],
    ["Favorit muss ein Wahrheitswert sein.", "Favorite must be a boolean."],
    ["Unbekanntes DNA-Format.", "Unknown DNA format."],
    ["Unbekanntes Quell- oder Zielprofil.", "Unknown source or target profile."],
    ["Unbekanntes Geschlecht.", "Unknown sex."],
    ["Schema-Informationen müssen ein Objekt sein.", "Schema information must be an object."],
    ["Verlustbericht muss eine Liste sein.", "Loss report must be a list."],
    ["Ungültige Bibliotheks-ID.", "Invalid library ID."],
    ["Das Porträt hat eine ungültige Bildgröße.", "The portrait has invalid image dimensions."],
    ["Das Porträt hat einen ungültigen Dateinamen.", "The portrait has an invalid filename."],
    ["Das Porträt muss ein gültiges PNG mit höchstens 8 MiB sein.", "The portrait must be a valid PNG no larger than 8 MiB."],
    ["Das PNG-Porträt ist unvollständig.", "The PNG portrait is incomplete."],
    ["Das PNG-Porträt enthält ungültige Daten.", "The PNG portrait contains invalid data."],
    ["Das PNG-Porträt hat keinen gültigen Bildkopf.", "The PNG portrait has no valid image header."],
    ["Die Porträtgröße stimmt nicht mit dem PNG überein.", "The portrait dimensions do not match the PNG."],
    ["Das PNG-Porträt enthält keine vollständigen Bilddaten.", "The PNG portrait does not contain complete image data."],
    ["Die Version der DNA-Bibliothek wird nicht unterstützt. Die Datei wurde nicht verändert.", "This DNA library version is not supported. The file was not changed."],
    ["Die Bibliotheksdatei enthält eine ungültige Eintragsliste.", "The library file contains an invalid entry list."],
    ["Ein gespeicherter Eintrag ist unvollständig.", "A saved entry is incomplete."],
    ["Die Bibliothek enthält doppelte IDs.", "The library contains duplicate IDs."],
    ["Ein gespeicherter Zeitstempel ist ungültig.", "A saved timestamp is invalid."],
    ["Die gespeicherten Zeitstempel sind widersprüchlich.", "The saved timestamps are inconsistent."],
    ["Die Bibliotheksdatei benötigt einen festen absoluten Pfad.", "The library file requires a fixed absolute path."],
    ["Die Bibliotheksdatei ist zu groß.", "The library file is too large."],
    ["Die DNA-Bibliothek ist beschädigt oder enthält ungültige Daten. Die Datei wurde nicht verändert.", "The DNA library is damaged or contains invalid data. The file was not changed."],
    ["Der Porträtordner ist ungültig.", "The portrait folder is invalid."],
    ["Der Bibliothekseintrag existiert nicht mehr.", "The library entry no longer exists."],
    ["Die Bibliothek ist voll. Bitte zuerst einen Eintrag löschen.", "The library is full. Delete an entry first."],
    ["Keine Änderungen angegeben.", "No changes were provided."],
    ["Bitte ein Bild mit höchstens 12 MB auswählen.", "Choose an image no larger than 12 MB."],
    ["Unterstützt werden PNG-, JPEG- und WebP-Bilder.", "PNG, JPEG and WebP images are supported."],
    ["Das Bild konnte nicht gelesen werden.", "The image could not be read."],
    ["Das Bild ist zu groß. Bitte eine kleinere Fassung verwenden.", "The image is too large. Use a smaller version."],
    ["Das Bild ist nach dem Einlesen zu groß.", "The image is too large after decoding."],
    ["Bibliothekseintrag nicht gefunden.", "Library entry not found."],
    ["Die Zwischenablage enthält kein Bild.", "The clipboard does not contain an image."],
    ["Dieser Bibliothekseintrag wurde nicht gefunden.", "This library entry was not found."],
    ["DNA konnte nicht gelesen werden.", "DNA could not be read."],
    ["Die App wird beendet.", "The app is shutting down."],
    ["Die lokale Verarbeitung hat ungueltig geantwortet.", "Local processing returned an invalid response."],
    ["Lokale Verarbeitung fehlgeschlagen.", "Local processing failed."],
    ["Die lokale Verarbeitung wurde beendet.", "Local processing stopped."],
    ["DNA-Eingabe ist zu gross.", "DNA input is too large."],
    ["Die lokale Verarbeitung antwortet nicht. App erneut oeffnen.", "Local processing is not responding. Reopen the app."],
    ["Die Anfrage ist abgelaufen. Bitte erneut versuchen; es wurde keine neue Aktion gestartet.", "The request expired. Try again; no new action was started."],
    ["Unbekannte Aktion.", "Unknown action."],
    ["Ungueltige Anfrage.", "Invalid request."],
    ["Aktive Mod-Zusammenstellung nicht lesbar.", "The active mod configuration could not be read."],
    ["Ungültiger Mod-Eintrag.", "Invalid mod entry."],
    ["Ein aktiver Mod-Pfad kann nicht geprüft werden.", "An active mod path could not be checked."],
    ["Ein aktiver Mod ersetzt Gen-Verzeichnisse. Bitte DNA zuerst für diese Zusammenstellung neu konvertieren.", "An active mod replaces gene folders. Reconvert the DNA for this configuration first."],
    ["EPE und AGOT sind zugleich aktiviert. Zielprofil nicht eindeutig.", "EPE and AGOT are both enabled. The target profile is ambiguous."],
    ["Aktive Porträt-Submods verändern die reguläre Gen-Reihenfolge oder Vorlagen. Bitte für diese Zusammenstellung neu konvertieren.", "Active portrait submods change the ordinary gene order or templates. Reconvert for this configuration."],
    ["Ein aktiver Mod ändert die Farbpaletten. Diese Bibliotheks-DNA bitte neu konvertieren.", "An active mod changes the color palettes. Reconvert this library DNA."],
    ["Bibliothekseintrag fehlt.", "Library entry is missing."],
    ["Dieser Eintrag enthält Text-DNA. Zuerst als DNA String (Base64) konvertieren und speichern.", "This entry contains text DNA. Convert and save it as a DNA String (Base64) first."],
    ["Die Charakterauswahl hat sich geändert. Anzeige aktualisieren lassen.", "The character selection changed. Wait for the display to refresh."],
    ["Das gespeicherte Zielprofil passt nicht zur aktiven Mod-Zusammenstellung. Bitte neu konvertieren.", "The saved target profile does not match the active mod configuration. Reconvert the DNA."],
    ["Die Gen-Definitionen haben sich geändert oder fehlen im Eintrag. Bitte erneut konvertieren.", "Gene definitions changed or are missing from the entry. Reconvert the DNA."],
    ["Die gespeicherte Spielversion weicht ab. Bitte erneut konvertieren.", "The saved game version differs. Reconvert the DNA."],
    ["Die Gen-Anzahl des ausgewählten Charakters passt nicht zum Profil.", "The selected character's gene count does not match the profile."],
    ["Profil, Gen-Definitionen und Länge passen zur aktuellen Auswahl.", "Profile, gene definitions and length match the current selection."],
    ["Bitte eine rohe Base64-DNA einfügen.", "Paste raw Base64 DNA."],
    ["Die Zwischenablage enthält keine gültige rohe Base64-DNA.", "The clipboard does not contain valid raw Base64 DNA."],
    ["Die Base64-DNA ist beschädigt.", "The Base64 DNA is damaged."],
    ["Die DNA hat ungültiges Padding oder unvollständige Gene.", "The DNA has invalid padding or incomplete genes."],
    ["Direkter Spielzugriff ist nur unter Windows verfügbar.", "Direct game access is only available on Windows."],
    ["CK3 ist nicht gestartet.", "CK3 is not running."],
    ["Mehrere CK3-Prozesse gefunden. Bitte nur eine Instanz öffnen.", "Multiple CK3 processes found. Open only one instance."],
    ["Kein Zugriff auf CK3. App und Spiel mit denselben Benutzerrechten starten.", "Cannot access CK3. Start the app and game with the same user permissions."],
    ["Der CK3-Prozess konnte nicht untersucht werden.", "The CK3 process could not be inspected."],
    ["Das laufende CK3-Modul wurde nicht gefunden.", "The running CK3 module was not found."],
    ["Ungültige CK3-Speicheradresse.", "Invalid CK3 memory address."],
    ["CK3-Daten sind nicht mehr lesbar. Auswahl erneut öffnen.", "CK3 data is no longer readable. Reopen the selection."],
    ["Dieser Zugriff ist nur lesend.", "This access is read-only."],
    ["Kein Charakterfenster verfügbar. Im geladenen Spiel einen Charakter öffnen.", "No character window is available. Open a character in the loaded game."],
    ["Zuerst einen CK3-Spielstand laden.", "Load a CK3 save first."],
    ["Die Spieloberfläche ist noch nicht verfügbar.", "The game interface is not available yet."],
    ["Bitte das normale Charakterfenster in CK3 öffnen.", "Open the normal character window in CK3."],
    ["Kein Charakter ausgewählt.", "No character selected."],
    ["Die Charakterauswahl hat sich geändert.", "The character selection changed."],
    ["Die Charakterauswahl ist nicht mehr gültig.", "The character selection is no longer valid."],
    ["Die DNA-Struktur passt nicht zum geprüften Build.", "The DNA structure does not match the verified build."],
    ["Der Charaktername ist nicht lesbar.", "The character name could not be read."],
    ["Der DNA-Prüfwert passt nicht. Spiel pausieren und Charakterfenster erneut öffnen.", "The DNA checksum does not match. Pause the game and reopen the character window."],
    ["Die automatische Charaktererkennung ist noch nicht bereit.", "Automatic character detection is not ready yet."],
    ["Der ausgewählte Charakter hat sich geändert. Die Anzeige kurz aktualisieren lassen und erneut klicken.", "The selected character changed. Wait for the display to refresh, then click again."],
    ["Die DNA ist bereits identisch.", "The DNA is already identical."],
    ["Auswahl oder DNA hat sich geändert. Erneut versuchen.", "The selection or DNA changed. Try again."],
    ["Ungültiges Zeitlimit. Nichts wurde geändert.", "Invalid time limit. Nothing was changed."],
    ["Zeitlimit abgelaufen. Nichts wurde geändert.", "Time limit expired. Nothing was changed."],
    ["DNA-Schreiben fehlgeschlagen.", "Writing DNA failed."],
    ["Prüfwert-Schreiben fehlgeschlagen.", "Writing the checksum failed."],
    ["Die Änderung konnte nicht bestätigt werden.", "The change could not be verified."],
    ["Unbekannte Spielaktion.", "Unknown game action."],
    ["Bitte jeweils einen DNA-Charakterblock oder einen genes={...}-Block einfügen.", "Paste one DNA character block at a time, or one genes={...} block."],
    ["portrait_info muss ein Block sein.", "portrait_info must be a block."],
    ["Die Text-DNA enthält keinen genes-Block.", "DNA text does not contain a genes block."],
    ["Ungültige Länge der Base64-DNA.", "Invalid Base64 DNA length."],
    ["DNA ist kein gültiges Base64.", "DNA is not valid Base64."],
    ["DNA hat ungültiges oder nicht kanonisches Base64-Padding.", "DNA has invalid/non-canonical Base64 padding."],
    ["Codierte DNA benötigt genau den aktuellen regulären Gensatz.", "Encoded DNA requires exactly the current ordinary gene set."],
    ["Nicht unterstütztes DNA-Zielformat.", "Unsupported target DNA format."],
    ["Vor dem Konvertieren DNA einfügen.", "Paste DNA before converting."],
    ["Die DNA-Eingabe ist zu groß.", "DNA input is too large."],
    ["Die Eingabe enthält keine vollständigen Charakterdaten. Der Textexport verwendet male/id=0 als Vorgabe; rohe DNA enthält kein Geschlecht, Alter oder Charakter-ID.", "Input has no complete character metadata. Text export uses male/id=0 defaults; raw DNA does not encode gender, age or character ID."],
    ["Gemeinsame Gennamen, Allelvorlagen und Stärkewerte werden soweit unterstützt erhalten. Unterschiedliche Mod-Modelle und Texturen können zu einem abweichenden Aussehen führen.", "Shared gene names, allele templates and strength values are preserved where supported. Different mod meshes/textures mean identical appearance cannot be guaranteed."],
    ["konfigurierte ähnliche Vorlage", "configured similar template"],
    ["ähnlicher Vorlagenname; optische Annäherung", "similar template name; visual approximation"],
    ["unterstützte Vorlage des anderen Allels; optische Annäherung", "supported sibling template; visual approximation"],
    ["einzige verfügbare Zielvorlage", "only available target template"],
    ["Standardvorlage des Ziels; optische Annäherung", "target default template; visual approximation"],
    ["Quell- und Zielporträtpaletten unterscheiden sich. Die ähnlichsten abgetasteten Zielfarben sind eine Annäherung; Spielschattierung, Interpolation und Sättigung können weiterhin abweichen.", "Source and target portrait palettes differ. Closest sampled target colors are an approximation; game shading, interpolation and saturation can still differ."],
    ["Keine Darstellung im gewählten Zielschema oder Zielformat.", "No representation in the selected target schema/format."],
    ["Kein Quellallel vorhanden. Mit der Zielvorlage mit dem niedrigsten Index und Stärke null initialisiert.", "No source allele supplied. Initialized with the lowest-index target template and zero strength."],
    ["Undurchsichtige Metadaten des Quellmods werden nicht auf einen anderen Zielmod angewendet.", "Opaque source-mod metadata is not applied to a different target mod."],
    ["Rohe Base64-DNA kann keine Porträtmetadaten aus Text speichern.", "Raw Base64 DNA cannot store text portrait metadata."],
    ["256x256-Raster normalisierter Byte-Koordinaten; nächster Texel auf der CPU; CIE Lab + Alpha-Metrik", "256x256 normalized byte-coordinate grid; CPU nearest texel; CIE Lab + alpha metric"],
    ["Unerwartete schließende Klammer in den Gen-Definitionen.", "Unexpected closing brace in gene definitions."],
    ["Wert der Gen-Definition fehlt.", "Missing gene definition value."],
    ["Wert der Gen-Definition vor der schließenden Klammer fehlt.", "Missing gene definition value before closing brace."],
    ["Nicht geschlossener Block in den Gen-Definitionen.", "Unclosed gene definition block."],
    ["Installierte CK3-Gen-Definitionen wurden nicht gefunden. CK3_GENES_DIR auf game/common/genes setzen.", "Installed CK3 gene definitions were not found. Set CK3_GENES_DIR to game/common/genes."],
    ["Die Eingabe ist leer.", "Input is empty."],
    ["Die Eingabe muss mit '<portrait_key>={' beginnen.", "Input must start with '<portrait_key>={'."],
    ["Unerwarteter Inhalt nach der schließenden Hauptklammer.", "Unexpected content found after the closing root brace."],
    ["Der genes-Block ist leer.", "The genes block is empty."],
    ["Der entity-Block muss genau zwei Ganzzahlen enthalten.", "The entity block must contain exactly two integer values."],
    ["Der Index der öffnenden Klammer muss auf '{' zeigen.", "Opening brace index must point at '{'."],
    ["Unausgeglichene Klammern in der Herrscherdesigner-Text-DNA.", "Unbalanced braces in ruler designer text."],
  ];

  // Anchored complete diagnostic templates keep inserted payloads byte-for-byte.
  // Placeholders are positional and may contain punctuation, Unicode or newlines.
  const templates = [
    ["Das Porträt für „{name}“ fehlt oder ist beschädigt. Bitte neu auswählen oder entfernen und den Export wiederholen.", "The portrait for “{name}” is missing or corrupt. Select it again or remove it, then retry the export."],
    ["Dieser CK3-Build ist für den direkten Spielzugriff nicht geprüft. Unterstützt: {versions}.", "This CK3 build has not been verified for direct game access. Supported: {versions}."],
    ["DNA-Länge passt nicht: {inserted} Bytes eingefügt, {required} benötigt. Nichts wurde geändert.", "DNA length mismatch: pasted {inserted} bytes, {required} required. Nothing was changed."],
    ["DNA von {name} (ID {id}) ersetzt und geprüft. Charakterfenster erneut öffnen.", "Replaced and verified DNA for {name} (ID {id}). Reopen the character window."],
    ["{mode} DNA-Länge passt nicht zu den installierten Definitionen: {expected} Bytes ({genes} Gene) erwartet, {received} erhalten. Es wurden keine Daten abgeschnitten. Ältere DNA bitte als Text-DNA mit Gennamen aus ihrer ursprünglichen Spiel-/Modversion exportieren.", "{mode} DNA length does not match the installed definitions: expected {expected} bytes ({genes} genes), received {received}. No data was truncated. For older DNA, export named text DNA from its original game/mod version."],
    ["Unbekannter {mode}-Vorlagencode in {gene}: {a}, {c}. Die DNA passt nicht zu diesem installierten Schema; es wurde keine Dekodierung anhand von Vermutungen versucht.", "Unknown {mode} template code in {gene}: {a}, {c}. The DNA does not match this installed schema; no guessed decoding was attempted."],
    ["{gene} muss vier Farbkoordinaten-Bytes enthalten.", "{gene} must contain four color-coordinate bytes."],
    ["{gene} muss zwei Vorlage/Wert-Allele enthalten.", "{gene} must contain two template/value alleles."],
    ["Unbekannte Zielvorlage für {gene}: {token}.", "Unknown target template for {gene}: {token}."],
    ["{gene} kann nicht als reguläre Vier-Byte-DNA dargestellt werden. Vorlagenindizes über 255 werden nur in Text-DNA mit Gennamen unterstützt.", "{gene} cannot be represented by four-byte ordinary DNA. Template indexes above 255 remain supported in named text only."],
    ["Keine Zielvorlagen für {gene} verfügbar.", "No target templates available for {gene}."],
    ["{gene} muss vier Farbkoordinaten enthalten.", "{gene} must contain four color coordinates."],
    ["{gene} benötigt Vorlage/Wert-Paare.", "{gene} requires template/value pairs."],
    ["{count} nicht unterstützte oder geänderte Elemente benötigen verlustbehaftete Ersatzwerte. Es wurde keine konvertierte Ausgabe erzeugt.", "{count} unsupported or changed item(s) require Lossy Fallbacks. No converted output was produced."],
    ["{count} Elemente angenähert, ausgelassen oder initialisiert; siehe Verlustbericht pro Gen.", "{count} item(s) approximated, omitted or initialized; see the per-gene loss report."],
    ["{count} Elemente müssten angenähert, ausgelassen oder initialisiert werden; die strikte Konvertierung wurde gestoppt.", "{count} item(s) would need approximation, omission or initialization; strict conversion was stopped."],
    ["Installierte Schemas: {source} ({sourceCount} Gene) -> {target} ({targetCount} Gene). {preserved} übergebene Gene exakt erhalten.", "Installed schemas: {source} ({sourceCount} genes) -> {target} ({targetCount} genes). Preserved {preserved} supplied gene(s) exactly."],
    ["Palette nicht verfügbar: {file}.", "Palette unavailable: {file}."],
    ["Installierte {mod}-Gen-Definitionen wurden nicht gefunden. {variable} auf common/genes dieses Mods setzen.", "Installed {mod} gene definitions were not found. Set {variable} to that mod's common/genes."],
    ["Nicht unterstütztes DNA-Profil: {profile}.", "Unsupported DNA profile: {profile}."],
    ["Nicht numerischer Vorlagenindex: {location}.", "Non-numeric template index: {location}."],
    ["Ungültiger Vorlagenindex: {location}.", "Invalid template index: {location}."],
    ["Keine expliziten Vorlagenindizes in {location}.", "No explicit template indexes in {location}."],
    ["Mehrdeutige doppelte Vorlagenindizes in {location}.", "Ambiguous duplicate template indexes in {location}."],
    ["Erforderliche Hauptfelder fehlen: {fields}.", "Missing required top-level field(s): {fields}."],
    ["Doppeltes Hauptfeld '{field}'.", "Duplicate top-level field '{field}'."],
    ["Nach dem Hauptfeld '{field}' wird '=' erwartet.", "Expected '=' after top-level field '{field}'."],
    ["Wert für Hauptfeld '{field}' fehlt.", "Missing value for top-level field '{field}'."],
    ["Skalarwert für Hauptfeld '{field}' fehlt.", "Missing scalar value for top-level field '{field}'."],
    ["Unbekannte Hauptfelder: {fields}.", "Unknown top-level field(s): {fields}."],
    ["Doppeltes Genfeld '{gene}'.", "Duplicate gene field '{gene}'."],
    ["Nach dem Genfeld '{gene}' wird '=' erwartet.", "Expected '=' after gene field '{gene}'."],
    ["Zum Beginn von Genfeld '{gene}' wird '{' erwartet.", "Expected '{' to start gene field '{gene}'."],
    ["Nicht unterstütztes Genfeldformat für '{gene}'.", "Unsupported gene field format for '{gene}'."],
    ["Hauptfeld '{field}' muss ein Skalarwert sein.", "Top-level field '{field}' must be a scalar value."],
    ["Hauptfeld '{field}' muss ein Blockwert sein.", "Top-level field '{field}' must be a block value."],
    ["In der Nähe von '{snippet}' wird ein Bezeichner erwartet.", "Expected an identifier near '{snippet}'."],
    ["Feld '{field}' muss eine Ganzzahl sein.", "Field '{field}' must be an integer."],
    ["Feld '{field}' muss eine Fließkommazahl sein.", "Field '{field}' must be a float."],
    ["Feld '{field}' muss zwischen 0 und 255 liegen.", "Field '{field}' must be between 0 and 255."],
  ];

  const labels = [
    ["Bibliothekspaket", "Library package"], ["Importeintrag", "Imported entry"], ["Importporträt", "Imported portrait"],
    ["Bibliothekseintrag", "Library entry"], ["Name", "Name"], ["Notiz", "Note"],
    ["DNA", "DNA"], ["Original-DNA", "Original DNA"], ["Schema-Informationen", "Schema information"],
    ["Verlustbericht", "Loss report"], ["Porträtgröße", "Portrait dimensions"], ["Porträt", "Portrait"],
    ["Bibliotheksdatei", "Library file"], ["Gespeicherter Eintrag", "Saved entry"], ["Änderung", "Change"],
  ];
  for (const [de, en] of labels) {
    for (const [deSuffix, enSuffix] of [
      [" muss ein Objekt sein.", " must be an object."],
      [" enthält unbekannte Felder.", " contains unknown fields."],
      [" darf nicht leer sein.", " must not be empty."],
      [" ist zu umfangreich.", " is too large."],
      [" enthält einen ungültigen Schlüssel.", " contains an invalid key."],
      [" muss gültige JSON-Daten enthalten.", " must contain valid JSON data."],
    ]) pairs.push([de + deSuffix, en + enSuffix]);
    templates.push([de + " ist ungültig oder zu lang (maximal {max} Zeichen).", en + " is invalid or too long (maximum {max} characters)."]);
  }

  const exact = { de: new Map(), en: new Map() };
  for (const [de, en] of pairs) {
    exact.en.set(de, en);
    exact.de.set(en, de);
  }
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function compile(source, target) {
    const names = [];
    let end = 0, pattern = "^";
    for (const match of source.matchAll(/\{([a-zA-Z]+)\}/g)) {
      pattern += escape(source.slice(end, match.index)) + "([\\s\\S]+?)";
      names.push(match[1]);
      end = match.index + match[0].length;
    }
    pattern += escape(source.slice(end)) + "$";
    return { regex: new RegExp(pattern), names, target };
  }
  const rules = { de: [], en: [] };
  for (const [de, en] of templates) {
    rules.en.push(compile(de, en));
    rules.de.push(compile(en, de));
  }

  function translate(text, lang) {
    if (typeof text !== "string" || !text) return text;
    const language = String(lang || "de").toLowerCase().split(/[-_]/)[0];
    if (language !== "en" && language !== "de") return text;
    const known = exact[language].get(text);
    if (known !== undefined) return known;

    // Electron wraps rejected IPC calls. Preserve its channel and technical prefix.
    const electron = /^(Error invoking remote method '[^']+': (?:Error: )?)([\s\S]+)$/.exec(text);
    if (electron) return electron[1] + translate(electron[2], language);
    const error = /^(Error: )([\s\S]+)$/.exec(text);
    if (error) return error[1] + translate(error[2], language);

    // Composite live errors contain another complete diagnostic before the outcome.
    for (const [de, en] of [
      [" Die ursprüngliche DNA wurde wiederhergestellt.", " The original DNA was restored."],
      [" Wiederherstellung nicht bestätigt! Spielstand NICHT speichern; Spielstand erneut laden.", " Restoration was not verified! Do NOT save the game; reload the save."],
    ]) {
      const source = language === "en" ? de : en;
      if (text.endsWith(source)) return translate(text.slice(0, -source.length), language) + (language === "en" ? en : de);
    }
    const palette = language === "de"
      ? /^Cannot read portrait palette ([^:\r\n]+): ([\s\S]+)$/.exec(text)
      : /^Porträtpalette ([^:\r\n]+) kann nicht gelesen werden: ([\s\S]+)$/.exec(text);
    if (palette) return (language === "de" ? `Porträtpalette ${palette[1]} kann nicht gelesen werden: ` : `Cannot read portrait palette ${palette[1]}: `) + translate(palette[2], language);

    for (const rule of rules[language]) {
      const match = rule.regex.exec(text);
      if (!match) continue;
      const values = Object.create(null);
      rule.names.forEach((name, index) => { values[name] = match[index + 1]; });
      return rule.target.replace(/\{([a-zA-Z]+)\}/g, (_, name) => values[name]);
    }
    return text;
  }
  return Object.freeze({ translate });
});

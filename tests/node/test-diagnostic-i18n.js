"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { translate } = require("../../src/shared/diagnostic-i18n");
const sourceRoot = path.resolve(__dirname, "../..");

const examples = [
  ["CK3 ist nicht gestartet.", "CK3 is not running."],
  ["Notiz ist ungültig oder zu lang (maximal 2000 Zeichen).", "Note is invalid or too long (maximum 2000 characters)."],
  ["Schema-Informationen enthält einen ungültigen Schlüssel.", "Schema information contains an invalid key."],
  ["Bibliothekseintrag muss ein Objekt sein.", "Library entry must be an object."],
  ["Dieser CK3-Build ist für den direkten Spielzugriff nicht geprüft. Unterstützt: 1.20.1.2 / Steam 26046173.", "This CK3 build has not been verified for direct game access. Supported: 1.20.1.2 / Steam 26046173."],
  ["DNA-Länge passt nicht: 512 Bytes eingefügt, 520 benötigt. Nichts wurde geändert.", "DNA length mismatch: pasted 512 bytes, 520 required. Nothing was changed."],
  ["DNA von König Ägir 'the Bold' $& (ID 1012) ersetzt und geprüft. Charakterfenster erneut öffnen.", "Replaced and verified DNA for König Ägir 'the Bold' $& (ID 1012). Reopen the character window."],
  ["EPE DNA-Länge passt nicht zu den installierten Definitionen: 520 Bytes (130 Gene) erwartet, 516 erhalten. Es wurden keine Daten abgeschnitten. Ältere DNA bitte als Text-DNA mit Gennamen aus ihrer ursprünglichen Spiel-/Modversion exportieren.", "EPE DNA length does not match the installed definitions: expected 520 bytes (130 genes), received 516. No data was truncated. For older DNA, export named text DNA from its original game/mod version."],
  ["Unbekannter AGOT-Vorlagencode in gene_bs_eye_fold_shape: 254, 255. Die DNA passt nicht zu diesem installierten Schema; es wurde keine Dekodierung anhand von Vermutungen versucht.", "Unknown AGOT template code in gene_bs_eye_fold_shape: 254, 255. The DNA does not match this installed schema; no guessed decoding was attempted."],
  ["hair_color muss vier Farbkoordinaten-Bytes enthalten.", "hair_color must contain four color-coordinate bytes."],
  ["gene_age muss zwei Vorlage/Wert-Allele enthalten.", "gene_age must contain two template/value alleles."],
  ["Unbekannte Zielvorlage für gene_age: 'old_4'.", "Unknown target template for gene_age: 'old_4'."],
  ["gene_age kann nicht als reguläre Vier-Byte-DNA dargestellt werden. Vorlagenindizes über 255 werden nur in Text-DNA mit Gennamen unterstützt.", "gene_age cannot be represented by four-byte ordinary DNA. Template indexes above 255 remain supported in named text only."],
  ["Keine Zielvorlagen für gene_age verfügbar.", "No target templates available for gene_age."],
  ["skin_color muss vier Farbkoordinaten enthalten.", "skin_color must contain four color coordinates."],
  ["gene_age benötigt Vorlage/Wert-Paare.", "gene_age requires template/value pairs."],
  ["13 nicht unterstützte oder geänderte Elemente benötigen verlustbehaftete Ersatzwerte. Es wurde keine konvertierte Ausgabe erzeugt.", "13 unsupported or changed item(s) require Lossy Fallbacks. No converted output was produced."],
  ["13 Elemente angenähert, ausgelassen oder initialisiert; siehe Verlustbericht pro Gen.", "13 item(s) approximated, omitted or initialized; see the per-gene loss report."],
  ["13 Elemente müssten angenähert, ausgelassen oder initialisiert werden; die strikte Konvertierung wurde gestoppt.", "13 item(s) would need approximation, omission or initialization; strict conversion was stopped."],
  ["Installierte Schemas: NONE 1.20.1.2 (128 Gene) -> EPE 2.0 / CK3 1.20.* (130 Gene). 127 übergebene Gene exakt erhalten.", "Installed schemas: NONE 1.20.1.2 (128 genes) -> EPE 2.0 / CK3 1.20.* (130 genes). Preserved 127 supplied gene(s) exactly."],
  ["Palette nicht verfügbar: eye_palette.dds.", "Palette unavailable: eye_palette.dds."],
  ["Porträtpalette skin_palette.dds kann nicht gelesen werden: cannot identify image file 'C:\\Mods\\Ägir\\skin_palette.dds'", "Cannot read portrait palette skin_palette.dds: cannot identify image file 'C:\\Mods\\Ägir\\skin_palette.dds'"],
  ["Installierte EPE-Gen-Definitionen wurden nicht gefunden. CK3_EPE_GENES_DIR auf common/genes dieses Mods setzen.", "Installed EPE gene definitions were not found. Set CK3_EPE_GENES_DIR to that mod's common/genes."],
  ["Nicht unterstütztes DNA-Profil: custom-profile.", "Unsupported DNA profile: custom-profile."],
  ["Nicht numerischer Vorlagenindex: 01_Ägir.txt/gene_age/old_4.", "Non-numeric template index: 01_Ägir.txt/gene_age/old_4."],
  ["Ungültiger Vorlagenindex: 01_Ägir.txt/gene_age/old_4.", "Invalid template index: 01_Ägir.txt/gene_age/old_4."],
  ["Keine expliziten Vorlagenindizes in 01_Ägir.txt/gene_age.", "No explicit template indexes in 01_Ägir.txt/gene_age."],
  ["Mehrdeutige doppelte Vorlagenindizes in 01_Ägir.txt/gene_age.", "Ambiguous duplicate template indexes in 01_Ägir.txt/gene_age."],
  ["Erforderliche Hauptfelder fehlen: genes, id.", "Missing required top-level field(s): genes, id."],
  ["Doppeltes Genfeld 'eye_color'.", "Duplicate gene field 'eye_color'."],
  ["Nach dem Genfeld 'eye_color' wird '=' erwartet.", "Expected '=' after gene field 'eye_color'."],
  ["Zum Beginn von Genfeld 'eye_color' wird '{' erwartet.", "Expected '{' to start gene field 'eye_color'."],
  ["Nicht unterstütztes Genfeldformat für 'eye_color'.", "Unsupported gene field format for 'eye_color'."],
  ["Hauptfeld 'genes' muss ein Blockwert sein.", "Top-level field 'genes' must be a block value."],
  ["Hauptfeld 'id' muss ein Skalarwert sein.", "Top-level field 'id' must be a scalar value."],
  ["In der Nähe von 'a=b\\n' wird ein Bezeichner erwartet.", "Expected an identifier near 'a=b\\n'."],
  ["Feld 'gene_age.first_value' muss zwischen 0 und 255 liegen.", "Field 'gene_age.first_value' must be between 0 and 255."],
  ["Feld 'id' muss eine Ganzzahl sein.", "Field 'id' must be an integer."],
  ["Feld 'age' muss eine Fließkommazahl sein.", "Field 'age' must be a float."],
];
for (const [de, en] of examples) {
  assert.equal(translate(de, "en"), en);
  assert.equal(translate(en, "de"), de);
  assert.equal(translate(en, "en"), en);
  assert.equal(translate(de, "de"), de);
}

for (const [deSuffix, enSuffix] of [
  [" Die ursprüngliche DNA wurde wiederhergestellt.", " The original DNA was restored."],
  [" Wiederherstellung nicht bestätigt! Spielstand NICHT speichern; Spielstand erneut laden.", " Restoration was not verified! Do NOT save the game; reload the save."],
]) {
  assert.equal(translate("DNA-Schreiben fehlgeschlagen." + deSuffix, "en"), "Writing DNA failed." + enSuffix);
  assert.equal(translate("Writing DNA failed." + enSuffix, "de"), "DNA-Schreiben fehlgeschlagen." + deSuffix);
}
const prefix = "Error invoking remote method 'game:paste': Error: ";
assert.equal(translate(prefix + "DNA-Schreiben fehlgeschlagen. Die ursprüngliche DNA wurde wiederhergestellt.", "en"), prefix + "Writing DNA failed. The original DNA was restored.");
assert.equal(translate("Error: Kein Charakter ausgewählt.", "en-US"), "Error: No character selected.");
assert.equal(translate("No character selected.", "de-DE"), "Kein Charakter ausgewählt.");
for (const value of [null, undefined, 17, {}, "", "AAAA/AA==", "gene_age", "C:\\Mods\\Kein Charakter ausgewählt.\\dna.txt", "A new backend message.", "Prefix CK3 ist nicht gestartet. Suffix"]) {
  assert.equal(translate(value, "en"), value);
  assert.equal(translate(value, "de"), value);
}
assert.equal(translate("CK3 ist nicht gestartet.", "fr"), "CK3 ist nicht gestartet.");

// All fixed error literals from the actual active entry points must be covered.
// This catches newly added backend validation without relying on duplicated lists.
const pythonFiles = [
  "bridge.py", "live_game.py", "library_compat.py",
  "src/ck3_dna_converter_core/core/services/runtime_conversion.py",
  "src/ck3_dna_converter_core/core/services/palette_conversion.py",
  "src/ck3_dna_converter_core/core/tables/current_schemas.py",
  "src/ck3_dna_converter_core/core/parsing/parse_ruler_designer.py",
];
let covered = 0;
function checkDiagnostic(message, filename) {
  const de = translate(message, "de"), en = translate(message, "en");
  assert.notEqual(de, en, `Untranslated diagnostic in ${filename}: ${message}`);
  assert.equal(translate(en, "en"), en);
  assert.equal(translate(de, "de"), de);
  covered++;
}
for (const filename of ["library-store.js", "main.js", "python-bridge.js"]) {
  const source = fs.readFileSync(path.join(sourceRoot, "src/main", filename), "utf8");
  for (const match of source.matchAll(/(?:\bfail|new Error)\(\s*("(?:\\.|[^"\\])*")/g)) {
    checkDiagnostic(JSON.parse(match[1]), filename);
  }
}
for (const filename of pythonFiles) {
  const source = fs.readFileSync(path.join(sourceRoot, "backend/python", filename), "utf8");
  for (const match of source.matchAll(/raise\s+(?:ValueError|LiveGameError|RulerDesignerParseError)\(\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
    checkDiagnostic(match[2].replace(/\\'/g, "'").replace(/\\"/g, '"'), filename);
  }
}
assert.ok(covered > 100, `Expected broad active-source coverage, received ${covered}`);

// Verify the browser interface independently of CommonJS / Node globals.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(sourceRoot, "src/shared/diagnostic-i18n.js"), "utf8"), context);
assert.equal(context.DiagnosticI18n.translate("CK3 ist nicht gestartet.", "en"), "CK3 is not running.");
assert.deepEqual(Object.keys(context.DiagnosticI18n), ["translate"]);
console.log(`Diagnostic translation tests passed (${covered} active-source literals and ${examples.length} bilingual dynamic examples).`);

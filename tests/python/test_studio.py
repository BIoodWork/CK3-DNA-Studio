"""Editor safety and auto-detection against real installed CK3/mod definitions."""
from pathlib import Path
import base64
import json
import sys
import unittest
from io import BytesIO
from unittest.mock import patch
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend/python/src'))
sys.path.insert(0, str(ROOT / 'backend/python'))
from ck3_dna_converter_core.core.domain.types import ColorGeneValue, TokenPairGeneValue
from ck3_dna_converter_core.core.services.runtime_conversion import _neutral, decode_current, encode_current
from ck3_dna_converter_core.core.services.studio import studio_detect, studio_catalog, studio_encode, studio_palette
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema
from bridge import process_request


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schemas = {mode: load_current_schema(mode) for mode in ('none', 'epe', 'agot')}
        cls.live = base64.b64encode((ROOT / 'tests/fixtures/live_dna.bin').read_bytes()).decode()
        cls.agot_text = (ROOT / 'tests/fixtures/agot_sample.txt').read_text(encoding='utf-8')

    def test_all_installed_raw_profiles_detect_and_edit_roundtrip(self):
        for mode, schema in self.schemas.items():
            with self.subTest(mode=mode):
                original_genes = {n: _neutral(d) for n, d in schema.genes.items()}
                original = encode_current(original_genes, schema)
                detected = studio_detect(original)
                self.assertEqual((detected['status'], detected['profile']), ('ready', mode))
                self.assertEqual(detected['encoded'], original)
                self.assertEqual(detected['geneCount'], len(schema.genes))
                result = studio_encode(original, mode, [{'name': 'hair_color', 'values': [12, 34, 56, 78]}])
                changed = decode_current(result['output'], schema)
                self.assertEqual(changed['hair_color'], ColorGeneValue((12, 34, 56, 78)))
                original_genes['hair_color'] = changed['hair_color']
                self.assertEqual(changed, original_genes)
                self.assertEqual(result['original'], original)
                self.assertEqual(result['schemaInfo']['target']['fingerprint'], schema.fingerprint)

    def test_shared_text_is_ambiguous_and_requires_selection(self):
        text = 'genes={ hair_color={1 2 3 4} }'
        result = studio_detect(text)
        self.assertEqual(result['status'], 'ambiguous')
        self.assertIsNone(result['profile'])
        self.assertEqual(result['candidates'], ['none', 'epe', 'agot'])
        self.assertFalse(result['genes'][0]['editable'])
        with self.assertRaisesRegex(ValueError, 'Select a source profile'):
            studio_encode(text, 'auto', [])
        self.assertEqual(studio_detect(text, 'vanilla')['profile'], 'none')

    def test_color_swatches_use_each_installed_palette_and_recompute_after_edit(self):
        for mode, schema in self.schemas.items():
            text = 'genes={hair_color={0 0 0 0}}'
            before = studio_detect(text, mode)['genes'][0]
            result = studio_encode(text, mode, [{'name': 'hair_color', 'values': [255, 255, 0, 255]}])
            after = result['genes'][0]
            with Image.open(schema.palette_path('hair_color')) as image:
                image = image.convert('RGBA')
                w, h = image.size
                expected = ['#' + ''.join(f'{c:02x}' for c in image.getpixel((x, y))[:3])
                            for x, y in ((w-1, h-1), (0, h-1))]
            self.assertEqual(after['swatches'], expected)
            self.assertNotEqual(before['swatches'], after['swatches'])
            self.assertEqual(after['values'], [255, 255, 0, 255])
            self.assertTrue(after['swatchApproximate'])
            self.assertIn('CPU nearest texel', after['swatchSampling'])
            self.assertEqual(result['original'], text)
        ambiguous = studio_detect('genes={hair_color={0 0 255 255}}')['genes'][0]
        self.assertNotIn('swatches', ambiguous, 'without a source profile no palette may be guessed')

    def test_palette_png_orientation_matches_installed_pixel_coordinates_all_profiles(self):
        for mode, schema in self.schemas.items():
            for gene in ('hair_color', 'skin_color', 'eye_color'):
                with self.subTest(mode=mode, gene=gene):
                    result = studio_palette(mode, gene)
                    self.assertEqual((result['width'], result['height']), (256, 256))
                    self.assertTrue(result['approximate'])
                    self.assertTrue(result['dataUrl'].startswith('data:image/png;base64,'))
                    with Image.open(BytesIO(base64.b64decode(result['dataUrl'].split(',', 1)[1]))) as preview:
                        self.assertEqual(preview.size, (256, 256))
                        with Image.open(schema.palette_path(gene)) as source:
                            source = source.convert('RGBA')
                            w, h = source.size
                            for x, y in ((0, 0), (255, 255), (0, 255), (255, 0), (37, 219)):
                                self.assertEqual(preview.getpixel((x, y)), source.getpixel((round(x*(w-1)/255), round(y*(h-1)/255))))

    def test_palette_rejects_unknown_profiles_genes_and_non_color_genes(self):
        for profile, gene in (('auto', 'hair_color'), ('unknown', 'hair_color'), ('epe', 'unknown_color'),
                              ('agot', 'gene_chin_forward'), ('none', '../outside'), ('epe', {})):
            with self.subTest(profile=profile, gene=gene), self.assertRaises(ValueError):
                studio_palette(profile, gene)

    def test_both_representations_are_current_after_edit_with_honest_unavailable_reason(self):
        raw = studio_detect(self.live)
        self.assertEqual(raw['encoded'], self.live)
        self.assertTrue(raw['rulerDesignerMetadataSynthetic'])
        self.assertEqual(studio_encode(raw['rulerDesigner'], 'epe', [], 'encoded')['output'], self.live)
        result = studio_encode(self.live, 'epe', [{'name': 'hair_color', 'values': [4, 3, 2, 1]}])
        self.assertNotEqual(result['encoded'], self.live)
        self.assertEqual(studio_encode(result['rulerDesigner'], 'epe', [], 'encoded')['output'], result['encoded'])
        text = 'genes={hair_color={1 2 3 4} future={opaque=yes}}'
        partial = studio_detect(text, 'epe')
        self.assertEqual(partial['rulerDesigner'], text)
        self.assertFalse(partial['rulerDesignerMetadataSynthetic'])
        self.assertIsNone(partial['encoded'])
        self.assertIn('exactly the current ordinary gene set', partial['encodingError'])

    def test_encoded_ambiguity_never_selects_first_schema(self):
        # Equal installed schemas are a genuine ambiguity even for raw DNA.
        with patch('ck3_dna_converter_core.core.services.studio.load_current_schema', return_value=self.schemas['epe']):
            result = studio_detect(self.live)
            self.assertEqual(result['status'], 'ambiguous')
            self.assertIsNone(result['profile'])
            self.assertEqual(studio_detect(self.live, 'epe')['status'], 'ready')

    def test_synthetic_agot_wrapper_unique_names_and_unknown_tokens_preserved(self):
        result = studio_detect(self.agot_text)
        self.assertEqual((result['status'], result['profile']), ('ready', 'agot'))
        self.assertEqual(result['geneCount'], 188)
        self.assertTrue(all(row['editable'] for row in result['genes']))
        self.assertEqual(studio_encode(self.agot_text, 'agot', result['genes'])['output'], self.agot_text)
        synthetic_unknown = 'synthetic_agot_0={portrait_info={genes={gene_dragon_brow_width={"" 127 "" 127}}}}'
        result = studio_detect(synthetic_unknown)
        unsupported = next(g for g in result['genes'] if g['name'] == 'gene_dragon_brow_width')
        self.assertEqual(unsupported['values'], ['', 127, '', 127])
        self.assertFalse(unsupported['editable'])
        self.assertEqual(studio_encode(synthetic_unknown, 'agot', result['genes'])['output'], synthetic_unknown)

    def test_text_edit_preserves_unknown_fields_wrapper_comments_bom_and_metadata(self):
        for wrapper in ('genes', 'ruler_designer_42', 'hero'):
            body = '''hair_color = { 1 2 3 4 } # keep { braces }
alien_gene = { nested={ arbitrary="keep # { }" } }
custom_face = { "future_template" 12 "future_template" 34 }'''
            if wrapper == 'genes':
                text = '\ufeffgenes={\n' + body + '\n} # end'
            elif wrapper == 'hero':
                text = 'hero={ portrait_info={ genes={\n' + body + '\n} unknown_meta={ hi=yes } } }'
            else:
                text = 'ruler_designer_42={ type=female id=99 age=27 genes={\n' + body + '\n} arbitrary_metadata="hello" }'
            result = studio_encode(text, 'epe', [{'name': 'hair_color', 'values': [255, 0, 17, 88]}])
            self.assertEqual(result['output'], text.replace('{ 1 2 3 4 }', '{ 255 0 17 88 }'))
            self.assertEqual(result['original'], text)
            self.assertIsNone(next(g for g in result['genes'] if g['name'] == 'alien_gene')['values'])
            with self.assertRaisesRegex(ValueError, 'preserved read-only'):
                studio_encode(text, 'epe', [{'name': 'custom_face', 'values': ['new', 1, 'new', 2]}])

    def test_catalog_covers_every_installed_special_and_ordinary_definition(self):
        for mode, schema in self.schemas.items():
            result = studio_catalog(mode)
            rows = {row['name']: row for row in result['genes']}
            self.assertEqual(set(rows), set(schema.all_genes))
            for name, definition in schema.all_genes.items():
                self.assertEqual(rows[name]['options'], list(definition.tokens))
                self.assertEqual(rows[name]['special'], definition.special)
                self.assertIn('category', rows[name])

    def test_add_supported_special_gene_text_only_and_refuse_raw_data_loss(self):
        schema = self.schemas['epe']
        name, definition = next(iter(schema.special_genes.items()))
        token = next(iter(definition.tokens))
        result = studio_encode('genes={ hair_color={1 2 3 4} }', 'epe', [
            {'name': name, 'values': [token, 12, token, 244]}])
        self.assertIn(name, result['output'])
        self.assertEqual(next(g for g in result['genes'] if g['name'] == name)['values'], [token, 12, token, 244])
        with self.assertRaisesRegex(ValueError, 'exactly the current ordinary gene set'):
            studio_encode(result['output'], 'epe', [], 'encoded')

    def test_invalid_byte_bool_unknown_token_and_duplicate_patch_rejected(self):
        invalid = [
            [{'name': 'hair_color', 'values': [256, 0, 0, 0]}],
            [{'name': 'hair_color', 'values': [True, 0, 0, 0]}],
            [{'name': 'gene_chin_forward', 'values': ['not_installed', 1, 'not_installed', 2]}],
            [{'name': 'hair_color', 'values': [1, 2, 3, 4]}, {'name': 'hair_color', 'values': [4, 3, 2, 1]}],
        ]
        for genes in invalid:
            with self.subTest(genes=genes), self.assertRaises(ValueError):
                studio_encode(self.live, 'epe', genes)

    def test_old_length_extra_bytes_and_unknown_raw_codes_never_truncated(self):
        raw = base64.b64decode(self.live)
        for value in (raw + b'\0' * 4, raw[:-4], b'\0' * 712):
            result = studio_detect(base64.b64encode(value).decode())
            self.assertEqual(result['status'], 'unsupported')
            self.assertIsNone(result['encoded'])
            self.assertFalse(result['genes'])
        damaged = bytearray(raw)
        damaged[12] = 255
        self.assertEqual(studio_detect(base64.b64encode(damaged).decode(), 'epe')['status'], 'unsupported')

    def test_malformed_text_and_multiple_characters_rejected(self):
        for text in ('genes={ hair_color={1 2 3 4}', 'genes={hair_color={1 2 3 4} hair_color={4 3 2 1}}',
                     'a={genes={hair_color={1 2 3 4}}} b={genes={hair_color={1 2 3 4}}}', 'hero={dna="identifier"}'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                studio_detect(text)

    def test_bridge_actions_are_json_serializable_and_existing_schemas_remains(self):
        for payload in ({'action': 'studio_detect', 'text': self.live},
                        {'action': 'studio_catalog', 'profile': 'epe'},
                        {'action': 'studio_palette', 'profile': 'epe', 'gene': 'hair_color'},
                        {'action': 'studio_encode', 'text': self.live, 'profile': 'epe', 'genes': []},
                        {'action': 'schemas'}):
            response = process_request(json.dumps({'requestId': 'test', 'payload': payload}))
            self.assertTrue(response['ok'], response.get('error'))
            self.assertEqual(response['requestId'], 'test')
            json.dumps(response)


if __name__ == '__main__':
    unittest.main(verbosity=2)

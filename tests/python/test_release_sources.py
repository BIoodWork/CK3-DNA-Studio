"""Check reproducible fixtures and the public backend's local dependency closure."""
import ast
import base64
import hashlib
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'backend/python'), str(ROOT / 'backend/python/src'), str(ROOT / 'tests/fixtures')]
from generate_synthetic_dna import synthetic_genes, synthetic_agot_text, EPE_SEED
from ck3_dna_converter_core.core.services.runtime_conversion import encode_current
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema


class ReleaseSourceTests(unittest.TestCase):
    def test_fixtures_reproduce_without_any_character_source(self):
        epe = load_current_schema('epe')
        raw = base64.b64decode(encode_current(synthetic_genes(epe, EPE_SEED), epe))
        self.assertEqual(raw, (ROOT / 'tests/fixtures/live_dna.bin').read_bytes())
        self.assertEqual(hashlib.sha256(raw).hexdigest(), '6b088e62578df006212bb3d7159bdfd40346a8c84b742449574d6f8b5982cee8')
        text = synthetic_agot_text(load_current_schema('agot'))
        self.assertEqual(text, (ROOT / 'tests/fixtures/agot_sample.txt').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256(text.encode()).hexdigest(), 'af8dccabcb1fd9ee9c3ee78685461a784d30f97c240e55098d8765b9ad142f6e')

    def test_all_retained_backend_modules_are_reachable_and_no_legacy_table_remains(self):
        backend = ROOT / 'backend/python'
        modules = {p.stem: p for p in backend.glob('*.py')}
        for path in (backend / 'src').rglob('*.py'):
            if path.name != '__init__.py':
                modules['.'.join(path.relative_to(backend / 'src').with_suffix('').parts)] = path
        reachable, pending = set(), ['bridge']
        while pending:
            name = pending.pop()
            if name in reachable:
                continue
            reachable.add(name)
            tree = ast.parse(modules[name].read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                names = [node.module] if isinstance(node, ast.ImportFrom) else [a.name for a in node.names] if isinstance(node, ast.Import) else []
                for imported in names:
                    if imported and imported.startswith('ck3_dna_converter_core.'):
                        self.assertIn(imported, modules, f'missing local dependency in {name}')
                    if imported in modules:
                        pending.append(imported)
        self.assertEqual(reachable, set(modules), 'unused backend source must be reviewed before public distribution')
        self.assertEqual(set(p.stem for p in (backend / 'src/ck3_dna_converter_core/core/tables').glob('*.py')), {'__init__', 'current_schemas'})
        for path in modules.values():
            self.assertNotIn('legacy converter bundle', path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()

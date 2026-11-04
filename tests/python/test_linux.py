"""Synthetic Linux portability checks; no installed game or personal DNA needed."""
import os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/'backend/python'), str(ROOT/'backend/python/src')]
from ck3_dna_converter_core.core.tables.current_schemas import _steam_libraries, _genes_dirs
from bridge import dispatch

NO_OVERRIDES = {'CK3_GENES_DIR': '', 'CK3_EPE_GENES_DIR': '', 'CK3_AGOT_GENES_DIR': ''}


class LinuxTests(unittest.TestCase):
    def discover(self, home, steam_relative):
        steam = home/steam_relative
        gene = steam/'steamapps/common/Crusader Kings III/game/common/genes'
        mod = steam/'steamapps/workshop/content/1158310/2507209632/common/genes'
        gene.mkdir(parents=True)
        mod.mkdir(parents=True)
        with patch('sys.platform', 'linux'), patch.object(Path, 'home', return_value=home), patch.dict(os.environ, NO_OVERRIDES):
            self.assertEqual(_genes_dirs('epe'), (gene.resolve(), mod.resolve()))

    def test_native_and_flatpak_steam_discovery(self):
        for steam in ('.local/share/Steam', '.var/app/com.valvesoftware.Steam/.local/share/Steam'):
            with self.subTest(steam=steam), tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp') as tmp:
                self.discover(Path(tmp), steam)

    def test_additional_library_from_libraryfolders(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp') as tmp:
            home = Path(tmp)
            steam = home/'.local/share/Steam/steamapps'
            steam.mkdir(parents=True)
            external = home/'games'
            (steam/'libraryfolders.vdf').write_text('"libraryfolders" { "1" { "path" "'+str(external)+'" } }')
            with patch('sys.platform', 'linux'), patch.object(Path, 'home', return_value=home):
                self.assertIn(external, _steam_libraries())

    def test_gateway_is_refused_without_mentioning_another_platform(self):
        with patch('sys.platform', 'linux'):
            for action in ('game_status', 'game_copy', 'game_paste', 'library_check', 'library_apply'):
                result = dispatch({'action': action})
                self.assertFalse(result['ready'])
                self.assertTrue(result['platformUnsupported'])
                self.assertNotIn('macOS', result['message'])


if __name__ == '__main__':
    unittest.main(verbosity=2)

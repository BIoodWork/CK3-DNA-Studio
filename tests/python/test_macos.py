"""Synthetic macOS portability checks; no installed game or personal DNA needed."""
import os, sys, tempfile, unittest, json
from pathlib import Path
from unittest.mock import patch
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'backend/python'),str(ROOT/'backend/python/src')]
from ck3_dna_converter_core.core.tables.current_schemas import _steam_libraries, _genes_dirs, load_current_schema
from ck3_dna_converter_core.core.services.runtime_conversion import _neutral, encode_current, decode_current, analyze_current
from ck3_dna_converter_core.core.services.studio import studio_detect, studio_encode, studio_palette
from bridge import dispatch

def fixtures(root):
    for mode in ('game','epe','agot'):
        folder=root/mode
        (folder/'common/genes').mkdir(parents=True)
        text='color_genes={hair_color={} skin_color={} eye_color={}}\nmorph_genes={face={default={index=0}}}'
        if mode!='game':text+='\nmorph_genes={'+mode+'_extra={default={index=0}}}'
        (folder/'common/genes/00.txt').write_text(text)
        (folder/'gfx/portraits').mkdir(parents=True)
        for color in ('hair','skin','eye'):
            Image.new('RGBA',(4,4),(60,80,100,255)).save(folder/f'gfx/portraits/{color}_palette.dds')
    return {'CK3_GENES_DIR':str(root/'game/common/genes'),'CK3_EPE_GENES_DIR':str(root/'epe/common/genes'),'CK3_AGOT_GENES_DIR':str(root/'agot/common/genes')}

class MacTests(unittest.TestCase):
    def test_steam_custom_library_and_workshop_discovery(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp') as tmp:
            home=Path(tmp);steam=home/'Library/Application Support/Steam';(steam/'steamapps').mkdir(parents=True)
            external=home/'External Library';gene=external/'steamapps/common/Crusader Kings III/game/common/genes';gene.mkdir(parents=True)
            mod=external/'steamapps/workshop/content/1158310/2507209632/common/genes';mod.mkdir(parents=True)
            (steam/'steamapps/libraryfolders.vdf').write_text('"libraryfolders" { "1" { "path" "'+str(external)+'" } }')
            with patch('sys.platform','darwin'),patch.object(Path,'home',return_value=home),patch.dict(os.environ,{'CK3_GENES_DIR':'','CK3_EPE_GENES_DIR':''}):
                self.assertIn(external,_steam_libraries());self.assertEqual(_genes_dirs('epe'),(gene.resolve(),mod.resolve()))
    def test_all_profiles_detect_edit_palette_and_conversion(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp') as tmp,patch.dict(os.environ,fixtures(Path(tmp))):
            for mode in ('none','epe','agot'):
                schema=load_current_schema(mode);dna=encode_current({k:_neutral(v) for k,v in schema.genes.items()},schema)
                self.assertEqual(studio_detect(dna,mode)['status'],'ready')
                edited=studio_encode(dna,mode,[{'name':'hair_color','values':[12,34,56,78]}])
                self.assertEqual(decode_current(edited['output'],schema)['hair_color'].values,(12,34,56,78))
                self.assertTrue(studio_palette(mode,'hair_color'))
            converted=analyze_current(dna,source_mode='agot',target_mode='epe',target_format='encoded',allow_lossy=True)
            self.assertTrue(converted['conversionSucceeded'])
    def test_gateway_is_refused_on_mac_before_windows_imports(self):
        with patch('sys.platform','darwin'):
            for action in ('game_status','game_copy','game_paste','library_check','library_apply'):
                result=dispatch({'action':action});self.assertFalse(result['ready']);self.assertTrue(result['platformUnsupported'])

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--fixtures':
        root=Path(sys.argv[2]);env=fixtures(root)
        with patch.dict(os.environ,env):
            schema=load_current_schema('none');dna=encode_current({k:_neutral(v) for k,v in schema.genes.items()},schema)
        print(json.dumps({'env':env,'dna':dna}))
    else:unittest.main(verbosity=2)

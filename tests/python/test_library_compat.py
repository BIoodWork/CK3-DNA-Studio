"""Isolated real-file compatibility regressions; game status is the only mock."""
import base64, hashlib, json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
root=ROOT/'backend/python';sys.path[:0]=[str(root),str(root/'src')]
import library_compat as c
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema
from ck3_dna_converter_core.core.services.runtime_conversion import analyze_current
from ck3_dna_converter_core.core.services.palette_conversion import palette
DEFINITIONS='''color_genes={hair_color={} skin_color={} eye_color={}}
morph_genes={face={default={index=0}}}'''
class Checks(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp');self.addCleanup(self.tmp.cleanup)
  self.folder=Path(self.tmp.name);self.game=self.folder/'game';self.user=self.folder/'user'
  genes=self.game/'common/genes';genes.mkdir(parents=True);(genes/'00.txt').write_text(DEFINITIONS)
  self.portraits=self.game/'gfx/portraits';self.portraits.mkdir(parents=True)
  for color in ('hair','skin','eye'):Image.new('RGBA',(2,2),(255,0,0,255)).save(self.portraits/f'{color}_palette.dds')
  self.user.mkdir();(self.user/'dlc_load.json').write_text(json.dumps({'enabled_mods':[]}))
  env=patch.dict(os.environ,{'CK3_GENES_DIR':str(genes),'CK3_USER_DIR':str(self.user)})
  env.start();self.addCleanup(env.stop)
  self.s=load_current_schema('none')
  self.e={'name':'Probe','dna':base64.b64encode(bytes(16)).decode(),'originalInput':'original text retained',
          'format':'encoded','profile':'none','schemaInfo':{'target':self.s.metadata()}}
  self.state={'ready':True,'pid':1,'id':2,'byteCount':16,'selectionToken':'a'*64}
  self.target={'pid':1,'id':2,'selectionToken':'a'*64}
 def runcheck(self):
  with patch.object(c,'handle_live',return_value=self.state):return c.check_entry(self.e,self.target)
 def test_matching(self):
  result=self.runcheck();self.assertTrue(result['compatible'])
  details=result['compatibilityDetails'];self.assertEqual(details['savedProfile'],'none');self.assertEqual(details['currentProfile'],'none')
  self.assertEqual(details['geneDefinitions']['status'],'match');self.assertEqual(details['palettes']['status'],'match')
  self.assertFalse(details['configuration']['runningModsVerified']);self.assertTrue(details['configuration']['caveat'])
 def test_stale(self):self.target['id']=3;self.assertFalse(self.runcheck()['compatible'])
 def test_missing_or_stale_token(self):
  for token in (None,'b'*64,'bad',12):
   with self.subTest(token=token):
    self.target['selectionToken']=token;self.assertFalse(self.runcheck()['compatible'])
  self.target.pop('selectionToken');self.assertFalse(self.runcheck()['compatible'])
 def test_fingerprint(self):
  self.e['schemaInfo']['target']['fingerprint']='bad';r=self.runcheck();self.assertFalse(r['compatible'])
  self.assertEqual(r['compatibilityDetails']['geneDefinitions']['status'],'changed')
 def test_profile(self):self.e['profile']='agot';self.assertFalse(self.runcheck()['compatible'])
 def test_text(self):self.e['format']='ruler_designer';self.assertFalse(self.runcheck()['compatible'])
 def test_length(self):self.state['byteCount']=416;self.assertFalse(self.runcheck()['compatible'])
 def test_conversion_records_source_and_target_palette_content(self):
  result=analyze_current(self.e['dna'],'none','none','encoded',False)
  self.assertTrue(result['conversionSucceeded'])
  for side in ('source','target'):
   fingerprints=result['schemaInfo'][side]['paletteFingerprints']
   self.assertEqual(set(fingerprints),{'hair_color','skin_color','eye_color'})
   for gene,digest in fingerprints.items():self.assertEqual(digest,hashlib.sha256(self.s.palette_path(gene).read_bytes()).hexdigest())
 def test_only_palette_changed_preserving_size_and_mtime_refuses_saved_entry(self):
  self.assertTrue(self.runcheck()['compatible']);saved=json.loads(json.dumps(self.e))
  path=self.s.palette_path('hair_color');stat=path.stat()
  old_palette=palette(path)
  Image.new('RGBA',(2,2),(0,0,255,255)).save(path);os.utime(path,ns=(stat.st_atime_ns,stat.st_mtime_ns))
  self.assertEqual(path.stat().st_size,stat.st_size)
  self.assertIs(load_current_schema('none'),self.s)
  r=self.runcheck();self.assertFalse(r['compatible']);self.assertIn('seit dem Speichern',r['reason'])
  details=r['compatibilityDetails'];self.assertEqual(details['geneDefinitions']['status'],'match');self.assertEqual(details['palettes']['status'],'changed')
  self.assertNotEqual(details['palettes']['saved']['hair_color'],details['palettes']['current']['hair_color'])
  current_palette=palette(path)
  self.assertNotEqual(old_palette['sha'],current_palette['sha'])
  self.assertEqual(current_palette['sha'],details['palettes']['current']['hair_color'])
  self.assertNotEqual(old_palette['sampled'],current_palette['sampled'])
  self.assertEqual(saved,self.e)
 def test_legacy_missing_historical_palettes_refused_original_still_available(self):
  self.e['schemaInfo']['target'].pop('paletteFingerprints');r=self.runcheck()
  self.assertFalse(r['compatible']);self.assertEqual(r['compatibilityDetails']['palettes']['status'],'missing')
  self.assertIn('gespeicherte DNA',r['reason']);self.assertEqual(self.e['originalInput'],'original text retained')
 def enable_submod(self,definitions=None,palette=False):
  mod=self.folder/'submod';mod.mkdir()
  if definitions:
   genes=mod/'common/genes';genes.mkdir(parents=True);(genes/'00.txt').write_text(definitions)
  if palette:
   portraits=mod/'gfx/portraits';portraits.mkdir(parents=True)
   Image.new('RGBA',(2,2),(0,255,0,255)).save(portraits/'hair_palette.dds')
  descriptor=self.user/'sub.mod';descriptor.write_text(f'path="{mod.as_posix()}"')
  (self.user/'dlc_load.json').write_text(json.dumps({'enabled_mods':['sub.mod']}))
 def test_additive_template_submod_remains_compatible(self):
  self.enable_submod(DEFINITIONS.replace('default={index=0}','default={index=0} extra={index=1}'))
  self.assertTrue(self.runcheck()['compatible'])
 def test_changed_template_submod_refused(self):
  self.enable_submod(DEFINITIONS.replace('index=0','index=1'));self.assertFalse(self.runcheck()['compatible'])
 def test_palette_overlay_submod_refused(self):
  self.enable_submod(palette=True);self.assertFalse(self.runcheck()['compatible'])
 def test_apply_rechecks_and_no_clipboard(self):
  self.e['profile']='agot'
  with patch.object(c,'handle_live',return_value=self.state) as native:
   with self.assertRaises(ValueError):c.handle_library('library_apply',{'entry':self.e,'expectedTarget':self.target})
   self.assertEqual([x.args[0] for x in native.call_args_list],['game_status'])
 def test_palette_change_blocks_apply_without_game_write(self):
  Image.new('RGBA',(2,2),(0,0,255,255)).save(self.s.palette_path('hair_color'))
  with patch.object(c,'handle_live',return_value=self.state) as native:
   with self.assertRaises(ValueError):c.handle_library('library_apply',{'entry':self.e,'expectedTarget':self.target})
   self.assertEqual([x.args[0] for x in native.call_args_list],['game_status'])
if __name__=='__main__':unittest.main(verbosity=2)

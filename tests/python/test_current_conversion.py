from pathlib import Path
import sys,unittest,base64,json,random,dataclasses,tempfile,os
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend/python/src'))
from ck3_dna_converter_core.core.services.runtime_conversion import analyze_current,decode_current,encode_current,_parse_text,_neutral
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema,list_current_schemas,parse_definitions
from ck3_dna_converter_core.core.services.palette_conversion import remap_color,palette
from ck3_dna_converter_core.core.domain.types import TokenPairGeneValue,ColorGeneValue
from PIL import Image

class CurrentConversionTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.epe=load_current_schema('epe');cls.agot=load_current_schema('agot');cls.vanilla=load_current_schema('none')
  cls.live=(ROOT/'tests/fixtures/live_dna.bin').read_bytes();cls.live64=base64.b64encode(cls.live).decode()
  cls.sample=(ROOT/'tests/fixtures/agot_sample.txt').read_text(encoding='utf-8')
 def test_installed_counts_and_correct_epe_slot_order(self):
  self.assertEqual([len(s.genes) for s in (self.vanilla,self.epe,self.agot)],[104,130,187])
  names=list(self.epe.genes);self.assertEqual(names[101:105],['gene_face_dacals','eye_accessory','teeth_accessory','eyelashes_accessory'])
  self.assertIn('gene_bs_eye_shape',names);self.assertNotIn('gene_eye_size',names)
  self.assertNotIn('clothes',self.agot.genes);self.assertIn('gene_dragon_fire_color',self.agot.genes)
 def test_live_epe_roundtrip_exact_all_bytes(self):
  report=analyze_current(self.live64,'epe','epe','encoded',False)
  self.assertTrue(report['conversionSucceeded']);self.assertEqual(report['convertedOutput'],self.live64)
  self.assertEqual(report['lossReport'],[]);self.assertEqual(report['preservedGeneCount'],130)
 def test_live_text_roundtrip_exact_all_alleles(self):
  text=analyze_current(self.live64,'epe','epe','ruler_designer',False)['convertedOutput']
  self.assertEqual(analyze_current(text,'epe','epe','encoded',False)['convertedOutput'],self.live64)
 def test_all_three_schema_roundtrips(self):
  r=random.Random(180)
  for schema in [self.vanilla,self.epe,self.agot]:
   genes={}
   for name,definition in schema.genes.items():
    if name in ['hair_color','skin_color','eye_color']:genes[name]=ColorGeneValue(tuple(r.randrange(256) for _ in range(4)))
    else:
     names=list(definition.tokens);genes[name]=TokenPairGeneValue(r.choice(names),r.randrange(256),r.choice(names),r.randrange(256))
   encoded=encode_current(genes,schema);self.assertEqual(decode_current(encoded,schema),genes)
 def test_no_truncation_or_old_agot_schema_guessing(self):
  for data in [self.live+b'\0'*4,self.live[:-4],b'\0'*(178*4)]:
   with self.assertRaisesRegex(ValueError,'No data was truncated'):decode_current(base64.b64encode(data).decode(),self.epe if len(data)!=712 else self.agot)
 def test_invalid_base64_and_padding(self):
  for value in ['!!!','A','AA=A','AB==','====',self.live64+'AAAA']:
   with self.subTest(value=value[:12]):
    with self.assertRaises(ValueError):decode_current(value,self.epe)
 def test_unknown_template_code_not_guessed(self):
  raw=bytearray(self.live);raw[3*4]=255
  with self.assertRaisesRegex(ValueError,'no guessed decoding'):decode_current(base64.b64encode(raw).decode(),self.epe)
 def test_synthetic_agot_wrapper_and_all_shared_shapes_preserved(self):
  source,_=_parse_text(self.sample)
  report=analyze_current(self.sample,'agot','epe','encoded',True)
  self.assertTrue(report['conversionSucceeded']);self.assertEqual(len(base64.b64decode(report['convertedOutput'])),520)
  target=decode_current(report['convertedOutput'],self.epe)
  changed={r['gene'] for r in report['lossReport']}
  for name,value in source.genes.items():
   if name in target and name not in changed:self.assertEqual(target[name],value)
  self.assertGreater(report['preservedGeneCount'],100)
  self.assertTrue(any(r['kind']=='palette-remap' for r in report['lossReport']))
  self.assertTrue(any(r['gene'].startswith('gene_dragon') for r in report['lossReport']))
 def test_strict_cross_mod_refuses_reported_loss(self):
  report=analyze_current(self.sample,'agot','epe','encoded',False)
  self.assertFalse(report['conversionSucceeded']);self.assertEqual(report['convertedOutput'],'')
  self.assertTrue(report['lossReport']);self.assertIn('Lossy Fallbacks',report['conversionError'])
 def test_named_text_keeps_supported_special_genes(self):
  source,_=_parse_text(self.sample)
  report=analyze_current(self.sample,'agot','epe','ruler_designer',True)
  textdoc,_=_parse_text(report['convertedOutput'])
  self.assertIn('hairstyles',source.genes);self.assertIn('hairstyles',textdoc.genes)
  self.assertFalse(any(r['gene']=='hairstyles' and r['kind']=='omitted-gene' for r in report['lossReport']))
 def test_named_index_above_255_survives_text_but_not_raw(self):
  from unittest.mock import patch
  gene=self.epe.special_genes['hairstyles'];token='future_template_over_255'
  modified=dataclasses.replace(gene,tokens=gene.tokens|{token:300})
  schema=dataclasses.replace(self.epe,special_genes=self.epe.special_genes|{'hairstyles':modified})
  source=analyze_current(self.live64,'epe','epe','ruler_designer',False)['convertedOutput']
  doc,_=_parse_text(source);doc=dataclasses.replace(doc,genes=doc.genes|{gene.name:TokenPairGeneValue(token,17,token,99)})
  from ck3_dna_converter_core.core.serialization.serialize_ruler_designer import serialize_ruler_designer
  text=serialize_ruler_designer(doc)
  with patch('ck3_dna_converter_core.core.services.runtime_conversion.load_current_schema',lambda mode:schema):
   result=analyze_current(text,'epe','epe','ruler_designer',False)
   self.assertTrue(result['conversionSucceeded']);self.assertIn(token,result['convertedOutput'])
   result=analyze_current(text,'epe','epe','encoded',False)
   self.assertFalse(result['conversionSucceeded']);self.assertTrue(any(r['gene']==gene.name for r in result['lossReport']))
 def test_default_additions_and_unknown_genes_are_reported(self):
  text='genes={ hair_color={ 1 2 3 4 } custom_face={ "unsupported" 12 "unsupported" 34 } }'
  result=analyze_current(text,'epe','epe','encoded',False)
  self.assertFalse(result['conversionSucceeded']);self.assertTrue(any(r['kind']=='added-default' for r in result['lossReport']))
  self.assertTrue(any(r['gene']=='custom_face' and r['kind']=='omitted-gene' for r in result['lossReport']))
 def test_each_allele_value_preserved_through_template_fallback(self):
  text=analyze_current(self.live64,'epe','epe','ruler_designer',False)['convertedOutput']
  doc,_=_parse_text(text);key='gene_chin_forward';doc.genes[key]=TokenPairGeneValue('chin_forward_custom_neg',17,'chin_forward_custom_pos',239)
  from ck3_dna_converter_core.core.serialization.serialize_ruler_designer import serialize_ruler_designer
  result=analyze_current(serialize_ruler_designer(doc),'agot','epe','encoded',True)
  gene=decode_current(result['convertedOutput'],self.epe)[key]
  self.assertEqual((gene.first_value,gene.second_value),(17,239));self.assertTrue(gene.first_token.endswith('_neg'));self.assertTrue(gene.second_token.endswith('_pos'))
 def test_multiple_characters_refused(self):
  with self.assertRaisesRegex(ValueError,'one DNA'):analyze_current(self.sample+self.sample,'agot','epe','encoded',True)
 def test_comments_and_quoted_comment_characters(self):
  parsed=parse_definitions('a={ # ignored {\n token={ index=1 text="hi # { there" } }')
  self.assertEqual(parsed[0][1][0][1][1],('text','"hi # { there"'))
 def test_palette_target_grid_and_recessive_separate(self):
  with tempfile.TemporaryDirectory(dir=ROOT/'tests/python/tmp') as d:
   src=Path(d)/'source.png';dst=Path(d)/'target.png'
   a=Image.new('RGBA',(2,2));a.putdata([(255,0,0,255),(0,255,0,255),(0,0,255,255),(255,255,255,255)]);a.save(src)
   b=Image.new('RGBA',(2,2));b.putdata([(0,0,255,255),(255,255,255,255),(255,0,0,255),(0,255,0,255)]);b.save(dst)
   coords,detail=remap_color((0,0,255,0),palette(src),palette(dst))
   self.assertEqual(detail['samples'][0]['sourceRGBA'],detail['samples'][0]['targetRGBA'])
   self.assertEqual(detail['samples'][1]['sourceRGBA'],detail['samples'][1]['targetRGBA'])
   self.assertNotEqual(coords[:2],coords[2:]);self.assertEqual(detail['paletteDistance'],[0.0,0.0])
 def test_missing_mod_metadata_does_not_break_other_profiles(self):
  from unittest.mock import patch
  from ck3_dna_converter_core.core.tables import current_schemas
  original=current_schemas.load_current_schema
  def missing(mode):
   if mode=='agot':raise ValueError('AGOT unavailable')
   return original(mode)
  with patch.object(current_schemas,'load_current_schema',missing):
   result=list_current_schemas();self.assertFalse(result['agot']['available']);self.assertTrue(result['epe']['available'])
 def test_loss_report_json_contract(self):
  result=analyze_current(self.sample,'agot','epe','encoded',False)
  json.dumps(result)
  for loss in result['lossReport']:self.assertTrue({'gene','kind','source','target','reason'}<=loss.keys())

if __name__=='__main__':unittest.main(verbosity=2)

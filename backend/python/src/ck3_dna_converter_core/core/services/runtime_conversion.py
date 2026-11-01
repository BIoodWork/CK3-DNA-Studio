"""Current-schema DNA conversion, with explicit source/target and loss reporting."""
from __future__ import annotations

import base64
from dataclasses import asdict, replace
from difflib import SequenceMatcher
import json
import re
from ck3_dna_converter_core.core.domain.types import ColorGeneValue, TokenPairGeneValue, RulerDesignerDocument
from ck3_dna_converter_core.core.parsing.parse_ruler_designer import parse_ruler_designer
from ck3_dna_converter_core.core.serialization.serialize_ruler_designer import serialize_ruler_designer
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema, list_current_schemas, parse_definitions
from ck3_dna_converter_core.core.services.palette_conversion import palette, remap_color

_COLORS={'hair_color','skin_color','eye_color'}
_ALIASES={
 'complexion':{'complexion_smooth_1':'complexion_1'},
 'face_detail_chin_def':{'chin_def_neg':'chin_def','undefined':'chin_def'},
 'face_detail_eye_lower_lid_def':{'eye_lower_lid_def_02':'eye_lower_lid_def'},
 'face_detail_eye_socket':{'eye_socket_color_01':'eye_socket_01','eye_socket_color_02':'eye_socket_02','eye_socket_color_03':'eye_socket_03'},
 'gene_age':{'old_beauty_1':'old_4'},
 'gene_bs_eye_fold_shape':{'eye_fold_shape_02_neg':'eye_fold_shape_neg','eye_fold_shape_02_pos':'eye_fold_shape_pos'},
}


def _value_json(value):
    if value is None:return None
    if isinstance(value,ColorGeneValue):return list(value.values)
    if isinstance(value,TokenPairGeneValue):return [value.first_token,value.first_value,value.second_token,value.second_value]
    return value


def _loss(report,gene,kind,source,target,reason,**details):
    report.append({'gene':gene,'kind':kind,'source':_value_json(source),'target':_value_json(target),'reason':reason,**details})


def _node_string(node):
    if not isinstance(node,list):return node
    return '{\n'+'\n'.join((str(k)+' = ' if k is not None else '')+_node_string(v) for k,v in node)+'\n}'


def _parse_text(text):
    # Re-tokenizing strips comments without stripping hash symbols inside quotes.
    root=parse_definitions(text.lstrip('\ufeff'))
    if len(root)!=1 or root[0][0] is None or not isinstance(root[0][1],list):
        raise ValueError('Paste one DNA character block at a time, or one genes={...} block.')
    root_name,content=root[0]
    metadata_synthetic=False
    if root_name=='genes':
        content=[('genes',content)];root_name='ruler_designer_0';metadata_synthetic=True
    fields=dict(content)
    if 'portrait_info' in fields:
        content=fields['portrait_info']
        if not isinstance(content,list):raise ValueError('portrait_info must be a block.')
        fields=dict(content);root_name='ruler_designer_0';metadata_synthetic=True
    if 'genes' not in fields:raise ValueError('DNA text does not contain a genes block.')
    if 'type' not in fields:content=[('type','male'),*content];metadata_synthetic=True
    if 'id' not in fields:content=[('id','0'),*content];metadata_synthetic=True
    document=parse_ruler_designer(root_name+'='+_node_string(content))
    return document,metadata_synthetic


def decode_current(text,schema):
    value=''.join(text.strip().strip('"').split())
    if not value or len(value)%4==1:raise ValueError('Invalid Base64 DNA length.')
    value+='='*((-len(value))%4)
    try: raw=base64.b64decode(value,validate=True)
    except (ValueError,TypeError) as exc:raise ValueError('DNA is not valid Base64.') from exc
    # Reject non-canonical padding and hidden trailing data accepted by some decoders.
    if base64.b64encode(raw).decode()!=value:raise ValueError('DNA has invalid/non-canonical Base64 padding.')
    expected=len(schema.genes)*4
    if len(raw)!=expected:
        raise ValueError(f'{schema.mode.upper()} DNA length does not match the installed definitions: expected {expected} bytes ({len(schema.genes)} genes), received {len(raw)}. No data was truncated. For older DNA, export named text DNA from its original game/mod version.')
    genes={}
    for i,(name,definition) in enumerate(schema.genes.items()):
        a,b,c,d=raw[i*4:i*4+4]
        if name in _COLORS:genes[name]=ColorGeneValue((a,b,c,d));continue
        reverse={v:k for k,v in definition.tokens.items()}
        if a not in reverse or c not in reverse:
            raise ValueError(f'Unknown {schema.mode.upper()} template code in {name}: {a}, {c}. The DNA does not match this installed schema; no guessed decoding was attempted.')
        genes[name]=TokenPairGeneValue(reverse[a],b,reverse[c],d)
    return genes


def encode_current(genes,schema):
    if set(genes)!=set(schema.genes):raise ValueError('Encoded DNA requires exactly the current ordinary gene set.')
    raw=bytearray()
    for name,definition in schema.genes.items():
        value=genes[name]
        if name in _COLORS:
            if not isinstance(value,ColorGeneValue):raise ValueError(f'{name} must contain four color-coordinate bytes.')
            values=value.values
        else:
            if not isinstance(value,TokenPairGeneValue):raise ValueError(f'{name} must contain two template/value alleles.')
            try: values=(definition.tokens[value.first_token],value.first_value,definition.tokens[value.second_token],value.second_value)
            except KeyError as exc:raise ValueError(f'Unknown target template for {name}: {exc}.') from exc
        if any(type(v) is not int or not 0<=v<=255 for v in values):
            raise ValueError(f'{name} cannot be represented by four-byte ordinary DNA. Template indexes above 255 remain supported in named text only.')
        raw.extend(values)
    return base64.b64encode(raw).decode('ascii')


def _neutral(definition):
    if definition.name in _COLORS:return ColorGeneValue((0,0,0,0))
    if not definition.tokens:raise ValueError(f'No target templates available for {definition.name}.')
    token=min(definition.tokens,key=lambda t:(definition.tokens[t],t))
    return TokenPairGeneValue(token,0,token,0)


def _fallback_token(gene,token,sibling,definition):
    candidates=definition.tokens
    alias=_ALIASES.get(gene,{}).get(token)
    if alias in candidates:return alias,'configured similar template'
    suffix='_neg' if token.endswith('_neg') else '_pos' if token.endswith('_pos') else None
    pool=[v for v in candidates if not suffix or v.endswith(suffix)]
    if pool:
        ranked=sorted(pool,key=lambda v:(-SequenceMatcher(None,token,v).ratio(),candidates[v],v))
        if SequenceMatcher(None,token,ranked[0]).ratio()>=.72:return ranked[0],'similar template name; visual approximation'
    if sibling in candidates:return sibling,'supported sibling template; visual approximation'
    if len(candidates)==1:return next(iter(candidates)),'only available target template'
    neutral=_neutral(definition).first_token
    return neutral,'target default template; visual approximation'


def _map_value(name,value,definition,source_schema,target_schema,report,allow_lossy):
    if name in _COLORS:
        if not isinstance(value,ColorGeneValue):raise ValueError(f'{name} must contain four color coordinates.')
        if source_schema.mode==target_schema.mode:return value
        src=palette(source_schema.palette_path(name));dst=palette(target_schema.palette_path(name))
        if src['sha']==dst['sha']:return value
        if allow_lossy:
            coords,info=remap_color(value.values,src,dst);new=ColorGeneValue(coords)
        else:new=value;info={}
        _loss(report,name,'palette-remap',value,new,'Source and target portrait palettes differ. Closest sampled target colors are an approximation; game shading, interpolation and saturation can still differ.',**info)
        return new
    if not isinstance(value,TokenPairGeneValue):raise ValueError(f'{name} requires template/value pairs.')
    tokens=[value.first_token,value.second_token];strengths=[value.first_value,value.second_value]
    for i,token in enumerate(tokens.copy()):
        if token in definition.tokens:continue
        replacement,reason=_fallback_token(name,token,tokens[1-i],definition)
        _loss(report,name,'template-replacement',token,replacement,reason,allele='dominant' if i==0 else 'recessive')
        tokens[i]=replacement
    return TokenPairGeneValue(tokens[0],strengths[0],tokens[1],strengths[1])


def analyze_current(text,source_mode='none',target_mode='epe',target_format='encoded',allow_lossy=False):
    """Return UI-ready analysis. Strict mode refuses every reported data change."""
    source_mode=str(source_mode);target_mode=str(target_mode);target_format=str(target_format)
    if target_format not in ('encoded','ruler_designer'):raise ValueError('Unsupported target DNA format.')
    if not isinstance(text,str) or not text.strip():raise ValueError('Paste DNA before converting.')
    if len(text)>4_000_000:raise ValueError('DNA input is too large.')
    source_schema=load_current_schema(source_mode);target_schema=load_current_schema(target_mode)
    report=[];messages=[];synthetic=False;document=None
    if '{' in text:
        document,synthetic=_parse_text(text);genes=document.genes;detected='ruler_designer'
    else:
        genes=decode_current(text,source_schema);detected='encoded'
        document=RulerDesignerDocument('ruler_designer_0',0,'male',0,0,None,genes,None,None,None)
        synthetic=True
    before={name:_value_json(value) for name,value in genes.items()}
    target_definitions=target_schema.all_genes if target_format=='ruler_designer' else target_schema.genes
    mapped={};preserved=0
    for name,value in genes.items():
        definition=target_definitions.get(name)
        if definition is None:
            _loss(report,name,'omitted-gene',value,None,'No representation in the selected target schema/format.');continue
        new=_map_value(name,value,definition,source_schema,target_schema,report,allow_lossy)
        mapped[name]=new
        if new==value and not any(r['gene']==name for r in report):preserved+=1
    # Always make the ordinary target genome complete; absent source data is an explicit loss.
    for name,definition in target_schema.genes.items():
        if name not in mapped:
            new=_neutral(definition);mapped[name]=new
            _loss(report,name,'added-default',None,new,'No source allele supplied. Initialized with the lowest-index target template and zero strength.')
    # Preserve harmless character metadata; do not carry opaque mod-specific overrides into another mod.
    if source_mode!=target_mode:
        for key in ('override_raw','tags_raw','entity'):
            old=getattr(document,key)
            if old is not None:
                _loss(report,key,'omitted-metadata',str(old),None,'Opaque source-mod metadata is not applied to a different target mod.')
        document=replace(document,override_raw=None,tags_raw=None,entity=None)
    if target_format=='encoded':
        for key in ('override_raw','tags_raw','entity'):
            old=getattr(document,key)
            if old is not None:_loss(report,key,'omitted-metadata',str(old),None,'Raw Base64 DNA cannot store text portrait metadata.')
    if synthetic:
        messages.append({'level':'info','message':'Input has no complete character metadata. Text export uses male/id=0 defaults; raw DNA does not encode gender, age or character ID.'})
    # Same token names may still refer to different underlying meshes/textures in different mods.
    if source_mode!=target_mode:
        messages.append({'level':'warning','message':'Shared gene names, allele templates and strength values are preserved where supported. Different mod meshes/textures mean identical appearance cannot be guaranteed.'})
    error=None;output=''
    if report and not allow_lossy:
        error=f'{len(report)} unsupported or changed item(s) require Lossy Fallbacks. No converted output was produced.'
    else:
        if target_format=='encoded':output=encode_current(mapped,target_schema)
        else:output=serialize_ruler_designer(replace(document,genes=mapped))
    if report:
        messages.append({'level':'warning','message':f'{len(report)} item(s) '+('approximated, omitted or initialized; see the per-gene loss report.' if allow_lossy else 'would need approximation, omission or initialization; strict conversion was stopped.')})
    messages.append({'level':'info','message':f'Installed schemas: {_label(source_schema)} -> {_label(target_schema)}. Preserved {preserved} supplied gene(s) exactly.'})
    return {'detectedInputFormat':detected,'targetFormat':target_format,'convertedOutput':output,
            'conversionSucceeded':error is None,'conversionError':error,'validationMessages':messages,
            'selectedMappingProfile':target_mode+'_current','ambiguousMappingProfiles':[],
            'lossyReplacementCount':len(report),'lossReport':report,'preservedGeneCount':preserved,
            'sourceGeneCount':len(genes),'targetGeneCount':len(mapped),'schemaInfo':{'source':source_schema.metadata(),'target':target_schema.metadata()},
            'canonicalData':{'source':before,'target':{n:_value_json(v) for n,v in mapped.items()}},
            'outputDownloadName':'converted_encoded_dna.txt' if target_format=='encoded' else 'converted_text_dna.txt'}


def _label(schema):return f'{schema.mode.upper()} {schema.version} ({len(schema.genes)} genes)'


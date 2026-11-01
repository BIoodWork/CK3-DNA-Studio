"""Check a deliberately saved DNA against current definitions and selected game target."""
from pathlib import Path
import hashlib,hmac,json,os,re
from live_game import handle_live, LiveGameError
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema, _load_schema_cached
from ck3_dna_converter_core.core.services.runtime_conversion import decode_current

def active_profile():
    user=Path(os.environ.get('CK3_USER_DIR',str(Path.home()/'Documents/Paradox Interactive/Crusader Kings III')))
    data=json.loads((user/'dlc_load.json').read_text(encoding='utf-8-sig'))
    mods=data.get('enabled_mods')
    if not isinstance(mods,list):raise ValueError('Aktive Mod-Zusammenstellung nicht lesbar.')
    roots=[];modes=set()
    for item in mods:
        if not isinstance(item,str):raise ValueError('Ungültiger Mod-Eintrag.')
        descriptor=Path(item)
        if not descriptor.is_absolute():descriptor=user/descriptor
        text=descriptor.read_text(encoding='utf-8-sig')
        match=re.search(r'^path\s*=\s*"([^"]+)"',text,re.M)
        if not match:raise ValueError('Ein aktiver Mod-Pfad kann nicht geprüft werden.')
        root=Path(match.group(1))
        if not root.is_absolute():root=descriptor.parent/root
        roots.append(root)
        remote=re.search(r'^remote_file_id\s*=\s*"([^"]+)"',text,re.M)
        ident=remote.group(1) if remote else root.name
        if ident=='2507209632':modes.add('epe')
        if ident=='2962333032':modes.add('agot')
        if re.search(r'replace_path\s*=\s*"common/genes(?:/[^\"]*)?"',text):
            raise ValueError('Ein aktiver Mod ersetzt Gen-Verzeichnisse. Bitte DNA zuerst für diese Zusammenstellung neu konvertieren.')
    if len(modes)>1:raise ValueError('EPE und AGOT sind zugleich aktiviert. Zielprofil nicht eindeutig.')
    mode=next(iter(modes),'none');schema=load_current_schema(mode)
    files={p.name:p for p in (schema.game_root/'common/genes').glob('*.txt')}
    for root in roots:files.update({p.name:p for p in (root/'common/genes').glob('*.txt')})
    h=hashlib.sha256()
    for name,p in sorted(files.items()):h.update(name.encode()+b'\0'+p.read_bytes())
    if h.hexdigest()!=schema.fingerprint:
        signature=tuple((name,str(p),p.stat().st_mtime_ns,p.stat().st_size) for name,p in sorted(files.items()))
        effective=_load_schema_cached(mode,str(schema.game_root/'common/genes'),str(schema.mod_root/'common/genes') if schema.mod_root else None,signature)
        additive = list(effective.genes)==list(schema.genes) and all(
            effective.genes[name].kind==g.kind and all(effective.genes[name].tokens.get(t)==v for t,v in g.tokens.items())
            for name,g in schema.genes.items())
        if not additive:
            raise ValueError('Aktive Porträt-Submods verändern die reguläre Gen-Reihenfolge oder Vorlagen. Bitte für diese Zusammenstellung neu konvertieren.')
    for gene in ('hair_color','skin_color','eye_color'):
        filename=gene.removesuffix('_color')+'_palette.dds'
        effective=schema.game_root/'gfx/portraits'/filename
        for root in roots:
            candidate=root/'gfx/portraits'/filename
            if candidate.is_file():effective=candidate
        if hashlib.sha256(effective.read_bytes()).digest()!=hashlib.sha256(schema.palette_path(gene).read_bytes()).digest():
            raise ValueError('Ein aktiver Mod ändert die Farbpaletten. Diese Bibliotheks-DNA bitte neu konvertieren.')
    return mode,schema

def check_entry(entry,expected):
    name=entry.get('name','DNA') if isinstance(entry,dict) else 'DNA'
    info=entry.get('schemaInfo',{}) if isinstance(entry,dict) else {}
    info=info.get('target',{}) if isinstance(info,dict) else {}
    if not isinstance(info,dict):info={}
    details={
        'savedProfile':entry.get('profile') if isinstance(entry,dict) else None,
        'currentProfile':None,
        'geneDefinitions':{'status':'not_checked','saved':info.get('fingerprint'),'current':None},
        'palettes':{'status':'not_checked','saved':info.get('paletteFingerprints'),'current':None},
        'configuration':{
            'source':'launcher_configuration', 'runningModsVerified':False,
            'caveat':'Die Prüfung nutzt die Launcher-Konfiguration und installierte Dateien. Das ist kein Nachweis der im laufenden Spiel geladenen Mods.'}}
    def no(reason):return {'compatible':False,'entryName':name,'reason':reason,'compatibilityDetails':details}
    try:
        if not isinstance(entry,dict):return no('Bibliothekseintrag fehlt.')
        if entry.get('format')!='encoded':return no('Dieser Eintrag enthält Text-DNA. Zuerst als DNA String (Base64) konvertieren und speichern.')
        state=handle_live('game_status')
        if not state.get('ready'):return no(state.get('message','Kein Charakter ausgewählt.'))
        if (not isinstance(expected,dict) or type(expected.get('pid')) is not int
                or type(expected.get('id')) is not int or expected['pid']!=state['pid'] or expected['id']!=state['id']
                or not isinstance(expected.get('selectionToken'),str)
                or not re.fullmatch(r'[0-9a-f]{64}',expected['selectionToken'])
                or not isinstance(state.get('selectionToken'),str)
                or not hmac.compare_digest(expected['selectionToken'],state['selectionToken'])):
            return no('Die Charakterauswahl hat sich geändert. Anzeige aktualisieren lassen.')
        mode,schema=active_profile()
        details['currentProfile']=mode
        genes=details['geneDefinitions'];genes['current']=schema.fingerprint
        genes['status']='missing' if not genes['saved'] else 'match' if genes['saved']==genes['current'] else 'changed'
        palettes=details['palettes'];palettes['current']=schema.palette_fingerprints()
        saved=palettes['saved']
        valid=(isinstance(saved,dict) and all(isinstance(saved.get(g),str) and re.fullmatch(r'[0-9a-f]{64}',saved[g]) for g in palettes['current']))
        palettes['status']='missing' if not valid else 'match' if all(saved[g]==digest for g,digest in palettes['current'].items()) else 'changed'
        if entry.get('profile')!=mode:return no('Das gespeicherte Zielprofil passt nicht zur aktiven Mod-Zusammenstellung. Bitte neu konvertieren.')
        if info.get('fingerprint')!=schema.fingerprint:return no('Die Gen-Definitionen haben sich geändert oder fehlen im Eintrag. Bitte erneut konvertieren.')
        if info.get('gameVersion')!=schema.game_version:return no('Die gespeicherte Spielversion weicht ab. Bitte erneut konvertieren.')
        if palettes['status']=='missing':return no('Historische Farbpaletten-Prüfsummen fehlen. Bitte die gespeicherte DNA im Konverter erneut prüfen und als neuen Eintrag speichern.')
        if palettes['status']=='changed':return no('Die Farbpaletten haben sich seit dem Speichern geändert. Bitte den gespeicherten Originalinhalt laden und erneut konvertieren.')
        decode_current(entry.get('dna',''),schema)
        if state['byteCount']!=len(schema.genes)*4:return no('Die Gen-Anzahl des ausgewählten Charakters passt nicht zum Profil.')
        return {'compatible':True,'entryName':name,'reason':'Profil, Gen-Definitionen, Farbpaletten und Länge passen zur aktuellen Auswahl.','profile':mode,'compatibilityDetails':details}
    except (OSError,ValueError,LiveGameError,KeyError,TypeError) as e:return no(str(e))

def handle_library(action,payload):
    entry=payload.get('entry');expected=payload.get('expectedTarget')
    result=check_entry(entry,expected)
    if action=='library_check':return result
    if not result['compatible']:raise ValueError(result['reason'])
    return handle_live('game_paste',{'dna':entry['dna'],'expectedTarget':expected,'deadline':payload.get('deadline')})

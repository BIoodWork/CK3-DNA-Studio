"""Read current installed CK3/mod gene definitions without legacy field tables.

Ordinary color/morph/accessory genes are serialized; special_genes are text-only.
File overlays follow the game's virtual file names. Re-definitions keep their
original insertion slot while replacing the definition. This order has been
checked against a 130-gene live EPE buffer from the installed 1.20.1.2 build.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import os
import re
import sys

_TOKEN = re.compile(r'#[^\n]*|"(?:\\.|[^"\\])*"|[{}=]|[^\s{}=#]+')
_GROUPS = {'color_genes', 'morph_genes', 'accessory_genes'}
_LABELS = {'none': 'Vanilla', 'epe': 'EPE', 'agot': 'AGOT'}
_MOD_IDS = {'epe': '2507209632', 'agot': '2962333032'}


def parse_definitions(text: str) -> list:
    """Small brace-aware Clausewitz reader; comments/quoted braces are safe."""
    tokens = [m.group() for m in _TOKEN.finditer(text) if not m.group().startswith('#')]
    i = 0
    def block(nested=False):
        nonlocal i
        result = []
        while i < len(tokens):
            key = tokens[i]; i += 1
            if key == '}':
                if not nested: raise ValueError('Unexpected closing brace in gene definitions.')
                return result
            if key == '{':
                result.append((None, block(True))); continue
            if i < len(tokens) and tokens[i] == '=':
                i += 1
                if i >= len(tokens): raise ValueError('Missing gene definition value.')
                value = tokens[i]; i += 1
                if value == '{': value = block(True)
                elif value == '}': raise ValueError('Missing gene definition value before closing brace.')
                result.append((key, value))
            else: result.append((None, key))
        if nested: raise ValueError('Unclosed gene definition block.')
        return result
    return block()


@dataclass(frozen=True)
class GeneDefinition:
    name: str
    kind: str
    tokens: dict[str, int]
    special: bool
    filename: str


@dataclass(frozen=True)
class CurrentSchema:
    mode: str
    version: str
    game_version: str
    game_root: Path
    mod_root: Path | None
    genes: dict[str, GeneDefinition]
    special_genes: dict[str, GeneDefinition]
    fingerprint: str

    @property
    def all_genes(self): return self.genes | self.special_genes

    def palette_path(self, gene: str) -> Path:
        filename = gene.removesuffix('_color') + '_palette.dds'
        if self.mod_root and (p := self.mod_root/'gfx/portraits'/filename).is_file(): return p
        return self.game_root/'gfx/portraits'/filename

    def metadata(self):
        return {'available': True, 'label': _LABELS[self.mode], 'version': self.version,
                'gameVersion': self.game_version, 'geneCount': len(self.genes),
                'specialGeneCount': len(self.special_genes), 'byteLength': len(self.genes)*4,
                'fingerprint': self.fingerprint, 'paletteFingerprints': self.palette_fingerprints(),
                'source': str(self.mod_root or self.game_root)}

    def palette_fingerprints(self):
        # Hash current content on every check, independently of schema/image caches.
        return {gene: hashlib.sha256(self.palette_path(gene).read_bytes()).hexdigest()
                for gene in ('hair_color', 'skin_color', 'eye_color')}


def _steam_libraries():
    """Default Steam roots plus explicit libraryfolders.vdf paths; no disk-wide scan."""
    if sys.platform == 'darwin':
        roots = [Path.home()/'Library/Application Support/Steam']
    elif sys.platform.startswith('linux'):
        roots = [Path.home()/p for p in ('.local/share/Steam', '.steam/steam', '.var/app/com.valvesoftware.Steam/.local/share/Steam', 'snap/steam/common/.local/share/Steam')]
    else:
        roots = [Path(p) for p in ['C:/Program Files (x86)/Steam', 'C:/SteamLibrary', 'D:/SteamLibrary', 'E:/SteamLibrary', 'F:/SteamLibrary']]
    libraries = list(roots)
    for root in roots:
        try:
            text = (root/'steamapps/libraryfolders.vdf').read_text(encoding='utf-8-sig')
            for raw in re.findall(r'"path"\s*"([^"\n]+)"', text):
                folder = Path(raw.replace(chr(92)*2, chr(92)))
                if folder.is_absolute() and folder not in libraries:
                    libraries.append(folder)
        except (OSError, UnicodeError):
            pass
    return libraries


def _genes_dirs(mode):
    base = os.environ.get('CK3_GENES_DIR')
    if not base:
        candidates = []
        for root in _steam_libraries():
            candidates.append(Path(root)/'steamapps/common/Crusader Kings III/game/common/genes')
        base = next((p for p in candidates if p.is_dir()), None)
    if not base or not Path(base).is_dir(): raise ValueError('Installed CK3 gene definitions were not found. Set CK3_GENES_DIR to game/common/genes.')
    base = Path(base).resolve()
    if mode == 'none': return base, None
    configured = os.environ.get(f'CK3_{mode.upper()}_GENES_DIR')
    candidates = [Path(configured)] if configured else []
    # Discover the Workshop sibling of the found Steam game, plus other libraries.
    for ancestor in base.parents:
        if ancestor.name.lower() == 'steamapps':
            candidates.append(ancestor/'workshop/content/1158310'/_MOD_IDS[mode]/'common/genes')
    for root in _steam_libraries():
        candidates.append(Path(root)/'steamapps/workshop/content/1158310'/_MOD_IDS[mode]/'common/genes')
    mod = next((p.resolve() for p in candidates if p.is_dir()), None)
    if mod is None: raise ValueError(f'Installed {_LABELS[mode]} gene definitions were not found. Set CK3_{mode.upper()}_GENES_DIR to that mod\'s common/genes.')
    return base, mod


def _version(root: Path, mod=False):
    if mod:
        try:
            text=(root/'descriptor.mod').read_text(encoding='utf-8-sig')
            version=re.search(r'^version\s*=\s*"([^"]+)"',text,re.M)
            compatible=re.search(r'^supported_version\s*=\s*"([^"]+)"',text,re.M)
            return (version.group(1) if version else 'installed') + (f' / CK3 {compatible.group(1)}' if compatible else '')
        except OSError: return 'installed'
    try:
        launcher=json.loads((root.parent/'launcher/launcher-settings.json').read_text(encoding='utf-8-sig'))
        return launcher.get('rawVersion') or launcher.get('version') or 'installed'
    except (OSError,ValueError): return 'installed'


def load_current_schema(mode='none') -> CurrentSchema:
    if mode not in _LABELS: raise ValueError(f'Unsupported DNA profile: {mode}.')
    base, mod = _genes_dirs(mode)
    files={p.name:p for p in base.glob('*.txt')}
    if mod: files.update({p.name:p for p in mod.glob('*.txt')})
    signature=tuple((name,str(p),p.stat().st_mtime_ns,p.stat().st_size) for name,p in sorted(files.items()))
    return _load_schema_cached(mode,str(base),str(mod) if mod else None,signature)


@lru_cache(maxsize=8)
def _load_schema_cached(mode,base_str,mod_str,signature):
    base=Path(base_str);mod=Path(mod_str) if mod_str else None
    regular={};special={};fingerprint=hashlib.sha256()
    def collect(groups, destination, filename, is_special):
        for group, values in groups:
            if group not in _GROUPS or not isinstance(values,list): continue
            for name, content in values:
                if name is None or not isinstance(content,list): continue
                token_map={}
                for token, value in content:
                    if token is None or not isinstance(value,list): continue
                    index=dict(value).get('index')
                    if index is not None:
                        try: integer=int(index)
                        except (TypeError,ValueError): raise ValueError(f'Non-numeric template index: {filename}/{name}/{token}.')
                        if not 0 <= integer <= 2147483647: raise ValueError(f'Invalid template index: {filename}/{name}/{token}.')
                        token_map[token]=integer
                if group != 'color_genes' and not token_map and not is_special:
                    raise ValueError(f'No explicit template indexes in {filename}/{name}.')
                if len(set(token_map.values()))!=len(token_map):
                    raise ValueError(f'Ambiguous duplicate template indexes in {filename}/{name}.')
                destination[name]=GeneDefinition(name,group,token_map,is_special,filename)
    for filename,path,_,_ in signature:
        raw=Path(path).read_bytes();fingerprint.update(filename.encode()+b'\0'+raw)
        parsed=parse_definitions(raw.decode('utf-8-sig'))
        collect(parsed,regular,filename,False)
        for group,value in parsed:
            if group=='special_genes' and isinstance(value,list):collect(value,special,filename,True)
    game_root=base.parent.parent;mod_root=mod.parent.parent if mod else None
    game_version=_version(game_root)
    return CurrentSchema(mode,_version(mod_root,True) if mod_root else game_version,game_version,
                         game_root,mod_root,regular,special,fingerprint.hexdigest())


def list_current_schemas():
    result={}
    for mode,label in _LABELS.items():
        try: result[mode]=load_current_schema(mode).metadata()
        except (OSError,ValueError) as exc: result[mode]={'available':False,'label':label,'error':str(exc),'geneCount':None,'version':None}
    return result


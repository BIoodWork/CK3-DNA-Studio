"""Lossless editing against installed schemas, with conservative auto detection.

Named DNA is edited in place: only the requested gene value spans are replaced.
Unknown genes, metadata, comments and the original wrapper stay intact.
"""
from __future__ import annotations

import json
import re
import base64
from io import BytesIO
from dataclasses import dataclass
from PIL import Image

from ck3_dna_converter_core.core.domain.types import ColorGeneValue, TokenPairGeneValue, RulerDesignerDocument
from ck3_dna_converter_core.core.parsing.parse_ruler_designer import _parse_gene_value
from ck3_dna_converter_core.core.serialization.serialize_ruler_designer import serialize_ruler_designer
from ck3_dna_converter_core.core.services.runtime_conversion import decode_current, encode_current, _value_json
from ck3_dna_converter_core.core.services.palette_conversion import palette, _rgba
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema

_MODES = ('none', 'epe', 'agot')
_TOKEN = re.compile(r'#[^\n]*|"(?:\\.|[^"\\])*"|[{}=]|[^\s{}=#]+')


@dataclass
class TextSource:
    genes: dict
    spans: dict
    closing: int


def _profile(profile):
    if profile in (None, '', 'auto'):
        return None
    if profile == 'vanilla':
        return 'none'
    if profile not in _MODES:
        raise ValueError('Unsupported DNA profile. Choose Vanilla, EPE or AGOT.')
    return profile


def _check_text(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError('Paste DNA before opening the editor.')
    if len(text) > 1_500_000:
        raise ValueError('DNA input is too large.')


def _read_text(text):
    """Read a single genes block and retain exact value offsets, including opaque genes."""
    tokens = [m for m in _TOKEN.finditer(text.lstrip('\ufeff')) if not m.group().startswith('#')]
    # Preserve offsets when a UTF-8 BOM is present.
    offset = len(text) - len(text.lstrip('\ufeff'))
    if not tokens:
        raise ValueError('DNA text is empty.')
    matching = {}
    stack = []
    for i, token in enumerate(tokens):
        if token.group() == '{':
            stack.append(i)
        elif token.group() == '}':
            if not stack:
                raise ValueError('Unexpected closing brace in DNA text.')
            opening = stack.pop()
            matching[opening] = i
    if stack:
        raise ValueError('Unclosed DNA text block.')

    def assignments(start, end):
        result = {}
        i = start
        while i < end:
            name = tokens[i].group()
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name) or i + 2 >= end or tokens[i+1].group() != '=':
                raise ValueError('Expected a named assignment in DNA text.')
            if name in result:
                raise ValueError(f'Duplicate DNA field: {name}.')
            value = i + 2
            finish = matching[value] if tokens[value].group() == '{' else value
            if finish >= end:
                raise ValueError('DNA assignment extends outside its block.')
            result[name] = (value, finish)
            i = finish + 1
        return result

    root = assignments(0, len(tokens))
    if len(root) != 1:
        raise ValueError('Paste one DNA character or genes block at a time.')
    root_name, (start, end) = next(iter(root.items()))
    if tokens[start].group() != '{':
        raise ValueError('DNA text must contain a genes block, not a save-game DNA reference.')
    if root_name == 'genes':
        genes_start, genes_end = start, end
    else:
        fields = assignments(start + 1, end)
        if 'portrait_info' in fields:
            start, end = fields['portrait_info']
            if tokens[start].group() != '{':
                raise ValueError('portrait_info must be a block.')
            fields = assignments(start + 1, end)
        if 'genes' not in fields:
            raise ValueError('DNA text does not contain a genes block.')
        genes_start, genes_end = fields['genes']
    if tokens[genes_start].group() != '{':
        raise ValueError('genes must be a block.')
    genes, spans = {}, {}
    for name, (start, end) in assignments(genes_start + 1, genes_end).items():
        value = None
        if tokens[start].group() == '{':
            raw = ' '.join(t.group() for t in tokens[start+1:end])
            try:
                value = _parse_gene_value(name, raw)
            except ValueError:
                pass  # Future/unknown syntax is retained verbatim, never guessed.
        genes[name] = value
        spans[name] = (tokens[start].start() + offset, tokens[end].end() + offset)
    if not genes:
        raise ValueError('The genes block is empty.')
    return TextSource(genes, spans, tokens[genes_end].start() + offset)


def _category(name, definition=None):
    if definition and definition.kind == 'color_genes':
        return 'Colors'
    for words, category in [
        (('hair', 'beard', 'bald'), 'Hair'),
        (('eye', 'brow', 'eyelash'), 'Eyes'),
        (('nose', 'nostril'), 'Nose'),
        (('mouth', 'lip', 'teeth'), 'Mouth'),
        (('chin', 'jaw', 'cheek'), 'Jaw & cheeks'),
        (('body', 'height', 'muscle', 'weight', 'bust'), 'Body'),
        (('dragon',), 'Dragon'),
        (('ear', 'face', 'head', 'complexion', 'age', 'skin'), 'Face'),
    ]:
        if any(word in name for word in words):
            return category
    if definition and definition.kind == 'accessory_genes':
        return 'Accessories'
    return 'Other'


def _supported(value, definition):
    if definition is None or value is None:
        return False
    if definition.kind == 'color_genes':
        return isinstance(value, ColorGeneValue)
    return (isinstance(value, TokenPairGeneValue)
            and value.first_token in definition.tokens and value.second_token in definition.tokens)


def _descriptor(name, definition=None, value=None, with_value=False):
    result = {
        'name': name, 'label': name.removeprefix('gene_').replace('_', ' '),
        'kind': 'color' if (definition and definition.kind == 'color_genes') or isinstance(value, ColorGeneValue) else 'morph',
        'category': _category(name, definition),
        'options': list(definition.tokens) if definition else [],
        'known': definition is not None,
        'editable': definition is not None and (not with_value or _supported(value, definition)),
        'special': bool(definition and definition.special),
        'encoded': bool(definition and not definition.special),
    }
    if with_value:
        result['values'] = _value_json(value)
    return result


def _color_swatches(row, value, schema):
    """Sample both allele coordinates from this profile's actual installed palette."""
    if row['kind'] != 'color' or not row['editable'] or not isinstance(value, ColorGeneValue):
        return
    row['swatches'] = []
    row['swatchApproximate'] = True
    row['swatchSampling'] = 'Installed palette, CPU nearest texel. Game interpolation, shading and materials may change the visible color.'
    try:
        source = palette(schema.palette_path(row['name']))
        values = value.values
        row['swatches'] = ['#' + ''.join(f'{c:02x}' for c in _rgba(source, x, y)[:3])
                           for x, y in ((values[0], values[1]), (values[2], values[3]))]
    except (OSError, ValueError) as exc:
        # A missing preview must never change gene values or prevent lossless
        # named-text editing. No substitute/fabricated color is displayed.
        row['swatchError'] = str(exc)


def studio_catalog(profile):
    profile = _profile(profile)
    if profile is None:
        raise ValueError('Select a DNA profile before opening the gene catalog.')
    schema = load_current_schema(profile)
    catalog = [_descriptor(name, definition) for name, definition in schema.all_genes.items()]
    return {'profile': profile, 'genes': catalog, 'catalog': catalog, 'schemaInfo': schema.metadata()}


def studio_palette(profile, gene):
    """Return a PNG whose pixel (x,y) is the byte-addressable palette position."""
    profile = _profile(profile)
    if profile is None:
        raise ValueError('Select a source profile before opening a color palette.')
    schema = load_current_schema(profile)
    definition = schema.all_genes.get(gene) if isinstance(gene, str) else None
    if definition is None or definition.kind != 'color_genes':
        raise ValueError('Select an installed color gene to open its palette.')
    sampled = palette(schema.palette_path(gene))
    image = Image.frombytes('RGBA', (256, 256), sampled['sampled'])
    buffer = BytesIO()
    image.save(buffer, format='PNG')
    return {
        'profile': profile, 'gene': gene, 'width': 256, 'height': 256,
        'dataUrl': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii'),
        'approximate': True,
        'sampling': 'Installed palette, CPU nearest texel. Game interpolation, shading and materials may change the visible color.',
        'coordinateSystem': 'x increases left-to-right; y increases top-to-bottom; integer coordinates 0..255',
    }


def _schemas():
    result, errors = {}, {}
    for mode in _MODES:
        try:
            result[mode] = load_current_schema(mode)
        except (ValueError, OSError) as exc:
            errors[mode] = str(exc)
    return result, errors


def _can_encode(genes, schema):
    try:
        return encode_current(genes, schema), None
    except ValueError as exc:
        return None, str(exc)


def studio_detect(text, profile=None):
    _check_text(text)
    profile = _profile(profile)
    schemas, unavailable = _schemas()
    if profile is not None and profile not in schemas:
        raise ValueError(unavailable[profile])
    text_source = _read_text(text) if '{' in text else None
    decoded = {}
    errors = {}
    if text_source:
        genes = text_source.genes
        # Unknown-to-every-schema genes supply no evidence. Known genes/tokens
        # must agree with a candidate; a shared subset remains ambiguous.
        known_names = set().union(*(set(s.all_genes) for s in schemas.values())) if schemas else set()
        evidence = [name for name in genes if name in known_names]
        support = {name: {mode for mode, schema in schemas.items()
                          if _supported(genes[name], schema.all_genes.get(name))} for name in evidence}
        candidates = [mode for mode, schema in schemas.items()
                      if evidence and all(mode in support[name] if support[name] else name in schema.all_genes
                                          for name in evidence)]
        if profile is not None:
            # Named DNA may contain future templates. Keep them read-only and
            # allow edits to the supported subset under an explicit profile.
            selected = profile
        else:
            selected = candidates[0] if len(candidates) == 1 else None
    else:
        for mode, schema in schemas.items():
            try:
                decoded[mode] = decode_current(text, schema)
            except ValueError as exc:
                errors[mode] = str(exc)
        candidates = list(decoded)
        selected = profile if profile in decoded else (candidates[0] if profile is None and len(candidates) == 1 else None)
        genes = decoded.get(selected, {})
    schema = schemas.get(selected)
    status = 'ready' if selected else ('ambiguous' if profile is None and len(candidates) > 1 else 'unsupported')
    messages = []
    if status == 'ambiguous':
        messages.append('This DNA matches multiple installed profiles. Choose the source profile; no profile was guessed.')
    elif status == 'unsupported':
        messages.append('No matching installed schema. Older or external DNA needs named text exported from its original game/mod version; no legacy field order was guessed.')
        if profile in errors:
            messages.append(errors[profile])
    definitions = schema.all_genes if schema else {}
    rows = [_descriptor(name, definitions.get(name), value, True) for name, value in genes.items()]
    if schema:
        for row in rows:
            _color_swatches(row, genes[row['name']], schema)
    encoded, encoding_error = _can_encode(genes, schema) if schema else (
        None, 'Select a matching source profile before generating encoded DNA. No field order or templates were guessed.')
    if schema and any(not row['editable'] for row in rows):
        messages.append('Unsupported genes/templates remain unchanged in text and are read-only. Raw DNA export requires exactly the supported ordinary gene set.')
    catalog = [_descriptor(name, definition) for name, definition in definitions.items()]
    metadata = schema.metadata() if schema else None
    ruler_designer = text if text_source else (serialize_ruler_designer(
        RulerDesignerDocument('ruler_designer_0', 0, 'male', 0, None, None, genes, None, None, None)) if schema else None)
    if text_source is None and ruler_designer is not None:
        messages.append('Raw DNA has no character metadata. The text representation uses male/id=0 defaults.')
    return {
        'format': 'ruler_designer' if text_source else 'encoded',
        'detectedInputFormat': 'ruler_designer' if text_source else 'encoded',
        'profile': selected, 'candidates': candidates, 'status': status,
        'geneCount': len(genes), 'genes': rows, 'catalog': catalog,
        # Retain direct fields for the editor and the established source/target
        # provenance shape used by saved-library compatibility checks.
        'schemaInfo': dict(metadata, source=metadata, target=metadata) if metadata else None,
        'original': text, 'normalized': text if text_source else encoded,
        'encoded': encoded, 'encodingError': encoding_error,
        'rulerDesigner': ruler_designer,
        'rulerDesignerMetadataSynthetic': text_source is None and ruler_designer is not None,
        'rulerDesignerError': None if ruler_designer is not None else 'Select a matching source profile before generating named text DNA. No field order or templates were guessed.',
        'messages': messages, 'unavailableProfiles': unavailable,
    }


def _patch_value(name, values, definition):
    if not isinstance(values, list) or len(values) != 4:
        raise ValueError(f'{name} needs exactly four allele values.')
    positions = (0, 1, 2, 3) if definition.kind == 'color_genes' else (1, 3)
    if any(type(values[i]) is not int or not 0 <= values[i] <= 255 for i in positions):
        raise ValueError(f'{name}: allele values must be integers from 0 to 255.')
    if definition.kind == 'color_genes':
        return ColorGeneValue(tuple(values))
    if any(not isinstance(values[i], str) or values[i] not in definition.tokens for i in (0, 2)):
        raise ValueError(f'{name}: select an installed template; unknown templates are not guessed.')
    return TokenPairGeneValue(*values)


def _value_text(value):
    values = _value_json(value)
    return '{ ' + ' '.join(json.dumps(v, ensure_ascii=False) if isinstance(v, str) else str(v) for v in values) + ' }'


def studio_encode(text, profile, genes, target_format=None):
    _check_text(text)
    profile = _profile(profile)
    if profile is None:
        raise ValueError('Select a source profile before applying edits.')
    analysis = studio_detect(text, profile)
    if analysis['status'] != 'ready':
        raise ValueError('This DNA does not match the selected profile. No edits were applied.')
    schema = load_current_schema(profile)
    source = _read_text(text) if analysis['format'] == 'ruler_designer' else None
    current = source.genes.copy() if source else decode_current(text, schema)
    if not isinstance(genes, list) or len(genes) > 10000:
        raise ValueError('Gene edits must be a list of named allele values.')
    changes = {}
    seen = set()
    for row in genes:
        if not isinstance(row, dict) or not isinstance(row.get('name'), str):
            raise ValueError('Each gene edit needs a name and values.')
        name = row['name']
        if name in seen:
            raise ValueError(f'Duplicate gene edit: {name}.')
        seen.add(name)
        values = row.get('values')
        # Full UI snapshots may include opaque read-only values unchanged.
        if name in current and values == _value_json(current[name]):
            continue
        definition = schema.all_genes.get(name)
        if definition is None:
            raise ValueError(f'Unknown gene {name} is preserved read-only; it cannot be edited or added.')
        value = _patch_value(name, values, definition)
        current[name] = value
        changes[name] = value
    target_format = target_format or analysis['format']
    if target_format not in ('encoded', 'ruler_designer'):
        raise ValueError('Unsupported target DNA format.')
    if target_format == 'encoded':
        # This check deliberately refuses special/unknown genes and missing
        # genes. No source data is dropped and no defaults are synthesized.
        output = encode_current(current, schema)
    elif source:
        replacements = [(source.spans[name][0], source.spans[name][1], _value_text(value))
                        for name, value in changes.items() if name in source.spans]
        additions = [(name, value) for name, value in changes.items() if name not in source.spans]
        if additions:
            replacements.append((source.closing, source.closing,
                                 '\n' + ''.join(f'\t{name} = {_value_text(value)}\n' for name, value in additions)))
        output = text
        for start, end, replacement in sorted(replacements, reverse=True):
            output = output[:start] + replacement + output[end:]
    else:
        output = serialize_ruler_designer(RulerDesignerDocument('ruler_designer_0', 0, 'male', 0, None, None, current, None, None, None))
    result = studio_detect(output, profile)
    result.update({'original': text, 'output': output, 'convertedOutput': output,
                   'conversionSucceeded': True, 'targetFormat': target_format, 'editedGeneCount': len(changes)})
    if source is None and target_format == 'ruler_designer':
        result['messages'].append('Raw DNA has no character metadata. Text export uses male/id=0 defaults.')
    if source is not None and target_format == 'encoded':
        result['messages'].append('Raw DNA contains genes only. Character metadata stays in the preserved original text.')
    return result

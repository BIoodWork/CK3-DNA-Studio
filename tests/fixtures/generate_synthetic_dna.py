"""Regenerate deterministic EPE/raw and AGOT/text DNA without saved characters."""
from pathlib import Path
import base64
import hashlib
import random
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'backend/python'), str(ROOT / 'backend/python/src')]
from live_game import murmur3
from ck3_dna_converter_core.core.domain.types import ColorGeneValue, TokenPairGeneValue
from ck3_dna_converter_core.core.services.runtime_conversion import encode_current
from ck3_dna_converter_core.core.tables.current_schemas import load_current_schema
from ck3_dna_converter_core.core.serialization.serialize_ruler_designer import _serialize_gene_value

EPE_SEED = 20261030
AGOT_SEED = 20261101


def synthetic_genes(schema, seed, special_names=()):
    """Use installed definition names and seeded random alleles, never user DNA."""
    rng = random.Random(seed)
    definitions = schema.genes | {name: schema.special_genes[name] for name in special_names}
    genes = {}
    for name, definition in definitions.items():
        if definition.kind == 'color_genes':
            genes[name] = ColorGeneValue(tuple(rng.randrange(256) for _ in range(4)))
        else:
            tokens = [token for token, code in definition.tokens.items() if definition.special or code <= 255]
            genes[name] = TokenPairGeneValue(rng.choice(tokens), rng.randrange(256), rng.choice(tokens), rng.randrange(256))
    return genes


def synthetic_agot_text(schema):
    genes = synthetic_genes(schema, AGOT_SEED, ('hairstyles',))
    rows = ['synthetic_agot_0 = {', '\tportrait_info = {', '\t\ttype = male', '\t\tid = 0', '\t\tgenes = {']
    rows.extend(f'\t\t\t{name} = {_serialize_gene_value(value)}' for name, value in genes.items())
    rows.extend(['\t\t}', '\t}', '\tenabled = yes', '}', ''])
    return '\n'.join(rows)


def main():
    schema = load_current_schema('epe')
    raw = base64.b64decode(encode_current(synthetic_genes(schema, EPE_SEED), schema))
    Path(__file__).with_name('live_dna.bin').write_bytes(raw)
    text = synthetic_agot_text(load_current_schema('agot'))
    Path(__file__).with_name('agot_sample.txt').write_text(text, encoding='utf-8', newline='\n')
    print(f'Synthetic EPE fixture: seed {EPE_SEED}; {len(raw)} bytes; SHA-256 {hashlib.sha256(raw).hexdigest()}; Murmur3 0x{murmur3(raw):08x}')
    print(f'Synthetic AGOT fixture: seed {AGOT_SEED}; SHA-256 {hashlib.sha256(text.encode()).hexdigest()}')


if __name__ == '__main__':
    main()

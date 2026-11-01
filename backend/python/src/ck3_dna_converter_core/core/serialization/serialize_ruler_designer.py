"""Serializer for CK3 ruler designer text DNA."""

from __future__ import annotations

from ck3_dna_converter_core.core.domain.types import (
    ColorGeneValue,
    DnaMode,
    RulerDesignerDocument,
    TokenPairGeneValue,
)


def serialize_ruler_designer(
    document: RulerDesignerDocument,
    mode: DnaMode = DnaMode.NONE,
) -> str:
    """Serialize a parsed ruler designer document into normalized text."""
    _ = mode

    lines: list[str] = [
        f"{document.root_key}={{",
        f"\ttype={document.character_type}",
        f"\tid={document.character_id}",
    ]
    if document.random_seed is not None:
        lines.append(f"\trandom_seed={document.random_seed}")
    if document.age is not None:
        lines.append(f"\tage={document.age:.6f}")
    lines.append("\tgenes={")

    for gene_name, gene_value in document.genes.items():
        lines.append(f"\t\t{gene_name}={_serialize_gene_value(gene_value)}")

    lines.append("\t}")

    if document.override_raw is not None:
        lines.append("\toverride={")
        lines.extend(_serialize_raw_block(document.override_raw))
        lines.append("\t}")

    if document.entity is not None:
        lines.append(f"\tentity={{ {document.entity[0]} {document.entity[1]} }}")

    if document.tags_raw is not None:
        lines.append("\ttags={")
        lines.extend(_serialize_raw_block(document.tags_raw))
        lines.append("\t}")

    lines.append("}")
    return "\n".join(lines) + "\n"


def _serialize_gene_value(gene_value: ColorGeneValue | TokenPairGeneValue) -> str:
    if isinstance(gene_value, ColorGeneValue):
        a, b, c, d = gene_value.values
        return f"{{ {a} {b} {c} {d} }}"

    return (
        '{ '
        f'"{gene_value.first_token}" {gene_value.first_value} '
        f'"{gene_value.second_token}" {gene_value.second_value}'
        " }"
    )


def _serialize_raw_block(raw_block: str) -> list[str]:
    """Preserve nested block content verbatim to avoid accidental data loss."""
    if not raw_block:
        return []
    return raw_block.splitlines()

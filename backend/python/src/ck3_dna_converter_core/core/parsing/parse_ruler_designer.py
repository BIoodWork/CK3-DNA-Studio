"""Parser for CK3 ruler designer text DNA."""

from __future__ import annotations

import re

from ck3_dna_converter_core.core.domain.errors import RulerDesignerParseError
from ck3_dna_converter_core.core.domain.types import (
    ColorGeneValue,
    DnaMode,
    EntityTuple,
    GeneValue,
    RulerDesignerDocument,
    TokenPairGeneValue,
)


_ROOT_HEADER_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{", re.DOTALL)
_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_COLOR_GENE_RE = re.compile(r"^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$", re.DOTALL)
_TOKEN_PAIR_RE = re.compile(
    r'^\s*"([^"]*)"\s+(\d+)\s+"([^"]*)"\s+(\d+)\s*$',
    re.DOTALL,
)
_RULER_DESIGNER_ID_RE = re.compile(r"^ruler_designer_(\d+)$")


def parse_ruler_designer(
    text: str,
    mode: DnaMode = DnaMode.NONE,
) -> RulerDesignerDocument:
    """Parse ruler designer text DNA into a structured document."""
    _ = mode

    if not text.strip():
        raise RulerDesignerParseError("Input is empty.")

    header_match = _ROOT_HEADER_RE.match(text)
    if header_match is None:
        raise RulerDesignerParseError("Input must start with '<portrait_key>={'.")

    root_key = header_match.group(1)
    designer_id = _extract_designer_id(root_key)
    opening_brace_index = header_match.end() - 1
    closing_brace_index = _find_matching_brace(text, opening_brace_index)

    trailing = text[closing_brace_index + 1 :].strip()
    if trailing:
        raise RulerDesignerParseError(
            "Unexpected content found after the closing root brace."
        )

    body = text[opening_brace_index + 1 : closing_brace_index]
    top_level = _parse_top_level_assignments(body)

    required_fields = {"type", "id", "genes"}
    missing = required_fields - top_level.keys()
    if missing:
        missing_list = ", ".join(sorted(missing))
        raise RulerDesignerParseError(
            f"Missing required top-level field(s): {missing_list}."
        )

    character_type = _expect_scalar(top_level, "type")
    character_id = _parse_int(_expect_scalar(top_level, "id"), field_name="id")
    random_seed = (
        _parse_int(_expect_scalar(top_level, "random_seed"), field_name="random_seed")
        if "random_seed" in top_level
        else None
    )
    age = (
        _parse_float(_expect_scalar(top_level, "age"), field_name="age")
        if "age" in top_level
        else None
    )
    genes = _parse_genes_block(_expect_block(top_level, "genes"))
    override_raw = top_level["override"][1].strip() if "override" in top_level else None
    entity = (
        _parse_entity_block(_expect_block(top_level, "entity"))
        if "entity" in top_level
        else None
    )
    tags_raw = top_level["tags"][1].strip() if "tags" in top_level else None

    return RulerDesignerDocument(
        root_key=root_key,
        designer_id=designer_id,
        character_type=character_type,
        character_id=character_id,
        random_seed=random_seed,
        age=age,
        genes=genes,
        override_raw=override_raw,
        entity=entity,
        tags_raw=tags_raw,
    )


def _parse_top_level_assignments(body: str) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    position = 0

    while True:
        position = _skip_whitespace(body, position)
        if position >= len(body):
            break

        key, position = _consume_identifier(body, position)
        if key in result:
            raise RulerDesignerParseError(f"Duplicate top-level field '{key}'.")

        position = _skip_whitespace(body, position)
        if position >= len(body) or body[position] != "=":
            raise RulerDesignerParseError(
                f"Expected '=' after top-level field '{key}'."
            )

        position += 1
        position = _skip_whitespace(body, position)
        if position >= len(body):
            raise RulerDesignerParseError(
                f"Missing value for top-level field '{key}'."
            )

        if body[position] == "{":
            end = _find_matching_brace(body, position)
            value = body[position + 1 : end]
            result[key] = ("block", value)
            position = end + 1
        else:
            line_end = body.find("\n", position)
            if line_end == -1:
                line_end = len(body)
            value = body[position:line_end].strip()
            if not value:
                raise RulerDesignerParseError(
                    f"Missing scalar value for top-level field '{key}'."
                )
            result[key] = ("scalar", value)
            position = line_end + 1

    allowed = {"type", "id", "random_seed", "age", "genes", "override", "entity", "tags"}
    unknown = sorted(set(result) - allowed)
    if unknown:
        unknown_list = ", ".join(unknown)
        raise RulerDesignerParseError(
            f"Unknown top-level field(s): {unknown_list}."
        )

    return result


def _parse_genes_block(block_text: str) -> dict[str, GeneValue]:
    result: dict[str, GeneValue] = {}
    position = 0

    while True:
        position = _skip_whitespace(block_text, position)
        if position >= len(block_text):
            break

        gene_name, position = _consume_identifier(block_text, position)
        if gene_name in result:
            raise RulerDesignerParseError(f"Duplicate gene field '{gene_name}'.")

        position = _skip_whitespace(block_text, position)
        if position >= len(block_text) or block_text[position] != "=":
            raise RulerDesignerParseError(
                f"Expected '=' after gene field '{gene_name}'."
            )

        position += 1
        position = _skip_whitespace(block_text, position)
        if position >= len(block_text) or block_text[position] != "{":
            raise RulerDesignerParseError(
                f"Expected '{{' to start gene field '{gene_name}'."
            )

        end = _find_matching_brace(block_text, position)
        value_text = block_text[position + 1 : end]
        result[gene_name] = _parse_gene_value(gene_name, value_text)
        position = end + 1

    if not result:
        raise RulerDesignerParseError("The genes block is empty.")

    return result


def _parse_gene_value(gene_name: str, value_text: str) -> GeneValue:
    color_match = _COLOR_GENE_RE.match(value_text)
    if color_match is not None:
        groups = color_match.groups()
        values = (
            _coerce_byte(int(groups[0]), field_name=f"{gene_name}[0]"),
            _coerce_byte(int(groups[1]), field_name=f"{gene_name}[1]"),
            _coerce_byte(int(groups[2]), field_name=f"{gene_name}[2]"),
            _coerce_byte(int(groups[3]), field_name=f"{gene_name}[3]"),
        )
        return ColorGeneValue(values=values)

    token_pair_match = _TOKEN_PAIR_RE.match(value_text)
    if token_pair_match is not None:
        first_token, first_value, second_token, second_value = token_pair_match.groups()
        return TokenPairGeneValue(
            first_token=first_token,
            first_value=_coerce_byte(int(first_value), field_name=f"{gene_name}.first_value"),
            second_token=second_token,
            second_value=_coerce_byte(
                int(second_value),
                field_name=f"{gene_name}.second_value",
            ),
        )

    raise RulerDesignerParseError(
        f"Unsupported gene field format for '{gene_name}'."
    )


def _parse_entity_block(block_text: str) -> EntityTuple:
    parts = block_text.split()
    if len(parts) != 2:
        raise RulerDesignerParseError(
            "The entity block must contain exactly two integer values."
        )

    return (
        _parse_int(parts[0], field_name="entity[0]"),
        _parse_int(parts[1], field_name="entity[1]"),
    )


def _extract_designer_id(root_key: str) -> int | None:
    match = _RULER_DESIGNER_ID_RE.match(root_key)
    if match is None:
        return None
    return int(match.group(1))


def _expect_scalar(mapping: dict[str, tuple[str, str]], key: str) -> str:
    kind, value = mapping[key]
    if kind != "scalar":
        raise RulerDesignerParseError(f"Top-level field '{key}' must be a scalar value.")
    return value


def _expect_block(mapping: dict[str, tuple[str, str]], key: str) -> str:
    kind, value = mapping[key]
    if kind != "block":
        raise RulerDesignerParseError(f"Top-level field '{key}' must be a block value.")
    return value


def _consume_identifier(text: str, position: int) -> tuple[str, int]:
    match = _IDENTIFIER_RE.match(text, position)
    if match is None:
        snippet = text[position : position + 30].replace("\n", "\\n")
        raise RulerDesignerParseError(
            f"Expected an identifier near '{snippet}'."
        )
    return match.group(0), match.end()


def _skip_whitespace(text: str, position: int) -> int:
    while position < len(text) and text[position].isspace():
        position += 1
    return position


def _find_matching_brace(text: str, opening_brace_index: int) -> int:
    if text[opening_brace_index] != "{":
        raise ValueError("Opening brace index must point at '{'.")

    depth = 0
    in_string = False
    escaped = False

    for index in range(opening_brace_index, len(text)):
        char = text[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index

    raise RulerDesignerParseError("Unbalanced braces in ruler designer text.")


def _parse_int(value: str, *, field_name: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise RulerDesignerParseError(
            f"Field '{field_name}' must be an integer."
        ) from exc


def _parse_float(value: str, *, field_name: str) -> float:
    try:
        return float(value)
    except ValueError as exc:
        raise RulerDesignerParseError(
            f"Field '{field_name}' must be a float."
        ) from exc


def _coerce_byte(value: int, *, field_name: str) -> int:
    if not 0 <= value <= 255:
        raise RulerDesignerParseError(
            f"Field '{field_name}' must be between 0 and 255."
        )
    return value

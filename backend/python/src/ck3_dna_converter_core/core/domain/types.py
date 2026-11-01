"""Minimal domain types for the desktop converter core."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


AlleleTuple = tuple[int, int, int, int]
DnaData = dict[str, AlleleTuple]
EntityTuple = tuple[int, int]


class InputFormat(StrEnum):
    """Supported high-level input formats."""

    UNKNOWN = "unknown"
    RULER_DESIGNER = "ruler_designer"
    ENCODED = "encoded"


class DnaMode(StrEnum):
    """Known mode variants from the legacy converter analysis."""

    NONE = "none"
    EPE = "epe"
    AGOT = "agot"


@dataclass(frozen=True, slots=True)
class ColorGeneValue:
    """A gene block represented by four raw integer values."""

    values: AlleleTuple


@dataclass(frozen=True, slots=True)
class TokenPairGeneValue:
    """A gene block represented by two token-value pairs."""

    first_token: str
    first_value: int
    second_token: str
    second_value: int


GeneValue = ColorGeneValue | TokenPairGeneValue
CanonicalGeneMap = dict[str, GeneValue]


@dataclass(frozen=True, slots=True)
class RulerDesignerDocument:
    """Parsed ruler designer document."""

    root_key: str
    designer_id: int | None
    character_type: str
    character_id: int
    random_seed: int | None
    age: float | None
    genes: dict[str, GeneValue]
    override_raw: str | None
    entity: EntityTuple | None
    tags_raw: str | None

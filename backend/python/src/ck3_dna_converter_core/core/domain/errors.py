"""Domain and parser-facing exceptions."""

from __future__ import annotations


class RulerDesignerParseError(ValueError):
    """Raised when ruler designer text cannot be parsed safely."""


class EncodedDnaError(ValueError):
    """Raised when encoded DNA cannot be parsed or serialized safely."""

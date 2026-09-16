"""Per-upload column mapping: turns whatever columns a raw file has into
the schema tidycsv needs to clean it, resolved per (owner, header shape)
rather than fixed globally. tidycsv itself is never modified - see
docs/superpowers/specs/2026-09-16-dynamic-schema-mapping-design.md."""

from __future__ import annotations

import hashlib
import re

import pandas as pd
from tidycsv.schema import FieldSpec, FieldType, Schema

_FIELD_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,99}$")


def compute_fingerprint(raw_headers: list[str]) -> str:
    """Order- and case-insensitive: two uploads with the same columns in
    a different order, or a stray casing/whitespace difference, hash the
    same - only an actual change to the column set produces a new one."""
    normalized = sorted(h.strip().lower() for h in raw_headers)
    return hashlib.sha256("\x1f".join(normalized).encode("utf-8")).hexdigest()


def _normalize_field_name(header: str) -> str:
    """trim, lowercase, collapse runs of non-alphanumerics to a single
    underscore, strip leading/trailing underscores, then guarantee the
    ^[a-z][a-z0-9_]{0,99}$ shape validate_resolution enforces on save -
    a default resolution must never be rejected if saved unchanged."""
    normalized = re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")
    if not normalized:
        return "field"
    if normalized[0].isdigit():
        normalized = f"field_{normalized}"
    return normalized[:100]


def default_resolution(raw_headers: list[str], reference_schema: Schema) -> list[dict]:
    """One entry per raw column: target_field defaults to the header's
    own normalized name, type defaults to the alias-matched field's type
    if the header matches a known schema.yaml alias, else "string". Two
    headers that normalize to the same name get a numeric suffix on the
    second (and third, etc.) rather than silently colliding."""
    alias_lookup = reference_schema.alias_lookup()  # normalized alias -> canonical name
    type_by_name = {f.name: f.type for f in reference_schema.fields}

    seen: dict[str, int] = {}
    resolution: list[dict] = []
    for header in raw_headers:
        alias_key = header.strip().lower().replace("_", " ").replace("-", " ")
        canonical = alias_lookup.get(alias_key)
        target = canonical if canonical else _normalize_field_name(header)

        if target in seen:
            seen[target] += 1
            target = f"{target}_{seen[target]}"
        else:
            seen[target] = 1

        field_type = type_by_name.get(canonical, FieldType.STRING) if canonical else FieldType.STRING
        resolution.append(
            {"raw_column": header, "target_field": target, "type": field_type.value}
        )
    return resolution


def default_dedup_key_fields(resolution: list[dict]) -> list[str]:
    """The engineer's data already tells us the natural identity when a
    column alias-matched to email - default to that, the same identity
    tidybridge always assumed before dynamic mapping existed, so
    re-uploading an unchanged file stays a no-op with zero configuration.
    No default otherwise: nothing else is safe to assume as an identity
    key, and a wrong guess would silently under-insert real, distinct
    rows instead of just failing to dedup them."""
    for entry in resolution:
        if entry["target_field"] == "email" and entry["type"] == "email":
            return ["email"]
    return []


def build_schema(resolution: list[dict]) -> Schema:
    """One FieldSpec per distinct non-null target_field - entries sharing
    one collapse into a single field (see apply_mapping). required=False
    on every field: nothing is ever required at the tidycsv level."""
    seen_targets: dict[str, FieldType] = {}
    for entry in resolution:
        target = entry["target_field"]
        if target is None:
            continue
        seen_targets.setdefault(target, FieldType(entry["type"] or "string"))

    fields = [
        FieldSpec(name=name, type=field_type, required=False)
        for name, field_type in seen_targets.items()
    ]
    return Schema(fields=fields, key_columns=[])


def apply_mapping(raw: pd.DataFrame, resolution: list[dict]) -> pd.DataFrame:
    """Renames/combines/drops raw columns per the resolution so the
    result has exactly the synthetic schema's field names - tidycsv's
    map_columns()/coerce_and_validate() run on this output completely
    unchanged. Two raw columns sharing a target_field are joined with a
    single space, in the resolution's own (= the raw file's) order."""
    by_target: dict[str, list[str]] = {}
    for entry in resolution:
        target = entry["target_field"]
        if target is None:
            continue
        by_target.setdefault(target, []).append(entry["raw_column"])

    out = pd.DataFrame(index=raw.index)
    for target, raw_columns in by_target.items():
        if len(raw_columns) == 1:
            out[target] = raw[raw_columns[0]]
        else:
            out[target] = raw[raw_columns].apply(
                lambda row: " ".join(str(v) for v in row if str(v).strip()), axis=1
            )
    return out


def validate_resolution(resolution: list[dict], dedup_key_fields: list[str]) -> None:
    """Raises ValueError with a specific reason on the first violation
    found - called by PUT /column-mappings/{fingerprint} before anything
    is persisted."""
    target_fields = {entry["target_field"] for entry in resolution if entry["target_field"]}
    for target in target_fields:
        if not _FIELD_NAME_RE.match(target):
            raise ValueError(f"invalid target_field {target!r}: must match {_FIELD_NAME_RE.pattern}")
    for key in dedup_key_fields:
        if key not in target_fields:
            raise ValueError(f"dedup_key_fields entry {key!r} is not a target_field in this resolution")

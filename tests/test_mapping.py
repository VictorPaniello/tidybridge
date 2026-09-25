"""mapping.py: turns raw file headers into a per-upload Schema and
dataframe tidycsv already knows how to clean - see the design spec."""

from __future__ import annotations

import pandas as pd
import pytest
from tidycsv.schema import Schema

from tidybridge.mapping import (
    apply_mapping,
    build_schema,
    compute_fingerprint,
    default_dedup_key_fields,
    default_resolution,
    validate_resolution,
)

REFERENCE_SCHEMA = Schema.load("examples/schema.yaml")


def test_fingerprint_is_order_and_case_insensitive():
    a = compute_fingerprint(["Full Name", "Email"])
    b = compute_fingerprint(["email", " full name "])
    assert a == b


def test_fingerprint_differs_for_different_shapes():
    a = compute_fingerprint(["Full Name", "Email"])
    b = compute_fingerprint(["Full Name", "Email", "Age"])
    assert a != b


def test_default_resolution_uses_alias_matched_type():
    resolution = default_resolution(["Full Name", "E-mail", "Age"], REFERENCE_SCHEMA)
    by_raw = {r["raw_column"]: r for r in resolution}
    assert by_raw["Full Name"]["target_field"] == "full_name"
    assert by_raw["E-mail"]["target_field"] == "email"
    assert by_raw["E-mail"]["type"] == "email"
    assert by_raw["Age"]["target_field"] == "age"
    assert by_raw["Age"]["type"] == "string"


def test_default_resolution_dedupes_colliding_target_names():
    resolution = default_resolution(["Age", "age"], REFERENCE_SCHEMA)
    targets = [r["target_field"] for r in resolution]
    assert targets == ["age", "age_2"]


def test_default_resolution_names_never_start_with_a_digit():
    resolution = default_resolution(["2024 Region"], REFERENCE_SCHEMA)
    assert resolution[0]["target_field"] == "field_2024_region"


def test_apply_mapping_combines_columns_sharing_a_target_field():
    raw = pd.DataFrame({"First": ["Jane"], "Last": ["Doe"], "Other": ["x"]})
    resolution = [
        {"raw_column": "First", "target_field": "full_name", "type": "string"},
        {"raw_column": "Last", "target_field": "full_name", "type": "string"},
        {"raw_column": "Other", "target_field": None, "type": None},
    ]
    mapped = apply_mapping(raw, resolution)
    assert list(mapped.columns) == ["full_name"]
    assert mapped["full_name"].iloc[0] == "Jane Doe"


def test_default_resolution_inherits_required_from_alias_matched_field():
    # full_name/email are required=True in examples/schema.yaml - an
    # alias-matched column defaults to that, restoring the same
    # "blank name/email gets flagged" behavior that existed before
    # dynamic mapping made every field required=False unconditionally.
    resolution = default_resolution(["Full Name", "Email", "Age"], REFERENCE_SCHEMA)
    by_raw = {r["raw_column"]: r for r in resolution}
    assert by_raw["Full Name"]["required"] is True
    assert by_raw["Email"]["required"] is True
    assert by_raw["Age"]["required"] is False


def test_build_schema_honors_required_flag_from_resolution():
    resolution = default_resolution(["Full Name", "Email", "Age"], REFERENCE_SCHEMA)
    schema = build_schema(resolution)
    required_by_name = {f.name: f.required for f in schema.fields}
    assert required_by_name["full_name"] is True
    assert required_by_name["email"] is True
    assert required_by_name["age"] is False


def test_build_schema_defaults_required_false_when_missing_from_entry():
    # apply_mapping()/build_schema() also run on hand-written resolution
    # dicts (existing tests, and the "combine two raw columns" path) that
    # never set "required" at all - must not KeyError.
    resolution = [{"raw_column": "First", "target_field": "full_name", "type": "string"}]
    schema = build_schema(resolution)
    assert schema.fields[0].required is False


def test_validate_resolution_rejects_dedup_key_not_in_resolution():
    resolution = [{"raw_column": "Name", "target_field": "full_name", "type": "string"}]
    with pytest.raises(ValueError, match="dedup"):
        validate_resolution(resolution, dedup_key_fields=["email"])


def test_validate_resolution_rejects_bad_field_name():
    resolution = [{"raw_column": "Name", "target_field": "1bad name", "type": "string"}]
    with pytest.raises(ValueError, match="target_field"):
        validate_resolution(resolution, dedup_key_fields=[])


def test_default_dedup_key_fields_uses_alias_matched_email():
    resolution = default_resolution(["Full Name", "E-mail"], REFERENCE_SCHEMA)
    assert default_dedup_key_fields(resolution) == ["email"]


def test_default_dedup_key_fields_empty_when_no_email_present():
    resolution = default_resolution(["Full Name", "Age"], REFERENCE_SCHEMA)
    assert default_dedup_key_fields(resolution) == []

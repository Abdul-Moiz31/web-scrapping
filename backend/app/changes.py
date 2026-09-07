from app.sources.registry import Source, get_source


def has_changed(source_id: str, old_data: dict, new_data: dict) -> tuple[bool, dict]:
    """Compares a row's previous saved state to its just-saved state using
    that source's own detect_changes() (registered in registry.py, same as
    discover/extract). Returns (changed, changed_fields)."""
    source = get_source(source_id)
    changed_fields = source.detect_changes(old_data, new_data)
    return bool(changed_fields), changed_fields


def row_identifier(source: Source, row: dict) -> str:
    """A human-readable handle for the changes feed -- the row's own natural
    key(s), the same columns already used as the upsert's ON CONFLICT
    target, so no source-specific case is needed here."""
    return "/".join(str(row[column]) for column in source.conflict_columns)

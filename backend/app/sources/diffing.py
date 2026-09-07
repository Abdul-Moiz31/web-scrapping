from typing import Optional, Sequence

# Columns the save worker itself writes on every row (identity + bookkeeping
# timestamps) -- comparing these would flag every row as "changed" on every
# single save regardless of source, so they're never part of a diff.
BOOKKEEPING_COLUMNS = {"id", "updated_at", "fetched_at"}


def field_diff(old: dict, new: dict, fields: Optional[Sequence[str]] = None) -> dict:
    """Compares `fields` (or, when None, every key in `new` other than the
    bookkeeping columns above) between two saved rows and returns only what
    differs, as {field: {"old": ..., "new": ...}}. The one shared building
    block typed sources use to define their own detect_changes()."""
    keys = fields if fields is not None else [k for k in new if k not in BOOKKEEPING_COLUMNS]
    return {key: {"old": old.get(key), "new": new.get(key)} for key in keys if old.get(key) != new.get(key)}

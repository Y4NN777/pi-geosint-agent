# Storage Schema

## File Layout

Evidence files are bucketed by geohash (7 characters), date, and source:

```
evidence/
└── {geohash7}/
    └── {YYYY-MM-DD}/
        └── {source}/
            ├── {photoId}.{ext}
            └── {photoId}.sidecar.json
```

Where:
- `{geohash7}` — 7-character geohash of the capture coordinate (precision ~150m).
- `{YYYY-MM-DD}` — date of capture (from `capturedAt` in discovery metadata).
- `{source}` — source identifier, e.g. `kartaview`.
- `{photoId}` — the KartaView photo ID (or external sequence ID).
- `{ext}` — file extension (`.jpg` for direct download, `.png` for render capture).

## Sidecar JSON Shape

Every evidence file has a companion `.sidecar.json`:

```json
{
  "photoId": "string",
  "sequenceId": "number",
  "lat": "number",
  "lon": "number",
  "heading": "number",
  "capturedAt": "string (ISO 8601)",
  "fetchedAt": "string (ISO 8601)",
  "sha256": "string (hex)",
  "sourceUrl": "string",
  "captureMethod": "direct | render",
  "flagged": "boolean",
  "flagReason": "string | null",
  "sizeBytes": "number",
  "geohash7": "string"
}
```

## SQLite Schema — `index.sqlite`

```sql
CREATE TABLE evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    geohash7 TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'kartaview',
    photo_id TEXT NOT NULL,
    sequence_id INTEGER,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    heading REAL,
    sha256 TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    sidecar_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    capture_method TEXT NOT NULL DEFAULT 'direct',
    flagged INTEGER NOT NULL DEFAULT 0,
    flag_reason TEXT,
    fetched_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_evidence_geohash ON evidence(geohash7);
CREATE INDEX idx_evidence_captured_at ON evidence(captured_at);
CREATE INDEX idx_evidence_source ON evidence(source);
CREATE INDEX idx_evidence_sha256 ON evidence(sha256);
```

## SQLite Schema — `corrections.sqlite`

```sql
CREATE TABLE corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    original_flag INTEGER NOT NULL,
    original_flag_reason TEXT,
    human_decision TEXT NOT NULL,
    human_notes TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_corrections_stage ON corrections(stage);
CREATE INDEX idx_corrections_input_hash ON corrections(input_hash);
```

## Idempotency

Running `store-evidence` twice with the same SHA256 value:
- Must not duplicate the file (detect by SHA256 match).
- Must not duplicate the SQLite row (`sha256` is UNIQUE; upsert replaces metadata but does not create a new row).

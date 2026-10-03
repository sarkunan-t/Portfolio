"""Supabase (PostgREST) reads/writes with the service-role key. No SDK needed."""
from __future__ import annotations

import json
import math
import os

import requests


def _clean(v):
    """JSON-safe: NaN/inf -> None, recurse into containers."""
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    return v


class Store:
    def __init__(self, url=None, key=None):
        url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        self.base = url + "/rest/v1/"
        self.s = requests.Session()
        self.s.headers.update({"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})

    def select(self, table, params: dict | None = None, page=1000):
        out, off = [], 0
        while True:
            h = {"Range-Unit": "items", "Range": f"{off}-{off + page - 1}"}
            r = self.s.get(self.base + table, params=params or {}, headers=h, timeout=60)
            if r.status_code not in (200, 206):
                raise RuntimeError(f"select {table}: {r.status_code} {r.text[:300]}")
            rows = r.json()
            out += rows
            if len(rows) < page:
                return out
            off += page

    def upsert(self, table, rows: list[dict], on_conflict: str, batch=500):
        for i in range(0, len(rows), batch):
            chunk = _clean(rows[i:i + batch])
            r = self.s.post(self.base + table, params={"on_conflict": on_conflict},
                            data=json.dumps(chunk),
                            headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, timeout=120)
            if r.status_code not in (200, 201, 204):
                raise RuntimeError(f"upsert {table}: {r.status_code} {r.text[:300]}")

    def delete(self, table, params: dict):
        r = self.s.delete(self.base + table, params=params, headers={"Prefer": "return=minimal"}, timeout=120)
        if r.status_code not in (200, 204):
            raise RuntimeError(f"delete {table}: {r.status_code} {r.text[:300]}")


class DryStore:
    """--dry-run: read nothing, write JSON files to scanner/out/ instead of Supabase."""

    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self.tables: dict = {}

    def select(self, table, params=None, page=1000):
        return list(self.tables.get(table, []))

    def upsert(self, table, rows, on_conflict, batch=500):
        self.tables.setdefault(table, []).extend(_clean(rows))
        with open(os.path.join(self.folder, f"{table}.json"), "w") as f:
            json.dump(self.tables[table], f, indent=1, default=str)

    def delete(self, table, params):
        pass

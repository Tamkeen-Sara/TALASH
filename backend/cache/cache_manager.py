import sqlite3
import json
import hashlib
import time
from pathlib import Path
from backend.config import settings


class CacheManager:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or settings.db_path
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    ttl_days INTEGER NOT NULL
                )
            """)
            conn.commit()

    def _make_key(self, namespace: str, inputs: dict) -> str:
        payload = json.dumps(inputs, sort_keys=True)
        digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return f"{namespace}:{digest}"

    def get(self, namespace: str, inputs: dict) -> dict | None:
        key = self._make_key(namespace, inputs)
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT value, created_at, ttl_days FROM cache WHERE key = ?",
                (key,)
            ).fetchone()
        if row is None:
            return None
        value, created_at, ttl_days = row
        age_days = (time.time() - created_at) / 86400
        if age_days > ttl_days:
            self.delete(key)
            return None
        result = json.loads(value)
        result["_from_cache"] = True
        return result

    def set(self, namespace: str, inputs: dict, value: dict, ttl_days: int = 30):
        key = self._make_key(namespace, inputs)
        serialized = json.dumps(value)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cache (key, value, created_at, ttl_days) VALUES (?, ?, ?, ?)",
                (key, serialized, time.time(), ttl_days)
            )
            conn.commit()

    def delete(self, key: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM cache WHERE key = ?", (key,))
            conn.commit()

    def clear_expired(self):
        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "DELETE FROM cache WHERE (? - created_at) / 86400 > ttl_days",
                (now,)
            )
            conn.commit()


cache = CacheManager()

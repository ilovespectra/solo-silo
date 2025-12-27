import os
import sqlite3
import time
from contextlib import contextmanager
from typing import List, Tuple, Optional

import faiss
import numpy as np

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "localai_photos.db")
DB_PATH = os.path.abspath(DB_PATH)

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    hash TEXT,
    type TEXT,
    date_taken INTEGER,
    size INTEGER,
    width INTEGER,
    height INTEGER,
    camera TEXT,
    lens TEXT,
    clip_embedding BLOB,
    text_embedding BLOB,
    ocr_text TEXT,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS face_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    embedding BLOB NOT NULL,
    bbox TEXT,
    confidence REAL,
    person_label TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clip_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    vector BLOB NOT NULL,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS object_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    class_name TEXT,
    confidence REAL,
    bbox TEXT,
    class_id INTEGER,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
"""

INDEX_SCHEMA = """
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_clip_file ON clip_embeddings(file_id);
CREATE INDEX IF NOT EXISTS idx_face_file ON face_embeddings(file_id);
CREATE INDEX IF NOT EXISTS idx_object_file ON object_tags(file_id);
"""


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        conn.executescript(INDEX_SCHEMA)
        conn.commit()


def to_blob(vec):
    arr = np.asarray(vec, dtype="float32")
    return arr.tobytes()


class RealDatabase:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = os.path.abspath(db_path)
        ensure_db()

    @contextmanager
    def conn(self):
        con = sqlite3.connect(self.db_path)
        try:
            yield con
        finally:
            con.close()

    def upsert_file(self, record: dict) -> int:
        now = int(time.time())
        record.setdefault("created_at", now)
        record.setdefault("updated_at", now)
        with self.conn() as con:
            con.execute(
                """
                INSERT INTO files (path, hash, type, date_taken, size, width, height, camera, lens, clip_embedding, text_embedding, ocr_text, created_at, updated_at)
                VALUES (:path, :hash, :type, :date_taken, :size, :width, :height, :camera, :lens, :clip_embedding, :text_embedding, :ocr_text, :created_at, :updated_at)
                ON CONFLICT(path) DO UPDATE SET
                    hash=excluded.hash,
                    type=excluded.type,
                    date_taken=excluded.date_taken,
                    size=excluded.size,
                    width=excluded.width,
                    height=excluded.height,
                    camera=excluded.camera,
                    lens=excluded.lens,
                    clip_embedding=excluded.clip_embedding,
                    text_embedding=excluded.text_embedding,
                    ocr_text=excluded.ocr_text,
                    updated_at=excluded.updated_at
                ;
                """,
                record,
            )
            cur = con.execute("SELECT id FROM files WHERE path=?", (record["path"],))
            fid = cur.fetchone()[0]
            con.commit()
            return fid

    def store_clip_embedding(self, file_id: int, vec):
        now = int(time.time())
        with self.conn() as con:
            con.execute("DELETE FROM clip_embeddings WHERE file_id=?", (file_id,))
            con.execute(
                "INSERT INTO clip_embeddings (file_id, vector, created_at, updated_at) VALUES (?,?,?,?)",
                (file_id, to_blob(vec), now, now),
            )
            con.commit()

    def store_faces(self, file_id: int, faces: list):
        now = int(time.time())
        with self.conn() as con:
            con.execute("DELETE FROM face_embeddings WHERE file_id=?", (file_id,))
            for face in faces:
                con.execute(
                    "INSERT INTO face_embeddings (file_id, embedding, bbox, confidence, person_label, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (
                        file_id,
                        to_blob(face.get("embedding", [])),
                        face.get("bbox_json"),
                        face.get("confidence"),
                        face.get("label"),
                        now,
                        now,
                    ),
                )
            con.commit()

    def store_objects(self, file_id: int, objects: list):
        now = int(time.time())
        with self.conn() as con:
            con.execute("DELETE FROM object_tags WHERE file_id=?", (file_id,))
            for obj in objects:
                con.execute(
                    "INSERT INTO object_tags (file_id, class_name, confidence, bbox, class_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (
                        file_id,
                        obj.get("class_name"),
                        obj.get("confidence"),
                        obj.get("bbox_json"),
                        obj.get("class_id"),
                        now,
                        now,
                    ),
                )
            con.commit()

    def list_files(self, limit=100):
        with self.conn() as con:
            cur = con.execute(
                "SELECT id, path, type, date_taken, size, width, height, camera, lens FROM files ORDER BY date_taken DESC NULLS LAST LIMIT ?",
                (limit,),
            )
            return [
                {
                    "id": r[0],
                    "path": r[1],
                    "type": r[2],
                    "date_taken": r[3],
                    "size": r[4],
                    "width": r[5],
                    "height": r[6],
                    "camera": r[7],
                    "lens": r[8],
                }
                for r in cur.fetchall()
            ]

    def build_faiss(self) -> Tuple[Optional[faiss.IndexFlatIP], List[int]]:
        with self.conn() as con:
            cur = con.execute("SELECT file_id, vector FROM clip_embeddings")
            rows = cur.fetchall()
        if not rows:
            return None, []
        ids = []
        vecs = []
        for fid, blob in rows:
            vec = np.frombuffer(blob, dtype="float32")
            vecs.append(vec)
            ids.append(fid)
        dim = len(vecs[0])
        index = faiss.IndexFlatIP(dim)
        xb = np.asarray(vecs, dtype="float32")
        faiss.normalize_L2(xb)
        index.add(xb)
        return index, ids

    def search_clip(self, query_vec, top_k=20):
        index, ids = self.build_faiss()
        if index is None or index.ntotal == 0:
            return []
        if index.d != len(query_vec):
            return []
        q = np.asarray([query_vec], dtype="float32")
        faiss.normalize_L2(q)
        scores, idxs = index.search(q, top_k)
        results = []
        with self.conn() as con:
            for score, idx in zip(scores[0].tolist(), idxs[0].tolist()):
                if idx < 0 or idx >= len(ids):
                    continue
                fid = ids[idx]
                cur = con.execute("SELECT path FROM files WHERE id=?", (fid,))
                row = cur.fetchone()
                if row:
                    results.append({"file_id": fid, "file_path": row[0], "score": score})
        return results

    def face_embeddings(self):
        with self.conn() as con:
            cur = con.execute("SELECT id, file_id, embedding, bbox, confidence, person_label FROM face_embeddings")
            rows = cur.fetchall()
        out = []
        for face_id, fid, blob, bbox, conf, label in rows:
            emb = np.frombuffer(blob, dtype="float32").tolist()
            out.append({
                "face_id": face_id,
                "file_id": fid,
                "embedding": emb,
                "bbox": bbox,
                "confidence": conf,
                "label": label,
            })
        return out

    def update_face_labels(self, face_ids: List[int], name: str) -> int:
        if not face_ids:
            return 0
        now = int(time.time())
        with self.conn() as con:
            con.executemany(
                "UPDATE face_embeddings SET person_label=?, updated_at=? WHERE id=?",
                [(name, now, fid) for fid in face_ids],
            )
            con.commit()
            return con.total_changes

__all__ = ["RealDatabase", "ensure_db", "DB_PATH"]

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core import RealIndexer, RealDatabase, cluster_faces

router = APIRouter(prefix="/api")
DEFAULT_PHOTOS_PATH = os.environ.get("PAI_PHOTOS_PATH", str(Path("./media").absolute()))
_db = RealDatabase()


def _indexer():
    # RealIndexer caches heavy models in real_models via lru_cache, so constructing per request is lightweight.
    return RealIndexer(DEFAULT_PHOTOS_PATH)


class IndexRequest(BaseModel):
    path: str
    recursive: Optional[bool] = True


@router.post("/index")
def index_photos(req: IndexRequest):
    photos_path = Path(req.path).expanduser()
    if not photos_path.exists():
        raise HTTPException(status_code=400, detail="path does not exist")
    indexer = RealIndexer(str(photos_path))
    count = indexer.crawl_and_process()
    return {"indexed": count, "path": str(photos_path)}


@router.get("/search")
def search(q: str, limit: int = 20):
    idx = _indexer()
    results = idx.search(q, top_k=limit)
    return {"results": results}


@router.get("/files")
def list_files(limit: int = 100):
    return {"files": _db.list_files(limit)}


@router.get("/people")
def list_people(min_cluster_size: int = 2):
    faces = _db.face_embeddings()
    clusters = cluster_faces(faces, min_cluster_size=min_cluster_size)
    return {"people": clusters}


class NameRequest(BaseModel):
    name: str


@router.post("/people/{cluster_id}/name")
def name_person(cluster_id: str, payload: NameRequest):
    faces = _db.face_embeddings()
    clusters = cluster_faces(faces)
    target = next((c for c in clusters if c["cluster_id"] == cluster_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="cluster not found")
    updated = _db.update_face_labels(target.get("face_ids", []), payload.name)
    target["name"] = payload.name
    return {"updated": updated, "cluster": target}


@router.get("/status")
def status():
    with _db.conn() as con:
        files_count = con.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        face_count = con.execute("SELECT COUNT(*) FROM face_embeddings").fetchone()[0]
    return {
        "files_indexed": files_count,
        "faces_indexed": face_count,
        "photos_path": DEFAULT_PHOTOS_PATH,
    }


@router.get("/health")
def health():
    return {"ok": True}

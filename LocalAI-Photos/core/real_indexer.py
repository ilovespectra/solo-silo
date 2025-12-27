import os
import json
import hashlib
import time
from pathlib import Path
from typing import List, Dict, Any

import numpy as np
from PIL import Image, ExifTags
import torch

from .real_models import load_clip_model, load_face_model, load_yolo_model, load_ocr_reader
from .real_database import RealDatabase, to_blob

SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".heic"}


def md5sum(path: str, chunk_size: int = 1_048_576) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def extract_exif(path: str) -> dict:
    meta = {"date_taken": None, "camera": None, "lens": None, "width": None, "height": None}
    try:
        with Image.open(path) as img:
            meta["width"], meta["height"] = img.size
            info = img._getexif() or {}
            tag_map = {ExifTags.TAGS.get(k, k): v for k, v in info.items()}
            if "DateTimeOriginal" in tag_map:
                dt = tag_map["DateTimeOriginal"]
                meta["date_taken"] = int(time.mktime(time.strptime(dt, "%Y:%m:%d %H:%M:%S")))
            meta["camera"] = tag_map.get("Model")
            meta["lens"] = tag_map.get("LensModel")
    except Exception:
        pass
    return meta


class RealIndexer:
    def __init__(self, photos_path: str):
        self.photos_path = Path(photos_path).expanduser().absolute()
        self.db = RealDatabase()
        self.clip_model, self.clip_preprocess, self.clip_tokenizer = load_clip_model()
        self.face_model, self.face_detector_backend = load_face_model()
        self.yolo = load_yolo_model()
        self.ocr_reader = load_ocr_reader()

    def _clip_embed_image(self, path: str):
        img = Image.open(path).convert("RGB")
        with torch.no_grad():
            tensor = self.clip_preprocess(img).unsqueeze(0).to(self.clip_model.visual.conv1.weight.device)
            feats = self.clip_model.encode_image(tensor)
            feats = feats / (feats.norm(dim=-1, keepdim=True) + 1e-12)
        return feats[0].float().cpu().numpy().tolist()

    def _clip_embed_text(self, text: str):
        with torch.no_grad():
            tokens = self.clip_tokenizer([text])
            feats = self.clip_model.encode_text(tokens.to(self.clip_model.visual.conv1.weight.device))
            feats = feats / (feats.norm(dim=-1, keepdim=True) + 1e-12)
        return feats[0].float().cpu().numpy().tolist()

    def _faces(self, path: str):
        from deepface import DeepFace
        try:
            reps = DeepFace.represent(
                img_path=path,
                model=self.face_model,
                detector_backend=self.face_detector_backend,
                enforce_detection=False,
            )
        except Exception:
            return []
        faces = []
        for rep in reps:
            area = rep.get("facial_area", {})
            bbox = [float(area.get("x", 0)), float(area.get("y", 0)), float(area.get("x", 0) + area.get("w", 0)), float(area.get("y", 0) + area.get("h", 0))]
            faces.append({
                "embedding": [float(x) for x in rep.get("embedding", [])],
                "bbox_json": json.dumps(bbox),
                "confidence": float(rep.get("face_confidence") or rep.get("detector_score") or 0.0),
                "label": None,
            })
        return faces

    def _objects(self, path: str):
        dets = []
        try:
            results = self.yolo(path, verbose=False)
        except Exception:
            return dets
        if not results:
            return dets
        r = results[0]
        if not r or not r.boxes:
            return dets
        for box, conf, cid in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.conf.cpu().numpy(), r.boxes.cls.cpu().numpy()):
            dets.append({
                "class_name": r.names.get(int(cid), f"class_{int(cid)}"),
                "confidence": float(conf),
                "bbox_json": json.dumps([float(x) for x in box]),
                "class_id": int(cid),
            })
        return dets

    def _ocr(self, path: str):
        res = []
        try:
            detections = self.ocr_reader.readtext(path, detail=1, paragraph=False)
        except Exception:
            return res
        for det in detections:
            bbox, text, conf = det
            flat_bbox = [float(x) for point in bbox for x in point]
            res.append({"text": text, "confidence": float(conf), "bbox_json": json.dumps(flat_bbox)})
        return res

    def process_single_image(self, path: str) -> Dict[str, Any]:
        ext = os.path.splitext(path)[1].lower()
        if ext not in SUPPORTED_IMAGE_TYPES:
            raise ValueError("unsupported file type")
        meta = extract_exif(path)
        clip_vec = self._clip_embed_image(path)
        faces = self._faces(path)
        objects = self._objects(path)
        ocr = self._ocr(path)
        text_for_embed = " ".join([os.path.basename(path)] + [o.get("class_name", "") for o in objects] + [t.get("text", "") for t in ocr])
        text_vec = self._clip_embed_text(text_for_embed)

        record = {
            "path": os.path.abspath(path),
            "hash": md5sum(path),
            "type": ext,
            "date_taken": meta.get("date_taken"),
            "size": os.path.getsize(path),
            "width": meta.get("width"),
            "height": meta.get("height"),
            "camera": meta.get("camera"),
            "lens": meta.get("lens"),
            "clip_embedding": to_blob(clip_vec),
            "text_embedding": to_blob(text_vec),
            "ocr_text": " ".join(t.get("text", "") for t in ocr),
        }
        file_id = self.db.upsert_file(record)
        self.db.store_clip_embedding(file_id, clip_vec)
        self.db.store_faces(file_id, faces)
        self.db.store_objects(file_id, objects)

        return {"file_id": file_id, "clip_embedding": clip_vec, "faces": faces, "objects": objects}

    def crawl_and_process(self):
        total = 0
        for dirpath, _, filenames in os.walk(self.photos_path):
            for name in filenames:
                full = os.path.join(dirpath, name)
                ext = os.path.splitext(full)[1].lower()
                if ext not in SUPPORTED_IMAGE_TYPES:
                    continue
                try:
                    self.process_single_image(full)
                    total += 1
                except Exception:
                    continue
        return total

    def search(self, query_text: str, top_k: int = 20):
        qvec = self._clip_embed_text(query_text)
        return self.db.search_clip(qvec, top_k=top_k)


import json
import torch

from typing import List
import numpy as np
import hdbscan


def cluster_faces(instances: List[dict], min_cluster_size: int = 2):
    if not instances:
        return []
    embeddings = np.asarray([i["embedding"] for i in instances], dtype="float32")
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, metric="euclidean")
    labels = clusterer.fit_predict(embeddings)
    clusters = {}
    for lbl, inst in zip(labels, instances):
        if lbl == -1:
            continue
        clusters.setdefault(lbl, {"faces": [], "face_ids": []})
        clusters[lbl]["faces"].append(inst)
        clusters[lbl]["face_ids"].append(inst.get("face_id"))
    result = []
    for cid, payload in clusters.items():
        faces = payload["faces"]
        sample = faces[0]
        result.append({
            "cluster_id": f"person_{cid}",
            "face_count": len(faces),
            "face_ids": payload["face_ids"],
            "sample_file_id": sample["file_id"],
            "sample_bbox": sample["bbox"],
            "name": sample.get("label"),
        })
    return result


def assign_name(clusters: List[dict], cluster_id: str, name: str):
    for c in clusters:
        if c["cluster_id"] == cluster_id:
            c["name"] = name
    return clusters

__all__ = ["cluster_faces", "assign_name"]

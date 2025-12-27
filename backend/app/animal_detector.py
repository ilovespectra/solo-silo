"""Object + animal detection using YOLOv8 locally."""

import os
from dataclasses import dataclass
from typing import List

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


# COCO classes that are animals/living things (not people)
LIVING_THING_CLASSES = {
    16: "dog",
    17: "cat",
    18: "horse",
    19: "sheep",
    20: "cow",
    21: "elephant",
    22: "bear",
    23: "zebra",
    24: "giraffe",
    25: "monkey",
    26: "bird",
    27: "fish",
    28: "insect",
    29: "reptile",
}


@dataclass
class ObjectDetection:
    path: str
    class_name: str
    confidence: float
    bbox: List[float]
    class_id: int
    is_animal: bool


def get_yolo_model():
    if YOLO is None:
        raise RuntimeError("ultralytics not installed. Run: pip install ultralytics")
    model_path = os.environ.get("PAI_YOLO_MODEL", "yolov8n.pt")
    device = 0 if os.environ.get("PAI_USE_GPU", "1") == "1" else "cpu"
    return YOLO(model_path, task="detect", verbose=False).to(device)


def detect_objects(paths: List[str], confidence_threshold: float = 0.25) -> List[ObjectDetection]:
    detections: List[ObjectDetection] = []
    try:
        model = get_yolo_model()
    except Exception as e:
        print(f"Failed to load YOLO model: {e}")
        return detections

    for path in paths:
        if not os.path.exists(path):
            continue
        try:
            results = model(path, conf=confidence_threshold, verbose=False)
        except Exception as e:
            print(f"Error running YOLO on {path}: {e}")
            continue

        if not results:
            continue

        result = results[0]
        if not result or not result.boxes:
            continue

        for box, conf, class_id in zip(
            result.boxes.xyxy.cpu().numpy(),
            result.boxes.conf.cpu().numpy(),
            result.boxes.cls.cpu().numpy(),
        ):
            cid = int(class_id)
            class_name = result.names.get(cid, f"class_{cid}")
            is_animal = cid in LIVING_THING_CLASSES
            detections.append(
                ObjectDetection(
                    path=path,
                    class_name=class_name,
                    confidence=float(conf),
                    bbox=[float(x) for x in box],
                    class_id=cid,
                    is_animal=is_animal,
                )
            )
    return detections


def detect_animals(paths: List[str], confidence_threshold: float = 0.5) -> List[ObjectDetection]:
    return [d for d in detect_objects(paths, confidence_threshold) if d.is_animal]


def detect_animals_with_confidence(
    paths: List[str],
    high_confidence_threshold: float = 0.75,
    low_confidence_threshold: float = 0.5,
) -> tuple[List[ObjectDetection], List[ObjectDetection]]:
    detections = detect_animals(paths, confidence_threshold=low_confidence_threshold)
    high_conf = [d for d in detections if d.confidence >= high_confidence_threshold]
    uncertain = [d for d in detections if d.confidence < high_confidence_threshold]
    return high_conf, uncertain


__all__ = ["detect_objects", "detect_animals", "detect_animals_with_confidence", "ObjectDetection"]

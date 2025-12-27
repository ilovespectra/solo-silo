"""
Utilities for confidence-based filtering and duplicate detection in machine learning models.
"""

import json
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import numpy as np


@dataclass
class ConfidenceLevel:
    """Classification of detection confidence."""
    name: str
    min_confidence: float
    max_confidence: float
    requires_review: bool


CONFIDENCE_LEVELS = [
    ConfidenceLevel("high", 0.85, 1.0, False),
    ConfidenceLevel("medium", 0.65, 0.85, True),
    ConfidenceLevel("low", 0.3, 0.65, True),
    ConfidenceLevel("very_low", 0.0, 0.3, True),
]


def get_confidence_level(confidence: float) -> ConfidenceLevel:
    """Get the confidence level for a given score."""
    for level in CONFIDENCE_LEVELS:
        if level.min_confidence <= confidence < level.max_confidence:
            return level
    return CONFIDENCE_LEVELS[-1]


def filter_by_confidence(
    detections: List,
    min_confidence: float = 0.5,
) -> Tuple[List, List]:
    """
    Split detections by confidence threshold.
    
    Returns:
        (confident_detections, uncertain_detections)
    """
    confident = []
    uncertain = []
    
    for det in detections:
        confidence = det.confidence if hasattr(det, 'confidence') else det.get('confidence')
        if confidence >= min_confidence:
            confident.append(det)
        else:
            uncertain.append(det)
    
    return confident, uncertain


def detect_potential_duplicates(
    detections: List,
    class_name: str,
    iou_threshold: float = 0.5,
) -> List[List[int]]:
    """
    Detect potentially duplicate/similar detections (e.g., same animal detected twice).
    Returns groups of detection indices that likely represent the same object.
    """
    if not detections:
        return []
    
    # Filter to just this class
    class_dets = [
        (i, d) for i, d in enumerate(detections)
        if (d.class_name if hasattr(d, 'class_name') else d.get('class_name')) == class_name
    ]
    
    if len(class_dets) < 2:
        return [[i] for i, _ in class_dets]
    
    groups = []
    used = set()
    
    for idx1, (i, det1) in enumerate(class_dets):
        if i in used:
            continue
        
        group = [i]
        used.add(i)
        
        bbox1 = det1.bbox if hasattr(det1, 'bbox') else det1.get('bbox')
        
        for idx2, (j, det2) in enumerate(class_dets[idx1 + 1:], start=idx1 + 1):
            if j in used:
                continue
            
            bbox2 = det2.bbox if hasattr(det2, 'bbox') else det2.get('bbox')
            iou = calculate_iou(bbox1, bbox2)
            
            if iou > iou_threshold:
                group.append(j)
                used.add(j)
        
        groups.append(group)
    
    return groups


def calculate_iou(box1: List[float], box2: List[float]) -> float:
    """
    Calculate Intersection over Union (IoU) for two bounding boxes.
    Boxes format: [x1, y1, x2, y2]
    """
    x1_min, y1_min, x1_max, y1_max = box1
    x2_min, y2_min, x2_max, y2_max = box2
    
    # Calculate intersection
    inter_xmin = max(x1_min, x2_min)
    inter_ymin = max(y1_min, y2_min)
    inter_xmax = min(x1_max, x2_max)
    inter_ymax = min(y1_max, y2_max)
    
    if inter_xmax < inter_xmin or inter_ymax < inter_ymin:
        return 0.0
    
    inter_area = (inter_xmax - inter_xmin) * (inter_ymax - inter_ymin)
    
    # Calculate union
    box1_area = (x1_max - x1_min) * (y1_max - y1_min)
    box2_area = (x2_max - x2_min) * (y2_max - y2_min)
    union_area = box1_area + box2_area - inter_area
    
    if union_area == 0:
        return 0.0
    
    return inter_area / union_area


def group_uncertain_detections(
    detections: List,
    grouping_threshold: float = 0.6,
) -> Dict[str, List[int]]:
    """
    Group uncertain detections by class and spatial proximity.
    Useful for identifying repeating/duplicate detections.
    
    Returns:
        {class_name: [list of detection indices]}
    """
    groups = {}
    
    # Group by class name
    class_indices = {}
    for i, det in enumerate(detections):
        class_name = det.class_name if hasattr(det, 'class_name') else det.get('class_name')
        if class_name not in class_indices:
            class_indices[class_name] = []
        class_indices[class_name].append(i)
    
    return class_indices


def should_request_user_confirmation(detection, confidence_threshold: float = 0.7) -> bool:
    """
    Determine if a detection should be flagged for user confirmation.
    
    Returns True if:
    - Confidence is below threshold
    - Object appears to be a duplicate
    - Detection quality is uncertain
    """
    confidence = detection.confidence if hasattr(detection, 'confidence') else detection.get('confidence')
    
    if confidence < confidence_threshold:
        return True
    
    return False


def format_detection_for_user(detection) -> Dict:
    """Format detection data for user-friendly display."""
    class_name = detection.class_name if hasattr(detection, 'class_name') else detection.get('class_name')
    confidence = detection.confidence if hasattr(detection, 'confidence') else detection.get('confidence')
    
    return {
        "class_name": class_name,
        "confidence_percent": round(confidence * 100, 1),
        "confidence_level": get_confidence_level(confidence).name,
        "requires_review": should_request_user_confirmation(detection),
    }


__all__ = [
    "filter_by_confidence",
    "detect_potential_duplicates",
    "calculate_iou",
    "group_uncertain_detections",
    "should_request_user_confirmation",
    "format_detection_for_user",
    "get_confidence_level",
]

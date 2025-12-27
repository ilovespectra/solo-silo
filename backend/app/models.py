from dataclasses import dataclass
from typing import Optional


@dataclass
class MediaFile:
    path: str
    hash: Optional[str]
    type: str
    date_taken: Optional[int]
    location: Optional[str]
    size: Optional[int]
    width: Optional[int]
    height: Optional[int]
    camera: Optional[str]
    lens: Optional[str]


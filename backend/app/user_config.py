"""
User metadata and configuration management.
Persists user-defined labels, preferences, and metadata locally.
"""

import os
import json
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Optional, Any
from datetime import datetime


CONFIG_PATH = os.environ.get("PAI_CONFIG", "./cache/user_config.json")


@dataclass
class FaceLabel:
    """User-defined face/person label."""
    id: str
    name: str
    aliases: List[str] = field(default_factory=list)
    notes: Optional[str] = None
    color: Optional[str] = None
    created_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))
    updated_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))


@dataclass
class AnimalLabel:
    """User-defined animal label."""
    id: str
    species: str  # dog, cat, horse, etc.
    name: Optional[str] = None  # Individual animal name
    breed: Optional[str] = None
    notes: Optional[str] = None
    color: Optional[str] = None
    created_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))
    updated_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))


@dataclass
class SearchPreset:
    """Saved search configuration."""
    id: str
    name: str
    query: str
    filters: Dict[str, Any] = field(default_factory=dict)
    created_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))


@dataclass
class UserConfig:
    """Complete user configuration and metadata."""
    version: str = "1.0"
    
    # Labels and naming
    face_labels: Dict[str, FaceLabel] = field(default_factory=dict)
    animal_labels: Dict[str, AnimalLabel] = field(default_factory=dict)
    
    # Search and filtering preferences
    search_presets: Dict[str, SearchPreset] = field(default_factory=dict)
    recent_searches: List[str] = field(default_factory=list)
    
    # Display preferences
    thumbnail_size: int = 200
    items_per_page: int = 50
    sort_by: str = "date_taken"  # date_taken, size, name
    sort_order: str = "desc"  # asc, desc
    
    # Organization preferences
    use_folders: bool = False
    folder_structure: Optional[str] = None  # people, animals, dates, custom
    
    # Advanced options
    auto_tag_confidence: float = 0.75
    require_review_below: float = 0.65
    
    # Metadata
    created_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))
    updated_at: int = field(default_factory=lambda: int(datetime.now().timestamp()))
    last_indexed: Optional[int] = None


class ConfigManager:
    """Manage user configuration and metadata."""
    
    def __init__(self, config_path: str = CONFIG_PATH):
        self.config_path = config_path
        self.config = self._load_config()
    
    def _load_config(self) -> UserConfig:
        """Load config from disk or create new."""
        try:
            # Ensure cache directory exists
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return self._dict_to_config(data)
        except Exception as e:
            print(f"Error loading config: {e}, using defaults")
        
        return UserConfig()
    
    def save(self) -> None:
        """Save config to disk."""
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        self.config.updated_at = int(datetime.now().timestamp())
        
        data = self._config_to_dict(self.config)
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    
    def _config_to_dict(self, config: UserConfig) -> Dict:
        """Convert config to JSON-serializable dict."""
        return {
            "version": config.version,
            "face_labels": {
                k: asdict(v) for k, v in config.face_labels.items()
            },
            "animal_labels": {
                k: asdict(v) for k, v in config.animal_labels.items()
            },
            "search_presets": {
                k: asdict(v) for k, v in config.search_presets.items()
            },
            "recent_searches": config.recent_searches,
            "thumbnail_size": config.thumbnail_size,
            "items_per_page": config.items_per_page,
            "sort_by": config.sort_by,
            "sort_order": config.sort_order,
            "use_folders": config.use_folders,
            "folder_structure": config.folder_structure,
            "auto_tag_confidence": config.auto_tag_confidence,
            "require_review_below": config.require_review_below,
            "created_at": config.created_at,
            "updated_at": config.updated_at,
            "last_indexed": config.last_indexed,
        }
    
    def _dict_to_config(self, data: Dict) -> UserConfig:
        """Convert dict from JSON to config."""
        config = UserConfig(
            version=data.get("version", "1.0"),
            thumbnail_size=data.get("thumbnail_size", 200),
            items_per_page=data.get("items_per_page", 50),
            sort_by=data.get("sort_by", "date_taken"),
            sort_order=data.get("sort_order", "desc"),
            use_folders=data.get("use_folders", False),
            folder_structure=data.get("folder_structure"),
            auto_tag_confidence=data.get("auto_tag_confidence", 0.75),
            require_review_below=data.get("require_review_below", 0.65),
            created_at=data.get("created_at", int(datetime.now().timestamp())),
            updated_at=data.get("updated_at", int(datetime.now().timestamp())),
            last_indexed=data.get("last_indexed"),
        )
        
        # Load face labels
        for face_id, face_data in data.get("face_labels", {}).items():
            config.face_labels[face_id] = FaceLabel(**face_data)
        
        # Load animal labels
        for animal_id, animal_data in data.get("animal_labels", {}).items():
            config.animal_labels[animal_id] = AnimalLabel(**animal_data)
        
        # Load search presets
        for preset_id, preset_data in data.get("search_presets", {}).items():
            config.search_presets[preset_id] = SearchPreset(**preset_data)
        
        config.recent_searches = data.get("recent_searches", [])
        
        return config
    
    # Face label operations
    def add_face_label(self, person_id: str, name: str, aliases: List[str] = None) -> FaceLabel:
        """Add or update a face label."""
        label = FaceLabel(
            id=person_id,
            name=name,
            aliases=aliases or [],
        )
        self.config.face_labels[person_id] = label
        self.save()
        return label
    
    def get_face_label(self, person_id: str) -> Optional[FaceLabel]:
        """Get face label by ID."""
        return self.config.face_labels.get(person_id)
    
    def search_face_label(self, query: str) -> List[FaceLabel]:
        """Search face labels by name or alias."""
        query_lower = query.lower()
        results = []
        for label in self.config.face_labels.values():
            if query_lower in label.name.lower():
                results.append(label)
            elif any(query_lower in alias.lower() for alias in label.aliases):
                results.append(label)
        return results
    
    # Animal label operations
    def add_animal_label(
        self,
        animal_id: str,
        species: str,
        name: Optional[str] = None,
        breed: Optional[str] = None,
    ) -> AnimalLabel:
        """Add or update an animal label."""
        label = AnimalLabel(
            id=animal_id,
            species=species,
            name=name,
            breed=breed,
        )
        self.config.animal_labels[animal_id] = label
        self.save()
        return label
    
    def get_animal_label(self, animal_id: str) -> Optional[AnimalLabel]:
        """Get animal label by ID."""
        return self.config.animal_labels.get(animal_id)
    
    def search_animal_label(self, query: str) -> List[AnimalLabel]:
        """Search animal labels by name or species."""
        query_lower = query.lower()
        results = []
        for label in self.config.animal_labels.values():
            if query_lower in label.species.lower():
                results.append(label)
            elif label.name and query_lower in label.name.lower():
                results.append(label)
            elif label.breed and query_lower in label.breed.lower():
                results.append(label)
        return results
    
    # Search preset operations
    def save_search_preset(
        self,
        preset_id: str,
        name: str,
        query: str,
        filters: Dict[str, Any] = None,
    ) -> SearchPreset:
        """Save a search preset."""
        preset = SearchPreset(
            id=preset_id,
            name=name,
            query=query,
            filters=filters or {},
        )
        self.config.search_presets[preset_id] = preset
        self.save()
        return preset
    
    def get_search_preset(self, preset_id: str) -> Optional[SearchPreset]:
        """Get saved search preset."""
        return self.config.search_presets.get(preset_id)
    
    def list_search_presets(self) -> List[SearchPreset]:
        """List all search presets."""
        return list(self.config.search_presets.values())
    
    # Recent searches
    def add_recent_search(self, query: str) -> None:
        """Add to recent searches (max 20)."""
        if query in self.config.recent_searches:
            self.config.recent_searches.remove(query)
        self.config.recent_searches.insert(0, query)
        self.config.recent_searches = self.config.recent_searches[:20]
        self.save()
    
    def get_recent_searches(self, limit: int = 10) -> List[str]:
        """Get recent searches."""
        return self.config.recent_searches[:limit]


# Global instance
_config_manager: Optional[ConfigManager] = None


def get_config_manager() -> ConfigManager:
    """Get or create global config manager."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


__all__ = [
    "ConfigManager",
    "UserConfig",
    "FaceLabel",
    "AnimalLabel",
    "SearchPreset",
    "get_config_manager",
]

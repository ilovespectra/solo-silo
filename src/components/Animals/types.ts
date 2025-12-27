/**
 * Animals Component Types
 */

export type SpeciesType = 'dog' | 'cat' | 'bird' | 'horse' | 'rabbit' | 'other';
export type AnimalCategory = 'pet' | 'wild' | 'farm' | 'unknown';

export interface AnimalCluster {
  id: string;
  name: string | null;
  species: SpeciesType | null;
  category: AnimalCategory;
  primary_thumbnail: string;
  photo_count: number;
  detection_confidence: number;
  is_hidden: boolean;
  last_detected: string;
  breed_suggestion?: string;
  is_selected?: boolean;
}

export interface AnimalPhoto {
  id: string;
  image_path: string;
  thumbnail: string;
  date_taken: string;
  detection_score: number;
  face_count: number;
  is_confirmed: boolean;
  bounding_box?: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpeciesOption {
  value: SpeciesType;
  label: string;
  emoji: string;
  subTypes?: string[];
}

export interface AnimalUpdate {
  name?: string;
  species?: SpeciesType | null;
  category?: AnimalCategory;
  is_hidden?: boolean;
}

export interface AnimalSuggestion {
  clusterId: string;
  suggestedName?: string;
  suggestedSpecies?: SpeciesType;
  confidence: number;
  relatedAnimals: string[];
}

export interface AnimalsFilter {
  species: SpeciesType | 'all';
  category: AnimalCategory | 'all';
  hideUnconfirmed: boolean;
  minConfidence: number;
}

export interface AnimalsSort {
  by: 'photoCount' | 'recentlyAdded' | 'alphabetical';
  order: 'asc' | 'desc';
}

export interface AnimalPhotoUpdate {
  clusterId: string;
  photoId: string;
  action: 'remove' | 'assign';
  targetClusterId?: string;
}

export interface SpeciesDetectionResult {
  species: SpeciesType;
  confidence: number;
  breed?: string;
}

/**
 * Species and Animal Detection Utilities
 */

import type { SpeciesOption, SpeciesType } from '../types';

export const SPECIES_OPTIONS: SpeciesOption[] = [
  {
    value: 'dog',
    label: 'Dog',
    emoji: '🐕',
    subTypes: [
      'Labrador Retriever',
      'Golden Retriever',
      'German Shepherd',
      'Bulldog',
      'Poodle',
      'Beagle',
      'Mixed',
    ],
  },
  {
    value: 'cat',
    label: 'Cat',
    emoji: '🐈',
    subTypes: [
      'Domestic Shorthair',
      'Tabby',
      'Siamese',
      'Persian',
      'Bengal',
      'Mixed',
    ],
  },
  {
    value: 'bird',
    label: 'Bird',
    emoji: '🦜',
    subTypes: ['Parrot', 'Dove', 'Sparrow', 'Pigeon', 'Other'],
  },
  {
    value: 'horse',
    label: 'Horse',
    emoji: '🐎',
    subTypes: ['Thoroughbred', 'Quarter Horse', 'Mustang', 'Other'],
  },
  {
    value: 'rabbit',
    label: 'Rabbit',
    emoji: '🐇',
    subTypes: ['Domestic', 'Cottontail', 'Other'],
  },
  {
    value: 'other',
    label: 'Other',
    emoji: '🐾',
    subTypes: ['Unknown'],
  },
];

export const CATEGORY_OPTIONS = [
  { value: 'pet', label: 'Pet', emoji: '🏠' },
  { value: 'wild', label: 'Wild', emoji: '🌿' },
  { value: 'farm', label: 'Farm', emoji: '🚜' },
  { value: 'unknown', label: 'Unknown', emoji: '❓' },
];

export const getSpeciesEmoji = (species: SpeciesType | null): string => {
  if (!species) return '🐾';
  const option = SPECIES_OPTIONS.find((s) => s.value === species);
  return option?.emoji ?? '🐾';
};

export const getSpeciesLabel = (species: SpeciesType | null): string => {
  if (!species) return 'Unknown';
  const option = SPECIES_OPTIONS.find((s) => s.value === species);
  return option?.label ?? 'Unknown';
};

export const getCategoryEmoji = (category: string): string => {
  const option = CATEGORY_OPTIONS.find((c) => c.value === category);
  return option?.emoji ?? '❓';
};

export const getCategoryLabel = (category: string): string => {
  const option = CATEGORY_OPTIONS.find((c) => c.value === category);
  return option?.label ?? 'Unknown';
};

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.85) return 'border-green-500 bg-green-50';
  if (confidence >= 0.7) return 'border-yellow-500 bg-yellow-50';
  return 'border-red-500 bg-red-50';
};

export const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 0.85) return 'High';
  if (confidence >= 0.7) return 'Medium';
  return 'Low';
};

export const getConfidencePercentage = (confidence: number): string => {
  return `${Math.round(confidence * 100)}%`;
};

// Sort functions
export const sortAnimalsByPhotoCount = (
  a: { photo_count: number },
  b: { photo_count: number },
  order: 'asc' | 'desc' = 'desc'
): number => {
  return order === 'desc'
    ? b.photo_count - a.photo_count
    : a.photo_count - b.photo_count;
};

export const sortAnimalsByName = (
  a: { name: string | null },
  b: { name: string | null },
  order: 'asc' | 'desc' = 'asc'
): number => {
  const aName = a.name || 'Unknown';
  const bName = b.name || 'Unknown';
  const comparison = aName.localeCompare(bName);
  return order === 'asc' ? comparison : -comparison;
};

export const sortAnimalsByDate = (
  a: { last_detected: string },
  b: { last_detected: string },
  order: 'asc' | 'desc' = 'desc'
): number => {
  const aDate = new Date(a.last_detected).getTime();
  const bDate = new Date(b.last_detected).getTime();
  return order === 'desc' ? bDate - aDate : aDate - bDate;
};

// Filter functions
export const filterBySpecies = (
  species: SpeciesType | 'all',
  animalSpecies: SpeciesType | null
): boolean => {
  if (species === 'all') return true;
  return animalSpecies === species;
};

export const filterByCategory = (
  category: string | 'all',
  animalCategory: string
): boolean => {
  if (category === 'all') return true;
  return animalCategory === category;
};

export const filterByConfidence = (
  confidence: number,
  minConfidence: number
): boolean => {
  return confidence >= minConfidence;
};

export const filterHidden = (
  isHidden: boolean,
  includeHidden: boolean = false
): boolean => {
  if (includeHidden) return true;
  return !isHidden;
};

/**
 * SpeciesSelector Component - Species and category selection
 */

import React from 'react';
import type { SpeciesType, AnimalCategory } from '@/components/Animals/types';
import { SPECIES_OPTIONS, CATEGORY_OPTIONS } from '@/components/Animals/utils/species';

interface SpeciesOption {
  value: SpeciesType;
  label: string;
  emoji: string;
}

interface CategoryOption {
  value: AnimalCategory;
  label: string;
  emoji: string;
}

interface SpeciesSelectorProps {
  species: SpeciesType | null;
  category: AnimalCategory;
  onSpeciesChange: (species: SpeciesType | null) => void;
  onCategoryChange: (category: AnimalCategory) => void;
  showLabel?: boolean;
}

export const SpeciesSelector: React.FC<SpeciesSelectorProps> = ({
  species,
  category,
  onSpeciesChange,
  onCategoryChange,
  showLabel = true,
}) => {

  return (
    <div className="space-y-4">
      {/* Species Selector */}
      <div>
        {showLabel && <label className="block text-sm font-semibold text-gray-700 mb-2">Species</label>}
        <div className="grid grid-cols-2 gap-2">
          {SPECIES_OPTIONS.map((option: SpeciesOption) => (
            <button
              key={option.value}
              onClick={() => onSpeciesChange(option.value)}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                species === option.value
                  ? 'bg-orange-500 text-white border-2 border-orange-600'
                  : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <span className="text-lg">{option.emoji}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        {/* Clear species button */}
        {species && (
          <button
            onClick={() => onSpeciesChange(null)}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear species
          </button>
        )}
      </div>

      {/* Category Selector */}
      <div>
        {showLabel && <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>}
        <div className="grid grid-cols-2 gap-2">
          {(CATEGORY_OPTIONS as CategoryOption[]).map((option) => (
            <button
              key={option.value}
              onClick={() => onCategoryChange(option.value as AnimalCategory)}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                category === option.value
                  ? 'bg-green-500 text-white border-2 border-green-600'
                  : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <span className="text-lg">{option.emoji}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSilos } from '@/hooks/useSilos';
import { advancedSearch, getFilterOptions, getMediaStats } from '@/lib/backend';

interface FilterOptions {
  file_types: string[];
  date_range: { min: number; max: number } | null;
  size_range: { min: number; max: number } | null;
  people: Array<{ id: string; name: string }>;
  animals: Array<{ id: string; species: string; name?: string }>;
}

interface SearchResult {
  id: number;
  path: string;
  type: string;
  date_taken?: number;
  size?: number;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
}

interface SearchFilters {
  query: string;
  file_type?: string;
  min_size?: number;
  max_size?: number;
  date_from?: number;
  date_to?: number;
  contains_person?: string;
  contains_animal?: string;
  sort_by: string;
  sort_order: string;
  limit: number;
  offset: number;
}

const API_BASE = '';

export default function AdvancedSearch() {
  const { activeSilo } = useSilos();
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    sort_by: 'date_taken',
    sort_order: 'desc',
    limit: 50,
    offset: 0,
  });

  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [optionsData, statsData] = await Promise.all([
          getFilterOptions(activeSilo?.name),
          getMediaStats(activeSilo?.name),
        ]);
        setFilterOptions(optionsData);
        setStats(statsData);
      } catch (e) {
        console.error('Failed to load filter options', e);
      }
    };
    loadOptions();
  }, [activeSilo?.name]);

  const handleSearch = async (newOffset: number = 0) => {
    setLoading(true);
    setError(null);
    try {
      const filterObj: Record<string, unknown> = {
        q: filters.query,
      };
      if (filters.file_type) filterObj.file_type = filters.file_type;
      if (filters.min_size) filterObj.min_size = filters.min_size;
      if (filters.max_size) filterObj.max_size = filters.max_size;
      if (filters.date_from) filterObj.date_from = filters.date_from;
      if (filters.date_to) filterObj.date_to = filters.date_to;
      if (filters.contains_person) filterObj.contains_person = filters.contains_person;
      if (filters.contains_animal) filterObj.contains_animal = filters.contains_animal;
      filterObj.sort_by = filters.sort_by;
      filterObj.sort_order = filters.sort_order;
      filterObj.limit = filters.limit;
      filterObj.offset = newOffset;

      const data = await advancedSearch(filterObj, activeSilo?.name);
      setResults(data);
      setFilters(prev => ({ ...prev, offset: newOffset }));
    } catch (e: Error | unknown) {
      setError((e instanceof Error ? e.message : 'Search failed') || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof SearchFilters, value: string | number | boolean | undefined) => {
    setFilters(prev => ({ ...prev, [key]: value, offset: 0 }));
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="p-4 overflow-auto w-full h-full flex flex-col">
      {/* Header & Quick Search */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Search & Browse</h2>
        
        {/* Quick stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{stats.total_files as number}</div>
              <div className="text-sm text-gray-600">Total Files</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.with_people as number}</div>
              <div className="text-sm text-gray-600">With People</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats.with_animals as number}</div>
              <div className="text-sm text-gray-600">With Animals</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-lg font-bold text-orange-600">{formatSize(stats.total_size_bytes as number)}</div>
              <div className="text-sm text-gray-600">Total Size</div>
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search by filename, content, people, animals..."
            value={filters.query}
            onChange={(e) => handleFilterChange('query', e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleSearch(0);
            }}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <button
            onClick={() => handleSearch(0)}
            disabled={loading}
            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'searching...' : 'search'}
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              showAdvanced
                ? 'bg-purple-600 text-white'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
            }`}
          >
            ⚙️ filters
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvanced && filterOptions && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* File type */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  file type
                </label>
                <select
                  value={filters.file_type || ''}
                  onChange={(e) => handleFilterChange('file_type', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">All Types</option>
                  {filterOptions.file_types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Size range */}
              {filterOptions.size_range && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    size range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min (bytes)"
                      value={filters.min_size || ''}
                      onChange={(e) =>
                        handleFilterChange('min_size', e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      className="flex-1 px-2 py-2 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Max (bytes)"
                      value={filters.max_size || ''}
                      onChange={(e) =>
                        handleFilterChange('max_size', e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      className="flex-1 px-2 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Date range */}
              {filterOptions.date_range && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    date range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={
                        filters.date_from
                          ? new Date(filters.date_from * 1000).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        handleFilterChange(
                          'date_from',
                          e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : undefined
                        )
                      }
                      className="flex-1 px-2 py-2 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="date"
                      value={
                        filters.date_to
                          ? new Date(filters.date_to * 1000).toISOString().split('T')[0]
                          : ''
                      }
                      onChange={(e) =>
                        handleFilterChange(
                          'date_to',
                          e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : undefined
                        )
                      }
                      className="flex-1 px-2 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Person filter */}
              {filterOptions.people.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    people
                  </label>
                  <select
                    value={filters.contains_person || ''}
                    onChange={(e) =>
                      handleFilterChange('contains_person', e.target.value || undefined)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">all people</option>
                    {filterOptions.people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Animal filter */}
              {filterOptions.animals.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    animals
                  </label>
                  <select
                    value={filters.contains_animal || ''}
                    onChange={(e) =>
                      handleFilterChange('contains_animal', e.target.value || undefined)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">All Animals</option>
                    {filterOptions.animals.map((animal) => (
                      <option key={animal.id} value={animal.species}>
                        {animal.name || animal.species}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Sort options */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-300">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  sort By
                </label>
                <select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="date_taken">date taken</option>
                  <option value="size">size</option>
                  <option value="path">filename</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  order 
                </label>
                <select
                  value={filters.sort_order}
                  onChange={(e) => handleFilterChange('sort_order', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="desc">desc</option>
                  <option value="asc">asc</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      </div>

      {/* View mode toggle */}
      {results.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-4 py-2 rounded font-medium ${
              viewMode === 'grid'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-200 text-gray-900'
            }`}
          >
            🔲 grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded font-medium ${
              viewMode === 'list'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-200 text-gray-900'
            }`}
          >
            ☰ list
          </button>
          <div className="ml-auto text-sm text-gray-600">
            showing {results.length} results
          </div>
        </div>
      )}

      {/* Results */}
      {loading && <p className="text-gray-600">searching...</p>}

      {!loading && results.length === 0 && filters.query && (
        <p className="text-gray-600">no results found</p>
      )}

      {!loading && results.length > 0 && (
        <div className="flex-1 overflow-auto">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="border border-gray-300 rounded-lg overflow-hidden hover:shadow-lg transition"
                >
                  {result.type && result.type.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/i) && (
                    <div className="w-full h-40 bg-gray-100 overflow-hidden relative">
                      <Image
                        src={result.path}
                        alt={result.path}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="p-2 text-xs">
                    <p className="font-semibold text-gray-900 truncate">
                      {result.path.split('/').pop()}
                    </p>
                    <p className="text-gray-600 truncate">{result.type}</p>
                    {result.size && <p className="text-gray-600">{formatSize(result.size)}</p>}
                    {result.date_taken && (
                      <p className="text-gray-600">{formatDate(result.date_taken)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">filename</th>
                  <th className="px-4 py-2 text-left">type</th>
                  <th className="px-4 py-2 text-right">size</th>
                  <th className="px-4 py-2 text-left">date</th>
                  <th className="px-4 py-2 text-left">dimensions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2 truncate">{result.path.split('/').pop()}</td>
                    <td className="px-4 py-2">{result.type}</td>
                    <td className="px-4 py-2 text-right">
                      {result.size ? formatSize(result.size) : '-'}
                    </td>
                    <td className="px-4 py-2">{formatDate(result.date_taken)}</td>
                    <td className="px-4 py-2">
                      {result.width && result.height
                        ? `${result.width}×${result.height}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {results.length > 0 && (
        <div className="mt-4 flex gap-2 justify-center">
          <button
            onClick={() => handleSearch(Math.max(0, filters.offset - filters.limit))}
            disabled={filters.offset === 0 || loading}
            className="px-4 py-2 bg-gray-300 text-gray-900 rounded disabled:opacity-50"
          >
            ← prev
          </button>
          <span className="px-4 py-2 text-gray-600">
            page {Math.floor(filters.offset / filters.limit) + 1}
          </span>
          <button
            onClick={() => handleSearch(filters.offset + filters.limit)}
            disabled={results.length < filters.limit || loading}
            className="px-4 py-2 bg-gray-300 text-gray-900 rounded disabled:opacity-50"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}

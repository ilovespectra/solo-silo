'use client';

import React, { useState, useMemo } from 'react';

interface PaginatedGridProps {
  items: any[];
  renderItem: (item: any, index: number) => React.ReactNode;
  itemsPerPage?: number;
  columns?: number;
  gap?: string;
  className?: string;
  onPageChange?: (page: number) => void;
}

/**
 * PaginatedGrid Component
 * 
 * Breaks a large list into pages to reduce DOM nodes and improve initial load time.
 * Includes pagination controls at the bottom.
 * 
 * Props:
 * - items: Array of items to display
 * - renderItem: Function to render each item
 * - itemsPerPage: Items per page (default: 100)
 * - columns: Number of grid columns
 * - gap: Gap between items (CSS value)
 * - className: Additional CSS classes
 * - onPageChange: Callback when page changes
 */
export const PaginatedGrid: React.FC<PaginatedGridProps> = ({
  items,
  renderItem,
  itemsPerPage = 100,
  columns = 5,
  gap = '0.75rem',
  className = '',
  onPageChange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  const paginatedItems = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    return items.slice(startIdx, endIdx);
  }, [items, currentPage, itemsPerPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    onPageChange?.(newPage);
    // Scroll to top of grid
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: gap,
        }}
      >
        {paginatedItems.map((item, index) => (
          <div key={`${currentPage}-${index}`}>
            {renderItem(item, (currentPage - 1) * itemsPerPage + index)}
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8 mb-4">
          {/* Previous button */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            ← Previous
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              // Show first, last, current, and ±1 around current
              const show =
                page === 1 ||
                page === totalPages ||
                page === currentPage ||
                page === currentPage - 1 ||
                page === currentPage + 1;

              if (!show) {
                if (page === 2) return <span key="dot-start">...</span>;
                if (page === totalPages - 1) return <span key="dot-end">...</span>;
                return null;
              }

              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-2 rounded border transition ${
                    page === currentPage
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}
          </div>

          {/* Next button */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            Next →
          </button>

          {/* Page info */}
          <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage} of {totalPages} ({items.length} total)
          </div>
        </div>
      )}
    </div>
  );
};

export default PaginatedGrid;

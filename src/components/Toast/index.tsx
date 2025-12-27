'use client';

import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose?: () => void;
}

export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  }[type];

  const icon = {
    success: '✓',
    error: '✕',
    info: 'ⓘ',
  }[type];

  return (
    <div className={`fixed bottom-6 right-6 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-[9999] animate-fade-in`}>
      <span className="text-lg font-semibold">{icon}</span>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

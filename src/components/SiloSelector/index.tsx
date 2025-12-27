import React, { useState } from 'react';
import { useSilos } from '@/hooks/useSilos';

interface SiloSelectorProps {
  onSiloSwitch?: () => void;
  onShowManager?: () => void;
}

export function SiloSelector({ onSiloSwitch, onShowManager }: SiloSelectorProps) {
  const { silos, activeSilo, loading, switchSilo, error } = useSilos();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedSiloName, setSelectedSiloName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSwitchSilo = async (siloName: string) => {
    const silo = silos.find(s => s.name === siloName);

    if (silo?.has_password) {
      setSelectedSiloName(siloName);
      setShowPasswordDialog(true);
      setPassword('');
    } else {
      await performSwitch(siloName, undefined);
    }
  };

  const performSwitch = async (siloName: string, pwd?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      await switchSilo(siloName, pwd);
      setIsDropdownOpen(false);
      setShowPasswordDialog(false);
      onSiloSwitch?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to switch silo';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPassword = async () => {
    if (!password && silos.find(s => s.name === selectedSiloName)?.has_password) {
      setErrorMsg('password required');
      return;
    }
    await performSwitch(selectedSiloName, password);
  };

  if (loading || !activeSilo) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-gray-100 dark:bg-gray-800">
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">loading silos...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Silo Selector Button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title={activeSilo.name}
      >
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {activeSilo.name}
        </span>
        {activeSilo.has_password && (
          <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        )}
        <svg className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg z-50 border border-gray-200 dark:border-gray-700">
          {silos.length > 0 ? (
            <div className="py-2 max-h-60 overflow-y-auto">
              {silos.map(silo => (
                <button
                  key={silo.name}
                  onClick={() => handleSwitchSilo(silo.name)}
                  disabled={isLoading || silo.is_active}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${
                    silo.is_active
                      ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-medium'
                      : 'text-gray-700 dark:text-gray-300'
                  } ${isLoading || silo.is_active ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <span className="flex items-center gap-2">
                    {silo.name}
                    {silo.has_password && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  {silo.is_active && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">no silos available</div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 py-2">
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                onShowManager?.();
              }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.72-2.7.72-1.955 2.06.343.563.38 1.278.04 1.914-.327.635-.702 1.11-1.703 1.11-.957 0-1.646.737-1.646 1.646 0 .908.689 1.646 1.646 1.646.798 0 1.045.487 1.372 1.265.28.763.455 1.48.04 1.914-.747 1.34.583 2.78 1.955 2.06.675-.36 1.592.008 2.286.948.38 1.56 2.6 1.56 2.98 0 .695-1.149 1.779-1.355 2.286-.948 1.372.72 2.7-.72 1.955-2.06-.343-.563-.38-1.278-.04-1.914.327-.635.702-1.11 1.703-1.11.957 0 1.646-.737 1.646-1.646 0-.908-.689-1.646-1.646-1.646-.798 0-1.045-.487-1.372-1.265-.28-.763-.455-1.48-.04-1.914.747-1.34-.583-2.78-1.955-2.06-.675.36-1.592-.008-2.286-.948z" />
              </svg>
              manage silos
            </button>
          </div>
        </div>
      )}

      {/* Password Dialog */}
      {showPasswordDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              enter password for &quot;{selectedSiloName}&quot;
            </h3>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-sm">
                {errorMsg}
              </div>
            )}

            <div className="relative mb-4">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmPassword()}
                placeholder="Enter silo password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                autoFocus
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowPasswordDialog(false);
                  setPassword('');
                  setErrorMsg('');
                  setShowPassword(false);
                }}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
              >
                cancel
              </button>
              <button
                onClick={handleConfirmPassword}
                disabled={isLoading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {isLoading ? 'switching...' : 'switch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded">
          {error}
        </div>
      )}
    </div>
  );
}

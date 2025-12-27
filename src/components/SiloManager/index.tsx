import React, { useState } from 'react';
import { useSilos } from '@/hooks/useSilos';
import { Toast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';

interface SiloManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'save' | 'create' | 'manage';

export function SiloManager({ isOpen, onClose }: SiloManagerProps) {
  const { activeSilo, silos, saveSilo, createSilo, deleteSilo, renameSilo, updatePassword, loading, error } = useSilos();
  const [activeTab, setActiveTab] = useState<Tab>('save');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [saveName, setSaveName] = useState(activeSilo?.name || '');
  const [savePassword, setSavePassword] = useState('');
  const [savePasswordMode, setSavePasswordMode] = useState<'instantly' | 'first_access'>('first_access');
  const [usePassword, setUsePassword] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [createPasswordMode, setCreatePasswordMode] = useState<'instantly' | 'first_access'>('first_access');
  const [useCreatePassword, setUseCreatePassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const [editingSilo, setEditingSilo] = useState<string | null>(null);
  const [editNewName, setEditNewName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editNewPasswordConfirm, setEditNewPasswordConfirm] = useState('');
  const [editPasswordMode, setEditPasswordMode] = useState<'instantly' | 'first_access'>('first_access');
  const [changeMode, setChangeMode] = useState<'rename' | 'password'>('rename');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);

  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const handleSaveSilo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) {
      setFormError('Silo name required');
      return;
    }

    try {
      setFormError('');
      setFormLoading(true);
      await saveSilo(
        saveName,
        usePassword ? savePassword : undefined,
        savePasswordMode
      );
      setSaveName(activeSilo?.name || '');
      setSavePassword('');
      setUsePassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save silo';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleCreateSilo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      setFormError('Silo name required');
      return;
    }

    if (useCreatePassword) {
      if (!createPassword.trim()) {
        setFormError('Password required');
        return;
      }
      if (createPassword !== createPasswordConfirm) {
        setFormError('Passwords do not match');
        return;
      }
    }

    try {
      setFormError('');
      setFormLoading(true);
      const siloNameCreated = createName;
      
      await createSilo(
        createName,
        useCreatePassword ? createPassword : undefined,
        createPasswordMode
      );
      
      const appStore = useAppStore.getState();
      appStore.setActiveSiloName(siloNameCreated);
      
      setCreateName('');
      setCreatePassword('');
      setCreatePasswordConfirm('');
      setUseCreatePassword(false);
      setShowCreatePassword(false);
      setToast({ message: `Silo "${siloNameCreated}" created successfully`, type: 'success' });
      console.log(`✓ Silo "${siloNameCreated}" created successfully with fresh config`);
      setTimeout(() => onClose(), 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to create silo';
      setFormError(message);
      setToast({ message, type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteSilo = async (siloName: string) => {
    if (deleteConfirmName !== siloName) {
      setFormError('type silo name to confirm deletion');
      return;
    }

    try {
      setFormError('');
      setFormLoading(true);
      await deleteSilo(siloName);
      setDeleteConfirmName('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to delete silo';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleRenameSilo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNewName.trim()) {
      setFormError('new name required');
      return;
    }

    try {
      setFormError('');
      setFormLoading(true);
      await renameSilo(editingSilo!, editNewName, editPassword || undefined);
      setEditingSilo(null);
      setEditNewName('');
      setEditPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to rename silo';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNewPassword.trim()) {
      setFormError('new password required');
      return;
    }
    if (editNewPassword !== editNewPasswordConfirm) {
      setFormError('passwords do not match');
      return;
    }

    try {
      setFormError('');
      setFormLoading(true);
      await updatePassword(
        editingSilo!,
        editPassword || undefined,
        editNewPassword,
        editPasswordMode
      );
      setEditingSilo(null);
      setEditPassword('');
      setEditNewPassword('');
      setEditNewPasswordConfirm('');
      setShowEditPassword(false);
      setShowEditNewPassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to update password';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4 lowercase">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Silos</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 lowercase">
          <button
            onClick={() => setActiveTab('save')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'save'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Save Current Silo
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Create New Silo
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'manage'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Manage Silos
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 lowercase">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {formError && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {formError}
            </div>
          )}

          {/* Save Current Silo Tab */}
          {activeTab === 'save' && (
            <form onSubmit={handleSaveSilo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  silo name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g., Family Photos"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={formLoading}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={e => setUsePassword(e.target.checked)}
                    className="rounded"
                    disabled={formLoading}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">protect with password</span>
                </label>

                {usePassword && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        password
                      </label>
                      <input
                        type="password"
                        value={savePassword}
                        onChange={e => setSavePassword(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        disabled={formLoading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        password mode
                      </label>
                      <select
                        value={savePasswordMode}
                        onChange={e => setSavePasswordMode(e.target.value as 'instantly' | 'first_access')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        disabled={formLoading}
                      >
                        <option value="first_access">require password on first access</option>
                        <option value="instantly">require password instantly</option>
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {savePasswordMode === 'instantly'
                          ? 'Password required every time you switch to this silo'
                          : 'Password required only on first access per session'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={formLoading || loading}
                className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Saving...' : 'Save Silo'}
              </button>
            </form>
          )}

          {/* Create New Silo Tab */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSilo} className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  creating a new silo will give you a completely empty library. you&apos;ll need to import sources, index files, and re-scan faces.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  silo name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="e.g., Work Photos"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  disabled={formLoading}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCreatePassword}
                    onChange={e => setUseCreatePassword(e.target.checked)}
                    className="rounded"
                    disabled={formLoading}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">protect with password</span>
                </label>

                {useCreatePassword && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        password
                      </label>
                      <div className="relative">
                        <input
                          type={showCreatePassword ? 'text' : 'password'}
                          value={createPassword}
                          onChange={e => setCreatePassword(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={formLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword(!showCreatePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                          {showCreatePassword ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        confirm password
                      </label>
                      <div className="relative">
                        <input
                          type={showCreatePassword ? 'text' : 'password'}
                          value={createPasswordConfirm}
                          onChange={e => setCreatePasswordConfirm(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={formLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCreatePassword(!showCreatePassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                          {showCreatePassword ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        password mode
                      </label>
                      <select
                        value={createPasswordMode}
                        onChange={e => setCreatePasswordMode(e.target.value as 'instantly' | 'first_access')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        disabled={formLoading}
                      >
                        <option value="first_access">require password on first access</option>
                        <option value="instantly">require password instantly</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={formLoading || loading}
                className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors disabled:opacity-50"
              >
                {formLoading ? 'Creating...' : 'Create Silo'}
              </button>
            </form>
          )}

          {/* Manage Silos Tab */}
          {activeTab === 'manage' && (
            <>
              {editingSilo === null ? (
                <div className="space-y-3">
                  {loading ? (
                    <div className="text-center py-8 text-gray-500">loading silos...</div>
                  ) : silos.length > 0 ? (
                    silos.map(silo => (
                      <div
                        key={silo.name}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900 dark:text-white">{silo.name}</h4>
                              {silo.is_active && (
                                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs rounded font-medium">
                                  active
                                </span>
                              )}
                              {silo.has_password && (
                                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              created {new Date(silo.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingSilo(silo.name);
                                setEditNewName(silo.name);
                                setEditPassword('');
                                setEditNewPassword('');
                                setChangeMode('rename');
                                setFormError('');
                              }}
                              disabled={formLoading}
                              className="px-3 py-1 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded text-sm transition-colors disabled:opacity-50"
                            >
                              edit
                            </button>
                            {!silo.is_active && (
                              <button
                                onClick={() => {
                                  setDeleteConfirmName('');
                                  if (window.confirm(`Delete silo "${silo.name}"? This cannot be undone.`)) {
                                    const confirmName = prompt(`Type "${silo.name}" to confirm deletion:`);
                                    if (confirmName === silo.name) {
                                      handleDeleteSilo(silo.name);
                                    }
                                  }
                                }}
                                disabled={formLoading}
                                className="px-3 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-sm transition-colors disabled:opacity-50"
                              >
                                delete
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">no silos found</div>
                  )}
                </div>
              ) : (
                /* Edit Modal */
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      setEditingSilo(null);
                      setFormError('');
                    }}
                    className="text-orange-600 dark:text-orange-400 hover:underline text-sm mb-4"
                  >
                    ← back to silos
                  </button>

                  <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setChangeMode('rename');
                          setFormError('');
                        }}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          changeMode === 'rename'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        rename
                      </button>
                      <button
                        onClick={() => {
                          setChangeMode('password');
                          setFormError('');
                        }}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          changeMode === 'password'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        password
                      </button>
                    </div>
                  </div>

                  {changeMode === 'rename' && (
                    <form onSubmit={handleRenameSilo} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          current name
                        </label>
                        <input
                          type="text"
                          disabled
                          value={editingSilo}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          new name
                        </label>
                        <input
                          type="text"
                          value={editNewName}
                          onChange={e => setEditNewName(e.target.value)}
                          placeholder="Enter new name"
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </div>

                      {silos.find(s => s.name === editingSilo)?.has_password && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            password
                          </label>
                          <input
                            type="password"
                            value={editPassword}
                            onChange={e => setEditPassword(e.target.value)}
                            placeholder="Enter silo password to confirm"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                        </div>
                      )}

                      {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

                      <button
                        type="submit"
                        disabled={formLoading}
                        className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                      >
                        {formLoading ? 'Renaming...' : 'Rename Silo'}
                      </button>
                    </form>
                  )}

                  {changeMode === 'password' && (
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          silo
                        </label>
                        <input
                          type="text"
                          disabled
                          value={editingSilo}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        />
                      </div>

                      {silos.find(s => s.name === editingSilo)?.has_password && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            current password
                          </label>
                          <div className="relative">
                            <input
                              type={showEditPassword ? 'text' : 'password'}
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                              placeholder="Enter current password"
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword(!showEditPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                              {showEditPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          new password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditNewPassword ? 'text' : 'password'}
                            value={editNewPassword}
                            onChange={e => setEditNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditNewPassword(!showEditNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                          >
                            {showEditNewPassword ? '👁️' : '👁️‍🗨️'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          confirm new password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditNewPassword ? 'text' : 'password'}
                            value={editNewPasswordConfirm}
                            onChange={e => setEditNewPasswordConfirm(e.target.value)}
                            placeholder="Re-enter new password"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditNewPassword(!showEditNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                          >
                            {showEditNewPassword ? '👁️' : '👁️‍🗨️'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          password mode
                        </label>
                        <select
                          value={editPasswordMode}
                          onChange={e => setEditPasswordMode(e.target.value as 'instantly' | 'first_access')}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          <option value="instantly">require on every switch</option>
                          <option value="first_access">require only on first access</option>
                        </select>
                      </div>

                      {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

                      <button
                        type="submit"
                        disabled={formLoading}
                        className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
                      >
                        {formLoading ? 'updating...' : 'update password'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

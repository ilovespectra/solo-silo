'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSilos } from '@/hooks/useSilos';
import { ChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { fetchSearch, approveSearchResult, rejectSearchResult, retrainEmbeddings } from '@/lib/backend';

type ResultStatus = 'pending' | 'approved' | 'rejected';

interface SearchResult {
  id: number;
  stableKey: string;
  path: string;
  name: string;
  type: string;
  date_taken?: number;
  size?: number;
  width?: number;
  height?: number;
  camera?: string;
  lens?: string;
  score: number;
  status: ResultStatus;
  userVerified?: boolean;
  approvedAt?: number;
}

export default function SearchChat() {
  const {
    config,
    chatHistory,
    addChatMessage,
    searchResults,
    setSearchResults,
  } = useAppStore();

  const { activeSilo } = useSilos();

  const [inputValue, setInputValue] = useState('');
  const [quickQuery, setQuickQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'results'>('chat');
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [currentQuery, setCurrentQuery] = useState('');
  
  const { searchPreferences, setSearchPreferences } = useAppStore();
  const confidenceThreshold = searchPreferences.confidenceThreshold;
  const displayCount = searchPreferences.displayCount;
  
  const setConfidenceThreshold = (value: number) => {
    setSearchPreferences({ confidenceThreshold: value });
  };
  
  const setDisplayCount = (value: number) => {
    setSearchPreferences({ displayCount: value });
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      return;
    }

    setLoading(true);
    setCurrentQuery(query);
    setDisplayCount(20);

    try {
      const data = await fetchSearch(query, 20, activeSilo?.name);
      console.log('[DEBUG] Raw fetchSearch data:', data);
      const newResults = (data || []).map((item: Record<string, unknown>, idx: number): SearchResult => ({
        id: item.id as number,
        stableKey: `result-${uuidv4()}-${idx}`,
        path: item.path as string,
        name: ((item.path as string) || '').split('/').pop() || 'file',
        type: item.type as string,
        date_taken: item.date_taken as number | undefined,
        size: item.size as number | undefined,
        width: item.width as number | undefined,
        height: item.height as number | undefined,
        camera: item.camera as string | undefined,
        lens: item.lens as string | undefined,
        score: (item.score as number) || 0,
        status: 'pending',
      }));
      
      const idCounts = new Map<number, number>();
      newResults.forEach((r: SearchResult) => idCounts.set(r.id, (idCounts.get(r.id) || 0) + 1));
      const duplicateIds = Array.from(idCounts.entries()).filter(([, count]) => count > 1);
      if (duplicateIds.length > 0) {
        console.warn('WARNING: Duplicate file IDs in search results:', duplicateIds);
      }
      console.log('Created', newResults.length, 'search results:', newResults.map((r: SearchResult) => ({ id: r.id, stableKey: r.stableKey })));
      
      setAllResults(newResults);
      setSearchResults(newResults);
      setActiveTab('results');

      const resultSummary =
        newResults.length > 0
          ? `Found ${newResults.length} relevant files`
          : 'No results found';

      addChatMessage({
        id: uuidv4(),
        role: 'assistant',
        content: resultSummary,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Search failed';
      addChatMessage({
        id: uuidv4(),
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    addChatMessage({
      id: uuidv4(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    });

    const query = inputValue;
    setInputValue('');

    await performSearch(query);
  };

  const handleApproveResult = async (stableKey: string, fileId: number) => {
    const resultMap = new Map(allResults.map(r => [r.stableKey, r]));
    const result = resultMap.get(stableKey);
    
    if (!result) return;
    
    resultMap.set(stableKey, { ...result, status: 'approved' as const });
    const updated = Array.from(resultMap.values());
    setAllResults(updated);

    try {
      await approveSearchResult(currentQuery, fileId, activeSilo?.name);
      console.log(`Approved search result: ${fileId}`);
      
      const refreshedResults = await fetchSearch(currentQuery, 20, activeSilo?.name);
      const newResults = (refreshedResults || []).map((item: Record<string, unknown>, idx: number): SearchResult => ({
        id: item.id as number,
        stableKey: `result-${uuidv4()}-${idx}`,
        path: item.path as string,
        name: ((item.path as string) || '').split('/').pop() || 'file',
        type: item.type as string,
        date_taken: item.date_taken as number | undefined,
        size: item.size as number | undefined,
        width: item.width as number | undefined,
        height: item.height as number | undefined,
        camera: item.camera as string | undefined,
        lens: item.lens as string | undefined,
        score: (item.score as number) || 0,
        status: 'pending',
      }));
      setAllResults(newResults);
      
      retrainEmbeddings(activeSilo?.name).catch(err => console.error('Failed to retrain embeddings:', err));
    } catch (err) {
      console.error('Failed to record approval:', err);
    }
  };

  const handleRejectResult = async (stableKey: string, fileId: number) => {
    const resultMap = new Map(allResults.map(r => [r.stableKey, r]));
    resultMap.delete(stableKey);
    const updated = Array.from(resultMap.values());
    setAllResults(updated);

    try {
      await rejectSearchResult(currentQuery, fileId);
      console.log(`Rejected search result: ${fileId}`);
      
      const refreshedResults = await fetchSearch(currentQuery, 20, activeSilo?.name);
      const newResults = (refreshedResults || []).map((item: Record<string, unknown>, idx: number): SearchResult => ({
        id: item.id as number,
        stableKey: `result-${uuidv4()}-${idx}`,
        path: item.path as string,
        name: ((item.path as string) || '').split('/').pop() || 'file',
        type: item.type as string,
        date_taken: item.date_taken as number | undefined,
        size: item.size as number | undefined,
        width: item.width as number | undefined,
        height: item.height as number | undefined,
        camera: item.camera as string | undefined,
        lens: item.lens as string | undefined,
        score: (item.score as number) || 0,
        status: 'pending',
      }));
      setAllResults(newResults);
    } catch (err) {
      console.error('Failed to record rejection:', err);
    }
  };

  if (!config.permissions.searchText) {
    return (
      <div className="p-8 text-center">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-yellow-900 font-semibold mb-2">Permission Required</h3>
          <p className="text-yellow-700">
            Grant search permission in the setup wizard to use semantic search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Quick Search Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = quickQuery.trim();
          if (!q) return;
          addChatMessage({ id: uuidv4(), role: 'user', content: q, timestamp: Date.now() });
          setActiveTab('results');
          performSearch(q);
        }}
        className="border-b border-gray-300 p-4 flex items-center gap-3 bg-gray-100"
      >
        <input
          type="text"
          placeholder="Type to search your files..."
          value={quickQuery}
          onChange={(e) => setQuickQuery(e.target.value)}
          className="flex-1 px-4 py-3 text-base border-2 border-gray-400 rounded-lg focus:outline-none focus:border-orange-600 bg-white"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !quickQuery.trim()}
          className="px-6 py-3 text-base font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition shadow-sm"
        >
          Search
        </button>
      </form>
      {/* Tabs */}
      <div className="border-b border-gray-200 flex">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'chat'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'results'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Results ({searchResults.length})
        </button>
      </div>

      {/* Chat View */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">🔍 Start by asking about your files</p>
                <p className="text-sm mt-2">
                  Try: &quot;Find photos of my daughter&quot;, &quot;Show me GitHub repos&quot;
                </p>
              </div>
            )}

            {chatHistory.map((message: ChatMessage) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your files..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 transition"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Results View */}
      {activeTab === 'results' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Results Count, Pagination, and Confidence Threshold */}
          {allResults.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-200 space-y-3 bg-gray-50">
              {/* Pagination Row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Showing {Math.min(displayCount, allResults.filter(r => (r.score || 0) >= confidenceThreshold / 100).length)} of {allResults.filter(r => (r.score || 0) >= confidenceThreshold / 100).length} results
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Show:</label>
                  <select
                    value={displayCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value, 10);
                      setDisplayCount(count);
                    }}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="20">20</option>
                    <option value="40">40</option>
                    <option value="80">80</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                    <option value="1000">1k</option>
                    <option value="2500">2.5k</option>
                  </select>
                </div>
              </div>
              
              {/* Confidence Threshold Slider */}
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  Confidence:
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                  title={`Show only results with ${confidenceThreshold.toFixed(0)}% confidence or higher. Lower scores = less certain matches.`}
                />
                <span className="text-sm font-semibold text-orange-600 w-12 text-right">
                  {confidenceThreshold.toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {/* Results List */}
          <div className="flex-1 overflow-y-auto p-4">
            {allResults.filter(r => (r.score || 0) >= confidenceThreshold / 100).length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>{allResults.length === 0 ? 'No search results yet' : `No results match confidence threshold of ${confidenceThreshold.toFixed(0)}%`}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allResults
                  .filter(r => (r.score || 0) >= confidenceThreshold / 100)
                  .slice(0, displayCount)
                  .map((file) => {
                  if (!file.stableKey) {
                    console.error(`ERROR: Result has no stableKey!`, file);
                    return null;
                  }
                  console.log(`Rendering result:`, { id: file.id, stableKey: file.stableKey });
                  return (
                    <div
                      key={file.stableKey}
                      className={`p-4 border-2 rounded-lg transition ${
                        file.status === 'approved'
                          ? 'border-green-400 bg-green-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{file.name}</p>
                          <p className="text-xs text-gray-600 truncate">{file.path}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-xs font-semibold text-orange-600">
                            {Math.round((file.score || 0) * 100)}%
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('Approve clicked for file:', file.id, 'key:', file.stableKey);
                                handleApproveResult(file.stableKey, file.id);
                              }}
                              className={`px-2 py-1 text-xs rounded transition ${
                                file.status === 'approved'
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-green-500 text-white hover:bg-green-600'
                              }`}
                              title="Mark as official result for this query"
                              disabled={file.status === 'approved'}
                            >
                              ✓
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('Reject clicked for file:', file.id, 'key:', file.stableKey);
                                handleRejectResult(file.stableKey, file.id);
                              }}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition"
                              title="Remove and improve indexing"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

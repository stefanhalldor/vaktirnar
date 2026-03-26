// app/s/[sessionId]/page.tsx

'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Users, Share2, Activity, BarChart3, Clock, Monitor, Flame, CircleDot,
  Plus, X, Pencil, Trash2, PlayCircle, CheckCircle, Eye, Info
} from 'lucide-react';
import { SessionData, Kid, LogEntry, ActivityCategory } from '@/lib/types';
import { generateSessionName, formatTime, calculateElapsedMinutes, formatElapsedTime } from '@/lib/utils';

const CATEGORY_CONFIG = {
  screen: { label: 'Screen time', icon: Monitor, color: 'red', bgClass: 'bg-red-600', textClass: 'text-red-700', lightBgClass: 'bg-red-100', borderClass: 'border-red-300' },
  physical: { label: 'Physical play', icon: Flame, color: 'green', bgClass: 'bg-green-600', textClass: 'text-green-700', lightBgClass: 'bg-green-100', borderClass: 'border-green-300' },
  other: { label: 'Other', icon: CircleDot, color: 'gray', bgClass: 'bg-gray-600', textClass: 'text-gray-700', lightBgClass: 'bg-gray-100', borderClass: 'border-gray-300' },
};

const KID_COLOR_CLASSES = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
];

export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const searchParams = useSearchParams();
  const key = searchParams.get('key');
  const router = useRouter();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKidName, setNewKidName] = useState('');
  const [selectedKids, setSelectedKids] = useState<Set<string>>(new Set());
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
  const [activityMode, setActivityMode] = useState<'completed' | 'start'>('completed');
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('');
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 5000);
    return () => clearInterval(interval);
  }, [sessionId, key]);

  useEffect(() => {
    if (sessionData) {
      setSelectedKids(new Set(sessionData.kids.map(k => k.id)));
    }
  }, [sessionData?.kids.length]);

  const fetchSession = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}?key=${key || ''}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      const data = await response.json();
      setSessionData(data);
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKid = async () => {
    if (!newKidName.trim() || !sessionData?.hasEditAccess) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/kids?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKidName.trim() }),
      });

      if (response.ok) {
        setNewKidName('');
        fetchSession();
      }
    } catch (error) {
      console.error('Error adding kid:', error);
    }
  };

  const handleOpenActivityModal = (category: ActivityCategory) => {
    setSelectedCategory(category);
    setActivityMode('completed');
    setMinutes(30);
    setNote('');
    setSelectedTime('');
    setShowActivityModal(true);
  };

  const handleLogActivity = async () => {
    if (!selectedCategory || selectedKids.size === 0 || !sessionData?.hasEditAccess) return;

    const kidIds = Array.from(selectedKids);
    const now = new Date();
    let startedAt: string;

    if (activityMode === 'completed') {
      if (selectedTime) {
        startedAt = selectedTime;
      } else {
        const startTime = new Date(now.getTime() - minutes * 60 * 1000);
        startedAt = startTime.toISOString();
      }
    } else {
      startedAt = selectedTime || now.toISOString();
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}/logs?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidIds,
          category: selectedCategory,
          minutes: activityMode === 'completed' ? minutes : undefined,
          startedAt,
          note: note.trim() || undefined,
          status: activityMode === 'completed' ? 'completed' : 'active',
        }),
      });

      if (response.ok) {
        setShowActivityModal(false);
        fetchSession();
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const handleEditLog = async () => {
    if (!editingLog || !sessionData?.hasEditAccess) return;

    const isCompletingActivity = editingLog.status === 'active';
    
    let calculatedMinutes = minutes;
    if (isCompletingActivity) {
      const startTime = new Date(selectedTime || editingLog.startedAt);
      const endTime = selectedEndTime ? new Date(selectedEndTime) : new Date();
      calculatedMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    }

    try {
      const response = await fetch(`/api/sessions/${sessionId}/logs/${editingLog.id}?key=${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidIds: Array.from(selectedKids),
          minutes: calculatedMinutes,
          startedAt: selectedTime || editingLog.startedAt,
          note: note.trim() || undefined,
          status: 'completed',
        }),
      });

      if (response.ok) {
        setEditingLog(null);
        fetchSession();
      }
    } catch (error) {
      console.error('Error updating log:', error);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!sessionData?.hasEditAccess || !confirm('Delete this activity?')) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/logs/${logId}?key=${key}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchSession();
      }
    } catch (error) {
      console.error('Error deleting log:', error);
    }
  };

  const handleCompleteActivity = (log: LogEntry) => {
    setEditingLog(log);
    setSelectedKids(new Set(log.kidIds));
    setMinutes(calculateElapsedMinutes(log.startedAt));
    setNote(log.note || '');
    setSelectedTime(log.startedAt);
    setSelectedEndTime('');
  };

  const handleShareLink = async () => {
    const link = `${window.location.origin}/s/${sessionId}`;
    try {
      await navigator.clipboard.writeText(link);
      alert('View-only link copied to clipboard!');
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      setMinutes(0);
    } else {
      const num = parseInt(val);
      if (!isNaN(num)) {
        setMinutes(Math.max(0, num));
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading playdate...</p>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Session Not Found</h1>
          <p className="text-gray-600 mb-4">This playdate session doesn't exist.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const sessionName = generateSessionName(sessionData.kids);
  const totalScreenTime = sessionData.logs
    .filter(l => l.status === 'completed' && l.category === 'screen')
    .reduce((sum, l) => sum + (l.minutes || 0), 0);

  const perKidTotals = sessionData.kids.map(kid => ({
    kid,
    total: sessionData.logs
      .filter(l => l.status === 'completed' && l.kidIds.includes(kid.id))
      .reduce((sum, l) => sum + (l.minutes || 0), 0),
  }));

  const perCategoryTotals = {
    screen: sessionData.logs.filter(l => l.status === 'completed' && l.category === 'screen').reduce((sum, l) => sum + (l.minutes || 0), 0),
    physical: sessionData.logs.filter(l => l.status === 'completed' && l.category === 'physical').reduce((sum, l) => sum + (l.minutes || 0), 0),
    other: sessionData.logs.filter(l => l.status === 'completed' && l.category === 'other').reduce((sum, l) => sum + (l.minutes || 0), 0),
  };

  const isCompletingActivity = editingLog?.status === 'active';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className={`${sessionData.hasEditAccess ? 'bg-gradient-to-r from-blue-500 to-purple-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'} text-white p-6 shadow-lg`}>
        <div className="container max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-all"
                title="Home"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold">{sessionName}</h1>
                <p className={`${sessionData.hasEditAccess ? 'text-blue-100' : 'text-gray-200'} text-xs mt-0.5`}>Playdate Session</p>
              </div>
            </div>
            <span className={`${sessionData.hasEditAccess ? 'bg-green-400 text-green-900' : 'bg-gray-300 text-gray-700'} text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1`}>
              {sessionData.hasEditAccess ? 'Editable' : (
                <><Eye className="w-3 h-3" />Read-only</>
              )}
            </span>
          </div>
          <p className={`${sessionData.hasEditAccess ? 'text-blue-100' : 'text-gray-200'} text-sm mb-4`}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          
          {sessionData.hasEditAccess ? (
            <button
              onClick={handleShareLink}
              className="w-full bg-white/20 backdrop-blur text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-white/30 transition-all"
            >
              <div className="flex items-center justify-center gap-1">
                <Share2 className="w-4 h-4" />
                <span>Share Link</span>
              </div>
            </button>
          ) : (
            <div className="bg-gray-700/30 backdrop-blur p-4 rounded-xl">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-100">
                  You're viewing in read-only mode. Ask the creator for the edit link to add kids or log activities.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="container max-w-4xl mx-auto p-6 space-y-6">
        {/* Kids Section */}
        <div className="bg-white rounded-2xl p-5 shadow-md">
          <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Kids
          </h2>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {sessionData.kids.map((kid, idx) => (
              <span key={kid.id} className={`${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].bg} ${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].text} px-4 py-2 rounded-full text-sm font-medium`}>
                {kid.name}
              </span>
            ))}
            {sessionData.kids.length === 0 && (
              <p className="text-sm text-gray-500">No kids added yet</p>
            )}
          </div>

          {sessionData.hasEditAccess && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newKidName}
                onChange={(e) => setNewKidName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddKid()}
                placeholder="Add kid's name..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleAddKid}
                disabled={!newKidName.trim()}
                className="bg-purple-600 text-white px-5 py-2 rounded-xl font-medium hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Timeline */}
        {sessionData.logs.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-600" />
              Timeline
            </h2>

            <div className="space-y-3">
              {sessionData.logs.map(log => {
                const config = CATEGORY_CONFIG[log.category];
                const Icon = config.icon;
                const isActive = log.status === 'active';
                const kidNames = log.kidIds.map(id => sessionData.kids.find(k => k.id === id)?.name).filter(Boolean);

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-3 pb-3 ${isActive ? 'border-2 border-green-200 bg-green-50 p-3 rounded-xl' : 'border-b border-gray-100'}`}
                  >
                    <div className={`w-10 h-10 ${isActive ? 'bg-green-500' : config.lightBgClass} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      {isActive ? (
                        <PlayCircle className="w-5 h-5 text-white" />
                      ) : (
                        <Icon className={`w-5 h-5 ${config.textClass}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900 text-sm">{config.label}</p>
                            {isActive && (
                              <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">Active</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {kidNames.map((name, idx) => (
                              <span key={idx} className={`text-xs ${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].bg} ${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].text} px-2 py-0.5 rounded-full`}>
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                        {sessionData.hasEditAccess && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingLog(log);
                                setSelectedKids(new Set(log.kidIds));
                                setMinutes(log.minutes || 0);
                                setNote(log.note || '');
                                setSelectedTime(log.startedAt);
                                setSelectedEndTime('');
                              }}
                              className="text-blue-500 hover:text-blue-700 p-1"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isActive ? (
                        <>
                          <p className="text-sm text-green-700 font-medium">
                            Started {formatElapsedTime(calculateElapsedMinutes(log.startedAt))}
                          </p>
                          <p className="text-xs text-gray-500">{formatTime(new Date(log.startedAt))} {log.note && `• ${log.note}`}</p>
                          {sessionData.hasEditAccess && (
                            <button
                              onClick={() => handleCompleteActivity(log)}
                              className="mt-2 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 transition-all flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" />
                              Complete & Log Duration
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <p className={`text-lg font-bold ${config.textClass}`}>
                            {log.minutes} minute{log.minutes !== 1 ? 's' : ''} {kidNames.length > 1 ? 'each' : ''}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTime(new Date(log.startedAt))}
                            {log.note && ` • ${log.note}`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity Logging */}
        {sessionData.hasEditAccess && sessionData.kids.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h2 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-600" />
              Log Activity
            </h2>
            
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl mb-4">
              <p className="text-xs font-medium text-blue-900 mb-2 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Logging for (all kids by default):
              </p>
              <div className="flex flex-wrap gap-2">
                {sessionData.kids.map(kid => (
                  <label key={kid.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-all border border-blue-200">
                    <input
                      type="checkbox"
                      checked={selectedKids.has(kid.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedKids);
                        if (e.target.checked) {
                          newSet.add(kid.id);
                        } else {
                          newSet.delete(kid.id);
                        }
                        setSelectedKids(newSet);
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">{kid.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-blue-700 mt-2">Uncheck if a kid isn't participating in this activity</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => handleOpenActivityModal(key as ActivityCategory)}
                    className={`${config.bgClass} p-4 rounded-xl text-white hover:scale-[1.02] transition-transform shadow-lg`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                          <Icon className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-lg">{config.label}</span>
                      </div>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {sessionData.logs.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-md">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Summary
            </h2>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                const total = perCategoryTotals[key as ActivityCategory];
                return (
                  <div key={key} className={`${config.lightBgClass} p-3 rounded-xl text-center`}>
                    <div className={`w-10 h-10 ${config.bgClass} rounded-lg mx-auto mb-2 flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <p className={`text-2xl font-bold ${config.textClass}`}>{total}</p>
                    <p className="text-xs text-gray-600">{config.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold text-gray-900">Total Screen Time</span>
                </div>
                <span className="text-2xl font-bold text-amber-600">{totalScreenTime} min</span>
              </div>
              <p className="text-xs text-amber-700 mt-1">All screen time activities</p>
            </div>

            {perKidTotals.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 uppercase mb-2">Per Kid</p>
                {perKidTotals.map(({ kid, total }) => (
                  <div key={kid.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-medium text-gray-700">{kid.name}</span>
                    <span className="text-sm font-bold text-gray-900">{total} min</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity Modal */}
      {showActivityModal && selectedCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setShowActivityModal(false)}>
          <div className="bg-white w-full rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 ${CATEGORY_CONFIG[selectedCategory].bgClass} rounded-xl flex items-center justify-center`}>
                {(() => {
                  const Icon = CATEGORY_CONFIG[selectedCategory].icon;
                  return <Icon className="w-6 h-6 text-white" />;
                })()}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{CATEGORY_CONFIG[selectedCategory].label}</h2>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Array.from(selectedKids).map(kidId => {
                    const kid = sessionData.kids.find(k => k.id === kidId);
                    const idx = sessionData.kids.findIndex(k => k.id === kidId);
                    return kid ? (
                      <span key={kid.id} className={`text-xs ${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].bg} ${KID_COLOR_CLASSES[idx % KID_COLOR_CLASSES.length].text} px-2 py-0.5 rounded-full font-medium`}>
                        {kid.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>

            {/* Toggle */}
            <div className="flex gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setActivityMode('completed')}
                className={`flex-1 py-2 px-4 font-medium rounded-lg transition-all ${
                  activityMode === 'completed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Completed
              </button>
              <button
                onClick={() => setActivityMode('start')}
                className={`flex-1 py-2 px-4 font-medium rounded-lg transition-all ${
                  activityMode === 'start' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Start Activity
              </button>
            </div>

            <div className="space-y-5">
              {activityMode === 'start' && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                  <div className="flex gap-2">
                    <PlayCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-900">Start tracking an activity</p>
                      <p className="text-xs text-green-700 mt-1">
                        Kids just started this activity? Log the start time without minutes. You can log the duration later when they finish.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activityMode === 'completed' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Quick Select Minutes</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[15, 30, 60].map(m => (
                        <button
                          key={m}
                          onClick={() => setMinutes(m)}
                          className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                            minutes === m
                              ? `${CATEGORY_CONFIG[selectedCategory].bgClass} text-white shadow-md`
                              : `${CATEGORY_CONFIG[selectedCategory].lightBgClass} ${CATEGORY_CONFIG[selectedCategory].textClass} hover:opacity-80`
                          }`}
                        >
                          {m} min
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Or Enter Custom Minutes</label>
                    <input
                      type="number"
                      value={minutes || ''}
                      onChange={handleMinutesChange}
                      className={`w-full px-4 py-3 border-2 ${CATEGORY_CONFIG[selectedCategory].borderClass} rounded-xl text-lg font-semibold text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none`}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Started at (optional)
                    </label>
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    >
                      <option value="">Auto ({minutes} min ago)</option>
                      {Array.from({ length: 24 }, (_, i) => {
                        const time = new Date();
                        const totalMinutesAgo = i * 10;
                        time.setMinutes(time.getMinutes() - totalMinutesAgo);
                        const hours = time.getHours();
                        const mins = Math.floor(time.getMinutes() / 10) * 10;
                        time.setHours(hours, mins, 0, 0);
                        const label = i === 0 ? 'Now' : `${hours}:${mins.toString().padStart(2, '0')}`;
                        return (
                          <option key={i} value={time.toISOString()}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </>
              )}

              {activityMode === 'start' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Started at
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  >
                    <option value="">Now</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const time = new Date();
                      const totalMinutesAgo = i * 10;
                      time.setMinutes(time.getMinutes() - totalMinutesAgo);
                      const hours = time.getHours();
                      const mins = Math.floor(time.getMinutes() / 10) * 10;
                      time.setHours(hours, mins, 0, 0);
                      return (
                        <option key={i} value={time.toISOString()}>
                          {hours}:{mins.toString().padStart(2, '0')}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What were they doing?"
                  rows={2}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none`}
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-2">
                <button
                  onClick={() => setShowActivityModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogActivity}
                  disabled={selectedKids.size === 0 || (activityMode === 'completed' && minutes <= 0)}
                  className={`flex-1 bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {activityMode === 'completed' ? 'Add Log' : 'Start Activity'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Log Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setEditingLog(null)}>
          <div className="bg-white w-full rounded-t-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 ${CATEGORY_CONFIG[editingLog.category].bgClass} rounded-xl flex items-center justify-center`}>
                {(() => {
                  const Icon = CATEGORY_CONFIG[editingLog.category].icon;
                  return <Icon className="w-6 h-6 text-white" />;
                })()}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {isCompletingActivity ? 'Complete Activity' : `Edit ${CATEGORY_CONFIG[editingLog.category].label}`}
                </h2>
                <p className="text-sm text-gray-600">
                  {isCompletingActivity ? 'Set the end time to log duration' : 'Modify this activity entry'}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Kids Involved
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl">
                  {sessionData.kids.map(kid => (
                    <label
                      key={kid.id}
                      className={`flex items-center gap-2 bg-white px-3 py-2 rounded-lg cursor-pointer hover:bg-purple-50 transition-all ${
                        selectedKids.has(kid.id) ? `border-2 ${CATEGORY_CONFIG[editingLog.category].borderClass}` : 'border border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedKids.has(kid.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedKids);
                          if (e.target.checked) {
                            newSet.add(kid.id);
                          } else {
                            newSet.delete(kid.id);
                          }
                          setSelectedKids(newSet);
                        }}
                        className={`w-4 h-4 text-purple-600 rounded`}
                      />
                      <span className="text-sm font-medium text-gray-700">{kid.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Started at - always shown */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Started at
                </label>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                >
                  <option value={editingLog.startedAt}>Current: {formatTime(new Date(editingLog.startedAt))}</option>
                  {Array.from({ length: 24 }, (_, i) => {
                    const time = new Date();
                    const totalMinutesAgo = i * 10;
                    time.setMinutes(time.getMinutes() - totalMinutesAgo);
                    const hours = time.getHours();
                    const mins = Math.floor(time.getMinutes() / 10) * 10;
                    time.setHours(hours, mins, 0, 0);
                    const label = i === 0 ? 'Now' : `${hours}:${mins.toString().padStart(2, '0')}`;
                    return (
                      <option key={i} value={time.toISOString()}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Ended at - only for completing activity */}
              {isCompletingActivity ? (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Ended at
                  </label>
                  <select
                    value={selectedEndTime}
                    onChange={(e) => setSelectedEndTime(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg font-medium focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                  >
                    <option value="">Now</option>
                    {Array.from({ length: 24 }, (_, i) => {
                      const time = new Date();
                      const totalMinutesAgo = i * 10;
                      time.setMinutes(time.getMinutes() - totalMinutesAgo);
                      const hours = time.getHours();
                      const mins = Math.floor(time.getMinutes() / 10) * 10;
                      time.setHours(hours, mins, 0, 0);
                      return (
                        <option key={i} value={time.toISOString()}>
                          {hours}:{mins.toString().padStart(2, '0')}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                /* Duration - only for editing completed activity */
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Duration (minutes)</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[15, 30, 60].map(m => (
                      <button
                        key={m}
                        onClick={() => setMinutes(m)}
                        className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                          minutes === m
                            ? `${CATEGORY_CONFIG[editingLog.category].bgClass} text-white shadow-md`
                            : `${CATEGORY_CONFIG[editingLog.category].lightBgClass} ${CATEGORY_CONFIG[editingLog.category].textClass} hover:opacity-80`
                        }`}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={minutes || ''}
                    onChange={handleMinutesChange}
                    className={`w-full px-4 py-3 border-2 ${CATEGORY_CONFIG[editingLog.category].borderClass} rounded-xl text-lg font-semibold text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none`}
                  />
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none`}
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-2">
                <button
                  onClick={() => setEditingLog(null)}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditLog}
                  disabled={selectedKids.size === 0}
                  className={`flex-1 bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isCompletingActivity ? 'Complete Activity' : 'Save Changes'}
                </button>
              </div>

              <button
                onClick={() => {
                  handleDeleteLog(editingLog.id);
                  setEditingLog(null);
                }}
                className="w-full text-red-600 font-medium py-2 text-sm hover:text-red-700 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete This Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
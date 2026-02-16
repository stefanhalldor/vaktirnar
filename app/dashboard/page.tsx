'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Users, Activity, Clock,
  Home, Monitor, Flame, CircleDot, RefreshCw
} from 'lucide-react';
import { DashboardStats } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10-second polling for better real-time feel
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async (manual = false) => {
    if (manual) setRefreshing(true);

    try {
      // Add cache-busting timestamp
      const response = await fetch(`/api/dashboard?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard statistics');
      }
      const data = await response.json();
      setStats(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchStats(true);
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getPercentage = (value: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="container max-w-6xl mx-auto px-6 py-12">
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="container max-w-6xl mx-auto px-6 py-12">
          <div className="text-center py-20">
            <p className="text-red-600">{error || 'No data available'}</p>
            <button
              onClick={fetchStats}
              className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalCategoryMinutes = stats.categoryBreakdown.screen +
    stats.categoryBreakdown.physical +
    stats.categoryBreakdown.other;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg">
        <div className="container max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                PlaydateSync Dashboard
              </h1>
              <p className="text-blue-100">Real-time usage statistics</p>
              {lastUpdated && (
                <p className="text-blue-200 text-xs mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-6 py-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Total Sessions */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {formatNumber(stats.totalSessions)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Sessions</p>
              <p className="text-xs text-green-600 mt-2">
                {stats.activeSessions} active now
              </p>
            </div>
          </div>

          {/* Total Kids */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {formatNumber(stats.totalKids)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Kids</p>
              <p className="text-xs text-gray-500 mt-2">
                Avg {stats.avgKidsPerSession} per session
              </p>
            </div>
          </div>

          {/* Total Activities */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl">
                <Activity className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {formatNumber(stats.totalActivities)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Activities</p>
              <p className="text-xs text-gray-500 mt-2">
                Avg {stats.avgActivitiesPerSession} per session
              </p>
            </div>
          </div>

          {/* Total Minutes */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {formatNumber(stats.totalMinutes)}
              </p>
              <p className="text-sm text-gray-600 mt-1">Total Minutes</p>
              <p className="text-xs text-gray-500 mt-2">
                {formatMinutes(stats.totalMinutes)}
              </p>
            </div>
          </div>
        </div>

        {/* Activity Breakdown */}
        <div className="bg-white rounded-2xl p-8 shadow-md mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Activity Breakdown</h2>

          <div className="space-y-6">
            {/* Screen Time */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-900">Screen Time</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900">
                    {getPercentage(stats.categoryBreakdown.screen, totalCategoryMinutes)}%
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatNumber(stats.activityCounts.screen)} activities)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full transition-all duration-500"
                  style={{
                    width: `${getPercentage(stats.categoryBreakdown.screen, totalCategoryMinutes)}%`
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {formatMinutes(stats.categoryBreakdown.screen)}
              </p>
            </div>

            {/* Physical Play */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-gray-900">Physical Play</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900">
                    {getPercentage(stats.categoryBreakdown.physical, totalCategoryMinutes)}%
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatNumber(stats.activityCounts.physical)} activities)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all duration-500"
                  style={{
                    width: `${getPercentage(stats.categoryBreakdown.physical, totalCategoryMinutes)}%`
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {formatMinutes(stats.categoryBreakdown.physical)}
              </p>
            </div>

            {/* Other */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CircleDot className="w-5 h-5 text-gray-600" />
                  <span className="font-semibold text-gray-900">Other</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900">
                    {getPercentage(stats.categoryBreakdown.other, totalCategoryMinutes)}%
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatNumber(stats.activityCounts.other)} activities)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-gray-400 to-gray-500 h-4 rounded-full transition-all duration-500"
                  style={{
                    width: `${getPercentage(stats.categoryBreakdown.other, totalCategoryMinutes)}%`
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {formatMinutes(stats.categoryBreakdown.other)}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Total Minutes Tracked</span>
              <span className="text-2xl font-bold text-gray-900">
                {formatMinutes(totalCategoryMinutes)}
              </span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all"
          >
            <Users className="w-5 h-5" />
            <span>Start Your Own Playdate</span>
          </button>
        </div>
      </div>
    </div>
  );
}

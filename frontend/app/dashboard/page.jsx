'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, authedFetch } = useAuth();
  
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch dashboard data
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchDashboard = async () => {
      try {
        const response = await authedFetch('/api/dashboard');
        
        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to load dashboard');
          return;
        }

        const data = await response.json();
        setDashboard(data);
      } catch (err) {
        setError('Failed to load dashboard');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [authLoading, user, authedFetch, router]);

  const formatActivityDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

          {/* Loading State */}
          {isLoading ? (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-sm text-gray-600">Loading dashboard...</p>
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          ) : dashboard ? (
            <>
              {/* ── Overview row: project count + completed this week ──────── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Overview</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                {/* Project Count — links to /projects */}
                <Link href="/projects" className="block">
                  <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">Projects</p>
                        <p className="text-3xl font-bold text-gray-900">{dashboard.projectCount}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <svg className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* Completed This Week — links to /assigned-to-me */}
                <Link href="/assigned-to-me" className="block">
                  <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">Completed This Week</p>
                        <p className="text-3xl font-bold text-green-600">{dashboard.completedThisWeek}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <svg className="h-10 w-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>

              {/* ── My Tasks by Status row: TODO / IN PROGRESS / DONE ─────── */}
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">My Tasks by Status</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                {/* TODO — links to /assigned-to-me */}
                <Link href="/assigned-to-me" className="block">
                  <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">TODO</p>
                        <p className="text-3xl font-bold text-gray-900">{dashboard.tasksByStatus.TODO}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <span className="text-base font-bold text-gray-500">T</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* IN PROGRESS — links to /assigned-to-me */}
                <Link href="/assigned-to-me" className="block">
                  <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">In Progress</p>
                        <p className="text-3xl font-bold text-blue-600">{dashboard.tasksByStatus.IN_PROGRESS}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-base font-bold text-blue-500">P</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>

                {/* DONE — links to /assigned-to-me */}
                <Link href="/assigned-to-me" className="block">
                  <div className="bg-white shadow rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-600">Done</p>
                        <p className="text-3xl font-bold text-green-600">{dashboard.tasksByStatus.DONE}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-base font-bold text-green-500">✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>

              {/* ── Busiest Project ───────────────────────────────────────── */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Busiest Project</h2>
                {dashboard.busiestProject ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/projects/${dashboard.busiestProject.id}`}
                        className="text-lg font-medium text-blue-600 hover:text-blue-800"
                      >
                        {dashboard.busiestProject.name}
                      </Link>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {dashboard.busiestProject.openTaskCount} open task{dashboard.busiestProject.openTaskCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No open tasks across your projects.</p>
                )}
              </div>

              {/* ── Recent Activity ───────────────────────────────────────── */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Activity</h2>
                {dashboard.recentActivity.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {dashboard.recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-2.5 py-2.5">
                        {/* Smaller icon — 6×6 circle instead of 8×8 */}
                        <div className="mt-0.5 flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg className="h-3.5 w-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{activity.message}</p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                            <span>{activity.actor.name}</span>
                            <span>·</span>
                            <Link
                              href={`/projects/${activity.project.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-blue-500 hover:underline"
                            >
                              {activity.project.name}
                            </Link>
                            <span>·</span>
                            <span>{formatActivityDate(activity.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

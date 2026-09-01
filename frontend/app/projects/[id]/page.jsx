'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;
  const { user, isLoading: authLoading, authedFetch } = useAuth();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [error, setError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Activity feed state
  const [activity, setActivity] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch project details
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchProject = async () => {
      try {
        const response = await authedFetch(`/api/projects/${projectId}`);

        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (response.status === 403) {
          setError("You don't have access to this project");
          setIsLoadingProject(false);
          return;
        }

        if (response.status === 404) {
          setError('Project not found');
          setIsLoadingProject(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to load project');
          setIsLoadingProject(false);
          return;
        }

        const data = await response.json();
        setProject(data);
      } catch (err) {
        setError('Failed to load project');
      } finally {
        setIsLoadingProject(false);
      }
    };

    fetchProject();
  }, [authLoading, user, projectId, authedFetch, router]);

  // Fetch members
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchMembers = async () => {
      try {
        const response = await authedFetch(`/api/projects/${projectId}/members`);

        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setMembers(data);
        }
      } catch (err) {
        console.error('Failed to load members:', err);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [authLoading, user, projectId, authedFetch, router]);

  // Fetch activity feed — re-runs when the page number changes
  const fetchActivity = useCallback(async () => {
    if (authLoading || !user) return;

    setIsLoadingActivity(true);
    setActivityError('');

    try {
      const response = await authedFetch(
        `/api/projects/${projectId}/activity?page=${activityPage}&limit=10`
      );

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setActivityError(data.error || 'Failed to load activity');
        return;
      }

      const data = await response.json();
      setActivity(data.data);
      setActivityTotalPages(data.totalPages);
    } catch (err) {
      setActivityError('Failed to load activity');
    } finally {
      setIsLoadingActivity(false);
    }
  }, [authLoading, user, projectId, activityPage, authedFetch, router]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Relative timestamp — same pattern used on Dashboard and task detail
  const formatRelativeTime = (dateString) => {
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
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setIsInviting(true);

    try {
      const response = await authedFetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail }),
      });

      if (!response.ok) {
        const data = await response.json();
        setInviteError(data.error || 'Failed to invite member');
        return;
      }

      setInviteSuccess('Member invited successfully!');
      setInviteEmail('');

      // Re-fetch the members list — the POST response only returns the bare Membership row,
      // not the joined user data (name, email) needed to render the member card.
      const membersResponse = await authedFetch(`/api/projects/${projectId}/members`);
      if (membersResponse.ok) {
        const data = await membersResponse.json();
        setMembers(data);
      }

      // Invite creates an activity log entry — refresh the feed to show it
      setActivityPage(1);
      fetchActivity();
    } catch (err) {
      setInviteError('Failed to invite member');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to remove ${userName} from this project?`)) {
      return;
    }

    try {
      const response = await authedFetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to remove member');
        return;
      }

      // Remove from local state directly — no re-fetch needed
      setMembers((prev) => prev.filter((m) => m.userId !== userId));

      // Removal creates an activity log entry — refresh the feed
      setActivityPage(1);
      fetchActivity();
    } catch (err) {
      alert('Failed to remove member');
    }
  };

  const handleDeleteProject = async () => {
    const confirmed = window.confirm(
      `Permanently delete "${project.name}"?\n\n` +
      `This will delete ALL tasks, comments, members, and activity in this project. ` +
      `This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleteError('');
    setIsDeleting(true);

    try {
      const response = await authedFetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        setDeleteError(data.error || 'Failed to delete project');
        return;
      }

      router.push('/projects');
    } catch (err) {
      setDeleteError('Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  // Loading state while auth initializes
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
          {/* Back Link */}
          <Link href="/projects" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Projects
          </Link>

          {/* Error States */}
          {error ? (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          ) : isLoadingProject ? (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-sm text-gray-600">Loading project...</p>
            </div>
          ) : project ? (
            <>
              {/* Project Header */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                    <span className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      project.myRole === 'OWNER'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      Your Role: {project.myRole}
                    </span>
                  </div>
                  <Link
                    href={`/projects/${projectId}/board`}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    View Board
                  </Link>
                </div>
              </div>

              {/* ── Members Section ─────────────────────────────────────────── */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members</h2>

                {/* Invite Member Form (OWNER only) */}
                {project.myRole === 'OWNER' && (
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Invite New Member</h3>
                    <form onSubmit={handleInviteMember} className="flex gap-4">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Enter email address"
                        required
                        disabled={isInviting}
                        className="flex-1 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                      />
                      <button
                        type="submit"
                        disabled={isInviting || !inviteEmail.trim()}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isInviting ? 'Inviting...' : 'Invite'}
                      </button>
                    </form>
                    {inviteError && (
                      <div className="mt-3 rounded-md bg-red-50 p-3">
                        <p className="text-sm text-red-800">{inviteError}</p>
                      </div>
                    )}
                    {inviteSuccess && (
                      <div className="mt-3 rounded-md bg-green-50 p-3">
                        <p className="text-sm text-green-800">{inviteSuccess}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Members List */}
                {isLoadingMembers ? (
                  <div className="text-center py-6">
                    <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">Loading members...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {members.map((membership) => (
                      <div key={membership.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{membership.user.name}</p>
                          <p className="text-sm text-gray-500">{membership.user.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            membership.role === 'OWNER'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {membership.role}
                          </span>
                          {project.myRole === 'OWNER' &&
                            membership.role !== 'OWNER' &&
                            membership.userId !== user.id && (
                            <button
                              onClick={() => handleRemoveMember(membership.userId, membership.user.name)}
                              className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Activity Feed ────────────────────────────────────────────── */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Activity</h2>
                {isLoadingActivity ? (
                  <div className="text-center py-8">
                    <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">Loading activity...</p>
                  </div>
                ) : activityError ? (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{activityError}</p>
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No activity yet.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {activity.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-b-0"
                        >
                          {/* Icon dot */}
                          <div className="mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-blue-400"></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">{entry.message}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                              <span>{entry.actor.name}</span>
                              <span>·</span>
                              <span>{formatRelativeTime(entry.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {activityTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          disabled={activityPage === 1}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-gray-600">
                          Page {activityPage} of {activityTotalPages}
                        </span>
                        <button
                          onClick={() => setActivityPage(p => Math.min(activityTotalPages, p + 1))}
                          disabled={activityPage === activityTotalPages}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* ── Danger Zone — OWNER only ─────────────────────────────── */}
              {project.myRole === 'OWNER' && (
                <div className="border border-red-200 rounded-lg p-6 bg-red-50">
                  <h2 className="text-base font-semibold text-red-800 mb-1">Danger Zone</h2>
                  <p className="text-sm text-red-700 mb-4">
                    Deleting this project is permanent and cannot be undone. All tasks, comments,
                    members, and activity history will be erased immediately.
                  </p>

                  {deleteError && (
                    <div className="mb-4 rounded-md bg-white border border-red-300 p-3">
                      <p className="text-sm text-red-700">{deleteError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleDeleteProject}
                    disabled={isDeleting}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Deleting…
                      </span>
                    ) : (
                      'Delete Project'
                    )}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
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

  // Wait for auth to finish loading before deciding what to show
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
          setError('You don\'t have access to this project');
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
      
      // Refresh members list
      const membersResponse = await authedFetch(`/api/projects/${projectId}/members`);
      if (membersResponse.ok) {
        const data = await membersResponse.json();
        setMembers(data);
      }
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

      // Refresh members list
      const membersResponse = await authedFetch(`/api/projects/${projectId}/members`);
      if (membersResponse.ok) {
        const data = await membersResponse.json();
        setMembers(data);
      }
    } catch (err) {
      alert('Failed to remove member');
    }
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

  // Don't render anything if redirecting to login
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
                <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
                <span className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  project.myRole === 'OWNER' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  Your Role: {project.myRole}
                </span>
              </div>

              {/* Members Section */}
              {/* No self-leave endpoint exists yet — members can only be removed by the owner, per current backend scope */}
              <div className="bg-white shadow rounded-lg p-6">
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

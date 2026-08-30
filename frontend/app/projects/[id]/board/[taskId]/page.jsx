'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import NavBar from '@/components/NavBar';

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;
  const taskId = params.taskId;
  const { user, isLoading: authLoading, authedFetch } = useAuth();
  const { socket, isConnected, connectionEpoch } = useSocket();
  
  const [task, setTask] = useState(null);
  const [members, setMembers] = useState([]);
  const [comments, setComments] = useState([]);
  const [isLoadingTask, setIsLoadingTask] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [error, setError] = useState('');
  const [commentsError, setCommentsError] = useState('');
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');
  
  // Status change
  const [statusChangeError, setStatusChangeError] = useState('');
  
  // Comment form
  const [newCommentBody, setNewCommentBody] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  
  // connectionEpoch < 2 means we haven't had a real reconnect yet:
  //   epoch 0 = never connected, epoch 1 = first connect (REST data already fetched).
  //   Only epoch >= 2 means a disconnect + reconnect happened and we need to recover.

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Fetch task
  useEffect(() => {
    if (authLoading || !user) return;

    const fetchTask = async () => {
      try {
        const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}`);
        
        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (response.status === 404) {
          setError('Task not found');
          setIsLoadingTask(false);
          return;
        }

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to load task');
          setIsLoadingTask(false);
          return;
        }

        const data = await response.json();
        setTask(data);
      } catch (err) {
        setError('Failed to load task');
      } finally {
        setIsLoadingTask(false);
      }
    };

    fetchTask();
  }, [authLoading, user, projectId, taskId, authedFetch, router]);

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

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (authLoading || !user) return;

    setIsLoadingComments(true);
    setCommentsError('');

    try {
      const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}/comments`);
      
      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setComments(data);
      } else {
        const data = await response.json();
        setCommentsError(data.error || 'Failed to load comments');
      }
    } catch (err) {
      setCommentsError('Failed to load comments');
    } finally {
      setIsLoadingComments(false);
    }
  }, [authLoading, user, projectId, taskId, authedFetch, router]);

  useEffect(() => {
    fetchComments();
  }, [authLoading, user, projectId, taskId, authedFetch, router]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket || !taskId) return;

    const handleTaskUpdated = (updatedTask) => {
      if (updatedTask.id === taskId) {
        setTask(updatedTask);
      }
    };

    const handleCommentAdded = (comment) => {
      if (comment.taskId === taskId) {
        // Upsert comment to avoid duplicates (user's own comment comes via REST and socket)
        setComments((prevComments) => {
          const existingIndex = prevComments.findIndex(c => c.id === comment.id);
          if (existingIndex >= 0) {
            const updated = [...prevComments];
            updated[existingIndex] = comment;
            return updated;
          } else {
            return [...prevComments, comment];
          }
        });
      }
    };

    socket.on('task:updated', handleTaskUpdated);
    socket.on('comment:added', handleCommentAdded);

    return () => {
      socket.off('task:updated', handleTaskUpdated);
      socket.off('comment:added', handleCommentAdded);
    };
  }, [socket, taskId]);

  // Refetch on reconnect — skip initial connect (epoch 1), only fire on epoch >= 2
  useEffect(() => {
    if (connectionEpoch < 2) return;

    // Reconnected - silently refetch to recover missed events
    const refetchData = async () => {
      if (authLoading || !user) return;

      try {
        const taskResponse = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}`);
        if (taskResponse.ok) {
          const taskData = await taskResponse.json();
          setTask(taskData);
        }
      } catch (err) {
        console.error('Failed to refetch task on reconnect:', err);
      }

      fetchComments();
    };

    refetchData();
  }, [connectionEpoch, authLoading, user, projectId, taskId, authedFetch, fetchComments]);

  const handleEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
    setEditAssigneeId(task.assigneeId || '');
    setIsEditing(true);
    setEditError('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    setEditError('');
    setIsSaving(true);

    try {
      const body = {};

      if (editTitle !== task.title) {
        body.title = editTitle;
      }

      if (editDescription !== (task.description || '')) {
        body.description = editDescription;
      }

      if (editPriority !== task.priority) {
        body.priority = editPriority;
      }

      const taskDueDate = task.dueDate ? task.dueDate.split('T')[0] : '';
      if (editDueDate !== taskDueDate) {
        body.dueDate = editDueDate || null;
      }

      if (editAssigneeId !== (task.assigneeId || '')) {
        body.assigneeId = editAssigneeId || null;
      }

      // Only send request if something changed
      if (Object.keys(body).length === 0) {
        setIsEditing(false);
        setIsSaving(false);
        return;
      }

      const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        setEditError(data.error || 'Failed to update task');
        return;
      }

      const updatedTask = await response.json();
      setTask(updatedTask);
      setIsEditing(false);
    } catch (err) {
      setEditError('Failed to update task');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setStatusChangeError('');

    try {
      const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.status === 403) {
        const data = await response.json();
        setStatusChangeError(data.error || 'You do not have permission to change this task status');
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setStatusChangeError(data.error || 'Failed to update task status');
        return;
      }

      const updatedTask = await response.json();
      setTask(updatedTask);
    } catch (err) {
      setStatusChangeError('Failed to update task status');
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    setCommentError('');
    setIsPostingComment(true);

    try {
      const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newCommentBody }),
      });

      if (!response.ok) {
        const data = await response.json();
        setCommentError(data.error || 'Failed to post comment');
        return;
      }

      // Socket event (comment:added) will upsert the comment automatically
      setNewCommentBody('');
    } catch (err) {
      setCommentError('Failed to post comment');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await authedFetch(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to delete task');
        return;
      }

      router.push(`/projects/${projectId}/board`);
    } catch (err) {
      alert('Failed to delete task');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCommentDate = (dateString) => {
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

  const getAssigneeName = (assigneeId) => {
    if (!assigneeId) return 'Unassigned';
    const member = members.find(m => m.userId === assigneeId);
    return member ? member.user.name : 'Unknown User';
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
      
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Back Link */}
          <Link href={`/projects/${projectId}/board`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Board
          </Link>

          {/* Loading State */}
          {isLoadingTask ? (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-sm text-gray-600">Loading task...</p>
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          ) : task ? (
            <>
              {/* Task Details */}
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                {/* Header with Actions */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="text-2xl font-bold text-gray-900 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSaving}
                      />
                    ) : (
                      <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
                    )}
                  </div>
                  <div className="ml-4 flex gap-2">
                    {/* Connection Indicator */}
                    <div className="flex items-center gap-2 mr-4">
                      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                      <span className={`text-sm ${isConnected ? 'text-green-700' : 'text-yellow-700'}`}>
                        {isConnected ? 'Live' : 'Reconnecting...'}
                      </span>
                    </div>
                    {!isEditing && (
                      <>
                        <button
                          onClick={handleEdit}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Edit
                        </button>
                        <button
                          onClick={handleDeleteTask}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Status Change Error */}
                {statusChangeError && (
                  <div className="mb-4 rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{statusChangeError}</p>
                  </div>
                )}

                {/* Edit Error */}
                {editError && (
                  <div className="mb-4 rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{editError}</p>
                  </div>
                )}

                {/* Task Attributes */}
                <div className="space-y-4">
                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    {isEditing ? (
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={4}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSaving}
                        placeholder="No description"
                      />
                    ) : (
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {task.description || 'No description'}
                      </p>
                    )}
                  </div>

                  {/* Status, Priority, Due Date Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      {isEditing ? (
                        <p className="text-sm text-gray-500">
                          (Change status using the dropdown above)
                        </p>
                      ) : (
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="DONE">DONE</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      {isEditing ? (
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          disabled={isSaving}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Due Date
                      </label>
                      {isEditing ? (
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          disabled={isSaving}
                        />
                      ) : (
                        <p className="text-gray-900">{formatDate(task.dueDate)}</p>
                      )}
                    </div>
                  </div>

                  {/* Assignee */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Assignee
                    </label>
                    {isEditing ? (
                      <select
                        value={editAssigneeId}
                        onChange={(e) => setEditAssigneeId(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        disabled={isSaving || isLoadingMembers}
                      >
                        <option value="">Unassigned</option>
                        {members.map((membership) => (
                          <option key={membership.userId} value={membership.userId}>
                            {membership.user.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-gray-900">{getAssigneeName(task.assigneeId)}</p>
                    )}
                  </div>
                </div>

                {/* Edit Mode Actions */}
                {isEditing && (
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Comments</h2>

                {/* Comments List */}
                {isLoadingComments ? (
                  <div className="text-center py-6">
                    <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">Loading comments...</p>
                  </div>
                ) : commentsError ? (
                  <div className="mb-4 rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{commentsError}</p>
                  </div>
                ) : (
                  <div className="space-y-4 mb-6">
                    {comments.length > 0 ? (
                      comments.map((comment) => (
                        <div key={comment.id} className="border-l-4 border-blue-500 pl-4 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900">
                              {comment.author.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatCommentDate(comment.createdAt)}
                            </span>
                          </div>
                          <p className="text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No comments yet. Be the first to comment!
                      </p>
                    )}
                  </div>
                )}

                {/* Comment Form */}
                <form onSubmit={handlePostComment} className="mt-6">
                  <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
                    Add a comment
                  </label>
                  <textarea
                    id="comment"
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    rows={3}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Write your comment..."
                    disabled={isPostingComment}
                  />
                  
                  {commentError && (
                    <div className="mt-2 rounded-md bg-red-50 p-3">
                      <p className="text-sm text-red-800">{commentError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPostingComment || !newCommentBody.trim()}
                    className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPostingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </form>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

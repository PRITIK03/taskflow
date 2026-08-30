'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import NavBar from '@/components/NavBar';

export default function TaskBoardPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id;
  const { user, isLoading: authLoading, authedFetch } = useAuth();
  const { socket, isConnected, connectionEpoch } = useSocket();
  
  const [tasks, setTasks] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [error, setError] = useState('');
  
  // Filters and pagination
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Create task form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  
  // Status change error
  const [statusChangeError, setStatusChangeError] = useState('');
  
  // connectionEpoch < 2 means we haven't had a real reconnect yet:
  //   epoch 0 = never connected, epoch 1 = first connect (REST data already fetched).
  //   Only epoch >= 2 means a disconnect + reconnect happened and we need to recover.

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 when search changes
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (authLoading || !user) return;

    setIsLoadingTasks(true);
    setError('');

    try {
      const params = new URLSearchParams();
      
      // Design tradeoff: When statusFilter is 'All', we fetch without status filter
      // and display in a 3-column board layout (client-side grouping).
      // Pagination is only active when a specific status is selected (single-column view).
      // This is a deliberate choice: the backend's pagination is server-side and applies
      // to the entire filtered result set, not per-column. A true multi-column kanban
      // with per-column pagination would require either (a) 3 separate paginated fetches
      // (wasteful and complex), or (b) a specialized backend endpoint that returns
      // paginated data per status. Given the current backend scope, we use client-side
      // grouping for the 3-column view with a reasonable limit (100 tasks), and only
      // enable server-side pagination when viewing a single status filter.
      
      if (statusFilter !== 'All') {
        params.append('status', statusFilter);
        params.append('page', page.toString());
        params.append('limit', '20');
      } else {
        // 3-column view: fetch all statuses with higher limit, no pagination
        params.append('limit', '100');
      }
      
      if (priorityFilter !== 'All') {
        params.append('priority', priorityFilter);
      }
      
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const response = await authedFetch(`/api/projects/${projectId}/tasks?${params.toString()}`);
      
      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to load tasks');
        return;
      }

      const data = await response.json();
      setTasks(data.data);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError('Failed to load tasks');
    } finally {
      setIsLoadingTasks(false);
    }
  }, [authLoading, user, projectId, statusFilter, priorityFilter, debouncedSearch, sortBy, sortOrder, page, authedFetch, router]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket || !projectId) return;

    const handleTaskCreated = (task) => {
      if (task.projectId !== projectId) return;

      if (statusFilter === 'All') {
        // 3-column view: upsert directly
        setTasks((prevTasks) => {
          const existingIndex = prevTasks.findIndex(t => t.id === task.id);
          if (existingIndex >= 0) {
            const updated = [...prevTasks];
            updated[existingIndex] = task;
            return updated;
          } else {
            return [...prevTasks, task];
          }
        });
      } else {
        // Paginated view: silent refetch
        fetchTasks();
      }
    };

    const handleTaskUpdated = (task) => {
      if (task.projectId !== projectId) return;

      if (statusFilter === 'All') {
        // 3-column view: upsert directly
        setTasks((prevTasks) => {
          const existingIndex = prevTasks.findIndex(t => t.id === task.id);
          if (existingIndex >= 0) {
            const updated = [...prevTasks];
            updated[existingIndex] = task;
            return updated;
          } else {
            return [...prevTasks, task];
          }
        });
      } else {
        // Paginated view: silent refetch (handles status changes automatically)
        fetchTasks();
      }
    };

    const handleTaskDeleted = (data) => {
      const deletedId = data.taskId;

      if (statusFilter === 'All') {
        // 3-column view: remove directly
        setTasks((prevTasks) => prevTasks.filter(t => t.id !== deletedId));
      } else {
        // Paginated view: silent refetch
        fetchTasks();
      }
    };

    socket.on('task:created', handleTaskCreated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('task:deleted', handleTaskDeleted);

    return () => {
      socket.off('task:created', handleTaskCreated);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('task:deleted', handleTaskDeleted);
    };
  }, [socket, projectId, statusFilter, fetchTasks]);

  // Refetch on reconnect — skip initial connect (epoch 1), only fire on epoch >= 2
  useEffect(() => {
    if (connectionEpoch < 2) return;

    // Reconnected - silently refetch to recover missed events
    fetchTasks();
  }, [connectionEpoch, fetchTasks]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, sortBy, sortOrder]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      const body = {
        title: newTaskTitle,
        priority: newTaskPriority,
      };

      if (newTaskDescription) {
        body.description = newTaskDescription;
      }

      if (newTaskDueDate) {
        body.dueDate = newTaskDueDate;
      }

      const response = await authedFetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        setCreateError(data.error || 'Failed to create task');
        return;
      }

      // Clear form — socket event will update the board automatically
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('MEDIUM');
      setNewTaskDueDate('');
      setShowCreateForm(false);
    } catch (err) {
      setCreateError('Failed to create task');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
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

      // Socket event (task:updated) will update the board automatically
    } catch (err) {
      setStatusChangeError('Failed to update task status');
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
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Group tasks by status for 3-column view
  const groupedTasks = {
    TODO: tasks.filter(t => t.status === 'TODO'),
    IN_PROGRESS: tasks.filter(t => t.status === 'IN_PROGRESS'),
    DONE: tasks.filter(t => t.status === 'DONE'),
  };

  const renderTaskCard = (task) => (
    <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <Link href={`/projects/${projectId}/board/${task.id}`}>
        <h4 className="font-medium text-gray-900 mb-2 hover:text-blue-600 cursor-pointer">
          {task.title}
        </h4>
      </Link>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
            {task.priority}
          </span>
          
          {/* Status change dropdown */}
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(task.id, e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="DONE">DONE</option>
          </select>
        </div>
        
        <p className="text-sm text-gray-600">
          {task.assigneeId ? 'Assigned' : 'Unassigned'}
        </p>
        
        {task.dueDate && (
          <p className="text-xs text-gray-500">
            Due: {formatDate(task.dueDate)}
          </p>
        )}
      </div>
    </div>
  );

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
          {/* Back Link */}
          <Link href={`/projects/${projectId}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Project
          </Link>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Task Board</h1>
              
              {/* Connection Indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                <span className={`text-sm ${isConnected ? 'text-green-700' : 'text-yellow-700'}`}>
                  {isConnected ? 'Live' : 'Reconnecting...'}
                </span>
              </div>
            </div>
            
            {/* Create Task Button */}
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {showCreateForm ? 'Cancel' : 'Create Task'}
            </button>
          </div>

          {/* Create Task Form */}
          {showCreateForm && (
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">New Task</h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                    disabled={isCreating}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    rows={3}
                    disabled={isCreating}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
                      Priority
                    </label>
                    <select
                      id="priority"
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value)}
                      disabled={isCreating}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700">
                      Due Date
                    </label>
                    <input
                      type="date"
                      id="dueDate"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      disabled={isCreating}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-sm text-red-800">{createError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? 'Creating...' : 'Create Task'}
                </button>
              </form>
            </div>
          )}

          {/* Status Change Error */}
          {statusChangeError && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{statusChangeError}</p>
            </div>
          )}

          {/* Filters and Controls */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="All">All</option>
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="All">All</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="createdAt">Created</option>
                    <option value="priority">Priority</option>
                    <option value="dueDate">Due Date</option>
                  </select>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Loading State */}
          {isLoadingTasks ? (
            <div className="text-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-2 text-sm text-gray-600">Loading tasks...</p>
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          ) : statusFilter === 'All' ? (
            /* 3-Column Board View */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* TODO Column */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-gray-300">
                  TODO ({groupedTasks.TODO.length})
                </h3>
                <div className="space-y-3">
                  {groupedTasks.TODO.length > 0 ? (
                    groupedTasks.TODO.map(renderTaskCard)
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">No tasks</p>
                  )}
                </div>
              </div>

              {/* IN_PROGRESS Column */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-blue-500">
                  IN PROGRESS ({groupedTasks.IN_PROGRESS.length})
                </h3>
                <div className="space-y-3">
                  {groupedTasks.IN_PROGRESS.length > 0 ? (
                    groupedTasks.IN_PROGRESS.map(renderTaskCard)
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">No tasks</p>
                  )}
                </div>
              </div>

              {/* DONE Column */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-green-500">
                  DONE ({groupedTasks.DONE.length})
                </h3>
                <div className="space-y-3">
                  {groupedTasks.DONE.length > 0 ? (
                    groupedTasks.DONE.map(renderTaskCard)
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">No tasks</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Single-Column Paginated View */
            <>
              <div className="space-y-3 mb-6">
                {tasks.length > 0 ? (
                  tasks.map(renderTaskCard)
                ) : (
                  <div className="text-center py-12 bg-white shadow rounded-lg">
                    <p className="text-sm text-gray-500">No tasks found</p>
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

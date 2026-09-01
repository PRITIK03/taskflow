const prisma = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { emitTaskCreated, emitTaskUpdated, emitTaskDeleted } = require('../sockets/emitters');
const asyncHandler = require('../utils/asyncHandler');

const TASK_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'DONE']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);
const MAX_LIMIT = 100;

const parsePage = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
};

const parseLimit = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(MAX_LIMIT, Math.floor(n));
};

const parseDueDateInput = (value) => {
  if (value === null || value === '') {
    return { value: null };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: 'Invalid due date.' };
  }

  return { value: date };
};

const createTask = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const title = req.body.title?.trim();

  if (!title) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  if (req.body.priority !== undefined && !PRIORITIES.has(req.body.priority)) {
    return res.status(400).json({ error: 'Invalid priority.' });
  }

  let dueDate;
  if (req.body.dueDate !== undefined && req.body.dueDate !== null && req.body.dueDate !== '') {
    const parsed = parseDueDateInput(req.body.dueDate);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (parsed.value < new Date()) {
      return res.status(400).json({ error: 'Due date cannot be in the past.' });
    }
    dueDate = parsed.value;
  }

  if (req.body.assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.body.assigneeId,
        },
      },
    });

    if (!membership) {
      return res.status(400).json({ error: 'Assignee must be a member of this project.' });
    }
  }

  const task = await prisma.task.create({
    data: {
      projectId,
      title,
      description: req.body.description,
      priority: req.body.priority,
      dueDate,
      assigneeId: req.body.assigneeId || undefined,
      createdById: req.userId,
    },
  });

  await logActivity(
    projectId,
    req.userId,
    'TASK_CREATED',
    `Task "${title}" was created.`
  );

  emitTaskCreated(projectId, task);

  res.status(201).json(task);
});

const listTasks = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);
  const { status, priority, assigneeId, search } = req.query;

  if (status && !TASK_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  if (priority && !PRIORITIES.has(priority)) {
    return res.status(400).json({ error: 'Invalid priority.' });
  }

  const allowedSortFields = ['priority', 'dueDate', 'createdAt'];
  const sortBy = allowedSortFields.includes(req.query.sortBy)
    ? req.query.sortBy
    : 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

  const where = { projectId };

  if (status) {
    where.status = status;
  }

  if (priority) {
    where.priority = priority;
  }

  if (assigneeId) {
    where.assigneeId = assigneeId;
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  const [total, data] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

const getTask = asyncHandler(async (req, res) => {
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.taskId,
      projectId: req.params.id,
    },
  });

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  res.json(task);
});

const updateTask = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { taskId } = req.params;

  // Capture the current assignee BEFORE the update so we can detect
  // reassignment and send a personal notification to the new assignee.

  const existingTask = await prisma.task.findFirst({
    where: { id: taskId, projectId },
  });

  if (!existingTask) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  if (req.body.title !== undefined) {
    const title = req.body.title?.trim();
    if (!title) {
      return res.status(400).json({ error: 'Task title is required.' });
    }
  }

  if (req.body.priority !== undefined && !PRIORITIES.has(req.body.priority)) {
    return res.status(400).json({ error: 'Invalid priority.' });
  }

  if (req.body.status !== undefined && !TASK_STATUSES.has(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  if (req.body.assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.body.assigneeId,
        },
      },
    });

    if (!membership) {
      return res.status(400).json({ error: 'Assignee must be a member of this project.' });
    }
  }

  if (req.body.status === 'DONE') {
    // DEBUG — remove after confirming the fix
    console.log('[updateTask DONE check]', {
      reqUserId: req.userId,
      membershipRole: req.membership?.role,
      membershipProjectId: req.membership?.projectId,
      existingTaskAssigneeId: existingTask.assigneeId,
      existingTaskProjectId: existingTask.projectId,
      paramsId: req.params.id,
    });

    const canMarkDone =
      req.membership.role === 'OWNER' || existingTask.assigneeId === req.userId;

    if (!canMarkDone) {
      return res.status(403).json({
        error: 'Only the assignee or project owner can mark this task as Done.',
      });
    }
  }

  const data = {};

  if (req.body.title !== undefined) {
    data.title = req.body.title.trim();
  }

  if (req.body.description !== undefined) {
    data.description = req.body.description;
  }

  if (req.body.priority !== undefined) {
    data.priority = req.body.priority;
  }

  if (req.body.dueDate !== undefined) {
    const parsed = parseDueDateInput(req.body.dueDate);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    // Only reject past dates when actually setting a date (null = clearing it, which is fine)
    if (parsed.value !== null && parsed.value < new Date()) {
      return res.status(400).json({ error: 'Due date cannot be in the past.' });
    }
    data.dueDate = parsed.value;
  }

  if (req.body.assigneeId !== undefined) {
    data.assigneeId = req.body.assigneeId || null;
  }

  if (req.body.status !== undefined) {
    data.status = req.body.status;

    if (req.body.status === 'DONE' && existingTask.status !== 'DONE') {
      data.completedAt = new Date();
    } else if (req.body.status !== 'DONE' && existingTask.status === 'DONE') {
      data.completedAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return res.json(existingTask);
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
  });

  if (req.body.status !== undefined && req.body.status !== existingTask.status) {
    await logActivity(
      projectId,
      req.userId,
      'TASK_MOVED',
      `Task "${task.title}" was moved from ${existingTask.status} to ${req.body.status}.`
    );
  }

  const newAssigneeId = req.body.assigneeId !== undefined
    ? (req.body.assigneeId || null)
    : undefined;

  if (newAssigneeId !== undefined && newAssigneeId !== existingTask.assigneeId) {
    let message;

    if (newAssigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: newAssigneeId },
        select: { name: true },
      });
      message = `Task "${task.title}" was assigned to ${assignee.name}.`;
    } else {
      message = `Task "${task.title}" was unassigned.`;
    }

    await logActivity(projectId, req.userId, 'TASK_ASSIGNED', message);
  }

  emitTaskUpdated(projectId, task, existingTask.assigneeId);

  res.json(task);
});

const deleteTask = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.taskId,
      projectId: req.params.id,
    },
  });

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  // Only the project owner or the task creator may delete a task.
  const canDelete =
    req.membership.role === 'OWNER' || task.createdById === req.userId;

  if (!canDelete) {
    return res.status(403).json({
      error: 'Only the task creator or project owner can delete this task.',
    });
  }

  await prisma.task.delete({
    where: { id: req.params.taskId },
  });

  emitTaskDeleted(projectId, req.params.taskId);

  res.json({ message: 'Task deleted successfully.' });
});

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
};

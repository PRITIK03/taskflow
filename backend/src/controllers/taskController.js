const prisma = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

const createTask = async (req, res) => {
  const projectId = req.params.id;
  const title = req.body.title?.trim();

  if (!title) {
    return res.status(400).json({ error: 'Task title is required.' });
  }

  if (req.body.dueDate !== undefined && req.body.dueDate !== null) {
    const dueDate = new Date(req.body.dueDate);
    if (dueDate < new Date()) {
      return res.status(400).json({ error: 'Due date cannot be in the past.' });
    }
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
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
      assigneeId: req.body.assigneeId,
      createdById: req.userId,
    },
  });

  await logActivity(
    projectId,
    req.userId,
    'TASK_CREATED',
    `Task "${title}" was created.`
  );

  res.status(201).json(task);
};

const listTasks = async (req, res) => {
  const projectId = req.params.id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const { status, priority, assigneeId, search } = req.query;

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
};

const getTask = async (req, res) => {
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
};

const updateTask = async (req, res) => {
  const projectId = req.params.id;
  const { taskId } = req.params;

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
    data.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  }

  if (req.body.assigneeId !== undefined) {
    data.assigneeId = req.body.assigneeId;
  }

  if (req.body.status !== undefined) {
    data.status = req.body.status;

    if (req.body.status === 'DONE' && existingTask.status !== 'DONE') {
      data.completedAt = new Date();
    } else if (req.body.status !== 'DONE' && existingTask.status === 'DONE') {
      data.completedAt = null;
    }
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

  if (
    req.body.assigneeId !== undefined &&
    req.body.assigneeId !== existingTask.assigneeId
  ) {
    let message;

    if (req.body.assigneeId) {
      const assignee = await prisma.user.findUnique({
        where: { id: req.body.assigneeId },
        select: { name: true },
      });
      message = `Task "${task.title}" was assigned to ${assignee.name}.`;
    } else {
      message = `Task "${task.title}" was unassigned.`;
    }

    await logActivity(projectId, req.userId, 'TASK_ASSIGNED', message);
  }

  res.json(task);
};

const deleteTask = async (req, res) => {
  const task = await prisma.task.findFirst({
    where: {
      id: req.params.taskId,
      projectId: req.params.id,
    },
  });

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  await prisma.task.delete({
    where: { id: req.params.taskId },
  });

  res.json({ message: 'Task deleted successfully.' });
};

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
};

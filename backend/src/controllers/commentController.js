const prisma = require('../config/db');

const createComment = async (req, res) => {
  const projectId = req.params.id;
  const { taskId } = req.params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { title: true },
  });

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const body = req.body.body?.trim();

  if (!body) {
    return res.status(400).json({ error: 'Comment body is required.' });
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        taskId,
        authorId: req.userId,
        body,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await tx.activityLog.create({
      data: {
        projectId,
        actorId: req.userId,
        type: 'COMMENT_ADDED',
        message: `Comment added on task "${task.title}".`,
      },
    });

    return created;
  });

  res.status(201).json(comment);
};

const listComments = async (req, res) => {
  const projectId = req.params.id;
  const { taskId } = req.params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    select: { id: true },
  });

  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  res.json(comments);
};

module.exports = {
  createComment,
  listComments,
};

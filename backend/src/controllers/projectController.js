const prisma = require('../config/db');
const { logActivity } = require('../utils/activityLogger');

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

const createProject = async (req, res) => {
  const name = req.body.name?.trim();

  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  // Create project and owner membership atomically in a single transaction.
  // If either insert fails, both roll back — no partial data left behind.
  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name,
        ownerId: req.userId,
      },
    });

    await tx.membership.create({
      data: {
        projectId: project.id,
        userId: req.userId,
        role: 'OWNER',
      },
    });

    return project;
  });

  res.status(201).json(result);
};

const listMyProjects = async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.userId },
    include: { project: true },
  });

  const projects = memberships.map((m) => ({
    ...m.project,
    myRole: m.role,
  }));

  res.json(projects);
};

const getProject = async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
  });

  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  res.json({ ...project, myRole: req.membership.role });
};

const deleteProject = async (req, res) => {
  // onDelete: Cascade on Membership, Task, ActivityLog handles cleanup
  await prisma.project.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Project deleted successfully.' });
};

const inviteMember = async (req, res) => {
  const { email } = req.body;
  const projectId = req.params.id;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const userToInvite = await prisma.user.findUnique({ where: { email } });
  if (!userToInvite) {
    return res.status(404).json({ error: 'No registered user found with that email.' });
  }

  const existingMembership = await prisma.membership.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: userToInvite.id,
      },
    },
  });

  if (existingMembership) {
    return res.status(409).json({ error: 'This user is already a member of the project.' });
  }

  const membership = await prisma.membership.create({
    data: {
      projectId,
      userId: userToInvite.id,
      role: 'MEMBER',
    },
  });

  await logActivity(
    projectId,
    req.userId,
    'MEMBER_INVITED',
    `${userToInvite.name} was invited to the project.`
  );

  res.status(201).json(membership);
};

const listMembers = async (req, res) => {
  const memberships = await prisma.membership.findMany({
    where: { projectId: req.params.id },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  res.json(memberships);
};

const removeMember = async (req, res) => {
  const projectId = req.params.id;
  const { userId } = req.params;

  const membership = await prisma.membership.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
  });

  if (!membership) {
    return res.status(404).json({ error: 'This user is not a member of the project.' });
  }

  if (membership.role === 'OWNER') {
    return res.status(400).json({ error: 'The project owner cannot be removed.' });
  }

  await prisma.$transaction(async (tx) => {
    // Unassign tasks belonging to this project that were assigned to the removed user
    await tx.task.updateMany({
      where: { projectId, assigneeId: userId },
      data: { assigneeId: null },
    });

    await tx.membership.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  });

  await logActivity(
    projectId,
    req.userId,
    'MEMBER_REMOVED',
    `A member was removed from the project.`
  );

  res.json({ message: 'Member removed successfully.' });
};

const listActivity = async (req, res) => {
  const projectId = req.params.id;
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const where = { projectId };

  const [total, data] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: {
          select: { name: true },
        },
      },
    }),
  ]);

  res.json({
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
};

module.exports = {
  createProject,
  listMyProjects,
  getProject,
  deleteProject,
  inviteMember,
  listMembers,
  removeMember,
  listActivity,
};

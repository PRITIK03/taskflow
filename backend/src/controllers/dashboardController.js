const prisma = require('../config/db');

const getDashboard = async (req, res) => {
  // "This week" = Monday 00:00 (server-local time) through now, not a rolling 7-day window,
  // since that matches how most people read a weekly dashboard stat.
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysFromMonday);
  startOfWeek.setHours(0, 0, 0, 0);

  const [membershipRows, projectCount, tasksByStatusRaw, completedThisWeek] =
    await Promise.all([
      prisma.membership.findMany({
        where: { userId: req.userId },
        select: { projectId: true },
      }),
      prisma.membership.count({ where: { userId: req.userId } }),
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: req.userId },
        _count: { status: true },
      }),
      prisma.task.count({
        where: {
          assigneeId: req.userId,
          status: 'DONE',
          completedAt: { gte: startOfWeek },
        },
      }),
    ]);

  const projectIds = membershipRows.map((m) => m.projectId);

  const tasksByStatus = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const row of tasksByStatusRaw) {
    tasksByStatus[row.status] = row._count.status;
  }

  const [busiestProjectRaw, recentActivity] = await Promise.all([
    prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projectIds }, status: { not: 'DONE' } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
    prisma.activityLog.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        actor: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
  ]);

  let busiestProject = null;
  if (busiestProjectRaw.length > 0) {
    const project = await prisma.project.findUnique({
      where: { id: busiestProjectRaw[0].projectId },
      select: { name: true },
    });
    busiestProject = {
      id: busiestProjectRaw[0].projectId,
      name: project.name,
      openTaskCount: busiestProjectRaw[0]._count.id,
    };
  }

  res.json({
    projectCount,
    tasksByStatus,
    completedThisWeek,
    busiestProject,
    recentActivity,
  });
};

module.exports = { getDashboard };

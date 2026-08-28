const prisma = require('../config/db');

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

const getAssignedToMe = async (req, res) => {
  const page = parsePage(req.query.page);
  const limit = parseLimit(req.query.limit);

  const where = { assigneeId: req.userId };

  const [total, data] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        project: {
          select: { id: true, name: true },
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

module.exports = { getAssignedToMe };

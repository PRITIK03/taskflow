const prisma = require('../config/db');

// Verifies the authenticated user is a member of the project.
// Attaches the Membership row to req.membership for downstream handlers.
const requireProjectMembership = async (req, res, next) => {
  const projectId = req.params.id;

  const membership = await prisma.membership.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: req.userId,
      },
    },
  });

  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this project.' });
  }

  req.membership = membership;
  next();
};

// Must run after requireProjectMembership.
// Rejects non-owners before the route handler runs.
const requireProjectOwner = (req, res, next) => {
  if (req.membership.role !== 'OWNER') {
    return res.status(403).json({ error: 'Only the project owner can perform this action.' });
  }
  next();
};

module.exports = { requireProjectMembership, requireProjectOwner };

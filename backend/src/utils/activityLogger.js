const prisma = require('../config/db');

const logActivity = async (projectId, actorId, type, message) => {
  await prisma.activityLog.create({
    data: { projectId, actorId, type, message },
  });
};

module.exports = { logActivity };

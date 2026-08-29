// The ONLY file controllers ever import for socket-related work.
// Each function is a thin wrapper: get io, emit to the right room(s), done.
// No DB calls, no business logic — that stays in the controllers.

const { getIO, getUserSocketIds } = require('./socketRegistry');

const emitTaskCreated = (projectId, task) => {
  const io = getIO();
  if (!io) return;

  io.to(`project:${projectId}`).emit('task:created', task);
};

const emitTaskUpdated = (projectId, task, previousAssigneeId) => {
  const io = getIO();
  if (!io) return;

  io.to(`project:${projectId}`).emit('task:updated', task);

  // If the task was just assigned to someone new, send them a personal
  // notification-style event so they see it even if they're not currently
  // viewing that project's board.
  if (task.assigneeId && task.assigneeId !== previousAssigneeId) {
    io.to(`user:${task.assigneeId}`).emit('task:assigned-to-you', task);
  }
};

const emitTaskDeleted = (projectId, taskId) => {
  const io = getIO();
  if (!io) return;

  io.to(`project:${projectId}`).emit('task:deleted', { taskId });
};

const emitCommentAdded = (projectId, comment) => {
  const io = getIO();
  if (!io) return;

  io.to(`project:${projectId}`).emit('comment:added', comment);
};

const emitMemberInvited = (projectId, membership) => {
  const io = getIO();
  if (!io) return;

  io.to(`project:${projectId}`).emit('member:invited', membership);

  // If the invited user is already connected (e.g. browsing other projects or dashboard),
  // join all of their currently connected sockets to this new project's room immediately
  // so they receive live updates without needing to reconnect.
  const socketIds = getUserSocketIds(membership.userId);
  for (const socketId of socketIds) {
    io.sockets.sockets.get(socketId)?.join(`project:${projectId}`);
  }
};

const emitMemberRemoved = (projectId, userId) => {
  const io = getIO();
  if (!io) return;

  // Notify everyone in the project that a member was removed
  io.to(`project:${projectId}`).emit('member:removed', { userId });

  // Forcibly evict the removed user's socket(s) from this project's room.
  // REST access is re-checked on every request so it blocks instantly,
  // but an already-open socket connection stays in a room until something
  // explicitly removes it. Without this step a removed member would keep
  // receiving live updates for a project they no longer have access to.
  const socketIds = getUserSocketIds(userId);
  for (const socketId of socketIds) {
    io.sockets.sockets.get(socketId)?.leave(`project:${projectId}`);
  }
};

module.exports = {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitCommentAdded,
  emitMemberInvited,
  emitMemberRemoved,
};

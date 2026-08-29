// Tiny in-memory store for the Socket.io instance and per-user socket tracking.
// No external dependencies — just a Map and a Set.

let ioInstance = null;

// userId -> Set of socket.id strings.
// A user can have multiple tabs/devices connected at once,
// so we track ALL of their socket ids, not just the latest one.
let userSockets = new Map();

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => {
  return ioInstance;
};

const addUserSocket = (userId, socketId) => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socketId);
};

const removeUserSocket = (userId, socketId) => {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(socketId);

  // Clean up the Map entry entirely when a user has no remaining connections.
  // Prevents the Map from growing unboundedly over time.
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
};

const getUserSocketIds = (userId) => {
  return userSockets.get(userId) || new Set();
};

module.exports = { setIO, getIO, addUserSocket, removeUserSocket, getUserSocketIds };

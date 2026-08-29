const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { setIO, addUserSocket, removeUserSocket } = require('./socketRegistry');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      // Wildcard '*' cannot be combined with credentials: true per CORS specification.
      // Defaults to local Next.js dev server and should be configured via FRONTEND_URL env var in production.
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  // Store the io instance globally so emitters.js can access it
  // without needing a direct reference passed around.
  setIO(io);

  // --- Socket authentication middleware ---
  // Mirrors authMiddleware.js's error philosophy: one generic error
  // for missing, invalid, OR expired tokens so the client handles
  // all failures the same way (re-authenticate).
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Invalid or expired access token.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired access token.'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      // Room membership is decided by the SERVER querying the database
      // fresh on every connection, never trusted from the client.
      // This prevents a user from joining rooms they don't belong to
      // by simply sending a crafted event.
      const memberships = await prisma.membership.findMany({
        where: { userId: socket.userId },
        select: { projectId: true },
      });

      for (const { projectId } of memberships) {
        socket.join(`project:${projectId}`);
      }

      // Personal room for cross-project events like "assigned to me" notifications.
      // Any event targeting this specific user (regardless of project) goes here.
      socket.join(`user:${socket.userId}`);

      addUserSocket(socket.userId, socket.id);

      socket.on('disconnect', () => {
        removeUserSocket(socket.userId, socket.id);
      });
    } catch (err) {
      // If the DB query fails (connection drop, timeout, etc.), don't leave
      // this socket in a half-initialized state where it's connected but in
      // no rooms — that's silently broken. Disconnect so the client can retry.
      console.error(`Socket connection setup failed for user ${socket.userId}:`, err);
      socket.disconnect(true);
    }
  });
};

module.exports = initSocket;

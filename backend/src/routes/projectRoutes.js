const express = require('express');
const router = express.Router();
const {
  createProject,
  listMyProjects,
  getProject,
  deleteProject,
  inviteMember,
  listMembers,
  removeMember,
} = require('../controllers/projectController');
const authenticateToken = require('../middleware/authMiddleware');
const { requireProjectMembership, requireProjectOwner } = require('../middleware/projectMiddleware');
const taskRoutes = require('./taskRoutes');

// Every route below requires a valid access token
router.use(authenticateToken);

router.post('/', createProject);
router.get('/', listMyProjects);
router.get('/:id', requireProjectMembership, getProject);
router.delete('/:id', requireProjectMembership, requireProjectOwner, deleteProject);
router.post('/:id/members', requireProjectMembership, requireProjectOwner, inviteMember);
router.get('/:id/members', requireProjectMembership, listMembers);
router.delete('/:id/members/:userId', requireProjectMembership, requireProjectOwner, removeMember);
router.use('/:id/tasks', requireProjectMembership, taskRoutes);

module.exports = router;

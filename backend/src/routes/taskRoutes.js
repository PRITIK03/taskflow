const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
} = require('../controllers/taskController');

router.get('/', listTasks);
router.post('/', createTask);
router.get('/:taskId', getTask);
router.patch('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

const commentRoutes = require('./commentRoutes');
router.use('/:taskId/comments', commentRoutes);

module.exports = router;

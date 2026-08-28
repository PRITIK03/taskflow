const express = require('express');
const router = express.Router();
const { getAssignedToMe } = require('../controllers/myTasksController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.get('/assigned-to-me', getAssignedToMe);

module.exports = router;

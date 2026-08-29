const express = require('express');
const router = express.Router();
const { getDashboard } = require('../controllers/dashboardController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken);
router.get('/', getDashboard);

module.exports = router;

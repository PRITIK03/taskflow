const express = require('express');
const router = express.Router({ mergeParams: true });
const { createComment, listComments } = require('../controllers/commentController');

router.get('/', listComments);
router.post('/', createComment);

module.exports = router;

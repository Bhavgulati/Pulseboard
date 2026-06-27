const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { 
  addComment, 
  getTaskComments, 
  editComment, 
  deleteComment 
} = require('../controllers/commentController');

router.use(authenticate);

router.post('/', addComment);
router.get('/task/:taskId', getTaskComments);
router.patch('/:id', editComment);
router.delete('/:id', deleteComment);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { 
  createWorkspace, 
  getMyWorkspaces, 
  getWorkspace,
  inviteMember,
  generateInviteLink,
  joinViaInviteLink
} = require('../controllers/workspaceController');


// All routes protected
router.use(authenticate);

router.post('/', createWorkspace);
router.get('/', getMyWorkspaces);
router.get('/:id', getWorkspace);
router.post('/:id/invite', inviteMember);
router.post('/:id/invite-link', generateInviteLink);
router.post('/join/:token', joinViaInviteLink);
module.exports = router;


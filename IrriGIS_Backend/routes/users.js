const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  getIrrigatorAssociations
} = require('../controllers/userController');

// Configure multer to handle FormData (memory storage for non-file fields)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  }
});

router.get('/ias', getIrrigatorAssociations);

router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

router.get('/', authenticate, authorize('nia_admin'), getAllUsers);

router.get('/:id', authenticate, getUserById);

router.post('/', authenticate, authorize('nia_admin'), createUser);

router.put('/:id', authenticate, upload.none(), updateUser);

router.delete('/:id', authenticate, authorize('nia_admin'), deleteUser);

router.put('/:id/password', authenticate, authorize('nia_admin'), resetPassword);

module.exports = router;

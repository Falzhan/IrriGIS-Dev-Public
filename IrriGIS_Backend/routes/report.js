const router = require('express').Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');
const { upload } = require('../middleware/supabaseUpload'); 

// Create report (authenticated users) - audit in controller after creation
// Uses 'images' as the form-data key. Allows max 5 files.
router.post(
  '/',
  authenticate,
  upload.array('images', 5),
  reportController.createReport
);

// Get all reports (authenticated users) - no audit for collection GET
router.get('/', authenticate, reportController.getAllReports);

// Get single report (authenticated users) - audit individual resource access
router.get('/:id', authenticate, auditMiddleware('reports'), reportController.getReport);

// Update report (authenticated users) - supports adding new images
router.put(
  '/:id',
  authenticate,
  upload.array('images', 5),
  auditMiddleware('reports'),
  reportController.updateReport
);

// Delete report (nia_admin only)
router.delete(
  '/:id',
  authenticate,
  authorize('nia_admin'),
  auditMiddleware('reports'),
  reportController.deleteReport
);

module.exports = router;

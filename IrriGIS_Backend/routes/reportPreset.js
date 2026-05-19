const router = require('express').Router();
const reportPresetController = require('../controllers/reportPresetController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/by-category', authenticate, reportPresetController.getPresetsByCategory);

router.get('/categories', authenticate, reportPresetController.getCategories);

router.get('/', authenticate, reportPresetController.getAllPresets);

router.get('/:id', authenticate, reportPresetController.getPresetById);

router.post('/', authenticate, authorize('nia_admin'), reportPresetController.createPreset);

router.put('/:id', authenticate, authorize('nia_admin'), reportPresetController.updatePreset);

router.delete('/:id', authenticate, authorize('nia_admin'), reportPresetController.deletePreset);

module.exports = router;
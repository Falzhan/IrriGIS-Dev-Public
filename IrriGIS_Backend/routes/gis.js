const router = require('express').Router();
const gisController = require('../controllers/gisController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/reports', authenticate, gisController.getReportsGeoJSON);

router.get('/features', authenticate, gisController.getFeaturesGeoJSON);
router.get('/features/:id', authenticate, gisController.getGISFeatureById);
router.post('/features', authenticate, authorize('nia_admin'), gisController.createGISFeature);
router.put('/features/:id', authenticate, authorize('nia_admin'), gisController.updateGISFeature);
router.delete('/features/:id', authenticate, authorize('nia_admin'), gisController.deleteGISFeature);

router.get('/ris', gisController.getRISList);
router.get('/ris/:id', authenticate, gisController.getRISById);

router.get('/stats', authenticate, authorize('nia_admin', 'nia_field_officer'), gisController.getStats);

router.get('/ias', gisController.getIAList);
router.get('/ias/geojson', authenticate, gisController.getIAGeoJSON);
router.get('/ias/:id', authenticate, gisController.getIAById);
router.post('/ias', authenticate, authorize('nia_admin'), gisController.createIA);
router.put('/ias/:id', authenticate, authorize('nia_admin'), gisController.updateIA);
router.delete('/ias/:id', authenticate, authorize('nia_admin'), gisController.deleteIA);

module.exports = router;

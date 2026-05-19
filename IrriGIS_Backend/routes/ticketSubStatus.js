const router = require('express').Router();
const ticketSubStatusController = require('../controllers/ticketSubStatusController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, ticketSubStatusController.getAllSubStatuses);

router.get('/for-ticket', authenticate, ticketSubStatusController.getSubStatusesForTicket);

router.get('/:id', authenticate, ticketSubStatusController.getSubStatusById);

router.post('/', authenticate, authorize('nia_admin'), ticketSubStatusController.createSubStatus);

router.put('/:id', authenticate, authorize('nia_admin'), ticketSubStatusController.updateSubStatus);

router.delete('/:id', authenticate, authorize('nia_admin'), ticketSubStatusController.deleteSubStatus);

module.exports = router;
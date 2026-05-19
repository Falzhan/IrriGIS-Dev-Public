const router = require('express').Router();
const ticketController = require('../controllers/ticketController');
const { authenticate, authorize } = require('../middleware/auth');
const auditMiddleware = require('../middleware/audit');

// Get all tickets (authenticated users) - no audit for collection GET
router.get('/', authenticate, ticketController.getAllTickets);

// Get single ticket (authenticated users) - audit individual resource access
router.get('/:id', authenticate, auditMiddleware('tickets'), ticketController.getTicketById);

// Create ticket manually (NIA admin only)
router.post(
  '/',
  authenticate,
  authorize('nia_admin'),
  ticketController.createTicket
);

// Update ticket status/assignment (authenticated users)
router.put(
  '/:id',
  authenticate,
  auditMiddleware('tickets'),
  ticketController.updateTicket
);

// Add comment to ticket (authenticated users)
router.post(
  '/:id/comments',
  authenticate,
  auditMiddleware('tickets'),
  ticketController.addComment
);

// Delete ticket (NIA admin only)
router.delete(
  '/:id',
  authenticate,
  authorize('nia_admin'),
  auditMiddleware('tickets'),
  ticketController.deleteTicket
);

module.exports = router;

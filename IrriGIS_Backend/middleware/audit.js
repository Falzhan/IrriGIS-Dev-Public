const { AuditLog } = require('../models');

const auditMiddleware = (tableName) => async (req, res, next) => {
  const actions = {
    GET: 'READ',
    POST: 'CREATE',
    PUT: 'UPDATE',
    PATCH: 'UPDATE',
    DELETE: 'DELETE'
  };
  
  try {
    // Only audit requests that have a record ID (individual resource operations)
    // Skip if no ID is present (e.g., collection GET or POST before creation)
    if (!req.params.id) {
      return next();
    }
    
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);
    
    await AuditLog.create({
      userId: req.user?.id || null,
      action: actions[req.method] || 'OTHER',
      tableName,
      recordId: req.params.id,
      oldData: req.method === 'PUT' ? req.previousState : null,
      newData: hasBody ? req.body : null
    });
    next();
  } catch (error) {
    console.error('Audit logging failed:', error);
    next(error);
  }
};

module.exports = auditMiddleware;

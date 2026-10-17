const express = require('express');
const router = express.Router();

const auditLogController = require('../controllers/auditLogController');
const { authenticate, authenticateOrApiKey, requireRole } = require('../middlewares/auth');

// Registrar: JWT de usuario o clave de servicio (x-api-key) de la API principal
router.post('/', authenticateOrApiKey, auditLogController.postAuditLog);

// A partir de aquí: solo usuarios con JWT
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'RECTOR'), auditLogController.getAuditLogs);
router.get('/:id', requireRole('ADMIN', 'RECTOR'), auditLogController.getAuditLogById);
router.put('/:id/deactivate', requireRole('ADMIN'), auditLogController.deactivateAuditLog);

module.exports = router;

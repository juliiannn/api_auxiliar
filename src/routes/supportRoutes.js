const express = require('express');
const router = express.Router();

const supportController = require('../controllers/supportController');
const { authenticate, requireRole } = require('../middlewares/auth');

const STAFF = ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER'];
const CREATORS = ['ADMIN', 'COORDINATOR', 'TEACHER'];

router.use(authenticate);

router.post('/', requireRole(...CREATORS), supportController.postSupport);
router.get('/', requireRole(...STAFF), supportController.getSupports);
router.get('/me', requireRole('STUDENT'), supportController.getMySupports); // antes de /:id
router.get('/:id', supportController.getSupportById);
router.put('/:id', requireRole(...CREATORS), supportController.putSupport);
router.put('/:id/deactivate', requireRole(...CREATORS), supportController.deactivateSupport);

module.exports = router;

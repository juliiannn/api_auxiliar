const express = require('express');
const router = express.Router();

const pictogramController = require('../controllers/pictogramController');
const { authenticate, requireRole } = require('../middlewares/auth');

const CREATORS = ['ADMIN', 'COORDINATOR', 'TEACHER'];

router.use(authenticate);

router.get('/search', requireRole(...CREATORS), pictogramController.searchPictograms);
router.get('/', requireRole(...CREATORS), pictogramController.getPictograms);
router.get('/:id', requireRole(...CREATORS), pictogramController.getPictogramById);
router.put('/:id/deactivate', requireRole('ADMIN'), pictogramController.deactivatePictogram);

module.exports = router;

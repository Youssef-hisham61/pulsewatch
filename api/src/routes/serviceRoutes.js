const { Router } = require('express');
const serviceController = require('../controllers/serviceController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = Router();

// All service routes require a valid JWT
router.use(authenticate);

router.get('/',       authorize('admin', 'developer', 'viewer'), serviceController.listServices);
router.post('/',      authorize('admin'),                         serviceController.addService);
router.delete('/:id', authorize('admin'),                         serviceController.deleteService);
router.get('/:id/results', authorize('admin', 'developer', 'viewer'), serviceController.getServiceResults);

module.exports = router;

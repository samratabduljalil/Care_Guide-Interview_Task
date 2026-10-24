const router = require('express').Router();
const c = require('../controllers/settings.controller');

router.get('/', c.get);
router.put('/', c.update);
router.post('/test-email', c.testEmail);
router.post('/send-report', c.sendReport);
router.get('/email-log', c.emailLog);

module.exports = router;

const router = require('express').Router();

router.use('/monitor', require('./monitor.routes'));
router.use('/alerts', require('./alerts.routes'));

module.exports = router;

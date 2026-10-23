const router = require('express').Router();
const { list, resolve } = require('../controllers/alerts.controller');

router.get('/', list);
router.patch('/:id/resolve', resolve);

module.exports = router;

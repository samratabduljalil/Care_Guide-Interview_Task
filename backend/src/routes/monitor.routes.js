const router = require('express').Router();
const validate = require('../middlewares/validate');
const { monitor } = require('../controllers/monitor.controller');

router.post('/', validate, monitor);

module.exports = router;

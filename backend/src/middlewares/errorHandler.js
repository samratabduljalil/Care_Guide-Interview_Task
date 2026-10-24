const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  const isBadJson = err.type === 'entity.parse.failed';
  if (isBadJson || err.expose) logger.warn(`${req.method} ${req.originalUrl} -> ${err.message}`);
  else logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);

  res.status(isBadJson ? 400 : err.status || 500).json({
    success: false,
    error: isBadJson ? 'Invalid JSON body' : err.expose ? err.message : 'Internal server error',
    ...(err.errors ? { errors: err.errors } : {}),
  });
};

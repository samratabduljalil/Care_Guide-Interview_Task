const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  const isBadJson = err.type === 'entity.parse.failed';
  if (isBadJson) logger.warn(`${req.method} ${req.originalUrl} -> invalid JSON body`);
  else logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  res.status(isBadJson ? 400 : err.status || 500).json({
    success: false,
    error: isBadJson ? 'Invalid JSON body' : 'Internal server error',
  });
};

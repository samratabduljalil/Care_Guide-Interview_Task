const { port } = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

(async () => {
  await connectDB();
  app.listen(port, () => logger.info(`Server running at http://localhost:${port}`));
})();

process.on('unhandledRejection', (e) => logger.error(`Unhandled rejection: ${e}`));

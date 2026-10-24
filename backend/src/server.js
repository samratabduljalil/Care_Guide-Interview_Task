const { port } = require('./config/env');
const { connectDB } = require('./config/db');
const settingsService = require('./services/settings.service');
const scheduler = require('./services/scheduler.service');
const app = require('./app');
const logger = require('./utils/logger');

(async () => {
  await connectDB();
  await settingsService.init();   // creates settings tables, loads dashboard settings
  scheduler.start();              // periodic status report
  app.listen(port, () => logger.info(`Server running at http://localhost:${port}`));
})().catch((err) => { logger.error(`Startup failed: ${err.stack}`); process.exit(1); });

process.on('unhandledRejection', (e) => logger.error(`Unhandled rejection: ${e}`));

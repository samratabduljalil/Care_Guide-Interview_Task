require('dotenv').config();

const port = process.env.PORT || 5000;

module.exports = {
  port,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/api_monitor',
  dashboardUrl: process.env.DASHBOARD_URL || `http://localhost:${port}`,
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  schedulerTickMs: Number(process.env.SCHEDULER_TICK_MS) || 60000,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    defaultTo: (process.env.EMAIL_TO || '').split(/[,;\s]+/).filter(Boolean),
  },
};

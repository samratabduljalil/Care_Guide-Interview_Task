require('./env'); // make sure .env is loaded first

module.exports = {
  latencyWarningMs: Number(process.env.LATENCY_WARNING_MS) || 2000,
  latencyCriticalMs: Number(process.env.LATENCY_CRITICAL_MS) || 4000,
  minRecords: 1, // fewer than this = "zero_records"
};

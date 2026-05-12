/** Central runtime configuration (env-backed). */
module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  get fullChartRows() {
    return process.env.FULL_CHART_ROWS ? Number(process.env.FULL_CHART_ROWS) : 10000;
  },
};

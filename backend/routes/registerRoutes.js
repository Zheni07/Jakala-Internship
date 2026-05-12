'use strict';

/**
 * Registers all authenticated API routes (after workspace + DB gate middleware).
 * Domain modules keep related endpoints together.
 */
module.exports = function registerRoutes(app) {
  require('./datasetsAndAi')(app);
  require('./stagingLayer')(app);
  require('./curatedLayer')(app);
  require('./martsLayer')(app);
  require('./perfLayer')(app);
};

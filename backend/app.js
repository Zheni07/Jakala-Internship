const express = require('express');
const cors = require('cors');
const workspace = require('./workspace');
const auth = require('./auth');
const createUploadMiddleware = require('./middleware/upload');
const {
  publicAuthPath,
  resolveDbSlot,
  requireUploadedSqlite,
  canUseAppWithoutDatabase,
} = require('./middleware/workspaceGate');

const registerAuthPublicRoutes = require('./routes/authPublic');
const registerAuthSessionRoutes = require('./routes/authSession');
const registerRoutes = require('./routes/registerRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  const upload = createUploadMiddleware();

  app.use(cors());
  app.use(express.json());

  registerAuthPublicRoutes(app);

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS' || publicAuthPath(req)) return next();
    return auth.authMiddleware(req, res, (err) => {
      if (err) return next(err);
      req.dbSlot = resolveDbSlot(req);
      workspace.ensureNewUserWorkspace(req.user.id, req.dbSlot);
      next();
    });
  });

  registerAuthSessionRoutes(app, { upload });

  app.use((req, res, next) => {
    if (canUseAppWithoutDatabase(req)) return next();
    return requireUploadedSqlite(req, res, next);
  });

  app.use('/performance-reports', (req, res, next) => {
    const d = workspace.dirs(req.user.id, req.dbSlot);
    express.static(d.PERF_DIR)(req, res, next);
  });

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

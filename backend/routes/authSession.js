const path = require('path');
const fs = require('fs');
const workspace = require('../workspace');
const { Http } = require('../lib/http');

module.exports = function registerAuthSessionRoutes(app, { upload }) {
  app.get('/auth/me', (req, res) => {
    const dbSlots = workspace.DB_SLOTS.reduce((acc, slot) => {
      acc[slot] = { hasDatabase: workspace.userHasDatabase(req.user.id, slot) };
      return acc;
    }, {});
    res.json({
      user: req.user,
      dbSlots,
      activeDbSlot: req.dbSlot,
      hasDatabase: workspace.userHasDatabase(req.user.id, req.dbSlot),
    });
  });

  function uploadDatabaseHandler(req, res) {
    if (!req.file) return Http.badRequest(res, 'No file uploaded (field name: database)');
    const slot = workspace.normalizeDbSlot(req.params.slot || req.dbSlot || 'db1');
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.sqlite', '.db', '.sqlite3'].includes(ext)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        /* ignore */
      }
      return Http.badRequest(res, 'Only SQLite files (.sqlite, .db) are allowed');
    }
    try {
      workspace.ensureNewUserWorkspace(req.user.id, slot);
      workspace.resetUserModels(req.user.id, slot);
      const dest = workspace.userDbPath(req.user.id, slot);
      fs.copyFileSync(req.file.path, dest);
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        /* ignore */
      }
      res.json({ success: true, slot, path: 'database.sqlite' });
    } catch (e) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        /* ignore */
      }
      Http.serverError(res, e.message || 'Upload failed');
    }
  }

  app.post('/auth/upload-database', upload.single('database'), uploadDatabaseHandler);
  app.post('/auth/upload-database/:slot', upload.single('database'), uploadDatabaseHandler);
};

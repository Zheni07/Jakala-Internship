const workspace = require('../workspace');
const auth = require('../auth');
const { Http } = require('../lib/http');
const { validateAuthPayload } = require('../lib/validation');

module.exports = function registerAuthPublicRoutes(app) {
  app.post('/auth/register', async (req, res) => {
    try {
      const { email, password } = validateAuthPayload(req.body, { requireMinPassword: true });
      const user = await auth.createUser(email, password);
      workspace.ensureUserWorkspaces(user.id);
      const token = auth.signToken(user);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      if (e?.status === 400) {
        return Http.badRequest(res, e.message, e.details ? { details: e.details } : undefined);
      }
      if (String(e.message).includes('UNIQUE')) {
        return Http.conflict(res, 'Email already registered');
      }
      Http.serverError(res, e.message || 'Registration failed');
    }
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = validateAuthPayload(req.body);
      const user = await auth.verifyLogin(email, password);
      if (!user) return Http.unauthorized(res, 'Invalid email or password');
      workspace.ensureUserWorkspaces(user.id);
      const token = auth.signToken(user);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      if (e?.status === 400) {
        return Http.badRequest(res, e.message, e.details ? { details: e.details } : undefined);
      }
      Http.serverError(res, e.message || 'Login failed');
    }
  });
};

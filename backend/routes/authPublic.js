const workspace = require('../workspace');
const auth = require('../auth');
const { Http } = require('../lib/http');

module.exports = function registerAuthPublicRoutes(app) {
  app.post('/auth/register', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return Http.badRequest(res, 'Email and password required');
      if (String(password).length < 6) return Http.badRequest(res, 'Password must be at least 6 characters');
      const user = await auth.createUser(email, password);
      workspace.ensureUserWorkspaces(user.id);
      const token = auth.signToken(user);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return Http.conflict(res, 'Email already registered');
      }
      Http.serverError(res, e.message || 'Registration failed');
    }
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return Http.badRequest(res, 'Email and password required');
      const user = await auth.verifyLogin(email, password);
      if (!user) return Http.unauthorized(res, 'Invalid email or password');
      workspace.ensureUserWorkspaces(user.id);
      const token = auth.signToken(user);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      Http.serverError(res, e.message || 'Login failed');
    }
  });
};

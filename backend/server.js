require('dotenv').config();

const auth = require('./auth');
const config = require('./config');
const { createApp } = require('./app');

auth.initAuthDb();

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

process.on('SIGINT', () => {
  process.exit(0);
});

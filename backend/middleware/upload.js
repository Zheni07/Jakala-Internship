const path = require('path');
const fs = require('fs');
const multer = require('multer');

function createUploadMiddleware() {
  const uploadTmp = path.join(__dirname, '..', 'data', 'tmp');
  fs.mkdirSync(uploadTmp, { recursive: true });
  return multer({ dest: uploadTmp, limits: { fileSize: 120 * 1024 * 1024 } });
}

module.exports = createUploadMiddleware;

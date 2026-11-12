const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/config');
const AppError = require('../utils/AppError');

const CERTIFICATE_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
// SVG is deliberately excluded: it can carry script and the logo is served from our own origin.
const LOGO_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const dirFor = (subdir) => {
  const dir = path.join(config.UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * Disk uploader for one file. The stored name is random and its extension comes from the
 * accepted MIME type, never from the client's file name.
 */
function singleFile({ field, subdir, types, maxMb, label }) {
  const uploader = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dirFor(subdir)),
      filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${types[file.mimetype]}`)
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (types[file.mimetype]) return cb(null, true);
      const allowed = Object.values(types).map((e) => e.slice(1).toUpperCase()).join(', ');
      cb(AppError.badRequest(`${label} must be one of: ${allowed}`, 'INVALID_FILE_TYPE'));
    }
  }).single(field);

  return (req, res, next) =>
    uploader(req, res, async (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(AppError.badRequest(`${label} must be ${maxMb} MB or smaller`, 'FILE_TOO_LARGE'));
      if (err?.code === 'LIMIT_UNEXPECTED_FILE') return next(AppError.badRequest(`Unexpected file field. Use "${field}".`, 'UNEXPECTED_FILE'));
      if (err) return next(err);
      // The declared MIME type comes from the client; check the file really starts like one.
      if (req.file && !(await contentMatches(req.file.path, req.file.mimetype))) {
        return next(AppError.badRequest(`${label} content does not match its file type`, 'INVALID_FILE_CONTENT'));
      }
      next();
    });
}

const SIGNATURES = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
};

async function contentMatches(filePath, mimeType) {
  const check = SIGNATURES[mimeType];
  if (!check) return false;
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return bytesRead >= 4 && check(buffer);
  } finally {
    await handle.close();
  }
}

const removeFile = (filePath) => {
  if (filePath) fs.promises.unlink(filePath).catch(() => {});
};

module.exports = {
  certificateUpload: singleFile({ field: 'certificate', subdir: 'certificates', types: CERTIFICATE_TYPES, maxMb: 5, label: 'Certificate' }),
  logoUpload: singleFile({ field: 'logo', subdir: 'branding', types: LOGO_TYPES, maxMb: 2, label: 'Logo' }),
  photoUpload: singleFile({ field: 'photo', subdir: 'photos', types: LOGO_TYPES, maxMb: 2, label: 'Photo' }),
  removeFile
};

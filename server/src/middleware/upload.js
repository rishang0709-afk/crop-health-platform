/**
 * upload.js
 *
 * Multer upload middleware for handling multipart/form-data crop image uploads.
 *
 * Design & Security decisions:
 *  - Uses memoryStorage() so images are held in memory buffers and streamed
 *    directly to Cloudinary without leaving temporary files on disk.
 *  - File filter restricts MIME types strictly to: image/jpeg, image/png, image/webp.
 *  - Limits file size to 10 MB maximum.
 *  - Intercepts Multer-specific errors (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE)
 *    and unsupported file formats, returning consistent HTTP 400 responses.
 */

'use strict';

const multer = require('multer');

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// 10 MB limit
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Configure memory storage
const storage = multer.memoryStorage();

// File filter function
function fileFilter(req, file, cb) {
  if (!file) {
    return cb(null, false);
  }

  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error(
      `Unsupported file type "${file.mimetype}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error, false);
  }
}

// Multer instance configured for single image upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
}).single('image');

/**
 * Express middleware wrapper that executes multer and formats errors consistently.
 */
function uploadImageMiddleware(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'LIMIT_FILE_SIZE',
              message: `Image size exceeds the 10 MB limit.`,
            },
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            code: err.code || 'UPLOAD_ERROR',
            message: err.message,
          },
        });
      }

      if (err.code === 'UNSUPPORTED_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_FILE_TYPE',
            message: err.message,
          },
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: err.message,
        },
      });
    }

    next();
  });
}

module.exports = {
  uploadImageMiddleware,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
};

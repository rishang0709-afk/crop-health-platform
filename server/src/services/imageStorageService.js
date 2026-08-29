/**
 * imageStorageService.js
 *
 * Cloudinary image storage service for crop image uploads.
 *
 * This module isolates all Cloudinary-specific logic, keeping the controllers
 * decoupled from the specific storage vendor. It can be replaced or adapted
 * to S3/GCS in the future without changing the controller logic.
 *
 * Specification & Security:
 *  - Credentials loaded exclusively from environment variables:
 *    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 *  - Images are streamed directly from memory buffer (no temporary disk files).
 *  - Stored in folder: crop-health/detections.
 *  - Returns secure_url and public_id (used as storageKey).
 *  - Provides deleteImage for orphan asset cleanup when database saves fail.
 *  - Never logs or exposes API secrets in error messages.
 */

'use strict';

const cloudinary = require('cloudinary').v2;

/**
 * Returns whether Cloudinary is fully configured with credentials.
 *
 * @returns {boolean}
 */
function isStorageConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  return Boolean(
    cloudName && cloudName.trim().length > 0 &&
    apiKey && apiKey.trim().length > 0 &&
    apiSecret && apiSecret.trim().length > 0
  );
}

/**
 * Configure Cloudinary with current environment variables.
 */
function configureCloudinary() {
  if (isStorageConfigured()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
      api_key: process.env.CLOUDINARY_API_KEY.trim(),
      api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
      secure: true,
    });
  }
}

// Initial configuration
configureCloudinary();

/**
 * Upload an image buffer to Cloudinary.
 *
 * @param {Buffer} buffer - Image file buffer in memory
 * @param {object} [options] - Optional upload parameters (e.g. filename, metadata)
 * @returns {Promise<{ url: string, storageKey: string, uploadedAt: Date }>}
 */
function uploadDetectionImage(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    // Re-verify configuration before attempting upload
    configureCloudinary();

    if (!isStorageConfigured()) {
      const err = new Error('Image storage is not configured on the server.');
      err.code = 'STORAGE_NOT_CONFIGURED';
      err.status = 503;
      return reject(err);
    }

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      const err = new Error('Invalid image buffer.');
      err.code = 'INVALID_IMAGE_BUFFER';
      err.status = 400;
      return reject(err);
    }

    const uploadOptions = {
      folder: 'crop-health/detections',
      resource_type: 'image',
      ...(options.publicId ? { public_id: options.publicId } : {}),
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error.message);
          const uploadErr = new Error('Failed to upload image to cloud storage.');
          uploadErr.code = 'STORAGE_UPLOAD_FAILED';
          uploadErr.status = 502;
          return reject(uploadErr);
        }

        resolve({
          url: result.secure_url,
          storageKey: result.public_id,
          uploadedAt: result.created_at ? new Date(result.created_at) : new Date(),
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Delete an image asset from Cloudinary by its storageKey (public_id).
 *
 * Used for cleaning up orphaned images if a database save fails after upload.
 * Does not throw; logs errors for monitoring without breaking calling flows.
 *
 * @param {string} storageKey - Cloudinary public_id
 * @returns {Promise<boolean>} True if deleted or skipped safely
 */
async function deleteImage(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') return false;

  try {
    configureCloudinary();
    if (!isStorageConfigured()) return false;

    const result = await cloudinary.uploader.destroy(storageKey, {
      resource_type: 'image',
    });

    return result && result.result === 'ok';
  } catch (err) {
    console.error('Cloudinary cleanup error for key', storageKey, ':', err.message);
    return false;
  }
}

module.exports = {
  isStorageConfigured,
  uploadDetectionImage,
  deleteImage,
};

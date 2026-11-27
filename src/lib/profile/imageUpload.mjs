import { isValidCloudinaryAvatarUrl } from './cloudinaryAvatar.mjs';

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

// Android gallery providers sometimes return a blank or generic MIME type
// for valid images. The file contents are validated by Cloudinary instead.
export function getImageFileIssue(file) {
  if (!file || typeof file !== 'object') return 'invalid-file';
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return 'invalid-file';
  if (size > IMAGE_UPLOAD_MAX_BYTES) return 'too-large';
  return null;
}

export function isValidCloudinaryImageUpload(result) {
  return result?.resource_type === 'image'
    && isValidCloudinaryAvatarUrl(result?.secure_url);
}

export const CLOUDINARY_CLOUD_NAME = 'do83voiqy';
export const CLOUDINARY_UPLOAD_PRESET = 'afrikdigitalo_upload';

export function isValidCloudinaryAvatarUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && url.hostname === 'res.cloudinary.com'
      && url.pathname.startsWith(`/${CLOUDINARY_CLOUD_NAME}/image/upload/`);
  } catch {
    return false;
  }
}

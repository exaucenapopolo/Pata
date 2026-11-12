import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isValidCloudinaryAvatarUrl } from '../src/lib/profile/cloudinaryAvatar.mjs';

test('keeps the Cloudinary account and upload preset used by the supplied profile page', () => {
  assert.equal(CLOUDINARY_CLOUD_NAME, 'do83voiqy');
  assert.equal(CLOUDINARY_UPLOAD_PRESET, 'afrikdigitalo_upload');
});

test('accepts only HTTPS avatar uploads from the configured Cloudinary image account', () => {
  assert.equal(isValidCloudinaryAvatarUrl('https://res.cloudinary.com/do83voiqy/image/upload/v123/pata/avatar.jpg'), true);
  assert.equal(isValidCloudinaryAvatarUrl('http://res.cloudinary.com/do83voiqy/image/upload/v123/avatar.jpg'), false);
  assert.equal(isValidCloudinaryAvatarUrl('https://res.cloudinary.com/another-account/image/upload/v123/avatar.jpg'), false);
  assert.equal(isValidCloudinaryAvatarUrl('https://example.com/avatar.jpg'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  getImageFileIssue,
  isValidCloudinaryImageUpload,
} from '../src/lib/profile/imageUpload.mjs';

test('accepts valid images up to exactly 5 MB without rejecting Android MIME variants', () => {
  const acceptedTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/x-png',
    'image/webp', 'image/heic', 'image/heif', 'image/avif',
    '', 'application/octet-stream',
  ];
  for (const type of acceptedTypes) {
    assert.equal(getImageFileIssue({ size: 1024, type }), null, type || '(MIME vide)');
  }
  assert.equal(getImageFileIssue({ size: IMAGE_UPLOAD_MAX_BYTES, type: 'application/octet-stream' }), null);
});

test('rejects only files that are empty, invalid or exceed 5 MB', () => {
  assert.equal(getImageFileIssue(null), 'invalid-file');
  assert.equal(getImageFileIssue({ size: 0, type: 'image/jpeg' }), 'invalid-file');
  assert.equal(getImageFileIssue({ size: Number.NaN, type: 'image/jpeg' }), 'invalid-file');
  assert.equal(getImageFileIssue({ size: IMAGE_UPLOAD_MAX_BYTES + 1, type: 'image/png' }), 'too-large');
});

test('accepts only Cloudinary responses confirmed as image resources on the trusted account', () => {
  assert.equal(isValidCloudinaryImageUpload({
    resource_type: 'image',
    secure_url: 'https://res.cloudinary.com/do83voiqy/image/upload/v123/pata/photo.jpg',
  }), true);
  assert.equal(isValidCloudinaryImageUpload({
    resource_type: 'raw',
    secure_url: 'https://res.cloudinary.com/do83voiqy/image/upload/v123/pata/photo.jpg',
  }), false);
  assert.equal(isValidCloudinaryImageUpload({
    resource_type: 'image',
    secure_url: 'https://example.com/photo.jpg',
  }), false);
});

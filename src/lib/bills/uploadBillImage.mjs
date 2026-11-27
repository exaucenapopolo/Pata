import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '@/lib/profile/cloudinaryAvatar.mjs';
import { getImageFileIssue, isValidCloudinaryImageUpload } from '@/lib/profile/imageUpload.mjs';

async function imageBlobFrom(value) {
  if (typeof value === 'string') {
    if (!value.startsWith('data:image/')) throw new Error('Image de facture invalide.');
    const response = await fetch(value);
    if (!response.ok) throw new Error('Impossible de lire l’image du justificatif.');
    return response.blob();
  }
  if (value && typeof value.arrayBuffer === 'function') return value;
  throw new Error('Choisis une photo ou une image de facture.');
}

export async function uploadBillImage(source) {
  const original = await imageBlobFrom(source);
  const issue = getImageFileIssue(original);
  if (issue === 'too-large') throw new Error('La photo dépasse la taille maximale de 5 Mo.');
  if (issue) throw new Error('Ce fichier est vide ou illisible. Choisis une autre photo.');

  const form = new FormData();
  form.append('file', original, source?.name || 'pata-facture');
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'pata/bills');
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
    { method: 'POST', body: form },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !isValidCloudinaryImageUpload(result)) {
    throw new Error(result?.error?.message || 'Ce fichier n’est pas une image prise en charge. Choisis une autre photo.');
  }
  return result.secure_url;
}

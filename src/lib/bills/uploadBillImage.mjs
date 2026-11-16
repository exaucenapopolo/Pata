import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isValidCloudinaryAvatarUrl } from '@/lib/profile/cloudinaryAvatar.mjs';

function imageBlobFrom(value) {
  if (typeof value === 'string') {
    if (!value.startsWith('data:image/')) throw new Error('Image de facture invalide.');
    return fetch(value).then((response) => {
      if (!response.ok) throw new Error('Impossible de lire l’image du justificatif.');
      return response.blob();
    });
  }
  if (value && typeof value.arrayBuffer === 'function' && String(value.type || '').startsWith('image/')) {
    return Promise.resolve(value);
  }
  throw new Error('Choisis une image JPG, PNG ou WEBP.');
}

function compressBillImage(blob) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Impossible de préparer la photo de cette facture.'));
        return;
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((compressed) => {
        URL.revokeObjectURL(objectUrl);
        if (!compressed) reject(new Error('Compression de la photo impossible.'));
        else if (compressed.size > 5 * 1024 * 1024) reject(new Error('La photo de facture dépasse la taille autorisée après compression.'));
        else resolve(compressed);
      }, 'image/jpeg', 0.84);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Le fichier image de la facture est illisible.'));
    };
    image.src = objectUrl;
  });
}

export async function uploadBillImage(source) {
  const original = await imageBlobFrom(source);
  const compressed = await compressBillImage(original);
  const form = new FormData();
  form.append('file', compressed, 'pata-facture.jpg');
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'pata/bills');
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload',
    { method: 'POST', body: form },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !isValidCloudinaryAvatarUrl(result?.secure_url)) {
    throw new Error(result?.error?.message || 'Le téléversement de la photo de facture a échoué.');
  }
  return result.secure_url;
}

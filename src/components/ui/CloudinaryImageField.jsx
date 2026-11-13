'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, UploadCloud, X } from 'lucide-react';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isValidCloudinaryAvatarUrl } from '@/lib/profile/cloudinaryAvatar.mjs';

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 800 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Impossible de préparer cette image.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) reject(new Error('Compression de l’image impossible.'));
        else resolve(blob);
      }, 'image/jpeg', 0.88);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Fichier image invalide.'));
    };
    image.src = objectUrl;
  });
}

export function CloudinaryImageField({ value = '', onChange, folder = 'pata/categories', language = 'fr', clickablePreview = false, hideActions = false, previewClassName = '', label }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const isEnglish = language === 'en';

  const onPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(isEnglish ? 'Use a JPG, PNG or WEBP image.' : 'Utilise une image JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(isEnglish ? 'Maximum image size is 5 MB.' : 'Taille maximale de l’image : 5 Mo.');
      return;
    }
    setUploading(true);
    try {
      const compressed = await resizeImage(file);
      const form = new FormData();
      form.append('file', compressed, 'pata-category.jpg');
      form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      form.append('folder', folder);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST', body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !isValidCloudinaryAvatarUrl(result?.secure_url)) {
        throw new Error(result?.error?.message || (isEnglish ? 'Cloudinary upload failed. Check the upload preset.' : 'Échec du téléversement Cloudinary. Vérifie le preset.'));
      }
      onChange(result.secure_url);
    } catch (uploadError) {
      setError(uploadError.message || (isEnglish ? 'Could not upload the image.' : 'Impossible de téléverser cette image.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label || (isEnglish ? 'Category photo' : 'Photo de la catégorie')}</p>
      {clickablePreview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={isEnglish ? 'Change image' : 'Changer la photo'}
          className={previewClassName || 'relative block aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 text-slate-400'}
        >
          {value ? <img src={value} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <span className="flex h-full w-full items-center justify-center"><ImagePlus size={30}/></span>}
          {uploading && <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white"><Loader2 size={24} className="animate-spin"/></span>}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-slate-400">
            {value ? <img src={value} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <ImagePlus size={22}/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500">{isEnglish ? 'JPG, PNG or WEBP · 5 MB max' : 'JPG, PNG ou WEBP · 5 Mo maximum'}</p>
            {!hideActions && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                  {uploading ? <Loader2 size={13} className="animate-spin"/> : <UploadCloud size={13}/>}
                  {isEnglish ? 'Choose a photo' : 'Choisir une photo'}
                </button>
                {value && <button type="button" onClick={() => onChange('')} disabled={uploading} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50"><X size={13}/>{isEnglish ? 'Remove' : 'Retirer'}</button>}
              </div>
            )}
          </div>
        </div>
      )}
      {clickablePreview && <p className="text-center text-xs text-slate-500">{isEnglish ? 'Tap the photo to change it · JPG, PNG or WEBP · 5 MB max' : 'Appuie sur la photo pour la changer · JPG, PNG ou WEBP · 5 Mo maximum'}</p>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} className="sr-only"/>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

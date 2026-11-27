'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, UploadCloud, X } from 'lucide-react';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '@/lib/profile/cloudinaryAvatar.mjs';
import { getImageFileIssue, isValidCloudinaryImageUpload } from '@/lib/profile/imageUpload.mjs';

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
    const fileIssue = getImageFileIssue(file);
    if (fileIssue === 'too-large') {
      setError(isEnglish ? 'Maximum image size is 5 MB.' : 'Taille maximale de l’image : 5 Mo.');
      return;
    }
    if (fileIssue) {
      setError(isEnglish ? 'This file is empty or unreadable. Choose another photo.' : 'Ce fichier est vide ou illisible. Choisis une autre photo.');
      return;
    }
    setUploading(true);
    try {
      // Upload the original like the profile editor. Avoid browser canvas
      // decoding, which rejects some Android, HEIC and AVIF gallery images.
      const form = new FormData();
      form.append('file', file, file.name || 'pata-image');
      form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      form.append('folder', folder);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST', body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !isValidCloudinaryImageUpload(result)) {
        throw new Error(result?.error?.message || (isEnglish
          ? 'This file is not a supported image. Choose another photo and try again.'
          : 'Ce fichier n’est pas une image prise en charge. Choisis une autre photo puis réessaie.'));
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
            <p className="text-[11px] text-slate-500">{isEnglish ? 'Any supported image · 5 MB max' : 'Toute image prise en charge · 5 Mo maximum'}</p>
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
      {clickablePreview && <p className="text-center text-xs text-slate-500">{isEnglish ? 'Tap the photo to change it · JPG, PNG or WEBP · 5 MB max' : 'Appuie sur la photo pour la changer · Toute image prise en charge · 5 Mo maximum'}</p>}
      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="sr-only"/>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

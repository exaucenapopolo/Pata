'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/context/LanguageContext';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, isValidCloudinaryAvatarUrl } from '@/lib/profile/cloudinaryAvatar.mjs';

const PROFILE_AVATARS = [
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/49391629-jeune-homme-avatar-personnage-du-avatar-homme-icone-dessin-anime-illustration-gratuit-vectoriel.jpg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%201.png",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%202.jpg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%203.png",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%204.jpeg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%205.jpeg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/illustration-du-jeune-homme-souriant_1308-174669.jpg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/man-with-beard-avatar-character-isolated-icon-free-vector.jpg",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/pngtree-man-avatar-image-for-profile-png-image_13001877.png",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/pngtree-man-avatar-image-for-profile-png-image_13001882.png",
  "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/figure-detaillee-vieil-homme-tenant-lettre_1077802-376424.jpg",
];

function getInitial(value = '') {
  const name = String(value || '').trim();
  return name ? name.charAt(0).toUpperCase() : 'P';
}

function resizeAvatar(file, maxSize = 800, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        let { width, height } = image;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Impossible de préparer cette image.');
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(sourceUrl);
          if (!blob) return reject(new Error('La compression de la photo a échoué.'));
          resolve(blob);
        }, 'image/jpeg', quality);
      } catch (error) {
        URL.revokeObjectURL(sourceUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('Le fichier ne contient pas une image valide.'));
    };
    image.src = sourceUrl;
  });
}

export function ProfilePhotoEditor({ photoURL = '', displayName = '', onSave }) {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('avatars');
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const text = isEnglish ? {
    title: 'Profile photo',
    change: 'Change photo',
    choose: 'Choose an avatar or upload your own photo.',
    avatars: 'Avatars',
    upload: 'My photo',
    uploadTitle: 'Upload a photo',
    uploadHint: 'JPG, PNG or WEBP · 5 MB maximum',
    selectFile: 'Choose a file',
    clear: 'Remove photo',
    save: 'Save photo',
    saving: 'Saving…',
    cancel: 'Cancel',
    invalidSize: 'The file is too large. Maximum size: 5 MB.',
    invalidType: 'Unsupported format. Use JPG, PNG or WEBP.',
    cloudinaryResponse: 'Cloudinary returned an invalid response.',
    uploadFailed: 'The photo could not be uploaded. Check the upload preset and try again.',
    saveFailed: 'The profile photo could not be saved. Please try again.',
    current: 'Current photo',
  } : {
    title: 'Photo de profil',
    change: 'Changer la photo',
    choose: 'Choisis un avatar ou télécharge ta propre photo.',
    avatars: 'Avatars',
    upload: 'Ma photo',
    uploadTitle: 'Télécharger une photo',
    uploadHint: 'JPG, PNG ou WEBP · 5 Mo maximum',
    selectFile: 'Choisir un fichier',
    clear: 'Retirer la photo',
    save: 'Enregistrer la photo',
    saving: 'Enregistrement…',
    cancel: 'Annuler',
    invalidSize: 'Le fichier est trop volumineux. Taille maximale : 5 Mo.',
    invalidType: 'Format non pris en charge. Utilise JPG, PNG ou WEBP.',
    cloudinaryResponse: 'Cloudinary a renvoyé une réponse invalide.',
    uploadFailed: 'La photo n’a pas pu être téléchargée. Vérifie le preset d’envoi puis réessaie.',
    saveFailed: 'La photo de profil n’a pas pu être enregistrée. Réessaie.',
    current: 'Photo actuelle',
  };

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const displayedPhoto = previewUrl || selectedAvatar || (removePhoto ? '' : photoURL);

  const openEditor = () => {
    setSelectedAvatar(PROFILE_AVATARS.includes(photoURL) ? photoURL : '');
    setSelectedFile(null);
    setPreviewUrl('');
    setRemovePhoto(false);
    setError('');
    setProgress(0);
    setActiveTab('avatars');
    setOpen(true);
  };

  const chooseAvatar = (url) => {
    setSelectedAvatar(url);
    setSelectedFile(null);
    setPreviewUrl('');
    setRemovePhoto(false);
    setError('');
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(text.invalidSize);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(text.invalidType);
      return;
    }
    setSelectedFile(file);
    setSelectedAvatar('');
    setRemovePhoto(false);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    setActiveTab('upload');
  };

  const handleSave = async () => {
    if (saving || typeof onSave !== 'function') return;
    setSaving(true);
    setError('');
    try {
      let nextPhotoURL = null;
      if (removePhoto) {
        nextPhotoURL = null;
      } else if (selectedFile) {
        setProgress(15);
        const compressed = await resizeAvatar(selectedFile);
        setProgress(40);
        const formData = new FormData();
        formData.append('file', compressed, 'pata-avatar.jpg');
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', 'pata/avatars');
        setProgress(60);
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
          method: 'POST',
          body: formData,
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(text.cloudinaryResponse);
        }
        setProgress(85);
        if (!response.ok || !isValidCloudinaryAvatarUrl(result?.secure_url)) {
          throw new Error(result?.error?.message || text.uploadFailed);
        }
        nextPhotoURL = result.secure_url;
      } else {
        nextPhotoURL = selectedAvatar || photoURL || null;
      }

      await onSave(nextPhotoURL);
      setProgress(100);
      setOpen(false);
      setSelectedFile(null);
      setPreviewUrl('');
      setSelectedAvatar('');
      setRemovePhoto(false);
    } catch (saveError) {
      console.error('[PATA PROFILE PHOTO]', saveError?.message || saveError);
      setError(saveError?.message || text.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e7f3eb] text-xl font-bold text-[#0b5c46] shadow-sm">
          {photoURL ? <img src={photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : getInitial(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{text.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{text.choose}</p>
          <button type="button" onClick={openEditor} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#0b5c46] px-3 text-xs font-semibold text-white transition hover:bg-[#084b39]">
            <Camera size={14} />{text.change}
          </button>
        </div>
      </div>

      <Modal open={open} onClose={() => { if (!saving) setOpen(false); }} title={text.title} className="max-w-xl">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-500">{text.choose}</p>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e7f3eb] text-xl font-bold text-[#0b5c46]">
              {displayedPhoto ? <img src={displayedPhoto} alt={text.current} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : getInitial(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">{text.current}</p>
              <p className="mt-1 break-all text-[11px] text-slate-500">{displayedPhoto ? (selectedFile ? selectedFile.name : isEnglish ? 'Selected photo' : 'Photo sélectionnée') : isEnglish ? 'Initials' : 'Initiales'}</p>
            </div>
            <button type="button" onClick={() => { setRemovePhoto(true); setSelectedAvatar(''); setSelectedFile(null); setPreviewUrl(''); setError(''); }} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50">
              <Trash2 size={13}/>{text.clear}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setActiveTab('avatars')} className={'min-h-10 rounded-lg px-3 text-xs font-semibold transition ' + (activeTab === 'avatars' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              <ImagePlus size={14} className="mr-1 inline"/> {text.avatars}
            </button>
            <button type="button" onClick={() => setActiveTab('upload')} className={'min-h-10 rounded-lg px-3 text-xs font-semibold transition ' + (activeTab === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              <UploadCloud size={14} className="mr-1 inline"/> {text.upload}
            </button>
          </div>

          {activeTab === 'avatars' ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {PROFILE_AVATARS.map((url, index) => (
                <button key={url} type="button" onClick={() => chooseAvatar(url)} aria-label={(isEnglish ? 'Choose avatar ' : 'Choisir avatar ') + (index + 1)} aria-pressed={selectedAvatar === url} className={'aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 transition ' + (selectedAvatar === url ? 'border-[#0b5c46] ring-2 ring-[#0b5c46]/15' : 'border-transparent hover:border-slate-300')}>
                  <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer"/>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-[#b9d7c4] bg-[#f7fbf8] p-5 text-center">
              <UploadCloud size={28} className="mx-auto text-[#0b5c46]"/>
              <p className="mt-2 text-sm font-semibold text-slate-800">{text.uploadTitle}</p>
              <p className="mt-1 text-xs text-slate-500">{text.uploadHint}</p>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} className="sr-only"/>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <ImagePlus size={14}/>{text.selectFile}
              </button>
            </div>
          )}

          {saving && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0b5c46] transition-all" style={{ width: progress + '%' }}/></div>
              <p className="text-right text-[10px] text-slate-500">{text.saving}</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{text.cancel}</button>
            <button type="button" onClick={handleSave} disabled={saving || (!selectedFile && !selectedAvatar && !removePhoto && selectedAvatar !== photoURL)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-xs font-semibold text-white hover:bg-[#084b39] disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}
              {saving ? text.saving : text.save}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

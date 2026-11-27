'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowRight, Building2, CheckCircle2, ChevronLeft, ChevronRight,
  Image as ImageIcon, LoaderCircle, Maximize2, PlayCircle, ShieldCheck,
  Star, X
} from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';
const videoEmbed = (raw) => {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) : '';
    }
    if (host.includes('youtube.com')) {
      const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
      return id ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) : '';
    }
    if (host.includes('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop();
      return id ? 'https://player.vimeo.com/video/' + encodeURIComponent(id) : '';
    }
  } catch {}
  return '';
};

function RatingSummary({ value = 0, count = 0 }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-600">
      <span className="flex items-center">
        {Array.from({ length: 5 }, (_, index) => <Star key={index} size={14} fill={index < Math.round(Number(value) || 0) ? 'currentColor' : 'none'} />)}
      </span>
      <b className="text-slate-800">{Number(value || 0).toFixed(1)}/5</b>
      <span className="text-slate-500">· {count} avis clients</span>
    </div>
  );
}

function StarPicker({ value, onChange, label }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-700">{label}</legend>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((number) => (
          <button key={number} type="button" onClick={() => onChange(number)} aria-label={number + ' étoile(s)'} className="rounded-lg p-1 text-amber-500 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
            <Star size={22} fill={number <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function PublicBusinessPaymentPage() {
  const params = useParams();
  const paymentLinkId = String(params?.paymentLinkId || '');
  const galleryRef = useRef(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [businessRating, setBusinessRating] = useState(5);
  const [productRating, setProductRating] = useState(5);
  const [reviewName, setReviewName] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewToken, setReviewToken] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewDone, setReviewDone] = useState(false);

  const photos = useMemo(() => [...new Set([payment?.imageUrl, ...(payment?.galleryImageUrls || [])].filter(Boolean))], [payment]);
  const proofs = payment?.proofImageUrls || [];
  const videos = payment?.videoUrls || [];
  const discounted = payment && Number(payment.originalAmount) > Number(payment.amount);
  const unavailable = payment && payment.status !== 'ACTIVE';

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('token') || '';
    const fromSession = sessionStorage.getItem('pata-payment-review:' + paymentLinkId) || '';
    setReviewToken(fromUrl || fromSession);
  }, [paymentLinkId]);

  useEffect(() => {
    if (!paymentLinkId) return;
    let active = true;
    fetch('/api/public/business-payment/' + encodeURIComponent(paymentLinkId), { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Cette offre est indisponible.');
        if (active) setPayment(result.payment || null);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Impossible de charger cette offre.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [paymentLinkId]);

  useEffect(() => {
    if (!lightbox) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event) => {
      if (event.key === 'Escape') setLightbox(null);
      if (event.key === 'ArrowRight') setLightbox((current) => current ? { ...current, index: (current.index + 1) % current.items.length } : current);
      if (event.key === 'ArrowLeft') setLightbox((current) => current ? { ...current, index: (current.index - 1 + current.items.length) % current.items.length } : current);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightbox]);

  const scrollGallery = (direction) => {
    const node = galleryRef.current;
    if (!node) return;
    const next = Math.max(0, Math.min(photos.length - 1, activePhoto + direction));
    node.scrollTo({ left: next * node.clientWidth, behavior: 'smooth' });
    setActivePhoto(next);
  };

  const syncGalleryIndex = (event) => {
    const node = event.currentTarget;
    if (!node.clientWidth) return;
    setActivePhoto(Math.max(0, Math.min(photos.length - 1, Math.round(node.scrollLeft / node.clientWidth))));
  };

  const openGallery = (items, index, label) => setLightbox({ items, index, label });
  const moveLightbox = (direction) => setLightbox((current) => current ? {
    ...current,
    index: (current.index + direction + current.items.length) % current.items.length,
  } : current);

  const beginCheckout = async () => {
    setPaying(true);
    setError('');
    try {
      const response = await fetch('/api/public/business-payment/' + encodeURIComponent(paymentLinkId), {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || !result.checkoutUrl) {
        throw new Error(result.error || 'Impossible de préparer le paiement pour le moment. Réessaie.');
      }
      const checkout = new URL(result.checkoutUrl);
      if (checkout.protocol !== 'https:') throw new Error('Le lien de paiement reçu n’est pas sécurisé.');
      if (result.reviewToken) { setReviewToken(result.reviewToken); sessionStorage.setItem('pata-payment-review:' + paymentLinkId, result.reviewToken); }
      window.location.assign(checkout.toString());
    } catch (checkoutError) {
      setError(checkoutError.message || 'Impossible de préparer le paiement. Réessaie.');
      setPaying(false);
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setReviewSaving(true);
    setReviewError('');
    try {
      const response = await fetch('/api/public/business-payment/' + encodeURIComponent(paymentLinkId) + '/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ token: new URLSearchParams(window.location.search).get('token') || '', customerName: reviewName, businessRating, productRating, comment: reviewComment }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible d’enregistrer votre avis.');
      setReviewDone(true);
      sessionStorage.removeItem('pata-payment-review:' + paymentLinkId);
    } catch (reviewSubmitError) {
      setReviewError(reviewSubmitError.message || 'Impossible d’enregistrer votre avis.');
    } finally {
      setReviewSaving(false);
    }
  };


  return (
    <main className="min-h-screen bg-[#f3f7f4] px-3 py-5 text-slate-900 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-4xl">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={23}/>Chargement de l’offre…</div>
        ) : error && !payment ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-12 text-center"><b>Offre indisponible</b><p className="mt-2 text-sm text-slate-500">{error}</p></section>
        ) : unavailable ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto text-slate-400" size={32}/><h1 className="mt-3 font-bold">Cette offre n’est plus disponible</h1><p className="mt-2 text-sm text-slate-500">Cette offre a atteint sa limite de commandes ou a été désactivée. Contactez directement l’entreprise.</p></section>
        ) : payment ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="relative bg-[#edf3ef]">
                {photos.length ? (
                  <>
                    <div ref={galleryRef} onScroll={syncGalleryIndex} className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x' }}>
                      {photos.map((url, index) => (
                        <div key={url} className="w-full shrink-0 snap-center">
                          <button type="button" onClick={() => openGallery(photos, index, payment.title)} className="relative flex aspect-[4/3] w-full items-center justify-center bg-[#edf3ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#075b43]" aria-label="Agrandir la photo">
                            <img src={url} alt={payment.title + ' — photo ' + (index + 1)} className="h-full w-full object-contain"/>
                            <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"><Maximize2 size={17}/></span>
                          </button>
                        </div>
                      ))}
                    </div>
                    {photos.length > 1 && <>
                      <button type="button" aria-label="Photo précédente" onClick={() => scrollGallery(-1)} disabled={activePhoto === 0} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md disabled:opacity-35"><ChevronLeft size={21}/></button>
                      <button type="button" aria-label="Photo suivante" onClick={() => scrollGallery(1)} disabled={activePhoto === photos.length - 1} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-md disabled:opacity-35"><ChevronRight size={21}/></button>
                      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5">{photos.map((url,index)=><button key={url} type="button" aria-label={'Afficher la photo '+(index+1)} onClick={()=>scrollGallery(index-activePhoto)} className={'h-1.5 rounded-full transition-all '+(index===activePhoto?'w-5 bg-white':'w-1.5 bg-white/60')}/>)}</div>
                    </>}
                  </>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center text-center text-[#075b43]"><div><ImageIcon size={38} className="mx-auto"/><p className="mt-2 text-xs">Présentation du produit</p></div></div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{payment.title}</h1>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                  {payment.businessLogoUrl ? <img src={payment.businessLogoUrl} alt="" className="h-full w-full object-contain"/> : <Building2 size={20} className="text-slate-400"/>}
                </span>
                <div className="min-w-0 flex-1">
                  {payment.businessProfilePublic ? <a href={'/entreprise/'+encodeURIComponent(payment.businessId)} className="block truncate text-sm font-bold text-slate-900 hover:text-[#075b43]">{payment.businessName || 'Entreprise'}</a> : <p className="truncate text-sm font-bold">{payment.businessName || 'Entreprise'}</p>}
                  {payment.businessSlogan && <p className="mt-0.5 text-xs text-slate-500">{payment.businessSlogan}</p>}
                  {payment.ratingCount > 0 && <div className="mt-1.5"><RatingSummary value={payment.averageBusinessRating} count={payment.ratingCount}/></div>}
                </div>
              </div>

              {payment.ratingCount > 0 && <div className="mt-4"><RatingSummary value={payment.averageProductRating} count={payment.ratingCount}/><p className="mt-1 text-[10px] text-slate-500">Note du produit ou service</p></div>}
              {payment.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{payment.description}</p>}
              {payment.sellingPoints?.length > 0 && <div className="mt-5 space-y-2.5">{payment.sellingPoints.map((point,index)=><div key={index} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-700"/><span>{point}</span></div>)}</div>}
            </section>

            {proofs.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-extrabold">Preuves et réalisations</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Exemples et éléments visuels présentés par l’entreprise.</p>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">{proofs.map((url,index)=><button key={url} type="button" onClick={()=>openGallery(proofs,index,'Preuve ou réalisation')} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075b43]"><img src={url} alt={'Preuve ou réalisation '+(index+1)} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"/><span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"><Maximize2 size={15}/></span></button>)}</div>
            </section>}

            {videos.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="flex items-center gap-2 text-base font-extrabold"><PlayCircle size={18}/>Démonstrations vidéo</h2>
              <div className="mt-4 grid gap-4">{videos.map((url,index)=>{const embed=videoEmbed(url);return <div key={url} className="overflow-hidden rounded-2xl bg-slate-950">{embed?<iframe src={embed} title={'Démonstration vidéo '+(index+1)} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy"/>:<video controls playsInline preload="metadata" className="aspect-video w-full" src={url}>Votre navigateur ne peut pas lire cette vidéo.</video>}</div>;})}</div>
            </section>}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              {discounted && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="line-through">{money(payment.originalAmount)}</span><span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-800">Économie de {money(payment.discountAmount)}</span></div>}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prix de l’offre</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-[#075b43]">{money(payment.amount)}</p>
              {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}
              <button type="button" disabled={paying} onClick={beginCheckout} className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#075b43] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#064b38] disabled:opacity-60">{paying?'Préparation du paiement…':'Continuer vers le paiement'}<ArrowRight size={17}/></button>
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>Vous serez redirigé vers la page de paiement pour terminer votre règlement. Aucune adresse e-mail ni aucun nom n’est exigé ici.</p>
            </section>

            {payment.reviews?.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-extrabold">Avis des clients</h2>
              <div className="mt-4 space-y-4">{payment.reviews.map((review)=><article key={review.id} className="border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{review.name}</b><span className={'text-[10px] font-semibold '+(review.verifiedPurchase?'text-emerald-700':'text-slate-500')}>{review.verifiedPurchase?'Achat confirmé':'Avis après tentative de paiement'}</span></div>
                <p className="mt-1 text-xs text-amber-600">Produit {review.productRating}/5 · Entreprise {review.businessRating}/5</p>
                {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{review.comment}</p>}
              </article>)}</div>
            </section>}

            {reviewToken && <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
              {reviewDone ? <div className="py-3 text-center"><CheckCircle2 size={36} className="mx-auto text-emerald-700"/><h2 className="mt-3 text-lg font-extrabold">Merci pour votre avis !</h2><p className="mt-2 text-sm text-slate-600">Votre retour aidera les autres clients à faire leur choix.</p></div> : <>
                <p className="text-xs font-bold uppercase tracking-wide text-[#075b43]">Votre expérience</p>
                <h2 className="mt-1 text-lg font-extrabold">Donnez votre avis</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Vous pouvez évaluer l’entreprise et le produit après votre passage sur la page de paiement.</p>
                <form onSubmit={submitReview} className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">Votre nom<input required minLength={2} maxLength={80} value={reviewName} onChange={event=>setReviewName(event.target.value)} placeholder="Nom affiché avec votre avis" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#075b43]"/></label>
                  <StarPicker value={businessRating} onChange={setBusinessRating} label="Votre note pour l’entreprise"/>
                  <StarPicker value={productRating} onChange={setProductRating} label="Votre note pour le produit ou service"/>
                  <label className="block text-sm font-semibold text-slate-700">Un commentaire (facultatif)<textarea maxLength={1000} rows={3} value={reviewComment} onChange={event=>setReviewComment(event.target.value)} placeholder="Partagez votre expérience…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-[#075b43]"/></label>
                  {reviewError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{reviewError}</p>}
                  <button type="submit" disabled={reviewSaving} className="min-h-12 w-full rounded-xl bg-[#075b43] px-4 text-sm font-bold text-white disabled:opacity-50">{reviewSaving?'Envoi de votre avis…':'Publier mon avis'}</button>
                </form>
              </>}
            </section>}
          </div>
        ) : null}

        {payment?.businessName && <p className="mt-6 text-center text-xs text-slate-400">{payment.businessName}</p>}
      </div>

      {lightbox && lightbox.items?.length > 0 && <div role="dialog" aria-modal="true" aria-label="Agrandissement de l’image" onClick={()=>setLightbox(null)} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 sm:p-6">
        <button type="button" aria-label="Fermer l’image" onClick={()=>setLightbox(null)} className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><X size={23}/></button>
        <p className="absolute left-4 top-5 right-16 text-center text-xs font-medium text-white/75">{lightbox.label} · {lightbox.index+1}/{lightbox.items.length}</p>
        {lightbox.items.length > 1 && <button type="button" aria-label="Image précédente" onClick={event=>{event.stopPropagation();moveLightbox(-1);}} className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white sm:left-5"><ChevronLeft size={25}/></button>}
        <div className="flex h-full w-full items-center justify-center" onClick={event=>event.stopPropagation()}>
          <img src={lightbox.items[lightbox.index]} alt={lightbox.label} className="max-h-[86vh] max-w-full object-contain"/>
        </div>
        {lightbox.items.length > 1 && <button type="button" aria-label="Image suivante" onClick={event=>{event.stopPropagation();moveLightbox(1);}} className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white sm:right-5"><ChevronRight size={25}/></button>}
      </div>}
    </main>
  );
}

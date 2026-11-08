'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrainCircuit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PWAInstallButton } from '@/components/PWAInstallButton';
import { ensureUserProfile } from '@/lib/firestore/profile';

const slides = [
  { eyebrow: 'UNE VUE PLUS CLAIRE', title: 'Sache où va ton argent.', text: 'Enregistre tes dépenses et tes revenus au même endroit. Pata transforme tes saisies en une vision simple de ton mois.', mark: '01', art: 'flow' },
  { eyebrow: 'MČ · TON ASSISTANTE', title: 'Comprends tes chiffres, pas seulement tes tableaux.', text: 'Pose tes questions à Mč. Elle peut analyser tes dépenses, t’aider à préparer un budget et t’expliquer les tendances de tes finances.', mark: '02', art: 'ai' },
  { eyebrow: 'BUDGETS, ÉPARGNE & PREMIUM', title: 'Donne une direction à chaque franc.', text: 'Définis des limites, crée des objectifs d’épargne et suis tes versements. Tu peux commencer gratuitement ; Premium ouvre davantage de possibilités quand tu souhaites aller plus loin.', mark: '03', art: 'savings' },
];

async function sendWelcomeOnce(user, created) {
  if (!created || !user?.email) return;
  try {
    const token = await user.getIdToken();
    await fetch('/api/email/welcome', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    console.warn('[PATA WELCOME EMAIL]', error?.message || error);
  }
}

export default function HomePage() {
  const { user, loading: authLoading, register, login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const carouselRef = useRef(null);

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const finishAccount = async (account) => {
    const profile = await ensureUserProfile(account);
    await sendWelcomeOnce(account, profile?.created === true);
    router.replace('/dashboard');
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (mode === 'register' && password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.');
    setBusy(true);
    try {
      if (mode === 'register') {
        const credential = await register(email.trim(), password);
        await finishAccount(credential.user);
      } else {
        const credential = await login(email.trim(), password);
        await finishAccount(credential.user);
      }
    } catch (err) {
      const code = err.code || '';
      setError(code === 'auth/email-already-in-use' ? 'Cette adresse e-mail est déjà utilisée.'
        : code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Adresse e-mail ou mot de passe incorrect.'
        : code === 'auth/user-not-found' ? 'Aucun compte ne correspond à cette adresse.'
        : code === 'auth/invalid-email' ? 'Adresse e-mail invalide.'
        : err.message || 'Une erreur est survenue. Réessaie.');
    } finally { setBusy(false); }
  };

  const google = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      const account = await loginWithGoogle();
      if (account) await finishAccount(account);
    } catch (err) { setError(err.message || 'Connexion Google impossible.'); }
    finally { setGoogleBusy(false); }
  };

  const moveSlide = (next) => {
    const target = Math.max(0, Math.min(slides.length - 1, next));
    setSlide(target);
    carouselRef.current?.children?.[target]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };
  const nextSlide = () => moveSlide(slide + 1);
  const previousSlide = () => moveSlide(slide - 1);
  const onCarouselScroll = (event) => {
    const width = event.currentTarget.clientWidth || 1;
    setSlide(Math.round(event.currentTarget.scrollLeft / width));
  };

  const renderAuthCard = (formId) => (
    <section id={formId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,.25)] sm:p-7">
      <div className="flex items-center gap-2">
        <div><p className="text-sm font-bold text-slate-900">{mode === 'register' ? 'Créer mon espace' : 'Retrouver mon espace'}</p><p className="text-xs text-slate-500">{mode === 'register' ? 'Deux informations pour commencer.' : 'Connecte-toi à ton compte Pata.'}</p></div>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Adresse e-mail
          <span className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#0b5c46]"><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com" className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"/></span>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Mot de passe
          <span className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#0b5c46]"><input type={showPassword?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'Au moins 6 caractères':'Ton mot de passe'} className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"/><button type="button" onClick={()=>setShowPassword(v=>!v)} className="text-xs font-semibold text-slate-500">{showPassword?'Masquer':'Afficher'}</button></span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
        <button type="submit" disabled={busy || googleBusy || !email.trim() || !password} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-sm font-bold text-white transition hover:bg-[#084b39] disabled:opacity-50">
          {busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>
      <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-slate-100"/><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ou</span><span className="h-px flex-1 bg-slate-100"/></div>
      <button type="button" onClick={google} disabled={busy || googleBusy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {googleBusy ? 'Connexion…' : 'Continuer avec Google'}
      </button>
      <p className="mt-5 text-center text-xs text-slate-500">{mode === 'register' ? 'Tu as déjà un compte ?' : 'Tu découvres Pata ?'}{' '}<button type="button" onClick={()=>{setMode(mode==='register'?'login':'register');setError('');}} className="font-bold text-[#0b5c46] hover:underline">{mode==='register'?'Se connecter':'Créer un compte'}</button></p>
      {mode === 'register' && <p className="mt-3 text-center text-[10px] leading-5 text-slate-400">En créant ton compte, tu acceptes les <Link href="/conditions" className="underline">conditions d’utilisation</Link> et la <Link href="/confidentialite" className="underline">politique de confidentialité</Link>.</p>}
    </section>
  );

  if (authLoading || user) return <main className="grid min-h-screen place-items-center bg-[#f5f8f6]"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#0b5c46] border-t-transparent"/></main>;

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5"><img src="/android-chrome-192x192.png" alt="Pata" className="h-9 w-9 rounded-lg"/><span className="text-lg font-extrabold tracking-tight text-slate-900">Pata</span></Link>
          <div className="flex items-center gap-2"><a href="#connexion-mobile" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex lg:hidden">Connexion</a><a href="#connexion" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 lg:inline-flex">Connexion</a><PWAInstallButton/></div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:gap-14 lg:py-14">
        <div className="hidden lg:block">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#0b5c46]">Tes finances, avec une méthode claire</p>
          <h1 className="mt-4 max-w-2xl text-5xl font-bold leading-[1.1] tracking-tight text-slate-950 xl:text-6xl">Ton argent mérite mieux qu’une mémoire approximative.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Pata rassemble tes dépenses, tes revenus, tes budgets et tes objectifs d’épargne. Tu vois ce qui entre, ce qui sort et ce que tu construis — dans un seul espace.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold text-slate-600"><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Suivi précis</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Budgets concrets</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2">Épargne suivie</span></div>
          <div className="mt-10 rounded-3xl border border-[#e1eae4] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-slate-500">UNE VUE D’ENSEMBLE</p><p className="mt-1 text-lg font-bold">Tes mouvements, enfin réunis.</p></div><span className="text-xs font-bold text-[#0b5c46]">PATA</span></div>
            <svg viewBox="0 0 600 170" className="mt-5 w-full" role="img" aria-label="Illustration de suivi des revenus, dépenses et épargne">
              <path d="M24 137H576" stroke="#e2e8f0" strokeWidth="2"/>
              <path d="M28 108 C85 108 92 65 150 65 S210 115 260 91 S340 46 392 62 S480 33 570 18" fill="none" stroke="#0b5c46" strokeWidth="4" strokeLinecap="round" strokeDasharray="700" className="pata-draw"/>
              <path d="M28 145 C100 145 125 125 175 131 S280 105 330 120 S440 100 570 91" fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round"/>
              {[150,260,392,570].map((x,i)=><circle key={x} cx={x} cy={[65,91,62,18][i]} r="5" fill="#0b5c46"/>)}
            </svg>
            <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4"><div><p className="text-[10px] text-slate-400">Dépenses</p><p className="mt-1 text-sm font-bold">Suivies</p></div><div><p className="text-[10px] text-slate-400">Budgets</p><p className="mt-1 text-sm font-bold">Maîtrisés</p></div><div><p className="text-[10px] text-slate-400">Objectifs</p><p className="mt-1 text-sm font-bold">Mesurés</p></div></div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
          <div className="mb-5 lg:hidden"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0b5c46]">Tes finances, avec une méthode claire</p><h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-slate-950">Ton argent mérite mieux qu’une mémoire approximative.</h1><p className="mt-2 text-sm leading-6 text-slate-600">Dépenses, revenus, budgets, épargne et analyses : tout est réuni dans Pata.</p></div>
          <div className="hidden lg:block">{renderAuthCard('connexion')}</div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-8 lg:hidden">
        <div className="px-4"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0b5c46]">Découvrir Pata</p><p className="mt-1 text-lg font-bold">Trois façons de reprendre la main.</p></div><span className="text-xs tabular-nums text-slate-400">{slide+1}/3</span></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf9]">
            <div ref={carouselRef} onScroll={onCarouselScroll} className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {slides.map((item)=><article key={item.mark} className="w-full shrink-0 snap-start p-5">
                <div className="flex h-36 items-center justify-center rounded-xl bg-white">
                  {item.art==='flow' ? <svg viewBox="0 0 270 110" className="h-full w-full max-w-xs"><path d="M15 85H255" stroke="#dbe5df" strokeWidth="2"/><path d="M20 75L80 53L130 65L190 32L250 18" fill="none" stroke="#0b5c46" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="360" className="pata-draw"/><circle cx="250" cy="18" r="5" fill="#0b5c46"/></svg>
                    : item.art==='ai' ? <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-[#dbe9e0] bg-[#edf5f0]"><BrainCircuit className="h-12 w-12 text-[#0b5c46]" strokeWidth={1.7}/></div>
                    : <svg viewBox="0 0 270 110" className="h-full w-full max-w-xs"><rect x="22" y="15" width="226" height="82" rx="12" fill="#f5f8f6" stroke="#dce8e0"/><path d="M135 35v44M93 57h84" stroke="#0b5c46" strokeWidth="3" strokeLinecap="round"/><circle cx="135" cy="57" r="27" fill="none" stroke="#9ab6a4" strokeWidth="3" strokeDasharray="6 6"/></svg>}
                </div>
                <p className="mt-5 text-[10px] font-bold tracking-[.16em] text-[#0b5c46]">{item.eyebrow}</p><h2 className="mt-2 text-xl font-bold leading-tight">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
              </article>)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between"><div className="flex gap-1.5">{slides.map((s,i)=><button key={s.mark} aria-label={`Présentation ${i+1}`} onClick={()=>moveSlide(i)} className={`h-1.5 rounded-full transition-all ${slide===i?'w-7 bg-[#0b5c46]':'w-2 bg-slate-300'}`}/>)}</div><div className="flex gap-2"><button type="button" onClick={previousSlide} disabled={slide===0} className="h-9 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-30">Précédent</button><button type="button" onClick={nextSlide} disabled={slide===2} className="h-9 rounded-full bg-[#0b5c46] px-3 text-xs font-semibold text-white disabled:opacity-30">Suivant</button></div></div>
          <a href="#connexion-mobile" className="mt-5 flex h-11 items-center justify-center rounded-xl border border-[#0b5c46]/20 text-sm font-bold text-[#0b5c46]">Créer mon compte ou me connecter</a>
        </div>
      </section>

      <section className="mx-auto max-w-md px-4 py-10 lg:hidden">{renderAuthCard('connexion-mobile')}</section>

      <section className="mx-auto hidden max-w-7xl grid-cols-3 gap-5 px-6 py-14 lg:grid">
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">MČ · ASSISTANCE INTELLIGENTE</p><h2 className="mt-3 text-xl font-bold">Une aide qui part de tes données.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Mč peut expliquer tes mouvements, analyser une dépense, comparer tes habitudes et t’aider à bâtir un budget réaliste. Les actions restent sous ton contrôle.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">SUIVI FINANCIER</p><h2 className="mt-3 text-xl font-bold">Pas seulement un carnet de dépenses.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Relie tes revenus, tes dépenses et tes budgets. Les rapports montrent les écarts et les tendances, sans devoir tout recalculer manuellement.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">ÉPARGNE & PREMIUM</p><h2 className="mt-3 text-xl font-bold">Construis un objectif à ton rythme.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Crée une épargne, organise tes versements et observe ta progression. Le compte gratuit permet de commencer. Premium coûte 2 500 FCFA pour 30 jours et ouvre davantage de possibilités.</p><Link href="/premium" className="mt-3 inline-flex text-sm font-semibold text-[#0b5c46]">Découvrir Premium</Link></article>
      </section>
      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500"><p>© {new Date().getFullYear()} Pata · Tes finances, mieux organisées.</p><div className="mt-2 flex flex-wrap justify-center gap-4"><Link href="/conditions" className="hover:underline">Conditions</Link><Link href="/confidentialite" className="hover:underline">Confidentialité</Link><Link href="/support" className="hover:underline">Assistance : +1 (242) 454-2961</Link></div></footer>
      <style jsx>{`
        .pata-draw { animation: draw 2.4s ease-out both; }
        @keyframes draw { from { stroke-dashoffset: 360; opacity:.3 } to { stroke-dashoffset:0; opacity:1 } }
        @media (prefers-reduced-motion: reduce) { .pata-draw { animation:none; } }
      `}</style>
    </main>
  );
}

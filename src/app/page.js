'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { PWAInstallButton } from '@/components/PWAInstallButton';
import { ensureUserProfile } from '@/lib/firestore/profile';

const slides = [
  { eyebrow: 'UNE VUE PLUS CLAIRE', title: 'Sache où va ton argent.', text: 'Enregistre tes dépenses et tes revenus au même endroit. Pata transforme tes saisies en une vision simple de ton mois.', mark: '01', art: 'flow' },
  { eyebrow: 'MČ · TON ASSISTANTE', title: 'Comprends tes chiffres, pas seulement tes tableaux.', text: 'Pose tes questions à Mč. Elle peut analyser tes dépenses, t’aider à préparer un budget et t’expliquer les tendances de tes finances.', mark: '02', art: 'ai' },
  { eyebrow: 'BUDGETS & ÉPARGNE', title: 'Donne une direction à chaque franc.', text: 'Fixe tes limites, crée des objectifs d’épargne et suis tes versements pour avancer avec une méthode adaptée à tes moyens.', mark: '03', art: 'savings' },
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
        await login(email.trim(), password);
        router.replace('/dashboard');
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

  const nextSlide = () => setSlide((current) => Math.min(slides.length - 1, current + 1));
  const previousSlide = () => setSlide((current) => Math.max(0, current - 1));

  const authCard = (
    <section id="connexion" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,.25)] sm:p-7">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf5f0] text-[#0b5c46]"><Lock size={17}/></span>
        <div><p className="text-sm font-bold text-slate-900">{mode === 'register' ? 'Créer mon espace' : 'Retrouver mon espace'}</p><p className="text-xs text-slate-500">{mode === 'register' ? 'Deux informations pour commencer.' : 'Connecte-toi à ton compte Pata.'}</p></div>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Adresse e-mail
          <span className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#0b5c46]"><Mail size={16} className="text-slate-400"/><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nom@exemple.com" className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"/></span>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Mot de passe
          <span className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#0b5c46]"><Lock size={16} className="text-slate-400"/><input type={showPassword?'text':'password'} autoComplete={mode==='register'?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'Au moins 6 caractères':'Ton mot de passe'} className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none"/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Masquer':'Afficher'} className="text-slate-400"><Eye size={16}/></button></span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p>}
        <button type="submit" disabled={busy || googleBusy || !email.trim() || !password} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-sm font-bold text-white transition hover:bg-[#084b39] disabled:opacity-50">
          {busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'} <ArrowRight size={16}/>
        </button>
      </form>
      <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-slate-100"/><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ou</span><span className="h-px flex-1 bg-slate-100"/></div>
      <button type="button" onClick={google} disabled={busy || googleBusy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {googleBusy ? 'Connexion…' : <><svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 32 15.1l5.7-5.7A20 20 0 1 0 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continuer avec Google</>}
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
          <div className="flex items-center gap-2"><a href="#connexion" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex">Connexion</a><PWAInstallButton/></div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:gap-14 lg:py-14">
        <div className="hidden lg:block">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#0b5c46]">Tes finances, avec une méthode claire</p>
          <h1 className="mt-4 max-w-2xl text-5xl font-bold leading-[1.1] tracking-tight text-slate-950 xl:text-6xl">Ton argent mérite mieux qu’une mémoire approximative.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Pata rassemble tes dépenses, tes revenus, tes budgets et tes objectifs d’épargne. Tu vois ce qui entre, ce qui sort et ce que tu construis — dans un seul espace.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs font-semibold text-slate-600"><span className="rounded-full border border-slate-200 bg-white px-3 py-2"><Check size={13} className="mr-1 inline text-[#0b5c46]"/> Suivi précis</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2"><Check size={13} className="mr-1 inline text-[#0b5c46]"/> Budgets concrets</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2"><Check size={13} className="mr-1 inline text-[#0b5c46]"/> Épargne suivie</span></div>
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
          {authCard}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-8 lg:hidden">
        <div className="px-4"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0b5c46]">Découvrir Pata</p><p className="mt-1 text-lg font-bold">Trois façons de reprendre la main.</p></div><span className="text-xs tabular-nums text-slate-400">{slide+1}/3</span></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f8faf9]">
            <div className="flex transition-transform duration-500 ease-out" style={{transform:`translateX(-${slide*100}%)`}}>
              {slides.map((item)=><article key={item.mark} className="w-full shrink-0 p-5">
                <div className="flex h-36 items-center justify-center rounded-xl bg-white">
                  {item.art==='flow' ? <svg viewBox="0 0 270 110" className="h-full w-full max-w-xs"><path d="M15 85H255" stroke="#dbe5df" strokeWidth="2"/><path d="M20 75L80 53L130 65L190 32L250 18" fill="none" stroke="#0b5c46" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="360" className="pata-draw"/><circle cx="250" cy="18" r="5" fill="#0b5c46"/></svg>
                    : item.art==='ai' ? <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-[#dbe9e0] bg-[#edf5f0]"><svg viewBox="0 0 64 64" className="h-12 w-12"><path d="M32 7l4.8 15.2L52 27l-15.2 4.8L32 47l-4.8-15.2L12 27l15.2-4.8L32 7Z" fill="none" stroke="#0b5c46" strokeWidth="2.5" strokeLinejoin="round"/><path d="M49 42l2.5 7.5L59 52l-7.5 2.5L49 62l-2.5-7.5L39 52l7.5-2.5L49 42Z" fill="none" stroke="#7a9d88" strokeWidth="2"/></svg></div>
                    : <svg viewBox="0 0 270 110" className="h-full w-full max-w-xs"><rect x="22" y="15" width="226" height="82" rx="12" fill="#f5f8f6" stroke="#dce8e0"/><path d="M135 35v44M93 57h84" stroke="#0b5c46" strokeWidth="3" strokeLinecap="round"/><circle cx="135" cy="57" r="27" fill="none" stroke="#9ab6a4" strokeWidth="3" strokeDasharray="6 6"/></svg>}
                </div>
                <p className="mt-5 text-[10px] font-bold tracking-[.16em] text-[#0b5c46]">{item.eyebrow}</p><h2 className="mt-2 text-xl font-bold leading-tight">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
              </article>)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between"><div className="flex gap-1.5">{slides.map((s,i)=><button key={s.mark} aria-label={`Présentation ${i+1}`} onClick={()=>setSlide(i)} className={`h-1.5 rounded-full transition-all ${slide===i?'w-7 bg-[#0b5c46]':'w-2 bg-slate-300'}`}/>)}</div><div className="flex gap-2"><button type="button" onClick={previousSlide} disabled={slide===0} aria-label="Précédent" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-600 disabled:opacity-30"><ChevronLeft size={17}/></button><button type="button" onClick={nextSlide} disabled={slide===2} aria-label="Suivant" className="grid h-9 w-9 place-items-center rounded-full bg-[#0b5c46] text-white disabled:opacity-30"><ChevronRight size={17}/></button></div></div>
          <a href="#connexion" className="mt-5 flex h-11 items-center justify-center rounded-xl border border-[#0b5c46]/20 text-sm font-bold text-[#0b5c46]">Créer mon compte ou me connecter</a>
        </div>
      </section>

      <section className="mx-auto hidden max-w-7xl grid-cols-3 gap-5 px-6 py-14 lg:grid">
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">MČ · ASSISTANCE INTELLIGENTE</p><h2 className="mt-3 text-xl font-bold">Une aide qui part de tes données.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Mč peut expliquer tes mouvements, analyser une dépense, comparer tes habitudes et t’aider à bâtir un budget réaliste. Les actions restent sous ton contrôle.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">SUIVI FINANCIER</p><h2 className="mt-3 text-xl font-bold">Pas seulement un carnet de dépenses.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Relie tes revenus, tes dépenses et tes budgets. Les rapports montrent les écarts et les tendances, sans devoir tout recalculer manuellement.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-6"><p className="text-xs font-bold text-[#0b5c46]">ÉPARGNE & PREMIUM</p><h2 className="mt-3 text-xl font-bold">Construis un objectif à ton rythme.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Crée une épargne, organise tes versements et observe ta progression. Le compte gratuit permet de commencer ; Premium ouvre davantage de capacités et de limites.</p><Link href="/premium" className="mt-3 inline-flex text-sm font-semibold text-[#0b5c46]">Découvrir Premium <ArrowRight size={15} className="ml-1"/></Link></article>
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

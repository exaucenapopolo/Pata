'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';

const SUPPORT_WHATSAPP = '14236752034';

export default function SupportPage() {
  const [reason, setReason] = useState('Question sur l’application');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const send = (event) => {
    event.preventDefault();
    const text = [
      'Bonjour l’équipe Pata, j’ai besoin d’assistance.',
      '',
      'Motif : ' + reason,
      'Adresse e-mail du compte : ' + (email.trim() || 'Non précisée'),
      '',
      'Mon message :',
      message.trim(),
      '',
      'Merci de votre aide.',
    ].join('\n');
    window.location.href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  };

  return <main className="min-h-screen bg-[#f5f8f6] px-4 py-8 text-slate-900 sm:py-12">
    <div className="mx-auto max-w-xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft size={16}/> Retour à Pata</Link>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <img src="/android-chrome-192x192.png" alt="Pata" className="h-12 w-12 rounded-xl"/>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0b5c46]">Assistance Pata</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Dis-nous ce qui bloque.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Quelques précisions nous aideront à comprendre ta demande avant l’ouverture de WhatsApp.</p>
        <form onSubmit={send} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Motif du contact
            <select value={reason} onChange={e=>setReason(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-[#0b5c46]">
              <option>Question sur l’application</option><option>Problème de connexion</option><option>Dépense, revenu ou budget</option><option>Épargne ou retrait</option><option>Paiement ou abonnement Premium</option><option>Problème technique</option><option>Suggestion ou autre demande</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">E-mail de ton compte (facultatif)
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="exemple@email.com" className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-[#0b5c46]"/>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Explique-nous ta demande
            <textarea required minLength={8} maxLength={1500} rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Décris ce qui s’est passé, le résultat attendu et, si possible, le moment où le problème est survenu." className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-[#0b5c46]"/>
          </label>
          <button type="submit" disabled={message.trim().length<8} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-sm font-bold text-white disabled:opacity-50"><MessageCircle size={17}/> Continuer sur WhatsApp</button>
        </form>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-700">Tu préfères un autre moyen de contact ?</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <a href="https://wa.me/14236752034" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-xs font-semibold text-emerald-800">WhatsApp<br/>+1 (423) 675-2034</a>
            <a href="tel:+237681144638" className="rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-semibold text-slate-700">Appel direct<br/>+237 681 14 46 38</a>
            <a href="mailto:support@pata-yam.site" className="rounded-xl border border-slate-200 bg-white p-3 text-center text-xs font-semibold text-slate-700">E-mail<br/>support@pata-yam.site</a>
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">Consulte d’abord le <a href="/help" className="font-semibold text-[#075b43] underline">Centre d’aide</a> pour les questions d’utilisation courantes.</p>
        </div>
      </section>
    </div>
  </main>;
}

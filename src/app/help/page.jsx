'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, ChevronDown, Mail, MessageCircle, Phone, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { AssistantButton } from '@/components/ai/AssistantButton';
import { HELP_EN, HELP_FR } from '@/lib/ai/helpKnowledge.mjs';

export default function HelpPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [search, setSearch] = useState('');
  const sections = isEnglish ? HELP_EN : HELP_FR;

  const askMč = (question) => {
    const prompt = isEnglish
      ? 'Use the Pata Help Center to answer this question in plain English. Explain the exact steps for phone and computer when relevant, and include a simple example if it helps. Do not change any account data. Question: ' + question
      : 'Utilise le centre d’aide de Pata pour répondre simplement à cette question. Donne les étapes exactes sur téléphone et ordinateur lorsque c’est utile, et un exemple facile à comprendre si cela aide. Ne modifie aucune donnée du compte. Question : ' + question;
    window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
  };

  const filteredSections = useMemo(() => {
    const value = search.trim().toLocaleLowerCase();
    if (!value) return sections;
    return sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => (item.q + ' ' + item.a).toLocaleLowerCase().includes(value)),
    })).filter((section) => section.items.length > 0);
  }, [sections, search]);

  return (
    <main className="min-h-[100dvh] bg-[#f5f8f6] px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft size={16}/> {isEnglish ? 'Back to settings' : 'Retour aux paramètres'}</Link>
        <header className="overflow-hidden rounded-3xl bg-[#0b5c46] p-5 text-white sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><BookOpen size={21}/></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100">Pata · {isEnglish ? 'Help Center' : 'Centre d’aide'}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{isEnglish ? 'Find your answer' : 'Trouve la réponse à ta question'}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50">{isEnglish ? 'Step-by-step instructions for using Pata. Check here before contacting the support team.' : 'Des explications simples et des étapes concrètes pour utiliser Pata. Consulte ces réponses avant de contacter l’assistance.'}</p>
            </div>
          </div>
          <label className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 text-slate-500">
            <Search size={17}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isEnglish ? 'Search a question or feature…' : 'Rechercher une question ou une fonctionnalité…'} className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"/>
          </label>
        </header>

        <div className="space-y-5">
          {filteredSections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-bold text-slate-900">{section.title}</h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <details key={item.q} className="group rounded-xl border border-slate-100 bg-slate-50/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                      <span>{item.q}</span>
                      <ChevronDown size={16} className="shrink-0 text-slate-400 transition group-open:rotate-180"/>
                    </summary>
                    <div className="border-t border-slate-100 px-3 py-3">
                      <p className="text-xs leading-6 text-slate-600">{item.a}</p>
                      <button type="button" onClick={() => askMč(item.q)} className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-[#0b5c46] hover:bg-emerald-50">
                        <Sparkles size={13}/>{isEnglish ? 'Ask Mč to explain this' : 'Demander à Mč de mieux expliquer'}
                      </button>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
          {!filteredSections.length && <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center"><p className="text-sm font-semibold text-slate-800">{isEnglish ? 'No matching answer' : 'Aucune réponse trouvée'}</p><p className="mt-1 text-xs text-slate-500">{isEnglish ? 'Try another word or contact support below.' : 'Essaie un autre mot ou contacte l’assistance ci-dessous.'}</p></div>}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#0b5c46]"><ShieldCheck size={19}/></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{isEnglish ? 'Still need help?' : 'Tu n’as pas trouvé ta réponse ?'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{isEnglish ? 'Contact the Pata team for a technical issue, account access problem or a question not covered above. Choose the channel that suits you.' : 'Pour un problème technique, un souci d’accès au compte ou une question qui n’est pas traitée ci-dessus, contacte directement l’équipe Pata par le canal qui te convient.'}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <a href="https://wa.me/14236752034" target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left hover:bg-emerald-100">
              <MessageCircle size={19} className="shrink-0 text-emerald-700"/>
              <span><strong className="block text-xs text-emerald-900">WhatsApp</strong><span className="text-[11px] text-emerald-800">+1 (423) 675-2034</span></span>
            </a>
            <a href="tel:+237681144638" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50">
              <Phone size={19} className="shrink-0 text-slate-600"/>
              <span><strong className="block text-xs text-slate-900">{isEnglish ? 'Phone call' : 'Appel direct'}</strong><span className="text-[11px] text-slate-600">+237 681 14 46 38</span></span>
            </a>
            <a href="mailto:support@pata-yam.site" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50">
              <Mail size={19} className="shrink-0 text-slate-600"/>
              <span><strong className="block text-xs text-slate-900">E-mail</strong><span className="break-all text-[11px] text-slate-600">support@pata-yam.site</span></span>
            </a>
          </div>
          <Link href="/support" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#0b5c46] hover:bg-emerald-50"><Sparkles size={15}/>{isEnglish ? 'Describe a specific problem to support' : 'Décrire un problème précis à l’assistance'} →</Link>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">{isEnglish ? 'Follow Pata' : 'Suis aussi Pata'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="https://www.facebook.com/share/1Rd13NJTpL/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <img src="/facebook-mark.svg" alt="" width="22" height="22"/> Facebook
              </a>
              <a href="https://whatsapp.com/channel/0029VbEP2fSAInPrijieOK3k" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <img src="/whatsapp-mark.svg" alt="" width="22" height="22"/> {isEnglish ? 'WhatsApp channel' : 'Chaîne WhatsApp'}
              </a>
            </div>
          </div>
        </section>
      </div>
      <AssistantButton showLauncher={false}/>
    </main>
  );
}

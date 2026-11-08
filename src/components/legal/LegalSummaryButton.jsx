'use client';

import { Sparkles } from 'lucide-react';
import { AssistantButton } from '@/components/ai/AssistantButton';

export function LegalSummaryButton({ documentTitle }) {
  const openSummary = () => {
    const documentElement = window.document.querySelector('[data-legal-document]');
    const documentText = String(documentElement?.innerText || '').trim();
    if (!documentText) {
      window.alert("Le contenu du document n'est pas disponible pour le moment.");
      return;
    }

    const prompt = [
      `Explique brièvement « ${documentTitle} » de Pata.`,
      "Lis le contenu ci-dessous et explique-le en français simple, sans inventer d’information.",
      "Commence par un paragraphe très court de 1 à 2 phrases qui débute par **En bref —**.",
      "Donne au maximum 3 points essentiels : engagements, frais ou obligations, données et choix.",
      "Explique les mots compliqués. N’affiche pas un long rapport, ne répète pas le document et ne donne pas un avis juridique.",
      "Réponse courte : 120 mots maximum.",
      "",
      "CONTENU DU DOCUMENT :",
      documentText.slice(0, 5000),
    ].join("\n\n");

    window.dispatchEvent(new CustomEvent('pata:assistant-open', {
      detail: { prompt },
    }));
  };

  return (
    <>
      <AssistantButton showLauncher={false}/>
      <button
        type="button"
        onClick={openSummary}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white px-3.5 py-2 text-xs font-semibold text-brand-800 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Sparkles size={15}/>
        Comprendre avec Mč
      </button>
    </>
  );
}

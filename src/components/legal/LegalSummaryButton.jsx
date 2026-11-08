'use client';

import { Sparkles } from 'lucide-react';

export function LegalSummaryButton({ documentTitle }) {
  const openSummary = () => {
    const documentElement = window.document.querySelector('[data-legal-document]');
    const documentText = String(documentElement?.innerText || '').trim();
    if (!documentText) {
      window.alert("Le contenu du document n'est pas disponible pour le moment.");
      return;
    }

    const prompt = [
      `Aide-moi à comprendre le document « ${documentTitle} » de Pata.`,
      "Lis le contenu ci-dessous et explique-le en français simple, sans inventer d’information.",
      "Commence par un paragraphe très court de 1 à 2 phrases qui débute par **En bref —**.",
      "Présente ensuite au maximum 4 points importants : ce que l’utilisateur accepte, les frais ou obligations éventuels, les données concernées et les choix dont il dispose.",
      "Explique les mots compliqués. N’affiche pas un long rapport, ne répète pas le document et ne donne pas un avis juridique.",
      "Termine en proposant d’expliquer une clause précise si l’utilisateur le souhaite.",
      "",
      "CONTENU DU DOCUMENT :",
      documentText.slice(0, 18000),
    ].join("\n\n");

    window.dispatchEvent(new CustomEvent('pata:assistant-open', {
      detail: { prompt },
    }));
  };

  return (
    <button
      type="button"
      onClick={openSummary}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white px-3.5 py-2 text-xs font-semibold text-brand-800 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <Sparkles size={15}/>
      Comprendre avec Mč
    </button>
  );
}

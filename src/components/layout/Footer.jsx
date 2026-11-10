import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 sm:px-6">
      <p>© {new Date().getFullYear()} <span className="font-semibold text-slate-700">Pata</span> — Gère ton argent, discipline ton épargne.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/confidentialite" className="hover:text-slate-900 hover:underline">Politique de confidentialité</Link>
        <Link href="/conditions" className="hover:text-slate-900 hover:underline">Conditions d’utilisation</Link>
        <Link href="/support" className="hover:text-slate-900 hover:underline">Assistance WhatsApp · +237 681 14 46 38</Link>
      </div>
    </footer>
  );
}

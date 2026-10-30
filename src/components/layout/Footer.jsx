export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 sm:px-6">
      © {new Date().getFullYear()} <span className="font-semibold text-slate-700">Pata</span> — Gère ton argent, discipline ton épargne.
    </footer>
  );
}

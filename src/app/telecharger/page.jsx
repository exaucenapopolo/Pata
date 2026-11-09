import Link from 'next/link';

export const metadata = {
  title: 'Télécharger Pata Android',
  description: 'Télécharge l’application Android Pata et active l’import Mobile Money par SMS.',
};

export default function TelechargerPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f8f6] px-4 py-10 text-slate-900 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#075b43]">
          <img src="/android-chrome-192x192.png" alt="" className="h-9 w-9 rounded-xl"/> Pata
        </Link>
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#075b43]">Application Android</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Pata sur ton téléphone</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">L’application Android conserve les fonctionnalités de Pata et ajoute la détection locale des confirmations Mobile Money, avec un écran de vérification avant chaque enregistrement.</p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-950">Téléchargement de la version Android</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">La version signée n’est pas encore publiée. Le lien sera activé après la compilation et la configuration de la signature de distribution.</p>
            <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-500">APK bientôt disponible</button>
          </div>
          <div className="mt-7 space-y-4">
            <h2 className="text-base font-bold">Installation de l’APK</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>Télécharge l’APK depuis cette page lorsque la version est publiée.</li>
              <li>Ouvre le fichier téléchargé et, si Android le demande, autorise l’installation depuis cette source (Chrome ou ton gestionnaire de fichiers).</li>
              <li>Termine l’installation puis connecte-toi à ton compte Pata.</li>
              <li>Dans Paramètres, active l’import SMS. Android demandera les autorisations prises en charge par ton appareil.</li>
              <li>Sur Tecno, Infinix et Xiaomi, vérifie les paramètres de batterie et autorise Pata à fonctionner en arrière-plan.</li>
            </ol>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-bold text-slate-900">À propos de l’autorisation SMS</h2>
            <p className="mt-2 text-xs leading-5 text-slate-600">Android classe RECEIVE_SMS comme une autorisation fortement restreinte. Selon le canal d’installation et la version du système, l’installateur doit autoriser cette permission ; un simple accord dans l’écran runtime ne suffit pas toujours. Le partage manuel d’un SMS reste le mode de repli lorsqu’Android refuse cette autorisation.</p>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">La version web/PWA reste accessible sur <a className="font-semibold text-[#075b43] underline" href="https://www.pata-yam.site/">pata-yam.site</a>.</p>
        </section>
      </div>
    </main>
  );
}

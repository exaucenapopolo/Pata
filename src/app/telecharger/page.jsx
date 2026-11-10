import Link from 'next/link';
import { ArrowLeft, BatteryCharging, CheckCircle2, Download, ShieldCheck, Smartphone } from 'lucide-react';
import { AndroidDownloadCard } from '@/components/AndroidDownloadCard';

export const metadata = {
  title: 'Télécharger Pata Android',
  description: 'Installe Pata sur Android pour suivre automatiquement tes confirmations Mobile Money.',
};

function Step({ number, title, children }) {
  return (
    <li className="relative pl-12">
      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf5ef] text-sm font-bold text-[#075b43]">{number}</span>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <div className="mt-1 text-xs leading-5 text-slate-600">{children}</div>
    </li>
  );
}

export default function TelechargerPage() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f8f6] px-4 py-7 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#075b43]">
            <img src="/android-chrome-192x192.png" alt="" className="h-9 w-9 rounded-xl" /> Pata
          </Link>
          <Link href="/settings" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
            <ArrowLeft size={15} /> Retour
          </Link>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[#0b5c46] px-5 py-6 text-white sm:px-8 sm:py-8">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100">Pata pour Android</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Ton suivi financier, même sans tout saisir.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50">L’application Android peut reconnaître les confirmations Mobile Money directement sur ton téléphone et t’aider à garder tes opérations à jour.</p>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <Smartphone size={18} className="text-[#0b5c46]" />
              <p className="mt-2 text-xs font-bold text-slate-900">Détection locale</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">Les confirmations MTN MoMo et Orange Money sont repérées sur ton téléphone.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <CheckCircle2 size={18} className="text-[#0b5c46]" />
              <p className="mt-2 text-xs font-bold text-slate-900">Opérations à jour</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">Tes entrées et sorties peuvent être ajoutées à ton suivi sans ressaisie manuelle.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
              <BatteryCharging size={18} className="text-[#0b5c46]" />
              <p className="mt-2 text-xs font-bold text-slate-900">Suivi en arrière-plan</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">Avec les bons réglages de batterie, Pata peut continuer à traiter les confirmations lorsque l’application est fermée.</p>
            </div>
          </div>

          <div className="mx-4 mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:mx-6 sm:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#075b43]" />
              <div>
                <h2 className="text-sm font-bold text-emerald-950">Une fonction réservée à Pata Premium</h2>
                <p className="mt-1 text-xs leading-5 text-emerald-900">Pour enregistrer automatiquement les confirmations Mobile Money dans tes dépenses et tes revenus, l’abonnement Premium est nécessaire : <strong>2 500 FCFA par mois</strong>. Sans Premium, les messages peuvent être détectés, mais les opérations ne sont pas ajoutées à ton compte.</p>
                <Link href="/premium" className="mt-2 inline-flex text-xs font-bold text-[#075b43] underline underline-offset-2">Découvrir Premium</Link>
              </div>
            </div>
          </div>

          <div className="mx-4 mb-6 rounded-2xl border border-slate-200 p-4 sm:mx-6 sm:p-5">
            <div className="flex items-center gap-2">
              <Download size={17} className="text-[#075b43]" />
              <h2 className="text-sm font-bold text-slate-900">Télécharger l’application</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">Télécharge uniquement le fichier proposé ici, depuis le site officiel de Pata.</p>
            <AndroidDownloadCard />
          </div>

          <div className="border-t border-slate-100 px-4 py-5 sm:px-6 sm:py-6">
            <h2 className="text-base font-bold text-slate-900">Installation étape par étape</h2>
            <ol className="mt-5 space-y-5">
              <Step number="1" title="Ouvre le fichier téléchargé">
                Après le téléchargement, ouvre la notification de téléchargement ou va dans <strong>Fichiers → Téléchargements</strong>, puis appuie sur le fichier Pata.
              </Step>
              <Step number="2" title="Autorise cette source à installer Pata">
                Si Android affiche un message, appuie sur <strong>Paramètres</strong>, puis active <strong>Autoriser depuis cette source</strong> pour Chrome ou pour l’application Fichiers qui ouvre le fichier. Reviens ensuite à l’installation.
                <span className="mt-2 block rounded-xl bg-slate-50 p-3">Pour retrouver ce réglage manuellement : <strong>Paramètres → Applications → Accès spécial des applications → Installer des applis inconnues</strong>. Choisis Chrome ou ton gestionnaire de fichiers, puis autorise cette source. Sur Samsung, tu peux aussi passer par <strong>Sécurité et confidentialité → Autres paramètres de sécurité → Installer applis inconnues</strong>. Sur les autres téléphones, recherche « Installer des applis inconnues » dans les paramètres.</span>
              </Step>
              <Step number="3" title="Si Google Play Protect bloque le fichier">
                Ouvre <strong>Play Store → photo de profil → Play Protect → Paramètres</strong>, puis désactive temporairement <strong>Analyser les applications avec Play Protect</strong>. Reviens au fichier Pata et relance l’installation. Une fois Pata installé, retourne au même endroit et réactive cette protection.
                <p className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900">Effectue cette manipulation uniquement si Play Protect bloque l’installation et seulement pour le fichier officiel téléchargé sur pata-yam.site. Garde cette protection activée en temps normal.</p>
              </Step>
              <Step number="4" title="Termine l’installation et connecte-toi">
                Appuie sur <strong>Installer</strong>, attends la fin, ouvre Pata puis connecte-toi avec le compte que tu utilises déjà sur le site.
              </Step>
              <Step number="5" title="Active la détection Mobile Money">
                Dans Pata, ouvre <strong>Paramètres → Import SMS Mobile Money</strong>, active la fonction et accepte l’autorisation de recevoir les SMS. Les notifications sont facultatives : leur refus ne bloque pas l’enregistrement des opérations.
              </Step>
              <Step number="6" title="Autorise Pata à fonctionner en arrière-plan">
                Sur Tecno, Infinix, Xiaomi et certains autres téléphones, ouvre les réglages de batterie de Pata et choisis <strong>Sans restriction</strong> ou <strong>Autoriser l’activité en arrière-plan</strong>. Cela évite que le téléphone arrête trop tôt le suivi automatique.
              </Step>
            </ol>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 text-center sm:px-6">
            <p className="text-xs leading-5 text-slate-600">Tu rencontres encore un blocage pendant l’installation ou l’activation ?</p>
            <a href="https://wa.me/237681144638" className="mt-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#075b43] px-4 text-xs font-bold text-white">Contacter l’assistance WhatsApp</a>
            <p className="mt-3 text-[11px] text-slate-500">La version web reste accessible sur <a className="font-semibold text-[#075b43] underline" href="https://pata-yam.site/">pata-yam.site</a>, sans installation.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
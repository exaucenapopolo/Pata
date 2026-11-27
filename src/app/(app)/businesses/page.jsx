'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus, ArrowRight, LockKeyhole, Crown, RefreshCw } from 'lucide-react';
import { CloudinaryImageField } from '@/components/ui/CloudinaryImageField';
import { useBusinesses } from '@/hooks/useBusinesses';
import { createBusiness } from '@/lib/business/client';
import { useLanguage } from '@/context/LanguageContext';

const BUSINESS_ACTIVITIES = [
  ['commerce','Commerce / vente au détail'],['wholesale','Commerce de gros / distribution'],['restaurant','Restaurant / alimentation'],['agriculture','Agriculture / élevage'],['transport','Transport / logistique'],['technology','Informatique / technologie'],['telecom','Télécommunications'],['construction','Bâtiment / travaux publics'],['real_estate','Immobilier'],['health','Santé / pharmacie'],['education','Éducation / formation'],['finance','Finance / assurance'],['consulting','Conseil / services professionnels'],['marketing','Marketing / communication'],['beauty','Beauté / bien-être'],['industry','Industrie / fabrication'],['craft','Artisanat'],['tourism','Tourisme / hébergement'],['cleaning','Nettoyage / entretien'],['other','Autre activité'],
];

export default function BusinessesPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const en = language === 'en';
  const { businesses, premiumActive, loading, error, refresh } = useBusinesses();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ name: '', activity: '', activityCustom: '', legalForm: '', city: '', phone: '', logoUrl: '' });

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!premiumActive) {
      router.push('/premium');
      return;
    }
    setSaving(true);
    try {
      const business = await createBusiness({ ...form, activity: BUSINESS_ACTIVITIES.find(([value]) => value === form.activity)?.[1] || form.activity });
      await refresh();
      router.push('/businesses/' + business.id);
    } catch (saveError) {
      setFormError(saveError.message || (en ? 'Could not create the business.' : 'Impossible de créer cette entreprise.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{en ? 'Professional workspace' : 'Espace professionnel'}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{en ? 'My businesses' : 'Mes entreprises'}</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{en ? 'Manage your business finances separately from your personal money.' : 'Gère les finances de tes activités séparément de ton argent personnel.'}</p>
        </div>
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 sm:flex"><Building2 size={23}/></div>
      </header>

      {!premiumActive && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 shrink-0 text-amber-700" size={20}/>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-amber-950">{en ? 'Business management is a Premium feature' : 'La gestion d’entreprise nécessite Pata Premium'}</h3>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">{en ? 'You can view businesses already linked to your account, but you cannot create or change professional data without an active Premium subscription.' : 'Tu peux consulter les entreprises déjà liées à ton compte, mais tu ne peux pas en créer ni modifier leurs données sans un abonnement Premium actif.'}</p>
              <Link href="/premium" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white">{en ? 'Activate Premium' : 'Profiter de Premium'} <Crown size={15}/></Link>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">{en ? 'Your business spaces' : 'Tes espaces professionnels'}</h3>
            <p className="mt-1 text-xs text-slate-500">{businesses.length} {en ? 'business(es) linked to this Pata account' : 'entreprise(s) rattachée(s) à ce compte Pata'}</p>
          </div>
          <button type="button" onClick={() => { setFormError(''); setShowForm((value) => !value); }} disabled={!premiumActive} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Plus size={16}/> {en ? 'Create a business' : 'Créer une entreprise'}
          </button>
        </div>

        {showForm && premiumActive && (
          <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 sm:p-4">
            <label className="text-xs font-semibold text-slate-700 sm:col-span-2">{en ? 'Business name' : 'Nom de l’entreprise'}<input required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SOCIAL BOOST HORIZON" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-600"/></label>
            <div className="sm:col-span-2">
              <CloudinaryImageField value={form.logoUrl || ''} onChange={(logoUrl) => setForm((current) => ({ ...current, logoUrl }))} folder="pata/businesses" language={language} label={en ? 'Business logo (optional)' : 'Logo de l’entreprise (facultatif)'} />
            </div>
            <label className="text-xs font-semibold text-slate-700">{en ? 'Business activity' : 'Secteur d’activité'}<select value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-600"><option value="">{en ? 'Choose an activity' : 'Choisir une activité'}</option>{BUSINESS_ACTIVITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {form.activity === 'other' && <label className="text-xs font-semibold text-slate-700">{en ? 'Describe your activity' : 'Précise ton activité'}<input required maxLength={120} value={form.activityCustom} onChange={(e) => setForm({ ...form, activityCustom: e.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal"/></label>}
            <label className="text-xs font-semibold text-slate-700">{en ? 'Legal form (optional)' : 'Forme juridique (facultatif)'}<select value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-600"><option value="">{en ? 'Choose (optional)' : 'Choisir (facultatif)'}</option>{['Entreprise individuelle','SARL','SA','SAS','SNC','Association','Coopérative','Établissement / succursale','Autre'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-700">{en ? 'City (optional)' : 'Ville (facultatif)'}<input maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-600"/></label>
            <label className="text-xs font-semibold text-slate-700">{en ? 'Business phone (optional)' : 'Téléphone professionnel (facultatif)'}<input maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-brand-600"/></label>
            {formError && <p className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? (en ? 'Creating…' : 'Création…') : (en ? 'Create my business' : 'Créer mon entreprise')}</button>
              <button type="button" onClick={() => setShowForm(false)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-600">{en ? 'Cancel' : 'Annuler'}</button>
            </div>
          </form>
        )}

        {loading ? <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin"/>{en ? 'Loading businesses…' : 'Chargement des entreprises…'}</div> : error ? <div className="py-8 text-sm text-red-600">{error} <button type="button" onClick={refresh} className="ml-2 underline">{en ? 'Retry' : 'Réessayer'}</button></div> : businesses.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {businesses.map((business) => (
              <Link key={business.id} href={'/businesses/' + business.id} className="group rounded-2xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/30">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-blue-700">{business.logoUrl ? <img src={business.logoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <Building2 size={21}/>}</span>
                  {business.readOnly ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">{en ? 'View only' : 'Consultation'}</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">{en ? 'Active' : 'Actif'}</span>}
                </div>
                <h4 className="mt-3 font-bold text-slate-900">{business.name}</h4>
                <p className="mt-1 text-xs text-slate-500">{business.activity || (en ? 'Business space' : 'Espace professionnel')} {business.city ? '· ' + business.city : ''}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">{en ? 'Open space' : 'Ouvrir l’espace'} <ArrowRight size={14} className="transition group-hover:translate-x-1"/></span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
            <Building2 size={28} className="mx-auto text-slate-400"/>
            <h4 className="mt-3 font-semibold text-slate-800">{en ? 'No business linked yet' : 'Aucune entreprise pour le moment'}</h4>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{en ? 'Create a dedicated professional space when you are ready. Your personal finances will remain separate.' : 'Crée un espace professionnel lorsque tu seras prêt. Tes finances personnelles resteront séparées.'}</p>
            {!premiumActive && <Link href="/premium" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-xs font-semibold text-brand-800">{en ? 'Discover Premium' : 'Découvrir Premium'} <Crown size={14}/></Link>}
          </div>
        )}
      </section>
      <p className="text-center text-[11px] leading-5 text-slate-400">{en ? 'Your personal account and each business keep separate financial records.' : 'Ton compte personnel et chaque entreprise conservent des données financières séparées.'}</p>
    </div>
  );
}

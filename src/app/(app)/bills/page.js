'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, FileText, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { translateText } from '@/lib/i18n/translations';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';
import { subscribeBills, createBill, updateBill, deactivateBill, payBill } from '@/lib/firestore/bills';

const BILL_TYPES = [
  ['electricity', 'Électricité'],
  ['water', 'Eau'],
  ['rent', 'Loyer'],
  ['television', 'Télévision / Bouquet'],
  ['internet', 'Internet'],
  ['telephone', 'Téléphone'],
  ['taxes', 'Impôts et taxes'],
  ['insurance', 'Assurance'],
  ['school', 'Scolarité'],
  ['other', 'Autre facture'],
];
const FREQUENCIES = [
  ['weekly', 'Chaque semaine'],
  ['monthly', 'Chaque mois'],
  ['quarterly', 'Tous les 3 mois'],
  ['yearly', 'Chaque année'],
  ['once', 'Une seule fois'],
];
const EXPENSE_OPTIONS = [
  ['housing', 'Logement'],
  ['internet', 'Télécom / Internet'],
  ['contribution', 'Cotisations'],
  ['health', 'Santé'],
  ['food', 'Alimentation'],
  ['transport', 'Transport'],
  ['leisure', 'Loisirs'],
  ['other', 'Autres dépenses'],
];
const PAYMENT_SOURCES = [
  ['cash', 'Espèces'],
  ['mtn_momo', 'MTN MoMo'],
  ['orange_money', 'Orange Money'],
  ['bank_transfer', 'Compte bancaire'],
  ['tracked', 'Revenus déjà suivis dans Pata'],
  ['other', 'Autre solde externe'],
];
const CATEGORY_DEFAULTS = {
  electricity: 'housing', water: 'housing', rent: 'housing',
  television: 'internet', internet: 'internet', telephone: 'internet',
  taxes: 'other', insurance: 'other', school: 'other', other: 'other',
};

function todayIso() {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function makeEmptyBill() {
  return {
    id: '', name: '', billType: 'electricity', amount: '', isVariable: false,
    frequency: 'monthly', nextDueDate: todayIso(), reminderDaysBefore: 3,
    expenseCategoryId: 'housing', providerName: '', accountReference: '', note: '',
  };
}

function daysUntil(date) {
  if (!date) return 9999;
  return Math.round((Date.parse(String(date).slice(0, 10) + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000);
}

function frequencyLabel(value) {
  return FREQUENCIES.find(([id]) => id === value)?.[1] || 'Fréquence personnalisée';
}

function monthlyEquivalent(bill) {
  const amount = Number(bill.amount) || 0;
  if (bill.frequency === 'weekly') return amount * 52 / 12;
  if (bill.frequency === 'quarterly') return amount / 3;
  if (bill.frequency === 'yearly') return amount / 12;
  if (bill.frequency === 'once') return 0;
  return amount;
}

export default function BillsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const t = (value) => translateText(value, language);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(makeEmptyBill);
  const [payingBill, setPayingBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', paidDate: todayIso(), paymentSource: 'cash' });

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return subscribeBills(
      user.uid,
      (rows) => { setBills(rows); setLoading(false); },
      (error) => { setFeedback(error?.message || 'Impossible de charger les factures.'); setFeedbackError(true); setLoading(false); }
    );
  }, [user?.uid]);

  const activeBills = useMemo(() => bills.filter((bill) => bill.active !== false), [bills]);
  const overdueBills = useMemo(() => activeBills.filter((bill) => daysUntil(bill.nextDueDate) < 0), [activeBills]);
  const upcomingBills = useMemo(() => activeBills.filter((bill) => daysUntil(bill.nextDueDate) >= 0 && daysUntil(bill.nextDueDate) <= 7), [activeBills]);
  const monthlyTotal = useMemo(() => activeBills.reduce((sum, bill) => sum + monthlyEquivalent(bill), 0), [activeBills]);

  const openCreate = () => {
    setForm(makeEmptyBill());
    setShowEditor(true);
  };

  const openEdit = (bill) => {
    setForm({
      id: bill.id,
      name: bill.name || '',
      billType: bill.billType || 'other',
      amount: String(bill.amount ?? ''),
      isVariable: bill.isVariable === true,
      frequency: bill.frequency || 'monthly',
      nextDueDate: String(bill.nextDueDate || todayIso()).slice(0, 10),
      reminderDaysBefore: Number(bill.reminderDaysBefore ?? 3),
      expenseCategoryId: bill.expenseCategoryId || 'other',
      providerName: bill.providerName || '',
      accountReference: bill.accountReference || '',
      note: bill.note || '',
    });
    setShowEditor(true);
  };

  const saveBill = async (event) => {
    event.preventDefault();
    setFeedback('');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        billType: form.billType,
        amount: form.amount === '' ? 0 : Number(form.amount),
        isVariable: form.isVariable,
        frequency: form.frequency,
        nextDueDate: form.nextDueDate,
        dueDay: Number(String(form.nextDueDate).slice(8, 10)),
        reminderDaysBefore: Number(form.reminderDaysBefore),
        expenseCategoryId: form.expenseCategoryId,
        providerName: form.providerName.trim(),
        accountReference: form.accountReference.trim(),
        note: form.note.trim(),
      };
      if (form.id) await updateBill(form.id, payload);
      else await createBill(payload);
      setShowEditor(false);
      setFeedback(form.id ? 'Facture mise à jour.' : 'Facture enregistrée. Pata te rappellera son échéance.');
      setFeedbackError(false);
    } catch (error) {
      setFeedback(error.message || 'Impossible d’enregistrer cette facture.');
      setFeedbackError(true);
    } finally {
      setSaving(false);
    }
  };

  const startPayment = (bill) => {
    setPayingBill(bill);
    setPaymentForm({
      amount: bill.amount > 0 ? String(bill.amount) : '',
      paidDate: todayIso(),
      paymentSource: 'cash',
    });
  };

  const confirmPayment = async (event) => {
    event.preventDefault();
    if (!payingBill) return;
    setSaving(true);
    setFeedback('');
    const payload = {
      billId: payingBill.id,
      dueDate: payingBill.nextDueDate,
      amount: Number(paymentForm.amount),
      paidDate: paymentForm.paidDate,
      paymentSource: paymentForm.paymentSource,
    };
    try {
      let result = await payBill(payload);
      if (result.confirmationRequired) {
        const accepted = window.confirm(t(result.message || 'Cette dépense risque de dépasser un budget. Veux-tu tout de même l’enregistrer ?'));
        if (!accepted) return;
        result = await payBill({ ...payload, confirmBudgetOverrun: true });
      }
      if (result.alreadyPaid) {
        setFeedback(t('Cette échéance a déjà été enregistrée comme payée.'));
      } else {
        setFeedback(t(result.completed
          ? 'Paiement enregistré dans tes dépenses. Cette facture ponctuelle est terminée.'
          : 'Paiement enregistré dans tes dépenses. Prochaine échéance : ' + formatDate(result.nextDueDate) + '.'));
      }
      setFeedbackError(false);
      setPayingBill(null);
    } catch (error) {
      setFeedback(t(error.message || 'Impossible d’enregistrer ce paiement.'));
      setFeedbackError(true);
    } finally {
      setSaving(false);
    }
  };

  const disableBill = async (bill) => {
    if (!window.confirm(isEnglish ? 'Disable “' + bill.name + '”? Its history will be kept.' : 'Désactiver « ' + bill.name + ' » ? Son historique restera conservé.')) return;
    setSaving(true);
    try {
      await deactivateBill(bill.id);
      setFeedback(t('Facture désactivée. Son historique est conservé.'));
      setFeedbackError(false);
    } catch (error) {
      setFeedback(t(error.message || 'Impossible de désactiver cette facture.'));
      setFeedbackError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Factures et échéances</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">Centralise l’électricité, l’eau, le loyer, la télévision, Internet, les impôts et toutes tes factures personnalisées.</p>
        </div>
        <Button onClick={openCreate}><Plus size={16}/> Ajouter une facture</Button>
      </header>

      {feedback && <div role="status" className={'rounded-xl border px-3 py-2.5 text-sm ' + (feedbackError ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>{feedback}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Factures actives</p><p className="mt-2 text-xl font-bold text-slate-900">{activeBills.length}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">À échéance sous 7 jours</p><p className="mt-2 text-xl font-bold text-amber-700">{upcomingBills.length}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">En retard</p><p className="mt-2 text-xl font-bold text-red-600">{overdueBills.length}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Budget mensuel estimé</p><p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(monthlyTotal)}</p></section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays size={19}/></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Prévoir avant de dépenser</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Les factures et les remboursements de dettes sont des engagements à anticiper. Après un revenu, vérifie les prochaines échéances avant de décider de ce que tu peux consacrer aux dépenses facultatives. Pata rappelle les dates, mais ne prélève ni ne déplace ton argent automatiquement.</p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Chargement des factures…</div>
      ) : activeBills.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
          <Receipt size={28} className="mx-auto text-slate-400"/>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Aucune facture enregistrée</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm leading-5 text-slate-500">Tu paies régulièrement l’électricité, l’eau, le loyer, la télévision ou des impôts ? Ajoute tes échéances pour que Pata puisse te prévenir à l’avance.</p>
          <Button className="mt-4" onClick={openCreate}><Plus size={15}/> Enregistrer ma première facture</Button>
        </section>
      ) : (
        <div className="space-y-3">
          {activeBills.map((bill) => {
            const remainingDays = daysUntil(bill.nextDueDate);
            const statusLabel = remainingDays < 0 ? 'En retard de ' + Math.abs(remainingDays) + ' jour(s)' : remainingDays === 0 ? 'À payer aujourd’hui' : remainingDays <= 7 ? 'Échéance proche' : 'Échéance programmée';
            const statusClass = remainingDays < 0 ? 'bg-red-50 text-red-700' : remainingDays <= 7 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600';
            const billTypeLabel = BILL_TYPES.find(([id]) => id === bill.billType)?.[1] || 'Autre facture';
            return (
              <article key={bill.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900">{bill.name}</h2>
                      <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + statusClass}>{statusLabel}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{billTypeLabel}{bill.providerName ? ' · ' + bill.providerName : ''}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{bill.isVariable ? 'Montant variable' : formatCurrency(Number(bill.amount) || 0)} <span className="font-normal text-slate-500">· {frequencyLabel(bill.frequency)}</span></p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={13}/> Prochaine échéance : {formatDate(bill.nextDueDate)}</p>
                    {bill.accountReference && <p className="mt-1 text-[11px] text-slate-500">Référence : {bill.accountReference}</p>}
                    {bill.lastPaidAt && <p className="mt-1 text-[11px] text-emerald-700">Dernier paiement enregistré : {formatDate(String(bill.lastPaidAt).slice(0, 10))}</p>}
                    <p className="mt-1 text-[10px] text-slate-400">Rappel {Number(bill.reminderDaysBefore) === 0 ? 'le jour de l’échéance' : Number(bill.reminderDaysBefore) + ' jour(s) avant'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => startPayment(bill)}><Check size={14}/> Marquer payée</Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(bill)}><Pencil size={14}/> Modifier</Button>
                    <Button size="sm" variant="ghost" onClick={() => disableBill(bill)} disabled={saving}><Trash2 size={14}/> Désactiver</Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={showEditor} onClose={() => setShowEditor(false)} title={form.id ? 'Modifier la facture' : 'Ajouter une facture'}>
        <form onSubmit={saveBill} className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Nom de la facture
            <input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex. Facture ENEO, loyer, Canal…" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Type
              <select value={form.billType} onChange={(event) => setForm({ ...form, billType: event.target.value, expenseCategoryId: CATEGORY_DEFAULTS[event.target.value] || 'other' })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {BILL_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">Fréquence
              <select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {FREQUENCIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Montant estimé (FCFA)
            <input type="number" min="0" step="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required={!form.isVariable} placeholder={form.isVariable ? 'Laisse vide si le montant change' : 'Ex. 25000'} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={form.isVariable} onChange={(event) => setForm({ ...form, isVariable: event.target.checked, amount: event.target.checked ? form.amount : form.amount })} className="mt-0.5"/>
            Le montant varie d’une échéance à l’autre (eau, électricité, etc.).
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Prochaine date de paiement
              <input type="date" required value={form.nextDueDate} onChange={(event) => setForm({ ...form, nextDueDate: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
            </label>
            <label className="block text-sm font-medium text-slate-700">Rappel
              <select value={form.reminderDaysBefore} onChange={(event) => setForm({ ...form, reminderDaysBefore: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                <option value={0}>Le jour même</option><option value={1}>1 jour avant</option><option value={3}>3 jours avant</option><option value={7}>7 jours avant</option><option value={14}>14 jours avant</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Catégorie de dépense
              <select value={form.expenseCategoryId} onChange={(event) => setForm({ ...form, expenseCategoryId: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                {EXPENSE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">Fournisseur (facultatif)
              <input maxLength={100} value={form.providerName} onChange={(event) => setForm({ ...form, providerName: event.target.value })} placeholder="ENEO, CAMWATER…" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Numéro client / référence (facultatif)
            <input maxLength={100} value={form.accountReference} onChange={(event) => setForm({ ...form, accountReference: event.target.value })} placeholder="Référence de contrat ou de compteur" className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
          </label>
          <label className="block text-sm font-medium text-slate-700">Note (facultatif)
            <textarea maxLength={250} rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Informations utiles…" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"/>
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowEditor(false)}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : form.id ? 'Enregistrer les changements' : 'Enregistrer la facture'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!payingBill} onClose={() => setPayingBill(null)} title="Enregistrer le paiement">
        {payingBill && <form onSubmit={confirmPayment} className="space-y-3">
          <p className="text-sm font-semibold text-slate-800">{payingBill.name}</p>
          <p className="text-xs text-slate-500">Échéance du {formatDate(payingBill.nextDueDate)}. Pata enregistrera une dépense dans ton historique ; la facture ne sera pas payée automatiquement.</p>
          <label className="block text-sm font-medium text-slate-700">Montant réellement payé (FCFA)
            <input type="number" min="1" step="1" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
          </label>
          <label className="block text-sm font-medium text-slate-700">Date de paiement
            <input type="date" required value={paymentForm.paidDate} onChange={(event) => setPaymentForm({ ...paymentForm, paidDate: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/>
          </label>
          <label className="block text-sm font-medium text-slate-700">Argent utilisé
            <select value={paymentForm.paymentSource} onChange={(event) => setPaymentForm({ ...paymentForm, paymentSource: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
              {PAYMENT_SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {paymentForm.paymentSource === 'tracked' && <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Pata débitera les revenus encore disponibles que tu as enregistrés dans l’application. Choisis cette option uniquement si tu as suivi cet argent dans Pata.</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setPayingBill(null)}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Confirmer le paiement'}</Button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}

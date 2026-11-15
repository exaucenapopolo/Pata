'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ReceiptText, X, Check, ArrowDownLeft, ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Modal } from '@/components/ui/Modal';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { parseQuickCapture } from '@/lib/quickCapture/parser.mjs';
import { parseMobileMoneySms } from '@/lib/sms/parseMobileMoneySms.mjs';
import { PataQuickCapture } from '@/lib/quickCapture/nativePlugin';

function premiumActive(profile) {
  const raw = profile?.premiumUntil;
  const date = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(date.getTime()) && date > new Date();
}
const today = () => {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
const makeId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'quick_' + Date.now() + '_' + Math.random().toString(16).slice(2));

export function QuickCaptureCoordinator() {
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const premium = premiumActive(profile);
  const [draft, setDraft] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const syncInProgressRef = useRef(false);
  const expenseCategories = useMemo(() => EXPENSE_CATEGORIES.filter((item) => !['loan_given', 'debt_repayment'].includes(item.id)), []);
  const incomeCategories = useMemo(() => INCOME_CATEGORIES.filter((item) => !['debt_borrowed', 'debt_repayment_received'].includes(item.id)), []);

  const openDraft = useCallback((rawText = '', forcedType = '', nativeCaptureId = '', origin = 'manual', extracted = null) => {
    const parsed = parseQuickCapture(rawText);
    const type = forcedType || parsed.type || 'expense';
    setError('');
    setDraft({
      id: nativeCaptureId || makeId(),
      nativeCaptureId,
      origin,
      rawText,
      type,
      amount: extracted?.totalAmount != null ? String(extracted.totalAmount) : parsed.amount == null ? '' : String(parsed.amount),
      categoryId: extracted?.suggestedCategory || parsed.categoryId || (type === 'income' ? 'other_income' : 'other'),
      date: extracted?.invoiceDate || parsed.date || today(),
      source: parsed.source || (extracted?.merchantName ? String(extracted.merchantName).slice(0, 100) : ''),
      note: extracted
        ? [extracted.merchantName, extracted.description, extracted.invoiceNumber ? 'Facture ' + extracted.invoiceNumber : ''].filter(Boolean).join(' · ').slice(0, 250)
        : parsed.note || '',
      confirmationRequired: false,
      confirmationMessage: '',
      sourceMimeType: origin === 'pdf' ? 'application/pdf' : '',
      analysisWarning: extracted?.analysisWarning || (origin === 'pdf' ? 'Le PDF est rendu en image pour son analyse. Vérifie le montant sur le document original.' : ''),
    });
  }, []);

  const analyzeSharedImage = useCallback(async (shared) => {
    if (!user) return;
    if (!premium) {
      setNotice('L’analyse et la saisie depuis un reçu sont réservées à Pata Premium.');
      return;
    }
    const token = await user.getIdToken();
    const response = await fetch('/api/quick-capture/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ imageData: 'data:image/jpeg;base64,' + shared.fileBase64, language: 'fr' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success || !result.extracted) {
      throw new Error(result.error || 'Le reçu n’a pas pu être lu. Essaie avec une image plus nette.');
    }
    const extractedCurrency = String(result.extracted.currency || '').trim().toUpperCase();
    const amountIsXaf = ['XAF', 'FCFA', 'CFA'].includes(extractedCurrency);
    const analysisWarning = !amountIsXaf
      ? (extractedCurrency
        ? 'La facture est libellée en ' + extractedCurrency + '. Pata ne convertit pas automatiquement cette devise en FCFA : saisis le montant converti.'
        : 'La devise n’a pas été identifiée avec certitude. Vérifie le montant et sa devise sur le justificatif avant de confirmer.')
      : shared.sourceMimeType === 'application/pdf' && Number(shared.pageCount) > 1
        ? 'Le PDF contient plusieurs pages. Pata a analysé uniquement la première page : vérifie le total sur le document original.'
        : '';
    const extractedData = {
      ...result.extracted,
      totalAmount: amountIsXaf ? result.extracted.totalAmount : null,
      analysisWarning,
    };
    openDraft(shared.text || '', 'expense', '', shared.sourceMimeType === 'application/pdf' ? 'pdf' : 'image', extractedData);
    await PataQuickCapture.clearSharedContent();
  }, [user, premium, openDraft]);

  const syncNativeInputs = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || !user || profileLoading || syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    try {
      const launch = await PataQuickCapture.getLaunchRequest();
      if (launch?.type) {
        if (!premium) setNotice('Pata Quick Capture est réservé à Premium. Consulte la page Premium pour activer cette fonction.');
        else if (launch.type === 'voice') {
          try {
            const spoken = await PataQuickCapture.startVoiceCapture();
            if (spoken?.text) openDraft(spoken.text, '', '', 'voice');
          } catch (voiceError) {
            setNotice(voiceError?.message || 'La saisie vocale n’est pas disponible sur cet appareil.');
          }
        } else {
          openDraft('', launch.type === 'income' ? 'income' : 'expense', '', 'native');
        }
      }
      const shared = await PataQuickCapture.getSharedContent();
      if (shared?.fileError) {
        setNotice(shared.fileError);
        await PataQuickCapture.clearSharedContent();
      } else if (shared?.fileBase64) {
        await analyzeSharedImage(shared);
      } else if (shared?.text) {
        // L'ancien import Mobile Money doit rester seul propriétaire des SMS de transaction partagés.
        if (parseMobileMoneySms(shared.text)) {
          await PataQuickCapture.clearSharedContent();
        } else {
          if (premium) openDraft(shared.text, '', '', 'share');
          else setNotice('La réception et l’analyse des partages sont réservées à Pata Premium.');
          await PataQuickCapture.clearSharedContent();
        }
      }
      const queued = await PataQuickCapture.getPendingCaptures();
      const next = (queued?.items || []).find((item) => !item.ownerUid || item.ownerUid === user.uid);
      if (next) {
        if (premium) openDraft(next.text || '', '', next.id, 'notification');
        else setNotice('Une saisie rapide est en attente. Passe à Pata Premium pour la vérifier.');
      }
    } catch (nativeError) {
      console.warn('[PATA QUICK CAPTURE SYNC]', nativeError?.message || nativeError);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [user, premium, profileLoading, openDraft, analyzeSharedImage]);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform() || profileLoading || premium) return;
    PataQuickCapture.setPersistentNotification({ enabled: false, uid: user.uid }).catch(() => {});
  }, [user, premium, profileLoading]);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return undefined;
    let active = true;
    let appListener = null;
    const run = () => { if (active && !draft) void syncNativeInputs(); };
    run();
    const onFocus = () => run();
    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    App.addListener('appStateChange', ({ isActive }) => { if (isActive) run(); })
      .then((listener) => {
        if (active) appListener = listener;
        else listener.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      appListener?.remove?.();
    };
  }, [user, draft, syncNativeInputs]);

  const categories = draft?.type === 'income' ? incomeCategories : expenseCategories;
  const closeDraft = async () => {
    if (draft?.nativeCaptureId) await PataQuickCapture.clearPendingCapture({ id: draft.nativeCaptureId }).catch(() => {});
    if (draft?.origin === 'image' || draft?.origin === 'pdf' || draft?.origin === 'share') {
      await PataQuickCapture.clearSharedContent().catch(() => {});
    }
    setDraft(null);
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!user || !draft || working) return;
    if (!premium) {
      setNotice('Cette fonction est incluse dans Pata Premium.');
      return;
    }
    const amount = Number(draft.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) {
      setError('Vérifie le montant en FCFA avant de continuer.');
      return;
    }
    if (!draft.categoryId) {
      setError('Choisis une catégorie avant de continuer.');
      return;
    }
    if (draft.type === 'income' && !String(draft.source || '').trim()) {
      setError('Indique la source de ce revenu.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          type: draft.type, amount, categoryId: draft.categoryId,
          date: draft.date, source: draft.source, note: draft.note,
          idempotencyKey: draft.id,
          confirmBudgetOverrun: draft.confirmationRequired === true,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.confirmationRequired) {
        setDraft((current) => current ? {
          ...current,
          confirmationRequired: true,
          confirmationMessage: result.message || 'Cette opération dépasse une enveloppe budgétaire. Confirme une deuxième fois si tu souhaites continuer.',
        } : current);
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || 'L’opération n’a pas été enregistrée.');
      if (draft.nativeCaptureId) await PataQuickCapture.clearPendingCapture({ id: draft.nativeCaptureId }).catch(() => {});
      if (draft.origin === 'image' || draft.origin === 'pdf' || draft.origin === 'share') {
        await PataQuickCapture.clearSharedContent().catch(() => {});
      }
      await PataQuickCapture.adjustWidgetBalance({
        delta: draft.type === 'income' ? amount : -amount,
      }).catch(() => {});
      window.dispatchEvent(new Event('pata:income-balances-refresh'));
      setNotice(draft.type === 'income' ? 'Revenu enregistré dans Pata.' : 'Dépense enregistrée dans Pata.');
      setDraft(null);
    } catch (saveError) {
      setError(saveError?.message || 'Impossible d’enregistrer cette opération.');
    } finally {
      setWorking(false);
    }
  };

  if (!draft) {
    return notice ? <div role="status" className="fixed bottom-24 left-3 right-3 z-[95] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg"><ReceiptText size={16} className="mt-0.5 shrink-0 text-emerald-700"/><span className="flex-1">{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Fermer"><X size={14}/></button></div> : null;
  }

  return (
    <>
      <Modal open={!!draft} onClose={closeDraft} title="Pata Quick Capture" className="max-w-lg">
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs leading-5 text-slate-500">{draft.rawText ? 'Saisie reçue : « ' + draft.rawText + ' »' : 'Complète uniquement ce qui manque. La date est déterminée automatiquement à partir de ta phrase.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft((current) => ({ ...current, type: 'expense', categoryId: current.type === 'income' ? 'other' : current.categoryId }))} className={'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ' + (draft.type === 'expense' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><ArrowUpRight size={16}/> Dépense</button>
            <button type="button" onClick={() => setDraft((current) => ({ ...current, type: 'income', categoryId: current.type === 'expense' ? 'other_income' : current.categoryId }))} className={'flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ' + (draft.type === 'income' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><ArrowDownLeft size={16}/> Revenu</button>
          </div>
          <label className="block text-xs font-semibold text-slate-700">Montant (FCFA)
            <input type="number" inputMode="numeric" min="1" max="1000000000" step="1" required value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-600"/>
          </label>
          <label className="block text-xs font-semibold text-slate-700">Catégorie
            <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
          {draft.type === 'income' && <label className="block text-xs font-semibold text-slate-700">Source du revenu
            <input value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} placeholder="Ex. Salaire, vente, activité…" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
          </label>}
          <label className="block text-xs font-semibold text-slate-700">Détail (facultatif)
            <input value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
          </label>
          {draft.analysisWarning && <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{draft.analysisWarning}</p>}
          {draft.confirmationRequired && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{draft.confirmationMessage}</p>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={closeDraft} disabled={working} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={working} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#075b43] px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">{working ? <LoaderCircle size={16} className="animate-spin"/> : <Check size={16}/>} {working ? 'Enregistrement…' : draft.confirmationRequired ? 'Confirmer quand même' : 'Confirmer l’opération'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

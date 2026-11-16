'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ReceiptText, X, Check, ArrowDownLeft, ArrowUpRight, LoaderCircle, HandCoins, Mic, MessageCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Modal } from '@/components/ui/Modal';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { parseQuickCapture } from '@/lib/quickCapture/parser.mjs';
import { parseMobileMoneySms } from '@/lib/sms/parseMobileMoneySms.mjs';
import { PataQuickCapture } from '@/lib/quickCapture/nativePlugin';
import { uploadBillImage } from '@/lib/bills/uploadBillImage.mjs';
import { enqueueOfflineCapture, listOfflineCaptures, removeOfflineCapture } from '@/lib/quickCapture/offlineQueue.mjs';

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
  const [captureOptions, setCaptureOptions] = useState({ incomes: [], debts: [], receivables: [] });
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [voiceOptionsOpen, setVoiceOptionsOpen] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [voiceChatText, setVoiceChatText] = useState('');
  const [voiceChatConversationId, setVoiceChatConversationId] = useState('');
  const [voiceChatWorking, setVoiceChatWorking] = useState(false);
  const [voiceChatError, setVoiceChatError] = useState('');
  const syncInProgressRef = useRef(false);
  const offlineSyncInProgressRef = useRef(false);
  useEffect(() => {
    if (!user || !premium || typeof window === 'undefined') return undefined;
    let active = true;
    const synchronizeOfflineOperations = async () => {
      if (!active || !navigator.onLine || offlineSyncInProgressRef.current) return;
      offlineSyncInProgressRef.current = true;
      let synchronized = 0;
      try {
        const queued = await listOfflineCaptures(user.uid);
        for (const item of queued) {
          if (!active || !navigator.onLine || item.uid !== user.uid) break;
          const token = await user.getIdToken();
          const payload = { ...item.payload };
          if (item.sharedImageData && !payload.imageUrl && payload.type === 'bill') {
            payload.imageUrl = await uploadBillImage(item.sharedImageData);
          }
          const response = await fetch('/api/quick-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(payload),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) {
            if (result.confirmationRequired) {
              setNotice('Une opération hors connexion attend ta confirmation dans Pata avant synchronisation.');
            } else if (response.status >= 400 && response.status < 500) {
              setNotice(result.error || 'Une opération sauvegardée hors connexion doit être vérifiée.');
            }
            break;
          }
          await removeOfflineCapture(item.id);
          if (item.nativeCaptureId) {
            await PataQuickCapture.clearPendingCapture({ id: item.nativeCaptureId }).catch(() => {});
          }
          synchronized += 1;
          window.dispatchEvent(new Event('pata:income-balances-refresh'));
        }
        if (synchronized > 0 && active) {
          setNotice(synchronized + ' opération(s) sauvegardée(s) hors connexion synchronisée(s) avec Pata.');
        }
      } catch (syncError) {
        if (active && navigator.onLine) {
          console.warn('[PATA OFFLINE SYNC]', syncError?.message || syncError);
        }
      } finally {
        offlineSyncInProgressRef.current = false;
      }
    };
    void synchronizeOfflineOperations();
    const onOnline = () => { void synchronizeOfflineOperations(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void synchronizeOfflineOperations();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, premium]);

  const expenseCategories = useMemo(() => EXPENSE_CATEGORIES.filter((item) => !['loan_given', 'debt_repayment'].includes(item.id)), []);
  const incomeCategories = useMemo(() => INCOME_CATEGORIES.filter((item) => !['debt_borrowed', 'debt_repayment_received'].includes(item.id)), []);

  const openDraft = useCallback((rawText = '', forcedType = '', nativeCaptureId = '', origin = 'manual', extracted = null, sharedImageData = '') => {
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
      person: parsed.person || '',
      incomeSourceName: parsed.incomeSourceName || '',
      incomeSourceId: parsed.incomeSourceName ? '' : 'all',
      repaymentDebtId: '',
      incomeFlowType: parsed.type === 'debt_borrowed' ? 'debt_borrowed' : 'normal',
      incomeCounterpartyType: 'person',
      incomePerson: parsed.person || '',
      incomeBankName: '',
      incomePhone: '',
      incomeDueDate: parsed.dueDate || '',
      note: extracted
        ? [extracted.merchantName, extracted.description, extracted.invoiceNumber ? 'Facture ' + extracted.invoiceNumber : ''].filter(Boolean).join(' · ').slice(0, 250)
        : parsed.note || '',
      billName: extracted?.merchantName ? 'Facture ' + String(extracted.merchantName).slice(0, 80) : parsed.billName || '',
      billType: extracted?.suggestedBillType || parsed.billType || 'other',
      dueDate: extracted?.dueDate || parsed.dueDate || '',
      frequency: parsed.frequency || 'once',
      expenseCategoryId: extracted?.suggestedCategory || parsed.expenseCategoryId || parsed.categoryId || 'other',
      providerName: extracted?.merchantName || '',
      accountReference: extracted?.accountReference || extracted?.invoiceNumber || '',
      sharedImageData: sharedImageData || '',
      isVariable: type === 'bill' && (extracted?.totalAmount == null && parsed.amount == null),
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
    const imageData = 'data:image/jpeg;base64,' + shared.fileBase64;
    const response = await fetch('/api/quick-capture/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ imageData, language: 'fr' }),
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
    const documentType = String(result.extracted.documentType || '').toLowerCase();
    const isBillDocument = /invoice|bill|facture|quittance|utility/.test(documentType)
      || Boolean(result.extracted.dueDate)
      || Boolean(result.extracted.invoiceNumber);
    openDraft(shared.text || '', isBillDocument ? 'bill' : 'expense', '',
      shared.sourceMimeType === 'application/pdf' ? 'pdf' : 'image',
      extractedData, isBillDocument ? imageData : '');
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
          setVoiceOptionsOpen(true);
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
    if (!user || !Capacitor.isNativePlatform() || profileLoading) return undefined;
    let active = true;
    const configurePersistentCapture = async () => {
      try {
        if (!premium) {
          await PataQuickCapture.setPersistentNotification({ enabled: false, uid: user.uid });
          return;
        }
        await user.getIdToken(true);
        if (!active) return;
        await PataQuickCapture.setAuthSession({
          uid: user.uid,
          refreshToken: user.refreshToken,
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        });
        const state = await PataQuickCapture.getPersistentNotificationStatus();
        if (state?.userDisabled) return;
        if (state?.enabled) {
          await PataQuickCapture.ensurePersistentNotification({ uid: user.uid });
          return;
        }
        if (!state?.permissionPromptAttempted) {
          const permission = await PataQuickCapture.requestNotificationPermission();
          if (permission?.granted !== true) return;
        }
        const refreshed = await PataQuickCapture.getPersistentNotificationStatus();
        if (active && refreshed?.permissionGranted && !refreshed?.userDisabled) {
          await PataQuickCapture.setPersistentNotification({ enabled: true, uid: user.uid, automatic: true });
        }
      } catch (error) {
        console.warn('[PATA PERSISTENT CAPTURE]', error?.message || error);
      }
    };
    void configurePersistentCapture();
    return () => { active = false; };
  }, [user, premium, profileLoading]);

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

  const categories = draft?.type === 'income'
    ? draft.incomeFlowType === 'debt_borrowed'
      ? [{ id: 'debt_borrowed', label: 'Dette contractée' }]
      : draft.incomeFlowType === 'repayment_received'
        ? [{ id: 'debt_repayment_received', label: 'Remboursement reçu' }]
        : incomeCategories
    : draft?.type === 'debt_repayment'
      ? [{ id: 'debt_repayment', label: 'Remboursement de dette' }]
      : expenseCategories;

  useEffect(() => {
    const needsIncomeOptions = draft?.type === 'income' && draft?.incomeFlowType === 'repayment_received';
    if (!user || !draft || !premium || (!['expense', 'debt_repayment'].includes(draft.type) && !needsIncomeOptions)) {
      setCaptureOptions({ incomes: [], debts: [], receivables: [] });
      setOptionsError('');
      setOptionsLoading(false);
      return undefined;
    }
    let active = true;
    setOptionsLoading(true);
    setOptionsError('');
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/quick-capture/options', {
          headers: { Authorization: 'Bearer ' + token },
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les revenus et dettes.');
        if (!active) return;
        const incomes = Array.isArray(result.incomes) ? result.incomes : [];
        const debts = Array.isArray(result.debts) ? result.debts : [];
        const receivables = Array.isArray(result.receivables) ? result.receivables : [];
        setCaptureOptions({ incomes, debts, receivables });
        setDraft((current) => {
          if (!current || current.id !== draft.id) return current;
          const normalize = (value) => String(value || '').normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const sourceMatches = current.incomeSourceName
            ? incomes.filter((income) => normalize(income.source) === normalize(current.incomeSourceName))
            : [];
          const counterpartyName = current.type === 'income' ? current.incomePerson : current.person;
          const debtChoices = current.type === 'income' && current.incomeFlowType === 'repayment_received'
            ? receivables : debts;
          const debtMatches = counterpartyName
            ? debtChoices.filter((debt) => normalize(debt.person) === normalize(counterpartyName))
            : [];
          return {
            ...current,
            ...(current.incomeSourceName && sourceMatches.length === 1 ? { incomeSourceId: sourceMatches[0].id } : {}),
            ...(counterpartyName && debtMatches.length === 1 ? { repaymentDebtId: debtMatches[0].id } : {}),
          };
        });
      } catch (loadError) {
        if (active) setOptionsError(loadError?.message || 'Impossible de charger les choix disponibles.');
      } finally {
        if (active) setOptionsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, premium, draft?.id, draft?.type, draft?.incomeFlowType, draft?.incomeSourceName, draft?.person, draft?.incomePerson]);

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
    const amount = draft.amount === '' && draft.type === 'bill' ? null : Number(draft.amount);
    if (draft.type !== 'bill' && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000)) {
      setError('Vérifie le montant en FCFA avant de continuer.');
      return;
    }
    if (draft.type === 'bill' && amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000)) {
      setError('Vérifie le montant estimé de la facture.');
      return;
    }
    if (!draft.categoryId) {
      setError('Choisis une catégorie avant de continuer.');
      return;
    }
    if (draft.type === 'income' && draft.incomeFlowType === 'normal' && !String(draft.source || '').trim()) {
      setError('Indique la source de ce revenu.');
      return;
    }
    if (draft.type === 'income' && draft.incomeFlowType === 'debt_borrowed') {
      const counterparty = draft.incomeCounterpartyType === 'bank' ? draft.incomeBankName : draft.incomePerson;
      if (!String(counterparty || '').trim()) {
        setError(draft.incomeCounterpartyType === 'bank'
          ? 'Indique le nom de la banque qui t’a prêté cet argent.'
          : 'Indique la personne auprès de qui tu as contracté cette dette.');
        return;
      }
      const dueDateValue = String(draft.incomeDueDate || '');
      const dueDateParts = dueDateValue.split('-');
      const dueDateParsed = new Date(dueDateValue + 'T00:00:00.000Z');
      if (dueDateParts.length !== 3 || dueDateParts[0].length !== 4
        || dueDateParts[1]?.length !== 2 || dueDateParts[2]?.length !== 2
        || !Number.isFinite(dueDateParsed.getTime())
        || dueDateParsed.toISOString().slice(0, 10) !== dueDateValue) {
        setError('Indique la date d’échéance de cette dette.');
        return;
      }
    }
    if (draft.type === 'income' && draft.incomeFlowType === 'repayment_received' && !String(draft.repaymentDebtId || '').trim()) {
      setError('Choisis la créance qui vient d’être remboursée.');
      return;
    }
    if (draft.type === 'bill' && !String(draft.billName || '').trim()) {
      setError('Indique le nom de cette facture.');
      return;
    }
    if (draft.type === 'debt_repayment' && !String(draft.repaymentDebtId || '').trim()) {
      setError('Choisis la dette à rembourser avant de continuer.');
      return;
    }
    setWorking(true);
    setError('');
    let offlinePayload = null;
    try {
      let imageUrl = draft.imageUrl || '';
      offlinePayload = {
        type: draft.type, amount, categoryId: draft.categoryId,
        date: draft.date, source: draft.source, note: draft.note,
        name: draft.billName, billType: draft.billType, dueDate: draft.dueDate,
        frequency: draft.frequency, isVariable: draft.isVariable || amount === null,
        expenseCategoryId: draft.expenseCategoryId, providerName: draft.providerName,
        accountReference: draft.accountReference, imageUrl,
        person: draft.person,
        repaymentDebtId: draft.repaymentDebtId || '',
        incomeFlowType: draft.incomeFlowType || 'normal',
        incomePerson: draft.incomePerson || '',
        incomeCounterpartyType: draft.incomeCounterpartyType || 'person',
        incomeBankName: draft.incomeBankName || '',
        incomePhone: draft.incomePhone || '',
        incomeDueDate: draft.incomeDueDate || '',
        incomeSourceId: draft.incomeSourceId || 'all',
        incomeSourceName: draft.incomeSourceName || '',
        idempotencyKey: draft.id,
        confirmBudgetOverrun: draft.confirmationRequired === true,
      };
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueueOfflineCapture({
          uid: user.uid, payload: offlinePayload, nativeCaptureId: draft.nativeCaptureId,
          sharedImageData: draft.sharedImageData || '', capturedAt: new Date().toISOString(),
        });
        if (draft.nativeCaptureId) await PataQuickCapture.clearPendingCapture({ id: draft.nativeCaptureId }).catch(() => {});
        setDraft(null);
        setNotice('Opération conservée sur cet appareil avec sa date. Elle sera synchronisée automatiquement dès le retour de la connexion.');
        return;
      }
      const token = await user.getIdToken();
      if (draft.type === 'bill' && draft.sharedImageData && !imageUrl) {
        imageUrl = await uploadBillImage(draft.sharedImageData);
        offlinePayload.imageUrl = imageUrl;
      }
      const response = await fetch('/api/quick-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(offlinePayload),
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
      if (draft.type !== 'bill') {
        if (draft.type === 'debt_repayment' || (draft.type === 'income' && draft.incomeFlowType !== 'normal')) {
          // Les emprunts et remboursements sont des flux de dette, pas des revenus gagnés.
        } else {
          await PataQuickCapture.adjustWidgetBalance({
            type: draft.type === 'income' ? 'income' : 'expense',
            amount,
            date: draft.date || today(),
          }).catch(() => {});
        }
        window.dispatchEvent(new Event('pata:income-balances-refresh'));
      }
      setNotice(draft.type === 'income'
        ? draft.incomeFlowType === 'debt_borrowed' ? 'Dette contractée enregistrée dans Pata. Elle reste séparée des revenus gagnés.'
          : draft.incomeFlowType === 'repayment_received'
            ? (result.repaymentCompleted ? 'Créance entièrement remboursée : elle est maintenant soldée.' : 'Remboursement reçu enregistré. Reste à recevoir : ' + Number(result.remaining || 0).toLocaleString('fr-FR') + ' FCFA.')
            : 'Revenu enregistré dans Pata.'
        : draft.type === 'bill' ? 'Facture enregistrée dans Pata avec son justificatif.'
          : draft.type === 'debt_repayment'
            ? (result.repaymentCompleted ? 'Dette entièrement remboursée : elle est maintenant soldée.' : 'Remboursement enregistré. Solde restant : ' + Number(result.remaining || 0).toLocaleString('fr-FR') + ' FCFA.')
            : 'Dépense enregistrée dans Pata.');
      setDraft(null);
    } catch (saveError) {
      const networkFailure = typeof navigator !== 'undefined' && (!navigator.onLine
        || saveError instanceof TypeError
        || /network|failed to fetch|fetch failed|connexion/i.test(String(saveError?.message || '')));
      if (networkFailure && offlinePayload) {
        try {
          await enqueueOfflineCapture({
            uid: user.uid, payload: offlinePayload, nativeCaptureId: draft.nativeCaptureId,
            sharedImageData: draft.sharedImageData || '', capturedAt: new Date().toISOString(),
          });
          if (draft.nativeCaptureId) await PataQuickCapture.clearPendingCapture({ id: draft.nativeCaptureId }).catch(() => {});
          setDraft(null);
          setNotice('Connexion interrompue : opération conservée sur cet appareil. Pata la synchronisera dès que le réseau reviendra.');
        } catch (storageError) {
          setError(storageError?.message || 'Impossible de conserver cette opération hors connexion.');
        }
      } else {
        setError(saveError?.message || 'Impossible d’enregistrer cette opération.');
      }
    } finally {
      setWorking(false);
    }
  };

  const startVoiceEntry = async () => {
    setVoiceOptionsOpen(false);
    try {
      const spoken = await PataQuickCapture.startVoiceCapture();
      if (spoken?.text) openDraft(spoken.text, '', '', 'voice');
      else setNotice('Aucune parole n’a été reconnue. Tu peux réessayer ou saisir ton opération manuellement.');
    } catch (voiceError) {
      setNotice(voiceError?.message || 'La saisie vocale n’est pas disponible sur cet appareil.');
    }
  };

  const openVoiceAssistant = () => {
    setVoiceOptionsOpen(false);
    setVoiceChatError('');
    setVoiceChatConversationId(makeId());
    setVoiceChatOpen(true);
  };

  const sendVoiceAssistantMessage = async (event) => {
    event.preventDefault();
    const message = String(voiceChatText || '').trim();
    if (!message || voiceChatWorking) return;
    if (!user || !premium) {
      setVoiceChatError('La conversation Mč depuis les notifications est réservée à Pata Premium.');
      return;
    }
    setVoiceChatWorking(true);
    setVoiceChatError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          messages: [{ role: 'user', content: message.slice(0, 1800) }],
          mode: 'text',
          language: 'fr',
          notificationMode: true,
          notificationConversationId: voiceChatConversationId || makeId(),
          clientRequestId: makeId(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Mč n’a pas pu traiter ton message.');
      const reply = String(result.reply || 'Je suis là. Peux-tu préciser ta demande ?').trim();
      const notification = await PataQuickCapture.showAIConversationReply({
        title: 'Mč · Pata',
        message: reply,
        conversationId: voiceChatConversationId,
      });
      if (notification?.shown === false) {
        throw new Error('La réponse est prête, mais les notifications Pata ne sont pas autorisées sur cet appareil.');
      }
      setVoiceChatOpen(false);
      setVoiceChatText('');
      setVoiceChatConversationId('');
      setNotice('Mč a répondu dans tes notifications. Tu peux continuer la conversation directement depuis la notification Pata.');
    } catch (sendError) {
      setVoiceChatError(sendError?.message || 'Impossible d’envoyer ce message à Mč.');
    } finally {
      setVoiceChatWorking(false);
    }
  };

  const voiceDialogs = (
    <>
      <Modal open={voiceOptionsOpen} onClose={() => setVoiceOptionsOpen(false)} title="Saisie vocale" className="max-w-md">
        <div className="space-y-3">
          <p className="text-xs leading-5 text-slate-600">Choisis ce que tu veux faire. La saisie de tes dépenses et de tes revenus reste l’action principale.</p>
          <button type="button" onClick={startVoiceEntry} className="flex min-h-[58px] w-full items-center gap-3 rounded-2xl bg-[#075b43] px-4 py-3 text-left text-white shadow-sm transition active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Mic size={20}/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">Saisie</strong><span className="mt-0.5 block text-[11px] leading-4 text-white/80">Dicte une dépense, un revenu ou un remboursement à enregistrer</span></span>
          </button>
          <button type="button" onClick={openVoiceAssistant} className="flex min-h-[58px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-800 transition hover:bg-slate-50 active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><MessageCircle size={19}/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">Causer avec Mč</strong><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">Pose une question et poursuis ensuite depuis les notifications</span></span>
          </button>
          <button type="button" onClick={() => setVoiceOptionsOpen(false)} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600">Fermer</button>
        </div>
      </Modal>

      <Modal open={voiceChatOpen} onClose={() => { if (!voiceChatWorking) setVoiceChatOpen(false); }} title="Causer avec Mč" className="max-w-md">
        <form onSubmit={sendVoiceAssistantMessage} className="space-y-3">
          <p className="text-xs leading-5 text-slate-600">Écris ton message normalement. Mč te répondra dans une notification, où tu pourras continuer sans ouvrir la conversation complète.</p>
          <textarea
            autoFocus
            maxLength={1800}
            rows={5}
            value={voiceChatText}
            onChange={(event) => setVoiceChatText(event.target.value)}
            placeholder="Ex. Aide-moi à savoir combien je peux encore dépenser cette semaine…"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-emerald-700"
          />
          <p className="text-[10px] text-slate-500">Cette conversation est séparée de ton historique complet AssistantChat. Elle est réservée à Premium.</p>
          {voiceChatError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">{voiceChatError}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={voiceChatWorking} onClick={() => setVoiceChatOpen(false)} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={voiceChatWorking || !voiceChatText.trim()} className="min-h-11 flex-1 rounded-xl bg-[#075b43] px-3 text-xs font-semibold text-white disabled:opacity-50">{voiceChatWorking ? 'Envoi à Mč…' : 'Envoyer à Mč'}</button>
          </div>
        </form>
      </Modal>
    </>
  );

  if (!draft) {
    return (
      <>
        {voiceDialogs}
        {notice && <div role="status" className="fixed bottom-24 left-3 right-3 z-[95] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg"><ReceiptText size={16} className="mt-0.5 shrink-0 text-emerald-700"/><span className="flex-1">{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Fermer"><X size={14}/></button></div>}
      </>
    );
  }

  return (
    <>
      {voiceDialogs}
      <Modal open={!!draft} onClose={closeDraft} title="Pata Quick Capture" className="max-w-lg">
        <form onSubmit={save} className="space-y-3">
          <p className="text-xs leading-5 text-slate-500">{draft.rawText ? 'Saisie reçue : « ' + draft.rawText + ' »' : 'Complète uniquement ce qui manque. La date est déterminée automatiquement à partir de ta phrase.'}</p>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => setDraft((current) => ({ ...current, type: 'expense', categoryId: current.type === 'income' || current.type === 'bill' || current.type === 'debt_repayment' ? 'other' : current.categoryId }))} className={'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-3 text-[11px] font-semibold ' + (draft.type === 'expense' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><ArrowUpRight size={14}/> Dépense</button>
            <button type="button" onClick={() => setDraft((current) => ({
              ...current,
              type: 'income',
              incomeFlowType: current.type === 'debt_borrowed' ? 'debt_borrowed' : current.type === 'repayment_received' ? 'repayment_received' : current.incomeFlowType || 'normal',
              categoryId: current.type === 'debt_borrowed' ? 'debt_borrowed' : current.type === 'repayment_received' ? 'debt_repayment_received' : current.type !== 'income' ? 'other_income' : current.categoryId,
              incomePerson: current.incomePerson || current.person || '',
              incomeDueDate: current.incomeDueDate || current.dueDate || '',
            }))} className={'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-3 text-[11px] font-semibold ' + (draft.type === 'income' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><ArrowDownLeft size={14}/> Revenu</button>
            <button type="button" onClick={() => setDraft((current) => ({ ...current, type: 'bill', categoryId: current.type === 'bill' ? current.categoryId : current.expenseCategoryId || 'other' }))} className={'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-3 text-[11px] font-semibold ' + (draft.type === 'bill' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><ReceiptText size={14}/> Facture</button>
            <button type="button" onClick={() => setDraft((current) => ({ ...current, type: 'debt_repayment', categoryId: 'debt_repayment' }))} className={'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-3 text-[10px] font-semibold ' + (draft.type === 'debt_repayment' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600')}><HandCoins size={14}/> Rembourser</button>
          </div>
          {draft.type === 'bill' && <label className="block text-xs font-semibold text-slate-700">Nom de la facture
            <input required maxLength={100} value={draft.billName || ''} onChange={(event) => setDraft((current) => ({ ...current, billName: event.target.value }))} placeholder="Ex. Facture ENEO" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
          </label>}
          <label className="block text-xs font-semibold text-slate-700">{draft.type === 'bill' ? 'Montant estimé (FCFA, facultatif)' : 'Montant (FCFA)'}
            <input type="number" inputMode="numeric" min="0" max="1000000000" step="1" required={draft.type !== 'bill'} value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value, isVariable: event.target.value === '' }))} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-base font-semibold text-slate-900 outline-none focus:border-emerald-600"/>
          </label>
          {draft.type === 'debt_repayment' && <label className="block text-xs font-semibold text-slate-700">Dette à rembourser
            <select value={draft.repaymentDebtId || ''} onChange={(event) => setDraft((current) => ({ ...current, repaymentDebtId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              <option value="">Choisir la dette de {draft.person || 'la personne'}</option>
              {captureOptions.debts.map((debt) => <option key={debt.id} value={debt.id}>{debt.person || 'Créancier'} · reste {Number(debt.remaining || 0).toLocaleString('fr-FR')} FCFA{debt.dueDate ? ' · échéance ' + debt.dueDate : ''}</option>)}
            </select>
          </label>}
          {(draft.type === 'expense' || draft.type === 'debt_repayment') && <label className="block text-xs font-semibold text-slate-700">Source du montant (facultatif)
            <select value={draft.incomeSourceId || 'all'} onChange={(event) => setDraft((current) => ({ ...current, incomeSourceId: event.target.value, incomeSourceName: '' }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              <option value="all">Répartir sur mes revenus disponibles</option>
              <option value="external">Solde externe / revenu non suivi</option>
              {captureOptions.incomes.map((income) => <option key={income.id} value={income.id}>{income.source} · {income.date || 'Date inconnue'} · {Number(income.amount || 0).toLocaleString('fr-FR')} FCFA initialement</option>)}
            </select>
            {draft.incomeSourceName && <span className="mt-1 block text-[10px] font-normal text-emerald-700">Source reconnue dans ta phrase : {draft.incomeSourceName}. Vérifie le revenu sélectionné.</span>}
            <span className="mt-1 block text-[10px] font-normal text-slate-500">Tu peux relier cette sortie à un revenu précis. Le solde est vérifié au moment de l’enregistrement.</span>
          </label>}
          {optionsLoading && <p className="text-[10px] text-slate-500">Chargement des sources et dettes actives…</p>}
          {optionsError && <p role="alert" className="rounded-lg bg-amber-50 p-2 text-[10px] text-amber-800">{optionsError}</p>}
                    {draft.type === 'income' && <label className="block text-xs font-semibold text-slate-700">Nature du revenu
            <select value={draft.incomeFlowType || 'normal'} onChange={(event) => {
              const flowType = event.target.value;
              setDraft((current) => ({
                ...current,
                incomeFlowType: flowType,
                categoryId: flowType === 'debt_borrowed' ? 'debt_borrowed' : flowType === 'repayment_received' ? 'debt_repayment_received' : 'other_income',
                repaymentDebtId: flowType === 'repayment_received' ? current.repaymentDebtId : '',
              }));
            }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              <option value="normal">Revenu ordinaire</option>
              <option value="debt_borrowed">Dette contractée (argent emprunté)</option>
              <option value="repayment_received">Remboursement reçu</option>
            </select>
          </label>}
          {draft.type === 'income' && draft.incomeFlowType === 'normal' && <>
            <label className="block text-xs font-semibold text-slate-700">Catégorie de revenu
              <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                {incomeCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">Source du revenu
              <input required value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} placeholder="Ex. Salaire, vente, activité…" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
            </label>
          </>}
          {draft.type === 'income' && draft.incomeFlowType === 'debt_borrowed' && <>
            <label className="block text-xs font-semibold text-slate-700">Type de créancier
              <select value={draft.incomeCounterpartyType || 'person'} onChange={(event) => setDraft((current) => ({ ...current, incomeCounterpartyType: event.target.value, incomePerson: '', incomeBankName: '' }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                <option value="person">Une personne</option><option value="bank">Une banque</option>
              </select>
            </label>
            {draft.incomeCounterpartyType === 'bank'
              ? <label className="block text-xs font-semibold text-slate-700">Nom de la banque
                  <input required value={draft.incomeBankName || ''} onChange={(event) => setDraft((current) => ({ ...current, incomeBankName: event.target.value }))} placeholder="Ex. Afriland First Bank" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
                </label>
              : <label className="block text-xs font-semibold text-slate-700">Personne auprès de qui tu empruntes
                  <input required value={draft.incomePerson || ''} onChange={(event) => setDraft((current) => ({ ...current, incomePerson: event.target.value }))} placeholder="Nom de la personne" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
                </label>}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-slate-700">Téléphone (facultatif)
                <input value={draft.incomePhone || ''} onChange={(event) => setDraft((current) => ({ ...current, incomePhone: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
              </label>
              <label className="block text-xs font-semibold text-slate-700">Date d’échéance
                <input type="date" required value={draft.incomeDueDate || ''} onChange={(event) => setDraft((current) => ({ ...current, incomeDueDate: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
              </label>
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">Cet argent est enregistré comme emprunt et reste séparé des revenus gagnés.</p>
          </>}
          {draft.type === 'income' && draft.incomeFlowType === 'repayment_received' && <label className="block text-xs font-semibold text-slate-700">Créance remboursée
            <select value={draft.repaymentDebtId || ''} onChange={(event) => setDraft((current) => ({ ...current, repaymentDebtId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              <option value="">Choisir la personne qui t’a remboursé</option>
              {captureOptions.receivables.map((debt) => <option key={debt.id} value={debt.id}>{debt.person || 'Personne'} · reste à recevoir {Number(debt.remaining || 0).toLocaleString('fr-FR')} FCFA</option>)}
            </select>
            {optionsLoading && <span className="mt-1 block text-[10px] font-normal text-slate-500">Chargement des créances…</span>}
            {!optionsLoading && captureOptions.receivables.length === 0 && <span className="mt-1 block text-[10px] font-normal text-amber-700">Aucune créance active à encaisser.</span>}
          </label>}
          {draft.type !== 'income' && <label className="block text-xs font-semibold text-slate-700">Catégorie
            <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
              {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>}
          {draft.type === 'bill' && <>
            <label className="block text-xs font-semibold text-slate-700">Type de facture
              <select value={draft.billType || 'other'} onChange={(event) => setDraft((current) => ({ ...current, billType: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                <option value="electricity">Électricité</option><option value="water">Eau</option><option value="rent">Loyer</option><option value="television">Télévision</option><option value="internet">Internet</option><option value="telephone">Téléphone</option><option value="taxes">Impôts et taxes</option><option value="insurance">Assurance</option><option value="school">Scolarité</option><option value="subscription">Abonnement</option><option value="other">Autre facture</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-slate-700">Date d’échéance
                <input type="date" value={draft.dueDate || ''} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal"/>
              </label>
              <label className="block text-xs font-semibold text-slate-700">Fréquence
                <select value={draft.frequency || 'once'} onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal">
                  <option value="once">Une seule fois</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option><option value="quarterly">Tous les 3 mois</option><option value="yearly">Chaque année</option>
                </select>
              </label>
            </div>
            {draft.sharedImageData && <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
              <img src={draft.sharedImageData} alt="Justificatif partagé" className="h-16 w-16 rounded-lg border border-slate-200 object-cover"/>
              <span className="min-w-0 text-xs leading-5 text-slate-600">Le justificatif sera enregistré avec cette facture lors de la confirmation.</span>
            </div>}
            {draft.type === 'bill' && draft.imageUrl && <p className="text-[10px] text-emerald-700">Photo de facture déjà associée.</p>}
          </>}
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

/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  Plus, Target, Trash2, AlertTriangle, Banknote, Pencil, Lightbulb,
  Info, CheckCircle2, TrendingUp, ShieldAlert, ArrowDownToLine, Landmark,
  MessageCircle, CalendarDays, PiggyBank, Pin, CalendarCheck, Zap, Unlock, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useGoals, useDeposits } from '@/hooks/useGoals';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createGoal, updateGoal, deleteGoal, toggleGoalPin } from '@/lib/firestore/goals';
import { computeGoalPlan, resolveFrequencyDays, GOAL_LATE_PENALTY_RATE } from '@/lib/goalCalc';
import { adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';
import { playSuccess } from '@/lib/sound';

const todayIso = () => new Date().toISOString().slice(0, 10);

const FREQUENCY_PRESETS = [
  { v: '1', label: 'Chaque jour' }, { v: '3', label: 'Tous les 3 j' },
  { v: '7', label: 'Chaque sem.' }, { v: '14', label: 'Toutes les 2 sem.' },
  { v: '30', label: 'Chaque mois' },
];

const ADVICE_ICONS = { success: CheckCircle2, danger: AlertTriangle, warning: AlertTriangle, tip: Lightbulb, info: Info };

function ProgressCircle({ value = 0, size = 100 }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.min(100, Math.max(0, value));
  const offset = circumference - (safe / 100) * circumference;
  const color = safe >= 100 ? '#10b981' : safe >= 60 ? '#3b82f6' : safe >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{safe.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function buildGoalAdvices(plan, balance, goalName) {
  if (!plan) return [];
  if (plan.type === 'piggybank') {
    return [{ type: 'info', message: `C'est ta caisse libre. Tu peux y déposer de l'argent à tout moment. Total actuel : ${formatCurrency(plan.totalDeposited)}.` }];
  }

  const advices = [];
  if (plan.notStarted) {
    advices.push({ type: 'info', message: `Cet objectif est programmé pour commencer le ${formatDate(plan.startDate)}.` });
    return advices;
  }
  if (plan.isReached) {
    advices.push({ type: 'success', message: `Ton objectif « ${goalName} » est atteint. Tu peux retirer ton argent à tout moment.` });
    return advices;
  }
  if (plan.isLate) {
    const missedLabel = `${plan.missedPayments} échéance${plan.missedPayments > 1 ? 's' : ''} manquée${plan.missedPayments > 1 ? 's' : ''}`;
    advices.push({
      type: 'danger',
      message: `${missedLabel} : des frais de retard de ${formatCurrency(plan.penalty)} sont dus. Ils représentent 15 % du montant cible par échéance manquée et seront déduits au retrait ou à la clôture.`,
    });
  } else if (plan.totalDeposited >= plan.expectedAmount) {
    advices.push({ type: 'success', message: `Tu es à jour : ${formatCurrency(plan.totalDeposited)} versés. Continue comme ça.` });
  } else {
    advices.push({ type: 'info', message: `Il te reste ${formatCurrency(plan.expectedAmount - plan.totalDeposited)} à verser pour être à jour.` });
  }
  if (balance >= plan.amountPerPayment) {
    advices.push({ type: 'tip', message: `Ton solde couvre le prochain paiement de ${formatCurrency(plan.amountPerPayment)}.` });
  } else if (balance === 0) {
    advices.push({ type: 'tip', message: 'Recharge ton portefeuille pour financer cet objectif.' });
  }
  return advices;
}

function ConfirmWithdrawModal({ goal, actionType, onClose, onConfirm, busy }) {
  const deposits = useDeposits(goal.id);
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState('mtn');
  const plan = computeGoalPlan(goal, deposits);
  const isPiggybank = goal.type === 'piggybank';
  const isCancel = actionType === 'cancel';
  const latePenalty = isPiggybank ? 0 : Number(plan.penalty) || 0;
  const cancelPenalty = isCancel && !isPiggybank ? Math.round(plan.totalDeposited * 0.10) : 0;
  const netRefund = Math.max(0, plan.totalDeposited - plan.totalDebt - latePenalty - cancelPenalty);

  const waNumber = '14236752034';
  const waMessage = encodeURIComponent(
    `Bonjour l'équipe Pata,\n\nJe souhaite ${isCancel ? 'annuler' : 'clôturer'} mon ${isPiggybank ? 'épargne libre' : 'objectif'} "${goal.name}".\n\n` +
    `- Total épargné : ${formatCurrency(plan.totalDeposited)}\n` +
    (plan.totalDebt > 0 ? `- Dettes : ${formatCurrency(plan.totalDebt)}\n` : '') +
    (latePenalty > 0 ? `- Pénalités de retard (15%) : ${formatCurrency(latePenalty)}\n` : '') +
    (cancelPenalty > 0 ? `- Frais d’annulation (10%) : ${formatCurrency(cancelPenalty)}\n` : '') +
    `- Net à recevoir : ${formatCurrency(netRefund)}\n\nMerci.`
  );

  return (
    <Modal open onClose={onClose} title={isPiggybank ? "Casser la tirelire" : (isCancel ? "Annuler l'objectif" : "Retirer mon épargne")}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <Info className="mt-0.5 shrink-0 text-slate-500" size={18} />
          <p className="text-sm text-slate-700">
            {isPiggybank ? "Ta demande sera vérifiée avant l’envoi de l’argent sur ton numéro Mobile Money."
              : isCancel ? "L’annulation entraîne des frais de clôture de 10 %, auxquels s’ajoutent les éventuels frais de retard déjà dus. Le net sera vérifié avant l’envoi."
              : "Les frais de retard déjà dus seront déduits du solde à retirer. Le net sera vérifié avant l’envoi."}
          </p>
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Total épargné</span><span className="font-medium text-slate-800">{formatCurrency(plan.totalDeposited)}</span></div>
          {plan.totalDebt > 0 && (<div className="flex justify-between text-sm text-red-600"><span>Dettes</span><span className="font-medium">- {formatCurrency(plan.totalDebt)}</span></div>)}
          {latePenalty > 0 && (<div className="flex justify-between text-sm text-red-600"><span>Frais de retard (15%)</span><span className="font-medium">- {formatCurrency(latePenalty)}</span></div>)}
          {cancelPenalty > 0 && (<div className="flex justify-between text-sm text-red-600"><span>Frais d’annulation (10%)</span><span className="font-medium">- {formatCurrency(cancelPenalty)}</span></div>)}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
            <span className="text-slate-800">Net à recevoir</span><span className="text-brand-600">{formatCurrency(netRefund)}</span>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">Numéro Mobile Money de réception
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="6XXXXXXXX" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Réseau de réception
            <select value={network} onChange={(event) => setNetwork(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="mtn">MTN Mobile Money</option><option value="orange">Orange Money</option></select>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => onConfirm(actionType, { phone, network })} disabled={busy || netRefund < 100 || phone.replace(/\D/g, '').length < 9} className="w-full">{busy ? 'Traitement…' : 'Confirmer'}</Button>
          <Button variant="outline" onClick={() => window.open(`https://wa.me/${waNumber}?text=${waMessage}`, '_blank')} className="w-full text-green-600 border-green-200 hover:bg-green-50"><MessageCircle size={16} /> Envoyer sur WhatsApp</Button>
          <Button variant="ghost" onClick={onClose} className="w-full">Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}

function GoalDetail({ goal, onClose, onAskWithdraw }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const advices = buildGoalAdvices(plan, profile?.balance || 0, goal.name);
  const isPiggybank = goal.type === 'piggybank';
  const purposeLabels = {
    personal: 'Pour moi-même',
    family: 'Pour ma famille / le foyer',
    child: 'Pour un enfant',
    partner: 'Pour mon conjoint / ma conjointe',
    emergency: 'Réserve d’urgence',
    project: 'Pour un projet précis',
    other: 'Autre usage ou bénéficiaire',
  };

  const [amount, setAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLoan, setShowLoan] = useState(false);

  const balance = profile?.balance || 0;

  const handleAction = async (endpoint, payload, successMsg) => {
    setError(''); setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/goals/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ goalId: goal.id, ...payload }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erreur.');
      setAmount(''); setRepayAmount('');
      onClose();
      if (successMsg) alert(successMsg);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const onFundFromWallet = async (e) => {
    e.preventDefault(); setError(''); setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/wallet/fund-goal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ goalId: goal.id, amount: Number(amount) }) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Impossible de verser cette somme.');
      
      // 🎵 Son de succès
      playSuccess();
      setAmount('');

      // 🎉 Confettis si objectif atteint
      const newTotal = plan.totalDeposited + Number(amount);
      if (newTotal >= goal.targetAmount) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#059669', '#10b981', '#34d399', '#fbbf24']
        });
      }
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={goal.name} className="max-w-lg">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-1">
          {isPiggybank ? (<div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-brand-600"><PiggyBank size={48} /></div>) : (<ProgressCircle value={plan.progress} size={120} />)}
          <div className="mt-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} /><span className="text-xs font-medium text-slate-500">{category.label}</span></div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Informations sur cette épargne</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start justify-between gap-3"><span className="text-slate-500">Destination</span><strong className="text-right text-slate-800">{purposeLabels[goal.purposeType || 'personal'] || 'Pour moi-même'}</strong></div>
            {goal.beneficiaryName && <div className="flex items-start justify-between gap-3"><span className="text-slate-500">Bénéficiaire</span><strong className="text-right text-slate-800">{goal.beneficiaryName}</strong></div>}
            {goal.beneficiaryRelation && <div className="flex items-start justify-between gap-3"><span className="text-slate-500">Lien</span><strong className="text-right text-slate-800">{goal.beneficiaryRelation}</strong></div>}
            {goal.description && <div className="border-t border-slate-100 pt-2"><p className="text-xs text-slate-500">Description</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{goal.description}</p></div>}
            {goal.rulesEnabled && goal.rulesText && <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Règles ou engagements indiqués</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-amber-800">{goal.rulesText}</p><p className="mt-1 text-[10px] leading-4 text-amber-700">Note informative : ces règles ne bloquent pas automatiquement les opérations.</p></div>}
          </div>
        </div>

        {!isPiggybank && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Objectif ciblé</span><span className="font-bold text-slate-900">{formatCurrency(goal.targetAmount)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Déjà épargné</span><span className="font-bold text-brand-600">{formatCurrency(plan.totalDeposited)}</span></div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2"><span className="text-sm text-slate-600">Reste à épargner</span><span className="font-bold text-slate-900">{formatCurrency(plan.remaining)}</span></div>
            <div className="bg-white rounded-lg p-2 border border-slate-100 mt-2">
              <p className="text-xs text-slate-500 mb-1">Ton plan de paiement :</p>
              <p className="text-sm font-semibold text-slate-800">{plan.totalPayments} paiements de <span className="text-brand-600">{formatCurrency(plan.amountPerPayment)}</span> tous les {plan.frequencyDays} jours.</p>
              {plan.nextPaymentDate && (<p className="text-xs text-brand-600 mt-1 flex items-center gap-1"><CalendarCheck size={12} /> Prochain paiement : {formatDate(plan.nextPaymentDate)}</p>)}
            </div>
            <div className="mt-2">
              <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Zap size={12} /> Pour aller plus vite :</p>
              <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-slate-600">
                <div className="bg-white border border-slate-100 rounded py-1"><span className="block font-bold text-slate-800">{formatCurrency(plan.perDay)}</span> / jour</div>
                <div className="bg-white border border-slate-100 rounded py-1"><span className="block font-bold text-slate-800">{formatCurrency(plan.perWeek)}</span> / sem.</div>
                <div className="bg-white border border-slate-100 rounded py-1"><span className="block font-bold text-slate-800">{formatCurrency(plan.perMonth)}</span> / mois</div>
              </div>
            </div>
          </div>
        )}

        {isPiggybank && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Total dans la caisse</p>
            <p className="text-3xl font-bold text-brand-800">{formatCurrency(plan.totalDeposited)}</p>
            {plan.hasTarget && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs"><span className="text-brand-800">Cible : {formatCurrency(plan.targetAmount)}</span><strong className="text-brand-900">{Math.round(plan.progress)}%</strong></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${plan.progress}%` }}/></div>
                <p className="text-[11px] text-brand-800">Encore {formatCurrency(plan.remaining)} pour atteindre ta cible. Aucun délai ne t’est imposé.</p>
              </div>
            )}
            {!plan.hasTarget && <p className="mt-1 text-xs text-brand-800">Caisse libre, sans cible ni échéance imposée.</p>}
          </div>
        )}

        {!isPiggybank && plan.notStarted && (<div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700"><CalendarDays size={16} /><span>Démarre le {formatDate(plan.startDate)}</span></div>)}

        {!isPiggybank && plan.totalDebt > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2"><Landmark size={16} className="mt-0.5 shrink-0 text-red-600" /><p className="text-sm text-red-700">Dette de <strong>{formatCurrency(plan.totalDebt)}</strong> (incluant 5% d'intérêts). Sera déduite si tu retires.</p></div>
            <div className="flex gap-2 items-end mt-2">
              <Input label="Montant à rembourser" type="number" min="1" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} className="flex-1" />
              <Button onClick={() => handleAction('repay', { amount: Number(repayAmount) }, 'Prêt remboursé.')} disabled={busy || !repayAmount || Number(repayAmount) > balance}>Rembourser</Button>
            </div>
          </div>
        )}

        {advices.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Lightbulb size={12} /> Assistant</div>
            <div className="space-y-2">{advices.map((a, i) => { const Icon = ADVICE_ICONS[a.type] || Info; return (<div key={i} className="flex items-start gap-2"><Icon size={14} className={`mt-0.5 shrink-0 ${adviceIconColor(a.type)}`} /><p className="text-sm leading-relaxed text-slate-700">{a.message}</p></div>); })}</div>
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => { const prompt = `Analyse mon épargne « ${goal.name} ». Type : ${isPiggybank ? 'tirelire libre' : 'objectif daté'}. Total déjà épargné : ${plan.totalDeposited} FCFA. Solde de mon portefeuille : ${balance} FCFA. ${isPiggybank ? '' : `Cible : ${goal.targetAmount} FCFA. Début : ${goal.startDate}. Échéance : ${goal.deadline}. Reste : ${plan.remaining} FCFA.`} Donne-moi un conseil réaliste et explique les prochaines étapes. Ne modifie rien sans me demander.`; window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } })); }}>Demander une analyse à Mč</Button>
          </div>
        )}

        {(!plan.isReached || isPiggybank) && !showLoan && (
          <form onSubmit={onFundFromWallet} className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2"><span className="text-xs text-slate-600">Solde disponible</span><span className="text-sm font-semibold text-brand-700">{formatCurrency(balance)}</span></div>
            <div className="mb-3 space-y-2">
              <Input label="Montant à verser depuis ton portefeuille Pata" type="number" min="1" max={balance} required value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-xs text-slate-500">Le versement est prélevé sur ton solde Pata disponible. Il n’est pas lié à une source de revenu.</p>
            </div>
            <div className="flex justify-end"><Button type="submit" disabled={saving || balance <= 0 || !amount || Number(amount) > Number(balance)}><Banknote size={14} /> {saving ? 'Versement…' : 'Verser'}</Button></div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {!isPiggybank && (<div className="mt-3 text-center"><button type="button" onClick={() => setShowLoan(true)} className="text-xs font-semibold text-brand-600 hover:underline">Besoin d’un coup de pouce ? Consulter le micro-prêt</button></div>)}
          </form>
        )}

        {showLoan && !plan.isReached && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <h4 className="text-sm font-semibold text-amber-800 mb-1">Micro-prêt d'urgence</h4>
            <p className="text-xs text-amber-700 mb-3">Emprunte pour éviter l'amende. 5% d'intérêts.</p>
            <div className="flex gap-2 items-end"><Input label="Montant" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1" /><Button onClick={() => handleAction('borrow', { amount: Number(amount) }, 'Prêt accordé.')} disabled={busy || !amount} className="bg-amber-600 hover:bg-amber-700">Emprunter</Button></div>
            <button onClick={() => setShowLoan(false)} className="text-xs text-amber-800 mt-3 hover:underline">Annuler</button>
          </div>
        )}

        <div className="space-y-2">
          {plan.isReached || isPiggybank ? (
            <Button onClick={() => { onClose(); onAskWithdraw(goal, isPiggybank ? 'cancel' : 'withdraw'); }} className="w-full" disabled={busy}><ArrowDownToLine size={16} /> {isPiggybank ? 'Casser la tirelire' : "Retirer l'épargne"}</Button>
          ) : (
            <Button onClick={() => { onClose(); onAskWithdraw(goal, 'cancel'); }} variant="outline" className="w-full text-red-600 hover:bg-red-50" disabled={busy}><ShieldAlert size={16} /> Annuler (10% pénalité)</Button>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historique</p>
          {deposits.length === 0 ? (<p className="text-xs text-slate-500">Aucun dépôt.</p>) : (
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">{deposits.map((d) => (<li key={d.id} className="flex items-center justify-between py-2"><div><span className="text-xs text-slate-500">{formatDate(d.date)}</span>{d.incomeSourceName && <span className="text-[10px] text-slate-400 ml-1">({d.incomeSourceName})</span>}{d.source === 'loan' && <span className="text-[10px] text-amber-600 font-bold ml-1">(PRÊT)</span>}</div><span className={`text-sm font-semibold ${d.source === 'loan' ? 'text-amber-600' : 'text-brand-600'}`}>+ {formatCurrency(d.amount)}</span></li>))}</ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GoalFormModal({ open, onClose, goal }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const premiumUntil = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const premiumActive = Number.isFinite(premiumUntil.getTime()) && premiumUntil > new Date();
  const editing = !!goal;

  const initial = editing ? {
    name: goal.name || '',
    type: goal.type || 'goal',
    targetAmount: String(goal.targetAmount || ''),
    categoryId: goal.categoryId || 'savings',
    startDate: goal.startDate || todayIso(),
    deadline: goal.deadline || todayIso(),
    frequencyDays: String(goal.frequencyDays || 7),
    penaltyAmount: '',
    penaltyEnabled: true,
    purposeType: goal.purposeType || 'personal',
    beneficiaryName: goal.beneficiaryName || '',
    beneficiaryRelation: goal.beneficiaryRelation || '',
    description: goal.description || '',
    rulesEnabled: goal.rulesEnabled === true,
    rulesText: goal.rulesText || '',
    piggyTargetEnabled: goal.type === 'piggybank' && Number(goal.targetAmount) > 0,
  } : {
    name: '',
    type: 'goal',
    targetAmount: '',
    categoryId: 'savings',
    startDate: todayIso(),
    deadline: new Date(new Date().setMonth(new Date().getMonth() + 2)).toISOString().slice(0, 10),
    frequencyDays: '7',
    penaltyAmount: '',
    penaltyEnabled: true,
    purposeType: 'personal',
    beneficiaryName: '',
    beneficiaryRelation: '',
    description: '',
    rulesEnabled: false,
    rulesText: '',
    piggyTargetEnabled: false,
  };

  const [type, setType] = useState(initial.type);
  const [name, setName] = useState(initial.name);
  const [targetAmount, setTargetAmount] = useState(initial.targetAmount);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [frequencyPreset, setFrequencyPreset] = useState(initial.frequencyDays);
  const [frequencyCustom, setFrequencyCustom] = useState('');
  const [purposeType, setPurposeType] = useState(initial.purposeType);
  const [beneficiaryName, setBeneficiaryName] = useState(initial.beneficiaryName);
  const [beneficiaryRelation, setBeneficiaryRelation] = useState(initial.beneficiaryRelation);
  const [description, setDescription] = useState(initial.description);
  const [rulesEnabled, setRulesEnabled] = useState(initial.rulesEnabled);
  const [rulesText, setRulesText] = useState(initial.rulesText);
  const [piggyTargetEnabled, setPiggyTargetEnabled] = useState(initial.piggyTargetEnabled);
  const [optionsOpen, setOptionsOpen] = useState(Boolean(initial.beneficiaryName || initial.description || initial.rulesEnabled));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const start = new Date(startDate);
  const end = new Date(deadline);
  const freeMaxDate = new Date(start);
  const startDay = freeMaxDate.getDate();
  freeMaxDate.setDate(1);
  freeMaxDate.setMonth(freeMaxDate.getMonth() + 2);
  freeMaxDate.setDate(Math.min(startDay, new Date(freeMaxDate.getFullYear(), freeMaxDate.getMonth() + 1, 0).getDate()));
  const deadlineMax = `${freeMaxDate.getFullYear()}-${String(freeMaxDate.getMonth() + 1).padStart(2, '0')}-${String(freeMaxDate.getDate()).padStart(2, '0')}`;
  const durationDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const frequencyDays = resolveFrequencyDays(frequencyPreset, frequencyCustom);
  const totalPayments = Math.max(1, Math.ceil(durationDays / frequencyDays));
  const amountPerPayment = targetAmount ? Math.round(Number(targetAmount) / totalPayments) : 0;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('Le nom est requis.');

    let payload = {
      name: name.trim(),
      type,
      categoryId,
      purposeType,
      beneficiaryName: beneficiaryName.trim(),
      beneficiaryRelation: beneficiaryRelation.trim(),
      description: description.trim(),
      rulesEnabled,
      rulesText: rulesEnabled ? rulesText.trim() : '',
    };

    if (type === 'goal') {
      const target = Math.round(Number(targetAmount));
      if (!Number.isSafeInteger(target) || target <= 0) return setError('Le montant cible est requis.');
      if (end <= start) return setError('La date de fin doit être après la date de début.');
      if (frequencyPreset === 'custom' && (!Number.isFinite(Number(frequencyCustom)) || Number(frequencyCustom) < 1)) {
        return setError('Indique une fréquence de versement valide.');
      }
      payload = {
        ...payload,
        targetAmount: target,
        startDate,
        deadline,
        frequencyDays,
      };
    } else {
      payload.targetAmount = piggyTargetEnabled && Number(targetAmount) > 0 ? Math.round(Number(targetAmount)) : null;
    }

    setSaving(true);
    try {
      if (editing) await updateGoal(user.uid, goal.id, payload);
      else await createGoal(user.uid, payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Impossible d’enregistrer cette épargne.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier l’épargne" : "Nouvelle épargne"} className="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-3">
        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType('goal')} className={`flex min-h-20 flex-col items-center justify-center rounded-xl border p-3 transition ${type === 'goal' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <Target size={20} className={type === 'goal' ? 'text-brand-700' : 'text-slate-400'}/>
              <span className={`mt-1 text-xs font-bold ${type === 'goal' ? 'text-brand-700' : 'text-slate-600'}`}>Objectif avec échéance</span>
            </button>
            <button type="button" onClick={() => setType('piggybank')} className={`flex min-h-20 flex-col items-center justify-center rounded-xl border p-3 transition ${type === 'piggybank' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <PiggyBank size={20} className={type === 'piggybank' ? 'text-brand-700' : 'text-slate-400'}/>
              <span className={`mt-1 text-xs font-bold ${type === 'piggybank' ? 'text-brand-700' : 'text-slate-600'}`}>Caisse / tirelire libre</span>
            </button>
          </div>
        )}

        <Input label="Nom de l’épargne" required value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'goal' ? 'Ex. Acheter un ordinateur' : 'Ex. Caisse familiale'} />
        <div><p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p><CategoryManager type="goal" value={categoryId} onChange={setCategoryId}/></div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
          <button type="button" onClick={() => setOptionsOpen((value) => !value)} aria-expanded={optionsOpen} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-3 text-left">
            <span><strong className="block text-sm font-semibold text-slate-800">Personnaliser cette épargne</strong><span className="mt-0.5 block text-xs text-slate-500">Bénéficiaire, raison et règles facultatives</span></span>
            <ChevronDown size={18} className={'shrink-0 text-slate-500 transition-transform ' + (optionsOpen ? 'rotate-180' : '')}/>
          </button>
          {optionsOpen && (
            <div className="space-y-3 border-t border-slate-200 px-3 pb-3 pt-3">
              <label className="block text-xs font-semibold text-slate-600">
                Cette épargne est destinée à…
                <select value={purposeType} onChange={(event) => setPurposeType(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  <option value="personal">Moi-même</option>
                  <option value="family">Ma famille / le foyer</option>
                  <option value="child">Un enfant</option>
                  <option value="partner">Mon conjoint / ma conjointe</option>
                  <option value="emergency">Une réserve d’urgence</option>
                  <option value="project">Un projet précis</option>
                  <option value="other">Autre personne ou usage</option>
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Bénéficiaire (facultatif)" value={beneficiaryName} onChange={(event) => setBeneficiaryName(event.target.value)} placeholder="Nom de la personne"/>
                <Input label="Lien avec toi (facultatif)" value={beneficiaryRelation} onChange={(event) => setBeneficiaryRelation(event.target.value)} placeholder="Ex. enfant, parent…"/>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Description ou objectif personnel (facultatif)
                <textarea maxLength="500" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="À quoi servira cette épargne ? Une précision utile…" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input type="checkbox" checked={rulesEnabled} onChange={(event) => setRulesEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"/>
                <span><strong className="block text-xs font-semibold text-slate-800">Ajouter des règles ou engagements</strong><span className="text-[10px] text-slate-500">Désactivé par défaut. Tu peux préciser tes propres conditions.</span></span>
              </label>
              {rulesEnabled && (
                <label className="block text-xs font-semibold text-slate-600">
                  Règles ou engagements facultatifs
                  <textarea maxLength="1200" rows={3} value={rulesText} onChange={(event) => setRulesText(event.target.value)} placeholder="Ex. contributions prévues, usage réservé à un projet…" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
                  <span className="mt-1 block text-[10px] font-normal text-slate-400">Ces règles sont des notes de référence. Pata ne bloque pas automatiquement les retraits en fonction de ce texte.</span>
                </label>
              )}
            </div>
          )}
        </section>

        {type === 'goal' && (
          <>
            <Input label="Montant cible (FCFA)" type="number" min="1" required value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)}/>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700"><CalendarDays size={16} className="text-brand-700"/> Période</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date de début" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)}/>
                <Input label="Date de fin" type="date" min={startDate} max={!premiumActive ? deadlineMax : undefined} required value={deadline} onChange={(event) => setDeadline(event.target.value)}/>
              </div>
              <p className="mt-2 text-xs text-slate-500">Durée : <strong className="text-slate-700">{durationDays} jours</strong>. {!premiumActive && <span>Le compte gratuit permet un objectif d’une durée maximale de deux mois.</span>}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Fréquence des versements</p>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_PRESETS.map(({ v, label }) => <button type="button" key={v} onClick={() => setFrequencyPreset(v)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${frequencyPreset === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>)}
                <button type="button" onClick={() => setFrequencyPreset('custom')} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${frequencyPreset === 'custom' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700'}`}>Personnalisée</button>
              </div>
              {frequencyPreset === 'custom' && <div className="mt-2"><Input label="Tous les X jours" type="number" min="1" value={frequencyCustom} onChange={(event) => setFrequencyCustom(event.target.value)}/></div>}
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm"><span className="font-medium text-brand-800">Aperçu : </span><strong className="text-slate-800">{totalPayments} versements de {formatCurrency(amountPerPayment)}</strong></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Pénalité obligatoire en cas de retard</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">Chaque échéance manquée entraîne des frais de 15 % du montant cible total de cette épargne, et non 15 % du versement attendu. Ces frais ne peuvent pas être désactivés.</p>
              {Number(targetAmount) > 0 && <p className="mt-1 text-xs font-semibold text-amber-900">Montant par échéance manquée : {formatCurrency(Math.round(Number(targetAmount) * GOAL_LATE_PENALTY_RATE))}</p>}
            </div>
          </>
        )}

        {type === 'piggybank' && (
          <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
            <div><p className="flex items-center gap-2 text-sm font-semibold text-brand-800"><PiggyBank size={16}/> Mode Caisse / tirelire</p><p className="mt-1 text-xs leading-5 text-slate-600">Dépose ce que tu veux, quand tu veux. Tu peux laisser la caisse sans cible ou définir un montant à atteindre, sans échéance imposée.</p></div>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input type="checkbox" checked={piggyTargetEnabled} onChange={(event) => setPiggyTargetEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"/>
              <span><strong className="block text-xs font-semibold text-slate-800">Définir une cible facultative</strong><span className="text-[10px] text-slate-500">Tu peux l’ajouter ou la retirer plus tard.</span></span>
            </label>
            {piggyTargetEnabled && <Input label="Montant cible (FCFA)" type="number" min="1" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="Ex. 100000"/>}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : "Créer l’épargne"}</Button>
      </form>
    </Modal>
  );
}
function GoalCard({ goal, onOpen, onEdit, onAskWithdraw, onTogglePin, onDelete }) {
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const isPiggybank = goal.type === 'piggybank';
  let statusColor = '#3b82f6'; let statusLabel = 'En cours';
  if (isPiggybank) { statusColor = '#14b8a6'; statusLabel = 'Tirelire'; }
  else if (plan.notStarted) { statusColor = '#94a3b8'; statusLabel = 'Programmé'; }
  else if (plan.isReached) { statusColor = '#10b981'; statusLabel = 'Atteint'; }
  else if (plan.isLate) { statusColor = '#ef4444'; statusLabel = 'En retard'; }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}
      className={`flex cursor-pointer flex-col transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${goal.pinned ? 'ring-2 ring-brand-500 shadow-md' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color || '#94a3b8' }} /><p className="truncate text-lg font-bold text-slate-900">{goal.name}</p></div>
          {!isPiggybank && (<p className="mt-1 text-xs text-slate-500">{formatCurrency(goal.targetAmount)} — {formatCurrency(plan.amountPerPayment)} / {plan.frequencyDays} j</p>)}
          {isPiggybank && goal.targetAmount > 0 && <p className="mt-1 text-xs text-slate-500">Cible : {formatCurrency(goal.targetAmount)}</p>}
          <p className="mt-1 text-[10px] font-semibold text-brand-700">Ouvrir la fiche et l’historique →</p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={(event) => { event.stopPropagation(); onTogglePin(goal.id, goal.pinned); }} className={`rounded-lg p-1.5 transition-colors ${goal.pinned ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100'}`} title={goal.pinned ? "Désépingler" : "Épingler"} aria-label={goal.pinned ? "Désépingler" : "Épingler"}><Pin size={18} className={goal.pinned ? 'fill-current' : ''} /></button>
          <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Modifier l’épargne"><Pencil size={16} /></button>
        </div>
      </div>
      <div className="mb-2"><span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: statusColor }}>{statusLabel}</span></div>

      {isPiggybank ? (
        <div className="mb-4 flex items-center justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><PiggyBank size={22} /></div><div className="min-w-0 flex-1 text-right"><p className="text-xs text-slate-500">Total épargné</p><p className="text-lg font-bold text-brand-700">{formatCurrency(plan.totalDeposited)}</p>{plan.hasTarget && <p className="text-[10px] text-slate-500">{Math.round(plan.progress)}% de la cible</p>}</div></div>
      ) : (
        <div className="mb-4 flex items-center gap-4">
          <ProgressCircle value={plan.progress} size={70} />
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Épargné</span><span className="font-semibold text-brand-600">{formatCurrency(plan.totalDeposited)}</span></div>
            {plan.totalDebt > 0 && (<div className="flex justify-between text-sm"><span className="text-red-500">Dettes</span><span className="font-semibold text-red-600">{formatCurrency(plan.totalDebt)}</span></div>)}
            {plan.isLate && (<div className="flex justify-between text-sm"><span className="text-red-500">Amende</span><span className="font-semibold text-red-600">{formatCurrency(plan.penalty)}</span></div>)}
            <div className="flex justify-between text-xs pt-1 border-t border-slate-100"><span className="text-slate-400">Échéance</span><span className="font-medium text-slate-600">{formatDate(goal.deadline)}</span></div>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-2">
        <Button variant="outline" className="w-full" onClick={(event) => { event.stopPropagation(); onOpen(); }}><TrendingUp size={16} /> {isPiggybank ? 'Ouvrir la caisse' : 'Voir détails et verser'}</Button>
        {isPiggybank ? (
          <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={(event) => { event.stopPropagation(); onAskWithdraw(goal, 'cancel'); }}><Unlock size={16} /> Casser la tirelire</Button>
        ) : plan.isReached ? (
          <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white" onClick={(event) => { event.stopPropagation(); onAskWithdraw(goal, 'withdraw'); }}><ArrowDownToLine size={16} /> Retirer</Button>
        ) : (
          <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={(event) => { event.stopPropagation(); onAskWithdraw(goal, 'cancel'); }}><ShieldAlert size={16} /> Annuler l'objectif</Button>
        )}
      </div>
    </Card>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { goals } = useGoals();
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirmGoal, setConfirmGoal] = useState(null);
  const [confirmType, setConfirmType] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [deleteGoalId, setDeleteGoalId] = useState(null);

  const sortedGoals = useMemo(() => {
    return [...goals].filter((goal) => !goal.closed).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB - dateA;
    });
  }, [goals]);

  const currentMonthKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(new Date());
  const goalExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const premiumActive = Number.isFinite(goalExpiry.getTime()) && goalExpiry > new Date();
  const usedGoalQuota = profile?.monthlyStats?.lastResetMonth === currentMonthKey ? Number(profile?.monthlyStats?.goals) || 0 : 0;
  const goalQuotaReached = !premiumActive && usedGoalQuota >= 1;
  const openCreate = () => { if (goalQuotaReached) return; setEditingGoal(null); setOpen(true); };
  const openEdit = (goal) => { setEditingGoal(goal); setOpen(true); };
  const closeForm = () => { setOpen(false); setEditingGoal(null); };
  const askWithdraw = (goal, type) => { setConfirmGoal(goal); setConfirmType(type); };
  const handleTogglePin = async (id, currentStatus) => { await toggleGoalPin(user.uid, id, currentStatus); };

  const handleConfirmAction = async (action, payoutDetails) => {
    if (!confirmGoal || !confirmType) return;
    setConfirmBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/goals/${confirmType}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ goalId: confirmGoal.id, ...payoutDetails }) });
      const data = await res.json();
      if (data.success) {
        alert(`Demande envoyée pour ${formatCurrency(data.amount)}. Le paiement sera effectué après vérification.`);
        setConfirmGoal(null); setConfirmType(null); setSelected(null);
      } else { alert(data.error); }
    } catch { alert('Erreur.'); } finally { setConfirmBusy(false); }
  };

  const handleDeleteGoal = async () => {
    if (!deleteGoalId) return;
    try { await deleteGoal(user.uid, deleteGoalId); setDeleteGoalId(null); }
    catch (error) { window.alert(error.message || 'Impossible de supprimer cette épargne.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Épargne & Objectifs</h1><p className="text-sm text-slate-500">Gère tes objectifs datés ou ta tirelire libre.</p></div>
        <Button onClick={openCreate} disabled={goalQuotaReached} className={goalQuotaReached ? 'opacity-50 grayscale' : ''}><Plus size={16} /> {goalQuotaReached ? 'Limite atteinte' : 'Créer une épargne'}</Button>
      </div>
      {!premiumActive && (
        <div className={`rounded-xl border p-3 ${goalQuotaReached ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">Création d’épargne ce mois-ci</p><p className="text-xs text-slate-500">{usedGoalQuota} sur 1 autorisée avec le compte gratuit. Un objectif gratuit peut durer jusqu’à deux mois.</p></div><span className="text-sm font-bold text-slate-700">{Math.min(usedGoalQuota, 1)}/1</span></div>
          {goalQuotaReached && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-amber-800">Tu as utilisé ta création gratuite de ce mois.</p><Button size="sm" onClick={() => window.location.assign('/premium')}>Passer à Premium</Button></div>}
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="Aucune épargne" description="Crée un objectif ou une tirelire pour commencer." action={<Button onClick={openCreate} disabled={goalQuotaReached}><Plus size={16} /> {goalQuotaReached ? "Limite atteinte" : "Créer"}</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {sortedGoals.map((g) => (<GoalCard key={g.id} goal={g} onOpen={() => setSelected(g)} onEdit={() => openEdit(g)} onAskWithdraw={askWithdraw} onTogglePin={handleTogglePin} onDelete={() => setDeleteGoalId(g.id)} />))}
        </div>
      )}

      {open && <GoalFormModal key={editingGoal?.id || 'new'} open={open} onClose={closeForm} goal={editingGoal} />}
      {selected && (<GoalDetail goal={selected} onClose={() => setSelected(null)} onAskWithdraw={(g, type) => { setSelected(null); askWithdraw(g, type); }} />)}
      {confirmGoal && confirmType && (<ConfirmWithdrawModal goal={confirmGoal} actionType={confirmType} onClose={() => { setConfirmGoal(null); setConfirmType(null); }} onConfirm={handleConfirmAction} busy={confirmBusy} />)}

      <ConfirmDialog open={!!deleteGoalId} onClose={() => setDeleteGoalId(null)} onConfirm={handleDeleteGoal} title="Supprimer cet objectif ?" message="Une épargne qui contient encore de l’argent ne peut pas être supprimée directement. Retire d’abord les fonds depuis sa fiche. La suppression ne rend pas une création gratuite." confirmWord="SUPPRIMER" confirmLabel="Supprimer définitivement" variant="danger" />
    </div>
  );
}
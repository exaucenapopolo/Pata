'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowDownLeft, ArrowDownToLine, ArrowUpRight, Bell, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, CreditCard, Database, KeyRound, Loader2, LogOut, Mail, MessageCircle, PiggyBank, RefreshCw, Search, ShieldCheck, Users, Wallet, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

const money = (value) => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value)).toLocaleString('fr-FR')} FCFA`;
const dateLabel = (value) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); };
const statusLabel = { PENDING_REVIEW: 'À vérifier', SENDING: 'Envoi en cours', PROCESSING: 'Traitement en cours', RECONCILIATION_REQUIRED: 'Vérification nécessaire', PAID: 'Payé', REJECTED: 'Refusé', FAILED: 'Échec', EXPIRED: 'Expiré' };
const templates = [
  {
    key: 'welcome', label: 'Bienvenue', subject: 'Bienvenue sur Pata — commençons à construire ton suivi',
    body: `Bonjour {nom},

Bienvenue sur Pata ! Nous sommes heureux de t’accueillir dans une application conçue pour t’aider à mieux comprendre ton argent et à organiser tes priorités, sans te compliquer la vie.

Tu peux commencer simplement : enregistrer tes revenus, noter tes dépenses courantes, définir un budget réaliste et suivre les objectifs qui comptent pour toi. Tu retrouveras tes informations dans ton tableau de bord et tes rapports.

Prends le temps de découvrir les rubriques à ton rythme. Tu n’as pas besoin de tout configurer en une seule journée : quelques informations fiables et régulièrement mises à jour suffisent pour commencer à voir plus clair.

Merci d’avoir choisi Pata. Notre équipe reste disponible pour t’accompagner si tu rencontres une difficulté ou si tu as une question.`,
  },
  {
    key: 'congratulations', label: 'Félicitations — projets et réalisations', subject: 'Nous souhaitions saluer tes avancées sur Pata',
    body: `Bonjour {nom},

Nous prenons un moment pour reconnaître les étapes positives de ton parcours sur Pata. Les projets que tu prépares, ceux que tu fais avancer et les objectifs que tu as choisi de financer témoignent d’une démarche concrète : transformer tes idées en réalisations.

Nous avons consulté les informations de ton compte afin de mettre en valeur tes projets, tes objectifs d’épargne et tes cotisations. Tu trouveras ci-dessous un aperçu personnalisé de ces engagements. Nous ne confondons pas ces réalisations avec les dépenses du quotidien : ce sont des objectifs distincts, qui méritent d’être suivis séparément.

Continue à avancer avec un rythme adapté à tes moyens et à tes priorités. Il vaut mieux un plan réaliste, que tu peux tenir, qu’un objectif trop ambitieux qui devient difficile à suivre.

Merci de faire confiance à Pata pour organiser ces étapes. Nous sommes heureux de t’accompagner dans la suite de ton parcours.`,
  },
  {
    key: 'support', label: 'Aide et accompagnement', subject: 'Pata — nous sommes disponibles pour t’accompagner',
    body: `Bonjour {nom},

Nous souhaitions prendre de tes nouvelles et vérifier que ton expérience sur Pata se déroule dans de bonnes conditions.

Si tu rencontres une difficulté pour enregistrer un revenu, classer une sortie, suivre un objectif d’épargne, utiliser une cotisation ou comprendre un rapport, réponds simplement à ce message en décrivant ce qui se passe. Tu peux également joindre une capture d’écran en prenant soin de masquer les informations confidentielles qui ne sont pas nécessaires.

Notre équipe pourra ainsi mieux comprendre la situation et t’indiquer les étapes à suivre. Nous préférons examiner le problème avec précision plutôt que de te donner une réponse approximative.

Merci de nous aider à améliorer Pata par tes retours. Nous restons disponibles pour t’accompagner.`,
  },
  {
    key: 'checkin', label: 'Prendre des nouvelles', subject: 'Comment se passe ton expérience avec Pata ?',
    body: `Bonjour {nom},

Cela fait quelque temps que nous ne nous sommes pas croisés sur Pata. Nous espérons que tout va bien de ton côté.

Nous aimerions savoir si l’application répond toujours à tes attentes. Est-ce que le suivi des revenus, les objectifs d’épargne, les projets et les cotisations sont faciles à utiliser ? Y a-t-il une étape qui te semble compliquée ou une fonction qui te manque ?

Ton retour nous aide à identifier les améliorations qui comptent vraiment pour les utilisateurs. Tu peux répondre directement à ce message : nous lirons tes remarques avec attention.

Merci de faire partie de la communauté Pata. Nous serons heureux d’avoir de tes nouvelles.`,
  },
  {
    key: 'encouragement', label: 'Encouragement', subject: 'Continue à avancer à ton rythme',
    body: `Bonjour {nom},

Un projet financier ne se construit pas toujours en une seule étape. Certaines périodes permettent d’avancer rapidement ; d’autres demandent de revoir les priorités ou de prendre un peu de recul.

L’important est de conserver une vision claire de ce que tu souhaites réaliser. Pata te permet de suivre séparément les dépenses du quotidien, les projets, les sommes mises de côté et les investissements. Tu peux ainsi prendre des décisions en tenant compte de la nature réelle de chaque mouvement.

Choisis des objectifs qui correspondent à tes moyens actuels et ajuste-les lorsque ta situation évolue. Tu peux également consulter tes rapports pour observer tes progrès sur une période précise.

Nous sommes heureux de t’accompagner. Continue avec méthode, sans te mettre une pression inutile.`,
  },
  {
    key: 'savings', label: 'Épargne et objectifs', subject: 'Un point sur tes objectifs d’épargne',
    body: `Bonjour {nom},

Nous souhaitions revenir sur les objectifs d’épargne que tu as enregistrés dans Pata. Les sommes mises de côté représentent une démarche distincte des dépenses de consommation : elles sont destinées à préparer une utilisation future ou à protéger une partie de tes ressources.

Tu peux consulter le montant déjà constitué, la progression vers chaque cible et les échéances que tu as définies. Si un objectif ne correspond plus à ta situation, prends le temps de revoir son calendrier et tes contributions avant de modifier ton plan.

L’essentiel est de garder un niveau d’épargne compatible avec tes besoins essentiels et tes engagements actuels. Un objectif réaliste et suivi régulièrement est plus utile qu’une cible difficile à tenir.

Merci d’utiliser Pata pour organiser tes priorités.`,
  },
  {
    key: 'cotisation', label: 'Cotisation et tontine', subject: 'Un point sur tes cotisations Pata',
    body: `Bonjour {nom},

Nous souhaitions te faire un point sur les groupes de cotisation auxquels tu participes sur Pata. Les cotisations reposent sur des engagements collectifs : chaque membre doit connaître sa position, sa contribution, la date limite et le tour du bénéficiaire.

Tu peux consulter le montant déjà confirmé, le reste à verser, l’ordre de passage et les règles de retard définies par le chef du groupe. Les paiements ne sont comptabilisés qu’après confirmation effective de Fapshi. Un lien de paiement ouvert ou une opération encore en attente ne constitue pas un versement reçu.

Lorsque toutes les contributions nécessaires sont confirmées, le bénéficiaire peut demander son retrait. Celui-ci reste soumis à la vérification administrative et à la confirmation du prestataire.

Merci de respecter les échéances et de prévenir ton groupe en cas de difficulté.`,
  },
  {
    key: 'premium', label: 'Découverte Premium', subject: 'Découvre les possibilités de Pata Premium',
    body: `Bonjour {nom},

Pata évolue pour proposer des outils plus complets à ceux qui souhaitent approfondir leur gestion financière.

Avec les fonctions Premium, tu peux notamment organiser des projets, relier des revenus à un projet précis, suivre les sorties qui lui sont associées et demander à Mč une analyse dédiée. Cela permet de distinguer plus clairement les dépenses du quotidien des sommes affectées à une réalisation importante.

Prends le temps de consulter la page Premium et de comparer les fonctions proposées à tes besoins réels. Tu n’as aucune obligation de souscrire : l’objectif est de te permettre de choisir en connaissance de cause.

Merci de ta confiance.`,
  },
];
const englishTemplates = {
  welcome: {
    label: 'Welcome',
    subject: "Welcome to Pata — let's build your financial overview",
    body: [
      'Hello {nom},',
      '',
      "Welcome to Pata! We're glad to have you in an app designed to help you better understand your money and organize your priorities without making things complicated.",
      '',
      'You can start simply: record your income, note everyday expenses, set a realistic budget and track the goals that matter to you. You will find your information in your dashboard and reports.',
      '',
      "Take time to explore the sections at your own pace. You do not need to configure everything in one day: a few reliable details updated regularly are enough to start getting a clearer picture.",
      '',
      'Thank you for choosing Pata. Our team is available to help if you encounter a problem or have a question.',
    ].join('\\n'),
  },
  congratulations: {
    label: 'Congratulations — projects and achievements',
    subject: 'We wanted to recognize your progress with Pata',
    body: [
      'Hello {nom},',
      '',
      'We want to recognize the positive steps you have taken with Pata. The projects you are preparing, the ones you are moving forward and the goals you have chosen to fund show a practical effort to turn ideas into achievements.',
      '',
      'We reviewed the information in your account to highlight your projects, savings goals and contribution groups. Below you will find a personalized overview of these commitments. We keep these achievements separate from everyday spending because they are distinct goals that deserve to be tracked separately.',
      '',
      'Keep moving forward at a pace that fits your means and priorities. A realistic plan you can maintain is more useful than an overly ambitious goal that becomes difficult to follow.',
      '',
      'Thank you for trusting Pata to organize these steps. We are glad to support you as you continue.',
    ].join('\\n'),
  },
  support: {
    label: 'Help and support',
    subject: 'Pata — we are here to help',
    body: [
      'Hello {nom},',
      '',
      'We wanted to check in and make sure your experience with Pata is going well.',
      '',
      'If you have difficulty recording income, categorizing an expense, tracking a savings goal, using a contribution group or understanding a report, simply reply to this message and describe what is happening. You may also attach a screenshot, making sure to hide any confidential information that is not needed.',
      '',
      'This will help our team understand the situation and guide you through the next steps. We prefer to examine the issue carefully rather than give you an approximate answer.',
      '',
      'Thank you for helping us improve Pata with your feedback. We are here to support you.',
    ].join('\\n'),
  },
  checkin: {
    label: 'Checking in',
    subject: 'How is your experience with Pata?',
    body: [
      'Hello {nom},',
      '',
      'It has been a little while since we last saw you on Pata. We hope everything is going well.',
      '',
      'We would like to know whether the app still meets your expectations. Is it easy to track income, savings goals, projects and contribution groups? Is there a step that seems complicated or a feature you are missing?',
      '',
      'Your feedback helps us identify the improvements that matter most to users. You can reply directly to this message; we will read your comments carefully.',
      '',
      'Thank you for being part of the Pata community. We would be happy to hear from you.',
    ].join('\\n'),
  },
  encouragement: {
    label: 'Encouragement',
    subject: 'Keep moving forward at your own pace',
    body: [
      'Hello {nom},',
      '',
      'A financial project is not always built in a single step. Some periods allow you to move quickly; others require you to review your priorities or take a step back.',
      '',
      'What matters is keeping a clear view of what you want to achieve. Pata lets you track everyday expenses, projects, set-aside funds and investments separately. This helps you make decisions based on the actual nature of each transaction.',
      '',
      'Choose goals that match your current means and adjust them as your situation changes. You can also review your reports to see your progress over a specific period.',
      '',
      'We are glad to support you. Keep going steadily, without putting unnecessary pressure on yourself.',
    ].join('\\n'),
  },
  savings: {
    label: 'Savings and goals',
    subject: 'An update on your savings goals',
    body: [
      'Hello {nom},',
      '',
      'We wanted to revisit the savings goals you recorded in Pata. Money set aside is different from everyday spending: it is intended for future use or to protect part of your resources.',
      '',
      'You can review the amount already saved, your progress toward each target and the deadlines you have set. If a goal no longer fits your situation, take time to review its schedule and your contributions before changing your plan.',
      '',
      'The key is to keep your savings at a level that remains compatible with essential needs and current commitments. A realistic goal that you follow regularly is more useful than a target that is difficult to maintain.',
      '',
      'Thank you for using Pata to organize your priorities.',
    ].join('\\n'),
  },
  cotisation: {
    label: 'Contribution group',
    subject: 'An update on your Pata contributions',
    body: [
      'Hello {nom},',
      '',
      'We wanted to give you an update on the contribution groups you participate in on Pata. These groups involve shared commitments: each member should know their position, contribution amount, due date and the beneficiary payout turn.',
      '',
      'You can review the amount already confirmed, the remaining contribution, the payout order and the late-payment rules set by the group leader. Payments are counted only after Fapshi confirms them. An opened payment link or a pending transaction does not mean that a contribution has been received.',
      '',
      'Once all required contributions are confirmed, the beneficiary can request a withdrawal. It remains subject to administrative review and confirmation by the payment provider.',
      '',
      'Thank you for meeting the deadlines and informing your group if you encounter a difficulty.',
    ].join('\\n'),
  },
  premium: {
    label: 'Discover Premium',
    subject: 'Discover what Pata Premium can offer',
    body: [
      'Hello {nom},',
      '',
      'Pata is evolving to offer more complete tools to people who want to take their financial organization further.',
      '',
      'With Premium features, you can organize projects, assign income to a specific project, track related outflows and ask Mč for a dedicated analysis. This helps you distinguish everyday spending from funds allocated to an important project.',
      '',
      'Take time to review the Premium page and compare the available features with your actual needs. You are not required to subscribe; the goal is to help you make an informed choice.',
      '',
      'Thank you for your trust.',
    ].join('\\n'),
  },
};

function getTemplateField(template, field, language) {
  if (language === 'en' && englishTemplates[template.key]?.[field]) {
    return englishTemplates[template.key][field];
  }
  return template[field];
}


function Metric({ label, value, detail, icon: Icon }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><span className="rounded-xl bg-slate-100 p-2 text-slate-600"><Icon size={17}/></span></div><p className="mt-3 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>; }
function SectionTitle({ title, detail, action }) { return <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>{action}</div>; }

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const router = useRouter();
  const [code, setCode] = useState(''); const [unlocked, setUnlocked] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); const [overview, setOverview] = useState(null); const [users, setUsers] = useState([]); const [nextCursor, setNextCursor] = useState(null); const [questions, setQuestions] = useState(null); const [nextQuestionCursor, setNextQuestionCursor] = useState(null); const [savings, setSavings] = useState(null); const [nextSavingsCursor, setNextSavingsCursor] = useState(null); const [recipients, setRecipients] = useState([]); const [recipientSummary, setRecipientSummary] = useState(null); const [nextRecipientCursor, setNextRecipientCursor] = useState(null); const [selectedRecipientIds, setSelectedRecipientIds] = useState([]); const [recipientMode, setRecipientMode] = useState('all'); const [recipientSearch, setRecipientSearch] = useState(''); const [withdrawals, setWithdrawals] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null); const [userDetail, setUserDetail] = useState(null); const [search, setSearch] = useState(''); const [templateChoice, setTemplateChoice] = useState('');
  const [emailSubject, setEmailSubject] = useState(getTemplateField(templates[0], 'subject', language)); const [emailMessage, setEmailMessage] = useState(getTemplateField(templates[0], 'body', language)); const [emailCustomized, setEmailCustomized] = useState(false); const [emailResult, setEmailResult] = useState(''); const [emailCtaPath, setEmailCtaPath] = useState('/dashboard'); const [emailTemplateKey, setEmailTemplateKey] = useState('welcome');
  const [broadcastTitle, setBroadcastTitle] = useState('Information Pata'); const [broadcastMessage, setBroadcastMessage] = useState(''); const [broadcastPath, setBroadcastPath] = useState('/dashboard'); const [broadcastImageUrl, setBroadcastImageUrl] = useState(''); const [broadcastResult, setBroadcastResult] = useState('');

  useEffect(() => {
    if (emailCustomized) return;
    const selectedTemplate = templates.find((template) => template.key === emailTemplateKey);
    if (!selectedTemplate) return;
    setEmailSubject(getTemplateField(selectedTemplate, 'subject', language));
    setEmailMessage(getTemplateField(selectedTemplate, 'body', language));
  }, [language, emailTemplateKey, emailCustomized]);

  const api = useCallback(async (path, method = 'GET', body = null) => {
    if (!user) throw new Error('Connecte-toi à ton compte avant de continuer.');
    const token = await user.getIdToken();
    const response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }, [user]);
  const loadDashboard = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [summary, userList, requests] = await Promise.all([api('admin/overview'), api('admin/users?limit=40'), api('admin/withdrawals')]);
      setOverview(summary); setUsers(userList.users || []); setNextCursor(userList.nextCursor || null); setWithdrawals(requests.withdrawals || []); setUnlocked(true);
    } catch (err) { setError(err.message || 'Impossible de charger le tableau de bord.'); if (/session administrateur/i.test(err.message || '')) setUnlocked(false); }
    finally { setBusy(false); }
  }, [api]);
  useEffect(() => { if (!authLoading && !user) router.replace('/login'); }, [authLoading, user, router]);

  const unlock = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await api('admin/unlock', 'POST', { code }); setCode(''); await loadDashboard(); } catch (err) { setError(err.message || 'Accès refusé.'); setBusy(false); } };
  const loadMoreUsers = async () => { if (!nextCursor || busy) return; setBusy(true); try { const result = await api(`admin/users?limit=40&cursor=${encodeURIComponent(nextCursor)}`); setUsers((current) => [...current, ...(result.users || [])]); setNextCursor(result.nextCursor || null); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const loadQuestions = async (append = false) => {
    setBusy(true); setError('');
    try {
      const cursor = append && nextQuestionCursor ? `&cursor=${encodeURIComponent(nextQuestionCursor)}` : '';
      const result = await api(`admin/questions?limit=20${cursor}`);
      setQuestions((current) => append ? { ...result, conversations: [...(current?.conversations || []), ...(result.conversations || [])] } : result);
      setNextQuestionCursor(result.nextCursor || null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const loadSavings = async (append = false) => {
    setBusy(true); setError('');
    try {
      const cursor = append && nextSavingsCursor ? `&cursor=${encodeURIComponent(nextSavingsCursor)}` : '';
      const result = await api(`admin/savings?limit=30${cursor}`);
      setSavings((current) => append ? { ...result, goals: [...(current?.goals || []), ...(result.goals || [])] } : result);
      setNextSavingsCursor(result.nextCursor || null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const loadRecipients = async (append = false) => {
    setBusy(true); setError('');
    try {
      const cursor = append && nextRecipientCursor ? `&cursor=${encodeURIComponent(nextRecipientCursor)}` : '';
      const result = await api(`admin/notification-recipients?limit=50${cursor}`);
      setRecipients((current) => append ? [...current, ...(result.recipients || [])] : (result.recipients || []));
      setRecipientSummary({ totalUsers: result.totalUsers || 0, optedInUsers: result.optedInUsers || 0 });
      setNextRecipientCursor(result.nextCursor || null);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const openUser = async (entry) => { setSelectedUser(entry); setUserDetail(null); setTemplateChoice(''); setEmailSubject(getTemplateField(templates[0], 'subject', language)); setEmailMessage(getTemplateField(templates[0], 'body', language)); setEmailCustomized(false); setEmailTemplateKey('welcome'); setEmailResult(''); try { setUserDetail(await api(`admin/user-detail?uid=${encodeURIComponent(entry.id)}`)); } catch (err) { setError(err.message); } };
  const sendUserEmail = async () => {
    if (!userDetail?.user?.id || !emailSubject.trim() || !emailMessage.trim()) return;
    setBusy(true); setError(''); setEmailResult('');
    try {
      const result = await api('admin/email/send', 'POST', {
        recipientUid: userDetail.user.id,
        subject: emailSubject.trim(),
        message: emailMessage.trim().replaceAll('{nom}', userDetail.user.displayName || 'bonjour'),
        ctaPath: emailCtaPath,
        templateKey: emailTemplateKey,
        ctaLabel: isEnglish
          ? (emailCtaPath === '/premium' ? 'Discover Premium' : emailCtaPath === '/goals' ? 'View my savings' : emailCtaPath === '/cotisations' ? 'View my contributions' : 'Open my dashboard')
          : (emailCtaPath === '/premium' ? 'Découvrir Premium' : emailCtaPath === '/goals' ? 'Voir mon épargne' : emailCtaPath === '/cotisations' ? 'Voir mes cotisations' : 'Ouvrir mon tableau de bord'),
      });
      setEmailResult(isEnglish ? 'Email accepted by Resend for ' + (result.recipientEmail || userDetail.user.email) + '.' : 'E-mail accepté par Resend pour ' + (result.recipientEmail || userDetail.user.email) + '.');
    } catch (err) { setError(err.message || 'Impossible d’envoyer cet e-mail.'); }
    finally { setBusy(false); }
  };
  const logout = async () => { try { await api('admin/logout', 'POST', {}); } catch { /* session déjà expirée */ } setUnlocked(false); setOverview(null); setUsers([]); setWithdrawals([]); setUserDetail(null); };
  const approve = async (item) => { if (!window.confirm(isEnglish ? `Approve the withdrawal of ${money(item.amount)} to ${item.phone}? The payment will be sent to Fapshi.` : `Valider le retrait de ${money(item.amount)} vers ${item.phone} ? Le paiement sera transmis à Fapshi.`)) return; setBusy(true); setError(''); try { await api('admin/withdrawal/approve', 'POST', { requestId: item.id }); await loadDashboard(); } catch (err) { setError(err.message); setBusy(false); } };
  const reject = async (item) => { const reason = window.prompt(isEnglish ? 'Reason for rejection (optional):' : 'Motif du refus (facultatif) :', isEnglish ? 'Request not approved after review.' : 'Demande non validée après vérification.'); if (reason === null) return; setBusy(true); setError(''); try { await api('admin/withdrawal/reject', 'POST', { requestId: item.id, reason }); await loadDashboard(); } catch (err) { setError(err.message); setBusy(false); } };
  const broadcast = async (event) => {
    event.preventDefault(); setBusy(true); setBroadcastResult(''); setError('');
    try {
      const result = await api('admin/notifications/broadcast', 'POST', { title: broadcastTitle, message: broadcastMessage, path: broadcastPath, imageUrl: broadcastImageUrl.trim(), recipientMode, recipientIds: recipientMode === 'selected' ? selectedRecipientIds : [] });
      const codes = (result.pushFailureDetails || []).map((item) => item.code);
      const diagnostic = codes.length ? ' Codes retournés : ' + [...new Set(codes)].join(', ') + '.' : '';
      setBroadcastResult((result.message || 'Notification enregistrée.') + diagnostic);
      setBroadcastMessage(''); setBroadcastImageUrl('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!unlocked || tab !== 'savings') return;
    const timer = setInterval(async () => {
      try {
        const result = await api('admin/savings?limit=30');
        setSavings(result);
        setNextSavingsCursor(result.nextCursor || null);
      } catch (err) {
        console.warn('[ADMIN SAVINGS REFRESH]', err.message);
      }
    }, 90000);
    return () => clearInterval(timer);
  }, [unlocked, tab, api]);
  const visibleUsers = useMemo(() => { const value = search.trim().toLowerCase(); return value ? users.filter((entry) => `${entry.displayName || ''} ${entry.email || ''} ${entry.phone || ''}`.toLowerCase().includes(value)) : users; }, [users, search]);
  const waHref = (entry, template) => { const number = String(entry?.phone || '').replace(/\D/g, ''); if (!number) return ''; const body = getTemplateField(template, 'body', language); return `https://wa.me/${number.startsWith('237') ? number : `237${number}`}?text=${encodeURIComponent(body.replaceAll('{nom}', entry?.displayName || (isEnglish ? 'there' : 'utilisateur')))}`; };

  if (authLoading || !user) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><Loader2 className="animate-spin text-slate-500"/></main>;
  if (!unlocked) return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10"><form onSubmit={unlock} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"><div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><ShieldCheck size={23}/></div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pata · Espace privé</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Administration</h1><p className="mt-2 text-sm leading-6 text-slate-500">Saisis le code administrateur pour accéder à la gestion de Pata.</p><label className="mt-6 block text-sm font-medium text-slate-700">Code administrateur</label><input autoComplete="current-password" type="password" value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base tracking-widest outline-none focus:border-slate-800" placeholder="Saisir le code" required/>{error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy || !code} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={17}/> : <KeyRound size={17}/>} Accéder à l’administration</button><p className="mt-4 text-center text-xs text-slate-400">NAPOPOLO EXAUCE · Pata</p></form></main>;

  const stats = overview?.stats || {};
  const nav = [['overview', 'Vue générale', Activity], ['savings', 'Épargnes & objectifs', PiggyBank], ['users', 'Utilisateurs', Users], ['questions', 'Discussions IA', MessageCircle], ['withdrawals', 'Retraits', ArrowDownToLine], ['broadcast', 'Notifications', Bell]];
  return <main className="min-h-screen bg-slate-50 p-3 text-slate-900 sm:p-6"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pata · Administration</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">Bonjour, NAPOPOLO EXAUCE</h1><p className="mt-1 text-xs text-slate-500">Gestion des comptes, de l’activité et des paiements</p></div><div className="flex gap-2"><button onClick={loadDashboard} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"><RefreshCw size={15}/> Actualiser</button><button onClick={logout} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white"><LogOut size={15}/> Quitter</button></div></header>
    {error && <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')}><XCircle size={16}/></button></div>}
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => { setTab(id); if (id === 'questions') loadQuestions(false); if (id === 'savings') loadSavings(false); if (id === 'broadcast') loadRecipients(false); }} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${tab === id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={16}/>{label}</button>)}</nav>
    {tab === 'overview' && <div className="space-y-6"><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Comptes créés" value={stats.totalUsers || 0} detail="Tous les comptes Pata" icon={Users}/><Metric label="Abonnés Premium" value={stats.premiumUsers || 0} detail="Abonnements encore actifs" icon={ShieldCheck}/><Metric label="Dépôts confirmés" value={money(stats.confirmedDeposits)} detail={`${stats.depositCount || 0} opérations`} icon={ArrowDownToLine}/><Metric label="Revenus d’abonnement" value={money(stats.subscriptionRevenue)} detail={`${stats.subscriptionCount || 0} paiements`} icon={CreditCard}/><Metric label="Soldes des portefeuilles" value={money(stats.walletLiability)} detail="Somme des soldes utilisateurs" icon={Wallet}/><Metric label="Argent protégé dans les épargnes" value={money(stats.protectedSavings)} detail={`${stats.activeSavingsGoals || 0} objectifs actifs · hors retraits effectués`} icon={PiggyBank}/><Metric label="Retraits envoyés" value={money(stats.paidWithdrawals)} detail={`${stats.paidWithdrawalCount || 0} paiements terminés`} icon={ArrowUpRight}/><Metric label="Retraits à suivre" value={money(stats.pendingWithdrawals)} detail={`${stats.pendingWithdrawalCount || 0} demandes / envois`} icon={Clock3}/><Metric label="Volume des sorties" value={money(stats.lifetimeExpenseVolume)} detail="Sorties enregistrées" icon={CircleDollarSign}/><Metric label="Volume des revenus" value={money(stats.lifetimeIncomeVolume)} detail="Revenus enregistrés" icon={ArrowUpRight}/><Metric label="On doit aux utilisateurs" value={money(stats.activeReceivables)} detail={`${stats.receivableDebtCount || 0} créances actives`} icon={ArrowDownLeft}/><Metric label="Dettes des utilisateurs" value={money(stats.activePayables)} detail={`${stats.payableDebtCount || 0} dettes actives`} icon={ArrowUpRight}/></section>
      <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Derniers inscrits" detail="Les 8 comptes les plus récents" action={<button onClick={() => setTab('users')} className="text-xs font-semibold text-slate-700">Tous les utilisateurs →</button>}/><div className="space-y-3">{(overview?.latestUsers || []).map((entry) => <button key={entry.id} onClick={() => { setTab('users'); openUser(entry); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-semibold">{entry.displayName || 'Sans nom'}</p><p className="truncate text-xs text-slate-500">{entry.email || 'Adresse non renseignée'}</p></div><div className="shrink-0 text-right"><p className="text-[11px] text-slate-500">Inscription</p><p className="text-xs font-medium">{dateLabel(entry.createdAt)}</p></div></button>)}{!overview?.latestUsers?.length && <p className="text-sm text-slate-500">Aucun compte à afficher.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Activité financière récente" detail="Derniers dépôts"/><div className="space-y-3">{(overview?.latestDeposits || []).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{entry.email || entry.userId || 'Utilisateur'}</p><p className="text-xs text-slate-500">{dateLabel(entry.createdAt)} · {entry.status || '—'}</p></div><p className="shrink-0 text-sm font-bold">{money(entry.amount)}</p></div>)}{!overview?.latestDeposits?.length && <p className="text-sm text-slate-500">Aucun dépôt récent.</p>}</div></div></section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Plus gros soldes', overview?.leaders?.balances, 'balance'], ['Plus gros dépensiers', overview?.leaders?.expenses, 'lifetimeExpenseAmount'], ['Dépenses les plus faibles', overview?.leaders?.leastExpenses, 'lifetimeExpenseAmount'], ['Plus gros revenus enregistrés', overview?.leaders?.incomes, 'lifetimeIncomeAmount']].map(([label, entries, field]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title={label} detail="Historique suivi depuis l’activation des classements"/><div className="space-y-2">{(entries || []).map((entry, index) => <div key={entry.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate text-slate-600">{index + 1}. {entry.displayName || entry.email || entry.id.slice(0, 9)}</span><strong className="shrink-0">{money(entry[field])}</strong></div>)}{!entries?.length && <p className="text-xs text-slate-400">Aucune donnée pour le moment.</p>}</div></div>)}</section>
      <p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500"><Database className="mr-1 inline" size={14}/> Les totaux utilisent des compteurs agrégés sur les profils. Les conversations et opérations détaillées ne sont chargées qu’à l’ouverture d’une fiche utilisateur.</p></div>}
    {tab === 'savings' && <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Vue globale des épargnes" detail="Montants présents dans les objectifs encore actifs. Les dépôts personnels et les emprunts sont distingués ; les objectifs retirés sont exclus." action={<button onClick={()=>loadSavings(false)} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14}/> Actualiser</button>}/>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Objectifs créés" value={savings?.summary?.totalGoals??overview?.savingsSummary?.totalGoals??'—'} detail="Toutes catégories" icon={Wallet}/><Metric label="Objectifs actifs" value={savings?.summary?.activeGoals??overview?.savingsSummary?.activeGoals??'—'} detail="Fonds encore réservés" icon={Activity}/><Metric label="Argent protégé" value={savings?.summary?.unavailable||overview?.savingsSummary?.unavailable?'Indisponible':money(savings?.summary?.totalProtectedSavings??overview?.stats?.protectedSavings)} detail="Total présent dans les objectifs actifs" icon={PiggyBank}/><Metric label="Épargne personnelle" value={savings?.summary?.unavailable||overview?.savingsSummary?.unavailable?'Indisponible':money(savings?.summary?.cashSavings??overview?.savingsSummary?.cashSavings)} detail="Dépôts hors emprunts" icon={ArrowDownToLine}/><Metric label="Emprunts intégrés" value={savings?.summary?.unavailable||overview?.savingsSummary?.unavailable?'Indisponible':money(savings?.summary?.borrowedSavings??overview?.savingsSummary?.borrowedSavings)} detail="Montants prêtés présents dans les objectifs" icon={CircleDollarSign}/></div>{(savings?.summary?.unavailable||overview?.savingsSummary?.unavailable)&&<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Le total n’a pas pu être vérifié entièrement. Pata ne l’affiche pas comme zéro afin de ne pas masquer un montant qui reste à vérifier.</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Répartition par catégorie"/>{(savings?.summary?.byCategory||overview?.savingsSummary?.byCategory||[]).map(item=><div key={item.categoryId} className="mb-3"><div className="flex justify-between gap-3 text-xs"><span>{item.categoryId}</span><strong>{money(item.amount)}</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:`${Math.max(2,Math.min(100,((item.amount||0)/Math.max(1,savings?.summary?.totalProtectedSavings||overview?.stats?.protectedSavings||1))*100))}%`}}/></div></div>)}{!(savings?.summary?.byCategory||overview?.savingsSummary?.byCategory||[]).length&&<p className="text-xs text-slate-400">{(savings?.summary?.unavailable||overview?.savingsSummary?.unavailable)?'Répartition indisponible tant que les montants ne sont pas vérifiés.':'Aucune épargne active à répartir.'}</p>}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Répartition par type"/>{(savings?.summary?.byType||overview?.savingsSummary?.byType||[]).map(item=><div key={item.type} className="mb-3 flex items-center justify-between gap-3 text-xs"><span>{item.type==='piggybank'?'Tirelires':'Objectifs'}</span><strong>{money(item.amount)}</strong></div>)}{!(savings?.summary?.byType||overview?.savingsSummary?.byType||[]).length&&<p className="text-xs text-slate-400">{(savings?.summary?.unavailable||overview?.savingsSummary?.unavailable)?'Répartition indisponible tant que les montants ne sont pas vérifiés.':'Aucune donnée disponible.'}</p>}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Objectifs et tirelires des utilisateurs" detail="Propriétaire, progression et fonds actuellement protégés."/>
        <div className="space-y-3">{(savings?.goals||[]).map(goal=><article key={goal.id} className="rounded-xl border border-slate-100 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{goal.name}</p><p className="mt-1 text-xs text-slate-500">{goal.userName} · {goal.email||goal.userId}</p><p className="mt-1 text-[10px] text-slate-400">{goal.type==='piggybank'?'Tirelire':'Objectif'} · {goal.categoryId} · {goal.active?(goal.withdrawalPending?'Retrait en vérification':'Actif'):'Clôturé'}</p></div><div className="shrink-0 text-right"><p className="text-sm font-bold">{goal.depositsSummaryAvailable===false?'Vérification impossible':money(goal.depositedAmount)}</p>{goal.borrowedAmount>0&&<p className="mt-1 text-[10px] text-amber-700">dont {money(goal.borrowedAmount)} empruntés</p>}{goal.targetAmount>0&&<p className="text-[10px] text-slate-500">sur {money(goal.targetAmount)}</p>}</div></div>
          {goal.targetAmount>0&&<><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:`${goal.progress||0}%`}}/></div><p className="mt-1 text-[10px] text-slate-500">{goal.progress||0}% de progression · {goal.deadline||'Sans échéance'}</p></>}</article>)}
          {!savings?.goals?.length&&<p className="py-8 text-center text-sm text-slate-500">{busy?'Chargement des objectifs…':'Aucun objectif ni tirelire enregistré.'}</p>}</div>
        {nextSavingsCursor&&<button onClick={()=>loadSavings(true)} disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold disabled:opacity-50">{busy?'Chargement…':'Charger plus d’objectifs'}</button>}
      </div>
    </section>}
    {tab === 'users' && <section className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Gestion des utilisateurs" detail={`${users.length} comptes chargés sur la page courante`}/><div className="relative mb-4"><Search className="absolute left-3 top-3 text-slate-400" size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, e-mail ou téléphone" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm"/></div><div className="space-y-2">{visibleUsers.map((entry) => <button key={entry.id} onClick={() => openUser(entry)} className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left ${selectedUser?.id === entry.id ? 'border-slate-500 bg-slate-50' : 'border-slate-100 hover:bg-slate-50'}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{entry.displayName || 'Nom non renseigné'}</p><p className="truncate text-xs text-slate-500">{entry.email || 'E-mail non renseigné'} {entry.phone ? ` · ${entry.phone}` : ''}</p></div><div className="flex items-center gap-3 text-right"><span className="text-[11px] text-slate-500">Inscrit : {dateLabel(entry.createdAt)} · Actif : {dateLabel(entry.lastSeenAt)}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${entry.premiumUntil && new Date(entry.premiumUntil) > new Date() ? 'bg-emerald-50 text-emerald-700' : entry.lastPaymentDate ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{entry.premiumUntil && new Date(entry.premiumUntil) > new Date() ? 'Premium actif' : entry.lastPaymentDate ? 'A déjà payé' : 'Gratuit'}</span><ChevronRight size={16}/></div></button>)}{!visibleUsers.length && <p className="py-8 text-center text-sm text-slate-500">Aucun utilisateur correspondant.</p>}</div>{nextCursor && !search.trim() && <button disabled={busy} onClick={loadMoreUsers} className="mt-4 h-10 w-full rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-50">{busy ? 'Chargement…' : 'Charger 40 autres utilisateurs'}</button>}
      {userDetail && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-bold">{userDetail.user?.displayName || 'Utilisateur'}</h3><p className="text-xs text-slate-500">{userDetail.user?.email} · {userDetail.user?.phone || 'Aucun numéro enregistré'}</p><p className="mt-1 text-[11px] text-slate-500">Inscription : {dateLabel(userDetail.user?.createdAt)} · Dernière activité : {dateLabel(userDetail.user?.lastSeenAt)}</p><p className="mt-1 text-[11px] text-slate-500">Dernier paiement : {dateLabel(userDetail.user?.lastPaymentDate)} · {userDetail.user?.lastPaymentAmount ? money(userDetail.user.lastPaymentAmount) : 'Aucun paiement Premium enregistré'} · {userDetail.user?.lastPaymentMethod || '—'}</p></div><button onClick={() => { setSelectedUser(null); setUserDetail(null); }} className="rounded-lg border border-slate-200 bg-white p-2"><XCircle size={16}/></button></div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-900">Contacter cet utilisateur par e-mail</h4>{waHref(userDetail.user, templates[3]) && <a href={waHref(userDetail.user, templates[3])} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800"><MessageCircle size={14}/> WhatsApp</a>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Modèle de message
              <select value={templateChoice} onChange={(event) => { const value=event.target.value; setTemplateChoice(value); const selected=templates.find((item)=>item.label===value); if(selected){setEmailCustomized(false);setEmailSubject(getTemplateField(selected, 'subject', language));setEmailMessage(getTemplateField(selected, 'body', language));setEmailTemplateKey(selected.key);} else {setEmailCustomized(true);setEmailTemplateKey('custom');} }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal"><option value="">Message personnalisé</option>{templates.map((template) => <option key={template.label} value={template.label}>{getTemplateField(template, 'label', language)}</option>)}</select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Destination du bouton
              <select value={emailCtaPath} onChange={(event)=>setEmailCtaPath(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal"><option value="/dashboard">Tableau de bord</option><option value="/goals">Épargnes</option><option value="/premium">Premium</option><option value="/reports">Rapports</option><option value="/cotisations">Cotisations</option></select>
            </label>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-600">Objet de l’e-mail<input value={emailSubject} onChange={(event)=>{setEmailCustomized(true);setEmailSubject(event.target.value);}} maxLength={140} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label>
          <label className="mt-3 block text-xs font-semibold text-slate-600">Message personnalisable<textarea value={emailMessage} onChange={(event)=>{setEmailCustomized(true);setEmailMessage(event.target.value);}} maxLength={5000} rows={6} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal leading-6"/><span className="mt-1 block font-normal text-slate-400">Le champ {'{nom}'} sera remplacé par le nom du destinataire. Le modèle « Félicitations » ajoute automatiquement les projets, objectifs d’épargne et cotisations enregistrés sur son compte — sans faire référence à ses dépenses.</span></label>
          <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={sendUserEmail} disabled={busy || !emailSubject.trim() || !emailMessage.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50">{busy?<Loader2 size={15} className="animate-spin"/>:<Mail size={15}/>} Envoyer l’e-mail</button>{emailResult && <p role="status" className="text-xs font-semibold text-emerald-700">{emailResult}</p>}</div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl bg-white p-3"><h4 className="mb-3 text-sm font-semibold">Discussions avec Mč</h4><div className="max-h-[34rem] space-y-3 overflow-y-auto">
            {(userDetail.chats || []).map((chat) => <div key={chat.id} className="rounded-lg border border-slate-100 p-3"><p className="mb-2 text-[10px] text-slate-400">{dateLabel(chat.updatedAt || chat.createdAt)} · {(chat.messages || []).length} messages</p>
              {(Array.isArray(chat.messages) ? chat.messages : []).slice(-20).map((message,index)=><p key={index} className={`mb-2 whitespace-pre-wrap rounded-lg p-2 text-xs leading-5 ${message.role==='assistant'?'bg-slate-100 text-slate-700':'bg-blue-50 text-slate-800'}`}><strong>{message.role==='assistant'?'Mč':'Utilisateur'} : </strong>{String(message.content||message.text||'').slice(0,1800)}</p>)}
              {!chat.messages?.length && <p className="text-xs text-slate-400">Aucun message détaillé conservé.</p>}</div>)}
            {!userDetail.chats?.length && <p className="text-xs text-slate-400">Aucune conversation conservée pour ce compte.</p>}
          </div></div>
          <div className="rounded-xl bg-white p-3"><h4 className="mb-3 text-sm font-semibold">Épargnes et objectifs</h4><div className="mb-3 space-y-1 text-xs text-slate-500"><p>Argent protégé : <strong className="text-slate-900">{userDetail.savingsSummaryAvailable===false?'Vérification impossible':money(userDetail.totalSavingsInGoals)}</strong></p><p>Épargne personnelle : <strong className="text-slate-900">{money(userDetail.cashSavingsInGoals)}</strong></p><p>Emprunts présents : <strong className="text-slate-900">{money(userDetail.borrowedSavingsInGoals)}</strong></p></div><div className="max-h-[34rem] space-y-3 overflow-y-auto">
            {(userDetail.goals||[]).map(goal=><div key={goal.id} className="rounded-lg border border-slate-100 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{goal.name||'Objectif sans nom'}</p><p className="mt-1 text-[10px] text-slate-500">{goal.type==='piggybank'?'Tirelire':'Objectif'} · {goal.categoryId||'Autre'} · {goal.active?'Actif':'Clôturé'}</p></div><strong className="text-xs">{money(goal.depositedAmount)}</strong></div>
              {goal.targetAmount>0&&<><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:`${goal.progress||0}%`}}/></div><p className="mt-1 text-[10px] text-slate-500">{goal.progress||0}% de {money(goal.targetAmount)}</p></>}
              {goal.deadline&&<p className="mt-2 text-[10px] text-slate-400">Échéance : {goal.deadline}</p>}</div>)}
            {!userDetail.goals?.length&&<p className="text-xs text-slate-400">Aucune épargne ou aucun objectif enregistré.</p>}
          </div></div>
          <div className="space-y-4"><div className="rounded-xl bg-white p-3"><h4 className="mb-2 text-sm font-semibold">Dernières dépenses</h4>{(userDetail.expenses||[]).map(item=><div key={item.id} className="flex justify-between gap-2 border-b border-slate-100 py-2 text-xs"><span className="min-w-0 truncate">{item.categoryId||'Autre'} · {item.date}</span><strong className="shrink-0">{money(item.amount)}</strong></div>)}{!userDetail.expenses?.length&&<p className="text-xs text-slate-400">Aucune dépense récente.</p>}</div>
            <div className="rounded-xl bg-white p-3"><h4 className="mb-2 text-sm font-semibold">Derniers revenus</h4>{(userDetail.incomes||[]).map(item=><div key={item.id} className="flex justify-between gap-2 border-b border-slate-100 py-2 text-xs"><span className="min-w-0 truncate">{item.source||'Revenu'} · {item.date}</span><strong className="shrink-0">{money(item.amount)}</strong></div>)}{!userDetail.incomes?.length&&<p className="text-xs text-slate-400">Aucun revenu récent.</p>}</div>
          </div>
        </div>
      </div>}
    </section>}
    {tab === 'questions' && <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <SectionTitle title="Discussions réelles avec Mč" detail="Historique des conversations enregistrées, de la plus récente à la plus ancienne." action={<button onClick={()=>loadQuestions(false)} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14}/> Actualiser</button>}/>
      {questions&&<p className="mb-3 text-xs text-slate-500">{questions.conversationCount||0} discussions chargées sur cette page.</p>}
      <div className="space-y-4">{(questions?.conversations||[]).map(chat=><article key={chat.id} className="rounded-xl border border-slate-100 p-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{chat.user?.displayName||'Utilisateur'}</p><p className="text-xs text-slate-500">{chat.user?.email||chat.userId} · {chat.title}</p></div><div className="text-right"><p className="text-xs font-medium">{dateLabel(chat.updatedAt||chat.createdAt)}</p><p className="text-[10px] text-slate-400">{chat.messageCount||0} messages</p></div></div>
        <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-2">{(chat.messages||[]).map((message,index)=><div key={index} className={`max-w-[95%] whitespace-pre-wrap rounded-lg p-2 text-xs leading-5 ${message.role==='assistant'?'mr-auto bg-white text-slate-700':'ml-auto bg-blue-50 text-slate-800'}`}><p className="mb-1 text-[10px] font-semibold text-slate-500">{message.role==='assistant'?'Mč':'Utilisateur'}</p>{message.content||'Contenu non textuel'}</div>)}</div>
      </article>)}
      {!questions?.conversations?.length&&<p className="py-8 text-center text-sm text-slate-500">{busy?'Chargement des conversations…':'Aucune discussion IA trouvée.'}</p>}</div>
      {nextQuestionCursor&&<button onClick={()=>loadQuestions(true)} disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-xs font-semibold disabled:opacity-50">{busy?'Chargement…':'Charger les discussions suivantes'}</button>}
    </section>}
    {tab === 'withdrawals' && <section className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Demandes de retrait" detail="Chaque paiement nécessite une validation manuelle. Vérifie le numéro et le montant avant d’approuver."/><div className="space-y-3">{withdrawals.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-sm font-bold">{item.displayName || 'Utilisateur'} · {money(item.amount)}</p><p className="mt-1 text-xs text-slate-500">{item.goalName || 'Épargne'} · {item.phone} · {item.medium === 'orange money' ? 'Orange Money' : 'MTN Mobile Money'}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(item.createdAt)} · {statusLabel[item.status] || item.status}</p>{item.providerMessage && <p className="mt-1 text-xs text-amber-700">{item.providerMessage}</p>}</div><div className="flex items-start gap-2">{item.status === 'PENDING_REVIEW' ? <><button disabled={busy} onClick={() => approve(item)} className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={14}/> Valider et payer</button><button disabled={busy} onClick={() => reject(item)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 disabled:opacity-50"><XCircle size={14}/> Refuser</button></> : <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{statusLabel[item.status] || item.status}</span>}</div></div><div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs sm:grid-cols-4"><span>Brut : <strong>{money(item.grossAmount)}</strong></span><span>Dette : <strong>{money(item.debtDeduction)}</strong></span><span>Ajustement : <strong>{money(item.cancellationPenalty)}</strong></span><span>Frais Pata : <strong>{money(item.platformFee)}</strong></span></div></article>)}{!withdrawals.length && <p className="py-8 text-center text-sm text-slate-500">Aucune demande de retrait.</p>}</div><p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Le service de retrait Fapshi doit être activé et approvisionné séparément du service qui encaisse les dépôts. En cas de réponse incertaine, la demande reste en vérification : ne relance pas le paiement sans rapprochement.</p></section>}
    {tab === 'broadcast' && <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={broadcast} className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Envoyer une notification" detail="Chaque message est enregistré dans la boîte de réception Pata. Les appareils autorisés reçoivent également une notification push."/>
        <div className="mb-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setRecipientMode('all')} className={`rounded-lg border p-3 text-left text-xs ${recipientMode==='all'?'border-slate-900 bg-slate-50':'border-slate-200'}`}><strong className="block text-sm">Tous les comptes</strong><span className="mt-1 block text-slate-500">Boîte Pata pour tous ; push si activé.</span></button><button type="button" onClick={()=>setRecipientMode('selected')} className={`rounded-lg border p-3 text-left text-xs ${recipientMode==='selected'?'border-slate-900 bg-slate-50':'border-slate-200'}`}><strong className="block text-sm">Comptes sélectionnés</strong><span className="mt-1 block text-slate-500">Choisis les destinataires.</span></button></div>
        {recipientMode==='selected'&&<div className="mb-4 rounded-xl border border-slate-200 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{selectedRecipientIds.length} compte(s) sélectionné(s)</p><p className="text-[10px] text-slate-500">{recipientSummary?.optedInUsers??'—'} comptes avec notifications activées</p></div><input value={recipientSearch} onChange={e=>setRecipientSearch(e.target.value)} placeholder="Rechercher par nom ou e-mail" className="mb-3 h-9 w-full rounded-lg border border-slate-200 px-3 text-xs"/>
          <div className="max-h-64 space-y-2 overflow-y-auto">{recipients.filter(item=>`${item.displayName} ${item.email} ${item.phone}`.toLowerCase().includes(recipientSearch.toLowerCase())).map(item=><label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 p-2 text-xs hover:bg-slate-50"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selectedRecipientIds.includes(item.id)} onChange={e=>setSelectedRecipientIds(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/><span className="min-w-0"><strong className="block truncate">{item.displayName}</strong><span className="block truncate text-[10px] text-slate-500">{item.email||item.phone||item.id}</span></span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${item.notificationsEnabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{item.notificationsEnabled?`Push actif · ${item.deviceCount}`:'In-app uniquement'}</span></label>)}
            {!recipients.length&&<p className="py-4 text-center text-xs text-slate-400">Charge la liste des destinataires.</p>}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={()=>loadRecipients(false)} disabled={busy} className="text-xs font-semibold text-slate-700 underline">Actualiser la liste</button>{nextRecipientCursor&&<button type="button" onClick={()=>loadRecipients(true)} disabled={busy} className="text-xs font-semibold text-slate-700 underline">Charger plus de comptes</button>}</div>
        </div>}
        <label className="block text-sm font-medium">Titre<input maxLength={80} value={broadcastTitle} onChange={e=>setBroadcastTitle(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" required/></label>
        <label className="mt-3 block text-sm font-medium">Message<textarea maxLength={220} value={broadcastMessage} onChange={e=>setBroadcastMessage(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm" placeholder="Rédige un message clair et utile…" required/></label>
        <label className="mt-3 block text-sm font-medium">Image facultative (lien HTTPS)<input type="url" value={broadcastImageUrl} onChange={e=>setBroadcastImageUrl(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="https://exemple.com/illustration.jpg"/></label>
        {broadcastImageUrl.trim().startsWith('https://') && <img src={broadcastImageUrl.trim()} alt="Aperçu de la notification" className="mt-2 max-h-44 w-full rounded-xl border border-slate-200 object-cover" />}
        <label className="mt-3 block text-sm font-medium">Page à ouvrir<input value={broadcastPath} onChange={e=>setBroadcastPath(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" placeholder="/dashboard"/></label>
        {broadcastResult&&<p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{broadcastResult}</p>}
        <button disabled={busy||(recipientMode==='selected'&&!selectedRecipientIds.length)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={16}/>:<Bell size={16}/>} Envoyer la notification</button>
        <p className="mt-3 text-[11px] leading-5 text-slate-400">La notification reste dans la boîte jusqu’à ce que l’utilisateur la marque comme lue. Le push dépend des autorisations et de l’appareil. L’image HTTPS est facultative et s’affiche selon les capacités du navigateur ou du système.</p>
      </form>
      <aside className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Notifications activées" detail="Compteur global des comptes inscrits."/><p className="text-3xl font-bold">{recipientSummary?recipientSummary.optedInUsers:'—'}</p><p className="mt-1 text-xs text-slate-500">sur {recipientSummary?recipientSummary.totalUsers:'—'} comptes Pata.</p><button type="button" onClick={()=>loadRecipients(false)} disabled={busy} className="mt-3 text-xs font-semibold underline">Actualiser les appareils inscrits</button></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><SectionTitle title="Conseils d’envoi"/><div className="space-y-3 text-xs leading-5 text-slate-600"><p>Choisis un titre court et un message précis.</p><p>Un utilisateur peut désactiver les notifications depuis ses paramètres.</p></div></div>
      </aside>
    </section>}
    <footer className="pb-4 text-center text-[11px] text-slate-400">Pata Administration · NAPOPOLO EXAUCE</footer>
  </div></main>;
}

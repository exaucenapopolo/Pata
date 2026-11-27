'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet, Plus, Building2, RefreshCw, LockKeyhole, Crown, CreditCard, Receipt, Users, FileText, Handshake, CalendarClock, PiggyBank, Trash2, CheckCircle2, Send, X, BarChart3, Link2, Share2, Copy, Pencil } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { subscribeIncomes } from '@/lib/firestore/incomes';
import { isIncomeCountedAsSource } from '@/lib/finance/incomeBalances.mjs';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CloudinaryImageField } from '@/components/ui/CloudinaryImageField';
import {
  createBusinessAccount, createBusinessTransaction, deleteBusinessResource,
  createBusinessPaymentLink, updateBusinessPaymentLink, deleteBusinessPaymentLink, getBusinessPaymentLinks, verifyBusinessPaymentLink, getBusinessPaymentLinkDetails,
  updateBusinessProfile, getBusinessAccounts, getBusinessOverview, getBusinessResource,
  getBusinessTransactions, payBusinessDocument, saveBusinessResource,
  transferPersonalIncome,
} from '@/lib/business/client';

const TABS = [
  { id: 'dashboard', fr: 'Vue d’ensemble', en: 'Overview', icon: Building2 },
  { id: 'transactions', fr: 'Opérations', en: 'Transactions', icon: Wallet },
  { id: 'reports', fr: 'Rapports', en: 'Reports', icon: BarChart3 },
  { id: 'payment-links', fr: 'Liens de paiement', en: 'Payment links', icon: Link2 },
  { id: 'accounts', fr: 'Comptes', en: 'Accounts', icon: CreditCard },
  { id: 'invoices', fr: 'Factures clients', en: 'Customer invoices', icon: Receipt },
  { id: 'obligations', fr: 'Obligations', en: 'Obligations', icon: CalendarClock },
  { id: 'clients', fr: 'Clients', en: 'Customers', icon: Users },
  { id: 'suppliers', fr: 'Fournisseurs', en: 'Suppliers', icon: Users },
  { id: 'partners', fr: 'Partenaires', en: 'Partners', icon: Handshake },
  { id: 'contracts', fr: 'Contrats', en: 'Contracts', icon: FileText },
  { id: 'budgets', fr: 'Budgets', en: 'Budgets', icon: PiggyBank },
];
const BUSINESS_EXPENSE_CATEGORIES = [["purchases","Achats / marchandises","Purchases / stock"],["raw_materials","Matières premières","Raw materials"],["rent","Loyer","Rent"],["salaries","Salaires","Salaries"],["utilities","Eau, électricité, internet","Utilities"],["transport","Transport / livraison","Transport / delivery"],["marketing","Marketing / publicité","Marketing / advertising"],["taxes","Impôts et taxes","Taxes"],["maintenance","Entretien / maintenance","Maintenance"],["services","Prestations / services","Services"],["payment_fees","Frais de paiement","Payment fees"],["travel","Déplacements / missions","Travel"],["office","Fournitures / bureau","Office supplies"],["insurance","Assurances","Insurance"],["other","Autres dépenses","Other expenses"]];
const RESOURCE_CONFIG = {
  invoices:{fields:[{key:'title',label:'Objet de la facture',required:true},{key:'customerId',label:'Rattacher à un client existant (facultatif)',type:'client'},{key:'customerName',label:'Nom du client',required:true},{key:'invoiceNumber',label:'Numéro (facultatif)'},{key:'totalAmount',label:'Montant total (FCFA)',type:'number',required:true},{key:'issueDate',label:'Date d’émission',type:'date',required:true},{key:'dueDate',label:'Date limite',type:'date'},{key:'note',label:'Note'}]},
  obligations:{fields:[{key:'title',label:'Dépense ou engagement à payer',required:true},{key:'supplierId',label:'Rattacher à un fournisseur (facultatif)',type:'supplier'},{key:'type',label:'Nature de l’obligation',type:'select',options:[['rent','Loyer'],['salary','Salaires'],['tax','Impôts et taxes'],['loan','Remboursement de prêt'],['supplier','Fournisseur'],['subscription','Abonnement'],['utility','Eau, électricité, internet'],['other','Autre']]},{key:'categoryId',label:'Catégorie financière',type:'business-category',required:true},{key:'amount',label:'Montant total engagé (FCFA)',type:'number',required:true},{key:'dueDate',label:'Échéance prévue',type:'date'},{key:'affectsFinances',label:'Inclure cet engagement dans les dettes à payer',type:'checkbox'},{key:'note',label:'Détails / référence'}]},
  clients:{fields:[{key:'name',label:'Nom du client',required:true},{key:'category',label:'Type de client',type:'select',options:[['individual','Particulier'],['company','Entreprise'],['association','Association'],['public','Administration'],['other','Autre']]},{key:'imageUrl',label:'Photo (facultative)',type:'image'},{key:'phone',label:'Téléphone'},{key:'email',label:'E-mail',type:'email'},{key:'address',label:'Adresse'},{key:'note',label:'Note'}]},
  suppliers:{fields:[{key:'name',label:'Nom du fournisseur',required:true},{key:'category',label:'Type de fournisseur',type:'select',options:[['goods','Marchandises / produits'],['services','Prestations de services'],['materials','Matières premières'],['transport','Transport / livraison'],['utilities','Eau, énergie, télécoms'],['professional','Services professionnels'],['other','Autre']]},{key:'imageUrl',label:'Logo (facultatif)',type:'image'},{key:'phone',label:'Téléphone'},{key:'email',label:'E-mail',type:'email'},{key:'address',label:'Adresse'},{key:'note',label:'Note'}]},
  partners:{fields:[{key:'name',label:'Nom du partenaire',required:true},{key:'role',label:'Rôle du partenaire',type:'select',options:[['business','Partenaire commercial'],['technical','Partenaire technique'],['financial','Partenaire financier'],['distribution','Distribution'],['marketing','Marketing / communication'],['strategic','Partenaire stratégique'],['other','Autre']]},{key:'imageUrl',label:'Photo ou logo (facultatif)',type:'image'},{key:'phone',label:'Téléphone'},{key:'email',label:'E-mail',type:'email'},{key:'note',label:'Accord ou note'}]},
  contracts:{fields:[{key:'title',label:'Titre du contrat',required:true},{key:'contractType',label:'Type de contrat',type:'select',options:[['service','Prestation de services'],['employment','Travail / emploi'],['commercial','Commercial / vente'],['partnership','Partenariat'],['rental','Location / bail'],['supply','Approvisionnement'],['loan','Prêt / financement'],['maintenance','Maintenance'],['subscription','Abonnement'],['other','Autre']]},{key:'counterpartyType',label:'Type de tiers lié',type:'select',options:[['clients','Client'],['suppliers','Fournisseur'],['partners','Partenaire']]},{key:'counterpartyId',label:'Fiche associée (facultatif)',type:'counterparty'},{key:'counterparty',label:'Nom du tiers (si non enregistré)'},{key:'amount',label:'Montant (FCFA)',type:'number'},{key:'startDate',label:'Date de début',type:'date'},{key:'endDate',label:'Date de fin',type:'date'},{key:'affectsFinances',label:'Ce contrat doit-il être pris en compte dans les finances ?',type:'checkbox'},{key:'description',label:'Description'}]},
  budgets:{fields:[{key:'title',label:'Nom du budget',required:true},{key:'month',label:'Mois concerné',type:'month',required:true},{key:'note',label:'Objectif / note (facultatif)'}]},
};

const RESOURCE_LABELS = {
  invoices: 'facture', obligations: 'obligation', clients: 'client',
  suppliers: 'fournisseur', partners: 'partenaire', contracts: 'contrat', budgets: 'budget',
};
const freshForm = (resource) => {
  if(resource==='budgets')return {title:'',month:new Date().toISOString().slice(0,7),note:'',allocations:[{categoryId:'',categoryLabel:'',amount:''}]};
  return Object.fromEntries((RESOURCE_CONFIG[resource]?.fields || []).map((field) => [field.key, field.key === 'issueDate' ? new Date().toISOString().slice(0, 10) : field.key === 'month' ? new Date().toISOString().slice(0, 7) : field.type === 'checkbox' ? true : '']));
};

export default function BusinessWorkspacePage() {
  const params = useParams();
  const businessId = String(params?.businessId || '');
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [personalSources, setPersonalSources] = useState([]);
  const [personalSourcesLoading, setPersonalSourcesLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [transactionForm, setTransactionForm] = useState({ type: 'income', amount: '', title: '', categoryId: 'sales', date: new Date().toISOString().slice(0, 10), accountId: 'main', note: '', paymentMethod: '' });
  const [accountForm, setAccountForm] = useState({ name: '', type: 'cash', openingBalance: '0' });
  const [resourceForm, setResourceForm] = useState({});
  const [relatedRecords, setRelatedRecords] = useState({clients:[],suppliers:[],partners:[]});
  const [deepLinkPaymentLinkId, setDeepLinkPaymentLinkId] = useState('');
  const [deepLinkOpenedId, setDeepLinkOpenedId] = useState('');
  const [transferForm, setTransferForm] = useState({ incomeId: '', amount: '', accountId: 'main', date: new Date().toISOString().slice(0, 10) });
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', accountId: 'main', date: new Date().toISOString().slice(0, 10) });
  const [paymentLinks, setPaymentLinks] = useState([]);
  const [showPaymentLinkForm, setShowPaymentLinkForm] = useState(false);
  const [paymentLinkForm, setPaymentLinkForm] = useState({ title: '', description: '', imageUrl: '', galleryImageUrls: [], proofImageUrls: [], videoUrlsText: '', sellingPointsText: '', originalAmount: '', amount: '', customerName: '', customerEmail: '', maxPayments: '', accountId: 'main', publicOnStorefront: true });
  const [busyPaymentLinkId, setBusyPaymentLinkId] = useState('');
  const [editingPaymentLinkId, setEditingPaymentLinkId] = useState('');
  const [deletePaymentLinkTarget, setDeletePaymentLinkTarget] = useState(null);
  const [deletePaymentLinkConfirmation, setDeletePaymentLinkConfirmation] = useState('');
  const [selectedPaymentLink, setSelectedPaymentLink] = useState(null);
  const [paymentLinkDetails, setPaymentLinkDetails] = useState(null);
  const [paymentDetailsLoading, setPaymentDetailsLoading] = useState(false);
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', activity: '', slogan: '', legalForm: '', city: '', phone: '', logoUrl: '', publicProfileEnabled: false, publicOffersEnabled: true });
  const [actionNotice, setActionNotice] = useState('');

  const writable = overview?.readOnly === false;
  const premiumActive = overview?.premiumActive === true;

  const refreshOverview = useCallback(async () => {
    if (!businessId) return;
    setOverviewLoading(true);
    setPageError('');
    try {
      const data = await getBusinessOverview(businessId);
      setOverview(data);
      setAccounts(data.accounts || []);
    } catch (error) {
      setPageError(error.message || 'Impossible de charger cette entreprise.');
    } finally {
      setOverviewLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void refreshOverview(); }, [refreshOverview]);
  useEffect(() => {
    const params=new URLSearchParams(window.location.search),tab=params.get('tab')||'',linkId=params.get('paymentLinkId')||'';
    if(tab==='payment-links'&&linkId){setActiveTab('payment-links');setDeepLinkPaymentLinkId(linkId);}
  },[]);

  useEffect(() => {
    if (!businessId || !overview) return;
    let active = true;
    const load = async () => {
      if (['dashboard', 'reports'].includes(activeTab)) return;
      setListLoading(true);
      setFormError('');
      try {
        if (activeTab === 'transactions') {
          const result = await getBusinessTransactions(businessId, { limit: 100 });
          if (active) setTransactions(result.transactions || []);
        } else if (activeTab === 'accounts') {
          const result = await getBusinessAccounts(businessId);
          if (active) setAccounts(result);
        } else if(activeTab==='payment-links'){
          const result=await getBusinessPaymentLinks(businessId);if(active)setPaymentLinks(result);
        }else{
          const result=await getBusinessResource(businessId,activeTab);if(active)setItems(result);
          const required=activeTab==='invoices'?['clients']:activeTab==='obligations'?['suppliers']:activeTab==='contracts'?['clients','suppliers','partners']:[];
          if(required.length){const loaded=await Promise.all(required.map(name=>getBusinessResource(businessId,name)));if(active)setRelatedRecords(current=>({...current,...Object.fromEntries(required.map((name,index)=>[name,loaded[index]]))}));}
        }
      } catch (error) {
        if (active) setFormError(error.message || 'Impossible de charger cette rubrique.');
      } finally {
        if (active) setListLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [activeTab, businessId, overview]);

  useEffect(() => {
    if (overview?.readOnly && !['dashboard', 'transactions', 'reports'].includes(activeTab)) setActiveTab('dashboard');
  }, [overview?.readOnly, activeTab]);

  const accountsForSelect = useMemo(() => accounts.length ? accounts : overview?.accounts || [], [accounts, overview?.accounts]);
  const budgetGroups=useMemo(()=>{
    const groups=new Map();
    for(const item of items){const key=item.budgetGroupId||('legacy-'+item.id);if(!groups.has(key))groups.set(key,{id:key,title:item.title||'Budget professionnel',month:item.month||'',note:item.note||'',items:[]});groups.get(key).items.push(item);}
    return [...groups.values()].map(group=>({...group,amount:group.items.reduce((sum,row)=>sum+(Number(row.amount)||0),0),spent:group.items.reduce((sum,row)=>sum+(Number(row.spent)||0),0),remaining:group.items.reduce((sum,row)=>sum+(Number(row.remaining??(Number(row.amount||0)-Number(row.spent||0)))||0),0)}));
  },[items]);
  const money = (amount) => formatCurrency(Number(amount) || 0, overview?.business?.currency || 'XAF');
  const reloadCurrent = async () => {
    await refreshOverview();
    if (activeTab === 'transactions') {
      const result = await getBusinessTransactions(businessId, { limit: 100 });
      setTransactions(result.transactions || []);
    }
    if (RESOURCE_CONFIG[activeTab]) setItems(await getBusinessResource(businessId, activeTab));
    if (activeTab === 'payment-links') setPaymentLinks(await getBusinessPaymentLinks(businessId));
  };

  const submitTransaction = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError(''); setActionNotice('');
    try {
      await createBusinessTransaction(businessId, transactionForm);
      setShowTransactionForm(false);
      setTransactionForm((current) => ({ ...current, amount: '', title: '', note: '' }));
      setActionNotice(en ? 'Transaction saved.' : 'Opération enregistrée.');
      await reloadCurrent();
    } catch (error) { setFormError(error.message || 'Impossible d’enregistrer cette opération.'); }
    finally { setSaving(false); }
  };

  const submitAccount = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createBusinessAccount(businessId, accountForm);
      setShowAccountForm(false);
      setAccountForm({ name: '', type: 'cash', openingBalance: '0' });
      await refreshOverview();
      if (activeTab === 'accounts') setAccounts(await getBusinessAccounts(businessId));
    } catch (error) { setFormError(error.message || 'Impossible de créer ce compte.'); }
    finally { setSaving(false); }
  };

  const submitResource=async(event)=>{
    event.preventDefault();setSaving(true);setFormError('');
    try{
      await saveBusinessResource(businessId,activeTab,resourceForm);
      setResourceFormOpen(false);setResourceForm(freshForm(activeTab));
      setItems(await getBusinessResource(businessId,activeTab));
      if(activeTab==='invoices'){const clients=await getBusinessResource(businessId,'clients');setRelatedRecords(current=>({...current,clients}));}
      if(activeTab==='obligations'){const suppliers=await getBusinessResource(businessId,'suppliers');setRelatedRecords(current=>({...current,suppliers}));}
      await refreshOverview();setActionNotice(en?'Information saved.':'Information enregistrée.');
    }catch(error){setFormError(error.message||'Impossible d’enregistrer cet élément.');}
    finally{setSaving(false);}
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await transferPersonalIncome(businessId, transferForm);
      setShowTransferForm(false);
      setTransferForm((current) => ({ ...current, amount: '' }));
      window.dispatchEvent(new Event('pata:income-balances-refresh'));
      await reloadCurrent();
      setActionNotice(en ? 'Personal funds transferred to the business.' : 'Fonds personnels transférés vers l’entreprise.');
    } catch (error) { setFormError(error.message || 'Impossible d’effectuer ce transfert.'); }
    finally { setSaving(false); }
  };

  const submitBusinessProfile = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await updateBusinessProfile(businessId, profileForm);
      setProfileFormOpen(false);
      await refreshOverview();
      setActionNotice(en ? 'Business profile updated.' : 'Informations et logo de l’entreprise mis à jour.');
    } catch (error) { setFormError(error.message || 'Impossible de modifier cette entreprise.'); }
    finally { setSaving(false); }
  };

  const submitPaymentLink = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError(''); setActionNotice('');
    try {
      const paymentInput = { ...paymentLinkForm, videoUrls: String(paymentLinkForm.videoUrlsText || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean), sellingPoints: String(paymentLinkForm.sellingPointsText || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean) };
      const result = editingPaymentLinkId
        ? await updateBusinessPaymentLink(businessId, editingPaymentLinkId, paymentInput)
        : await createBusinessPaymentLink(businessId, paymentInput);
      const saved = result.paymentLink;
      setShowPaymentLinkForm(false);
      setEditingPaymentLinkId('');
      setPaymentLinkForm({ title: '', description: '', imageUrl: '', galleryImageUrls: [], proofImageUrls: [], videoUrlsText: '', sellingPointsText: '', originalAmount: '', amount: '', customerName: '', customerEmail: '', maxPayments: '', accountId: accountsForSelect[0]?.id || 'main', publicOnStorefront: true });
      setPaymentLinks((current) => editingPaymentLinkId
        ? current.map((item) => item.id === saved?.id ? saved : item)
        : [saved, ...current.filter((item) => item.id !== saved?.id)]);
      setActionNotice(en ? (editingPaymentLinkId ? 'Offer updated. The public link is unchanged.' : 'Payment link created. You can now share it.') : (editingPaymentLinkId ? 'Offre mise à jour. Le lien public reste identique.' : 'Lien de paiement créé. Tu peux maintenant le partager.'));
    } catch (error) { setFormError(error.message || (en ? 'Could not save this offer.' : 'Impossible d’enregistrer cette offre.')); }
    finally { setSaving(false); }
  };

  const beginEditPaymentLink = (link) => {
    setEditingPaymentLinkId(link.id);
    setPaymentLinkForm({title:link.title||'',description:link.description||'',imageUrl:link.imageUrl||'',galleryImageUrls:Array.isArray(link.galleryImageUrls)?link.galleryImageUrls:[],proofImageUrls:Array.isArray(link.proofImageUrls)?link.proofImageUrls:[],videoUrlsText:Array.isArray(link.videoUrls)?link.videoUrls.join('\n'):'',sellingPointsText:Array.isArray(link.sellingPoints)?link.sellingPoints.join('\n'):'',originalAmount:String(link.originalAmount||link.amount||''),amount:String(link.amount||''),customerName:link.customerName||'',customerEmail:link.customerEmail||'',maxPayments:String(link.maxPayments||''),accountId:link.accountId||'main',publicOnStorefront:link.publicOnStorefront!==false});
    setFormError('');
    setShowPaymentLinkForm(true);
  };

  const confirmDeletePaymentLink = async () => {
    if (!deletePaymentLinkTarget || deletePaymentLinkConfirmation !== 'SUPPRIMER') return;
    const target=deletePaymentLinkTarget;
    setBusyPaymentLinkId(target.id);setFormError('');
    try {
      await deleteBusinessPaymentLink(businessId,target.id,'SUPPRIMER');
      setPaymentLinks(rows=>rows.filter(row=>row.id!==target.id));
      setDeletePaymentLinkTarget(null);setDeletePaymentLinkConfirmation('');
      setActionNotice(en?'Offer deleted from public access. Payment history is preserved.':'Lien supprimé de l’accès public. L’historique des paiements est conservé.');
    } catch(error){setFormError(error.message||'Impossible de supprimer ce lien.');}
    finally{setBusyPaymentLinkId('');}
  };

  const sharePaymentLink = async (link) => {
    const url = String(link.publicUrl || '');
    if (!url) return;
    const shareData = { title: link.title || overview.business.name, text: (en ? 'Payment for ' : 'Paiement pour ') + overview.business.name + ' · ' + (link.title || ''), url };
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setActionNotice(en ? 'Share dialog opened.' : 'Menu de partage ouvert.');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setActionNotice(en ? 'Payment link copied.' : 'Lien copié dans le presse-papiers.');
        return;
      }
      if (typeof window !== 'undefined') window.prompt(en ? 'Copy this payment link:' : 'Copie ce lien de paiement :', url);
    } catch (error) {
      if (error?.name !== 'AbortError') setFormError(en ? 'Could not share the link.' : 'Impossible de partager le lien.');
    }
  };

  const copyPaymentLink = async (link) => {
    const url = String(link.publicUrl || '');
    if (!url) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setActionNotice(en ? 'Payment link copied.' : 'Lien de paiement copié.');
      } else if (typeof window !== 'undefined') {
        window.prompt(en ? 'Copy this payment link:' : 'Copie ce lien de paiement :', url);
      }
    } catch {
      if (typeof window !== 'undefined') window.prompt(en ? 'Copy this payment link:' : 'Copie ce lien de paiement :', url);
    }
  };

  const verifyPaymentLink = async (linkId) => {
    setBusyPaymentLinkId(linkId); setFormError('');
    try {
      const result = await verifyBusinessPaymentLink(businessId, linkId);
      const refreshed = await getBusinessPaymentLinks(businessId);
      setPaymentLinks(refreshed);
      if (result.status === 'CONFIRMED') {
        await refreshOverview();
        setActionNotice(en ? 'Payment verified and added to business cash.' : 'Paiement vérifié et ajouté à la trésorerie de l’entreprise.');
      } else if (result.status === 'FAILED' || result.status === 'EXPIRED') {
        setActionNotice(en ? 'This payment did not complete.' : 'Ce paiement n’a pas abouti ou a expiré.');
      } else {
        setActionNotice(en ? 'Payment is still being processed.' : 'Le paiement est toujours en cours de traitement.');
      }
    } catch (error) { setFormError(error.message || 'Impossible de vérifier le paiement.'); }
    finally { setBusyPaymentLinkId(''); }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setSaving(true); setFormError('');
    try {
      await payBusinessDocument(businessId, activeTab, paymentTarget.id, paymentForm);
      setPaymentTarget(null);
      setItems(await getBusinessResource(businessId, activeTab));
      await refreshOverview();
      setActionNotice(en ? 'Payment recorded.' : 'Paiement enregistré.');
    } catch (error) { setFormError(error.message || 'Impossible d’enregistrer le paiement.'); }
    finally { setSaving(false); }
  };

  const removeResource = async (item) => {
    const label = RESOURCE_LABELS[activeTab] || 'élément';
    const prompt=activeTab==='budgets'?(en?'Delete the entire monthly budget and all its category envelopes?':'Supprimer tout ce budget mensuel et toutes ses enveloppes ?'):(en?'Delete this '+label+'?':'Supprimer cet élément ('+label+') ?');
    const confirmed=window.confirm(prompt);
    if (!confirmed) return;
    setFormError('');
    try {
      await deleteBusinessResource(businessId, activeTab, item.id);
      setItems(await getBusinessResource(businessId, activeTab));
      await refreshOverview();
    } catch (error) { setFormError(error.message || 'Impossible de supprimer cet élément.'); }
  };

  const openResourceForm=()=>{setFormError('');setResourceForm(freshForm(activeTab));setResourceFormOpen(value=>!value);};
  const openPaymentLinkAnalytics=async(link)=>{
    setSelectedPaymentLink(link);setPaymentDetailsLoading(true);setPaymentLinkDetails(null);
    try{setPaymentLinkDetails(await getBusinessPaymentLinkDetails(businessId,link.id));}
    catch(error){setFormError(error.message||'Impossible de charger les statistiques.');}
    finally{setPaymentDetailsLoading(false);}
  };
  useEffect(()=>{
    if(activeTab!=='payment-links'||!deepLinkPaymentLinkId||deepLinkOpenedId===deepLinkPaymentLinkId||!paymentLinks.length)return;
    const link=paymentLinks.find(item=>item.id===deepLinkPaymentLinkId);if(!link)return;
    setDeepLinkOpenedId(deepLinkPaymentLinkId);void openPaymentLinkAnalytics(link);
  },[activeTab,deepLinkPaymentLinkId,deepLinkOpenedId,paymentLinks]);
  useEffect(() => {
    if (!showTransferForm || !user?.uid) return undefined;
    let active = true;
    setPersonalSourcesLoading(true);
    const unsubscribe = subscribeIncomes(user.uid, async (rows) => {
      try {
        const candidates = rows.filter((income) => isIncomeCountedAsSource(income)
          && !income.cashPocket && income.flowType !== 'repayment_received'
          && income.categoryId !== 'debt_repayment_received');
        if (!candidates.length) { if (active) { setPersonalSources([]); setPersonalSourcesLoading(false); } return; }
        const token = await user.getIdToken();
        const response = await fetch('/api/incomes/spent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ incomeIds: candidates.map((income) => income.id) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !Array.isArray(result.totals)) throw new Error(result.error || 'Soldes personnels indisponibles.');
        const totals = new Map(result.totals.map((item) => [String(item.incomeId), Number(item.spent) || 0]));
        const next = candidates.map((income) => {
          const spent = Math.max(0, totals.get(income.id) || 0);
          return { ...income, spent, remaining: Math.max(0, Number(income.amount || 0) - spent) };
        }).filter((income) => income.remaining > 0);
        if (active) setPersonalSources(next);
      } catch (error) {
        console.warn('[PATA BUSINESS PERSONAL SOURCES]', error?.message || error);
        if (active) setPersonalSources([]);
      } finally {
        if (active) setPersonalSourcesLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [showTransferForm, user]);

  if (overviewLoading) return <div className="mx-auto flex max-w-5xl items-center gap-2 py-16 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin"/>Chargement de l’entreprise…</div>;
  if (pageError || !overview) return <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{pageError || 'Entreprise introuvable.'}<div className="mt-3"><Link href="/businesses" className="underline">Retour aux entreprises</Link></div></div>;

  const currentTab = TABS.find((tab) => tab.id === activeTab);
  const visibleTabs = writable ? TABS : TABS.filter((tab) => ['dashboard', 'transactions', 'reports'].includes(tab.id));

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <header className="flex items-start gap-3">
        <Link href="/businesses" aria-label={en ? 'Back to businesses' : 'Retour aux entreprises'} className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><ArrowLeft size={18}/></Link>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-slate-500">
          {overview.business.logoUrl ? <img src={overview.business.logoUrl} alt={overview.business.name} className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <Building2 size={24}/>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700">{en ? 'Business space' : 'Espace entreprise'}</p>
          <h2 className="truncate text-2xl font-extrabold tracking-tight text-slate-900">{overview.business.name}</h2>
          <p className="mt-1 text-xs text-slate-500">{overview.business.slogan || (en ? 'Professional finances' : 'Finances professionnelles')} {overview.business.city ? '· ' + overview.business.city : ''}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (writable ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>{writable ? (en ? 'Premium active' : 'Premium actif') : (en ? 'View only' : 'Consultation')}</span>
          {<Link href={'/businesses/' + businessId + '/team'} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600"><Users size={12}/>{en ? 'Team' : 'Équipe'}</Link>}
          {writable && ['owner', 'admin'].includes(overview.role) && <button type="button" onClick={() => { setProfileForm({ name: overview.business.name || '', activity: overview.business.activity || '', slogan: overview.business.slogan || '', legalForm: overview.business.legalForm || '', city: overview.business.city || '', phone: overview.business.phone || '', logoUrl: overview.business.logoUrl || '', publicProfileEnabled: overview.business.publicProfileEnabled === true, publicOffersEnabled: overview.business.publicOffersEnabled !== false }); setProfileFormOpen(true); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600"><Pencil size={12}/>{en ? 'Edit' : 'Modifier'}</button>}
        </div>
      </header>

      {!writable && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <LockKeyhole size={19} className="mt-0.5 shrink-0 text-amber-700"/>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-950">{en ? 'Your business is in read-only mode' : 'Ton entreprise est en mode consultation'}</h3>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">{en ? 'Your existing overview and transaction history remain available. Creating, editing, transfers and sensitive business records are locked until Premium is active again.' : 'Ton résumé et ton historique financier restent consultables. Les créations, modifications, transferts et informations professionnelles sensibles restent verrouillés jusqu’à la réactivation de Premium.'}</p>
            <Link href="/premium" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white">{en ? 'Reactivate Premium' : 'Réactiver Premium'} <Crown size={14}/></Link>
          </div>
        </section>
      )}

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={en ? 'Business sections' : 'Rubriques de l’entreprise'}>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => { setFormError(''); setActiveTab(tab.id); }} className={'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ' + (activeTab === tab.id ? 'bg-[#075b43] text-white' : 'border border-slate-200 bg-white text-slate-600') }><Icon size={15}/>{en ? tab.en : tab.fr}</button>;
        })}
      </nav>

      {actionNotice && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800"><CheckCircle2 size={16}/>{actionNotice}<button type="button" onClick={() => setActionNotice('')} className="ml-auto"><X size={14}/></button></div>}
      {formError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{formError}</div>}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 rounded-2xl bg-[#075b43] p-4 text-white sm:col-span-1"><p className="text-[10px] text-white/75">{en ? 'Available cash' : 'Trésorerie disponible'}</p><p className="mt-2 text-xl font-extrabold tabular-nums">{money(overview.totals.cashBalance)}</p><p className="mt-1 text-[10px] text-white/70">FCFA · {en ? 'all active accounts' : 'tous comptes actifs'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Collected income' : 'Revenus encaissés'}</p><p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">{money(overview.totals.income)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Paid expenses' : 'Dépenses payées'}</p><p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">{money(overview.totals.expense)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Period result' : 'Résultat de la période'}</p><p className={'mt-2 text-lg font-bold tabular-nums ' + (overview.totals.result < 0 ? 'text-red-700' : 'text-emerald-700')}>{money(overview.totals.result)}</p></div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">{en?'Monthly budget control':'Suivi du budget mensuel'}</h3><p className="mt-1 text-[10px] text-slate-500">{overview.month} · {overview.totals.budgetCount||0} {en?'category envelopes':'enveloppes'}</p></div><button type="button" onClick={()=>setActiveTab('budgets')} className="text-xs font-semibold text-[#075b43]">{en?'Manage':'Gérer'}</button></div><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[10px] text-slate-500">{en?'Planned':'Prévu'}</p><b className="text-sm">{money(overview.totals.budgetAllocated||0)}</b></div><div><p className="text-[10px] text-slate-500">{en?'Spent':'Dépensé'}</p><b className="text-sm">{money(overview.totals.budgetSpent||0)}</b></div><div><p className="text-[10px] text-slate-500">{en?'Remaining':'Restant'}</p><b className="text-sm">{money(overview.totals.budgetRemaining||0)}</b></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:Math.min(100,Number(overview.totals.budgetAllocated)>0?Number(overview.totals.budgetSpent||0)/Number(overview.totals.budgetAllocated)*100:0)+'%'}}/></div></section>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{en ? 'Money received from the owner' : 'Apports du propriétaire'}</h3><p className="mt-2 text-xl font-bold text-slate-900">{money(overview.totals.ownerContributions)}</p><p className="mt-1 text-xs text-slate-500">{en ? 'Not counted as business sales.' : 'Ne sont pas comptés comme des ventes.'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{en ? 'Outstanding commitments' : 'Engagements financiers'}</h3><div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">{en ? 'Receivables' : 'Créances clients'}</span><strong>{money(overview.totals.receivables)}</strong></div><div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">{en ? 'Payables' : 'Dettes à payer'}</span><strong>{money(overview.totals.payables)}</strong></div></div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{en ? 'Financial accounts' : 'Comptes financiers'}</h3>{writable && <button type="button" onClick={() => setActiveTab('accounts')} className="text-xs font-semibold text-brand-700">{en ? 'Manage' : 'Gérer'}</button>}</div>
            <div className="mt-3 space-y-2">
              {(overview.accounts || []).map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="min-w-0 truncate text-xs font-medium text-slate-700">{account.name}</span><strong className="shrink-0 text-xs tabular-nums text-slate-900">{money(account.balance)}</strong></div>)}
              {!overview.accounts?.length && <p className="text-xs text-slate-500">{en ? 'No active account.' : 'Aucun compte actif.'}</p>}
            </div>
          </section>
          {writable && <div className="grid grid-cols-2 gap-2 sm:max-w-md"><button type="button" onClick={() => { setTransactionForm((current) => ({ ...current, type: 'income' })); setShowTransactionForm(true); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#075b43] px-3 text-xs font-semibold text-white"><ArrowDownLeft size={16}/>{en ? 'Add income' : 'Ajouter un revenu'}</button><button type="button" onClick={() => { setTransactionForm((current) => ({ ...current, type: 'expense' })); setShowTransactionForm(true); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><ArrowUpRight size={16}/>{en ? 'Add expense' : 'Ajouter une dépense'}</button></div>}
        </div>
      )}

      {activeTab === 'reports' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">{en ? 'Business financial reports' : 'Rapports financiers de l’entreprise'}</h3><p className="mt-1 text-xs text-slate-500">{en ? 'Monthly collected income, paid expenses and operating result.' : 'Revenus encaissés, dépenses payées et résultat par mois.'}</p></div>
            <BarChart3 size={20} className="shrink-0 text-brand-700"/>
          </div>
          {overview.monthlyHistory?.length ? (
            <div className="mt-4 space-y-4">
              {[...overview.monthlyHistory].reverse().map((row) => {
                const income = Math.max(0, Number(row.income) || 0);
                const expense = Math.max(0, Number(row.expense) || 0);
                const max = Math.max(income, expense, 1);
                const result = income - expense;
                const [year, monthNumber] = String(row.month || '').split('-').map(Number);
                const label = year && monthNumber ? new Date(year, monthNumber - 1, 1).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' }) : row.month;
                return <div key={row.id || row.month} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3"><strong className="text-xs capitalize text-slate-800">{label}</strong><span className={'text-xs font-bold tabular-nums ' + (result < 0 ? 'text-rose-700' : 'text-emerald-700')}>{money(result)}</span></div>
                  <div className="mt-3 space-y-2">
                    <div><div className="mb-1 flex justify-between gap-2 text-[10px]"><span className="text-slate-500">{en ? 'Income received' : 'Revenus encaissés'}</span><strong>{money(income)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: Math.max(0, Math.min(100, income / max * 100)) + '%' }}/></div></div>
                    <div><div className="mb-1 flex justify-between gap-2 text-[10px]"><span className="text-slate-500">{en ? 'Expenses paid' : 'Dépenses payées'}</span><strong>{money(expense)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-400" style={{ width: Math.max(0, Math.min(100, expense / max * 100)) + '%' }}/></div></div>
                  </div>
                </div>;
              })}
            </div>
          ) : <p className="py-10 text-center text-xs text-slate-500">{en ? 'Monthly reports will appear after the first transactions.' : 'Les rapports mensuels apparaîtront après les premières opérations.'}</p>}
          <p className="mt-3 text-[10px] leading-5 text-slate-400">{en ? 'Owner contributions and opening balances are kept separate from sales and are not included in the operating result.' : 'Les apports du propriétaire et les soldes initiaux restent séparés des ventes et ne sont pas intégrés au résultat d’exploitation.'}</p>
        </section>
      )}

      {activeTab === 'transactions' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{en ? 'Transaction history' : 'Historique des opérations'}</h3>{writable && <button type="button" onClick={() => setShowTransactionForm(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en ? 'New' : 'Ajouter'}</button>}</div>
          {listLoading ? <p className="py-8 text-center text-xs text-slate-500">{en ? 'Loading…' : 'Chargement…'}</p> : transactions.length ? <div className="mt-3 divide-y divide-slate-100">{transactions.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="flex min-w-0 items-start gap-2.5"><span className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' + (item.type === 'expense' ? 'bg-rose-50 text-rose-700' : item.flowType === 'owner_contribution' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>{item.type === 'expense' ? <ArrowUpRight size={15}/> : <ArrowDownLeft size={15}/>}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{item.title || item.categoryId}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(item.date || item.createdAt)} · {item.flowType === 'owner_contribution' ? (en ? 'Owner contribution' : 'Apport du propriétaire') : item.categoryId}</p>{item.note && <p className="mt-1 text-[10px] text-slate-500">{item.note}</p>}</div></div><strong className={'shrink-0 text-xs tabular-nums ' + (item.type === 'expense' ? 'text-rose-700' : 'text-emerald-700')}>{item.type === 'expense' ? '−' : '+'}{money(item.amount)}</strong></div>)}</div> : <p className="py-10 text-center text-xs text-slate-500">{en ? 'No transactions yet.' : 'Aucune opération enregistrée.'}</p>}
        </section>
      )}

      {activeTab === 'payment-links' && writable && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">{en ? 'Payment links' : 'Liens de paiement'}</h3><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{en ? 'Create a branded product or service page, share it with anyone and receive payments into your selected business account.' : 'Crée une page de vente à l’identité de ton entreprise, partage-la avec tes clients et reçois les paiements dans le compte professionnel choisi.'}</p></div>
            <button type="button" onClick={() => { setFormError(''); setShowPaymentLinkForm((value) => !value); setEditingPaymentLinkId(''); setPaymentLinkForm({ title: '', description: '', imageUrl: '', galleryImageUrls: [], proofImageUrls: [], videoUrlsText: '', sellingPointsText: '', originalAmount: '', amount: '', customerName: '', customerEmail: '', maxPayments: '', accountId: accountsForSelect[0]?.id || 'main', publicOnStorefront: true }); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#075b43] px-3.5 text-xs font-semibold text-white"><Plus size={15}/>{en ? 'Create a link' : 'Créer un lien'}</button>
          </div>
          {showPaymentLinkForm && (
            <form onSubmit={submitPaymentLink} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{en ? 'Product or service name' : 'Nom du produit ou service'}<input required maxLength={100} value={paymentLinkForm.title} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, title: event.target.value })} placeholder={en ? 'Example: Laptop, design service…' : 'Ex. Ordinateur portable, prestation graphique…'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{en ? 'Product description' : 'Description du produit'}<textarea required minLength={5} maxLength={1200} rows={3} value={paymentLinkForm.description} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, description: event.target.value })} placeholder={en ? 'Describe what the customer will receive…' : 'Explique clairement ce que le client va acheter…'} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"/></label>
              <div className="sm:col-span-2"><CloudinaryImageField value={paymentLinkForm.imageUrl || ''} onChange={(imageUrl) => setPaymentLinkForm((current) => ({ ...current, imageUrl }))} folder="pata/business-payment-products" language={language} label={en ? 'Product photo (recommended)' : 'Photo du produit (recommandée)'}/><p className="mt-1 text-[10px] text-slate-500">{en ? 'Optional for services or digital products.' : 'Facultative pour les prestations et produits numériques.'}</p></div>

              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-slate-800">{en?'Additional product photos':'Photos supplémentaires du produit'}</p><p className="mt-1 text-[10px] text-slate-500">{en?'Up to 4 extra images.':'Jusqu’à 4 images supplémentaires.'}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{Array.from({length:4},(_,index)=><CloudinaryImageField key={'gallery-'+index} value={paymentLinkForm.galleryImageUrls?.[index]||''} onChange={url=>setPaymentLinkForm(current=>{const rows=[...(current.galleryImageUrls||[])];rows[index]=url;return {...current,galleryImageUrls:rows};})} folder="pata/business-payment-gallery" language={language} label={'Photo '+(index+1)}/>)}</div>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-slate-800">{en?'Proofs, results and screenshots':'Preuves, résultats et captures d’écran'}</p><p className="mt-1 text-[10px] text-slate-500">{en?'Show examples, completed work or real customer results.':'Présente des exemples réels, des réalisations ou des résultats obtenus.'}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{Array.from({length:4},(_,index)=><CloudinaryImageField key={'proof-'+index} value={paymentLinkForm.proofImageUrls?.[index]||''} onChange={url=>setPaymentLinkForm(current=>{const rows=[...(current.proofImageUrls||[])];rows[index]=url;return {...current,proofImageUrls:rows};})} folder="pata/business-payment-proofs" language={language} label={'Preuve '+(index+1)}/>)}</div>
              </div>
              <label className="sm:col-span-2 block text-xs font-semibold text-slate-600">{en?'Video links (one per line)':'Liens vidéo (un par ligne)'}<textarea rows={3} value={paymentLinkForm.videoUrlsText||''} onChange={event=>setPaymentLinkForm({...paymentLinkForm,videoUrlsText:event.target.value})} placeholder={'https://youtu.be/...\nhttps://vimeo.com/...'} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-slate-500">{en?'YouTube, Vimeo and secure MP4/WebM videos play directly on the sales page.':'YouTube, Vimeo et les vidéos MP4/WebM sécurisées se lisent directement sur la page de vente.'}</span></label>
              <label className="sm:col-span-2 block text-xs font-semibold text-slate-600">{en?'Key benefits (one per line)':'Points forts (un par ligne)'}<textarea rows={3} maxLength={1500} value={paymentLinkForm.sellingPointsText||''} onChange={event=>setPaymentLinkForm({...paymentLinkForm,sellingPointsText:event.target.value})} placeholder={'Garantie de 6 mois\nLivraison disponible\nAssistance après-vente'} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"/></label>
              
              <label className="text-xs font-semibold text-slate-600">{en ? 'Regular price (XAF)' : 'Prix normal (FCFA)'}<input type="number" min="100" step="1" value={paymentLinkForm.originalAmount} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, originalAmount: event.target.value })} placeholder={en ? 'Optional, before discount' : 'Facultatif, avant réduction'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label>
              <label className="text-xs font-semibold text-slate-600">{en ? 'Amount customer pays (XAF)' : 'Montant à payer (FCFA)'}<input required type="number" min="100" step="1" value={paymentLinkForm.amount} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, amount: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"/></label>
              <label className="text-xs font-semibold text-slate-600">{en?'Maximum successful payments':'Nombre maximal de paiements'}<input type="number" min="1" step="1" value={paymentLinkForm.maxPayments||''} onChange={(event)=>setPaymentLinkForm({...paymentLinkForm,maxPayments:event.target.value})} placeholder={en?'Empty = unlimited':'Vide = illimité'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/><span className="mt-1 block text-[10px] font-normal text-slate-500">{en?'Limit counts successful payments only.':'La limite porte uniquement sur les paiements validés.'}</span></label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={paymentLinkForm.publicOnStorefront!==false} onChange={event=>setPaymentLinkForm({...paymentLinkForm,publicOnStorefront:event.target.checked})}/>{en?'Show this offer in the public company shop':'Afficher cette offre dans la boutique publique'}</label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{en ? 'Business account to credit' : 'Compte professionnel à créditer'}<select required value={paymentLinkForm.accountId} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, accountId: event.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <details className="sm:col-span-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">{en ? 'Customer details (optional)' : 'Informations du client (facultatives)'}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">{en ? 'Customer name' : 'Nom du client'}<input maxLength={100} value={paymentLinkForm.customerName} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, customerName: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label><label className="text-xs font-semibold text-slate-600">{en ? 'Customer email' : 'E-mail du client'}<input type="email" value={paymentLinkForm.customerEmail} onChange={(event) => setPaymentLinkForm({ ...paymentLinkForm, customerEmail: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label></div></details>
              <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="min-h-11 flex-1 rounded-xl bg-[#075b43] px-3 text-xs font-semibold text-white">{saving ? (en ? 'Creating…' : 'Création…') : (en ? 'Create my sales page' : 'Créer ma page de vente')}</button><button type="button" onClick={() => { setShowPaymentLinkForm(false); setEditingPaymentLinkId(''); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-600">{en ? 'Cancel' : 'Annuler'}</button></div>
            </form>
          )}
          {listLoading ? <p className="py-8 text-center text-xs text-slate-500">{en ? 'Loading…' : 'Chargement…'}</p> : paymentLinks.length ? (
            <div className="mt-4 space-y-2">
              {paymentLinks.map((link) => {
                const soldOut=link.status==='SOLD_OUT';
                return <article key={link.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start gap-3"><span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">{link.imageUrl?<img src={link.imageUrl} alt="" className="h-full w-full object-cover"/>:<Building2 size={22} className="text-slate-400"/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="break-words text-sm font-semibold text-slate-900">{link.title}</h4><span className={'rounded-full px-2 py-1 text-[10px] font-semibold '+(soldOut?'bg-slate-100 text-slate-600':'bg-emerald-50 text-emerald-800')}>{soldOut?(en?'Offer completed':'Offre terminée'):(en?'Reusable offer':'Offre réutilisable')}</span></div><p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{link.description}</p><p className="mt-1 text-xs font-bold text-slate-900">{money(link.amount)} · {link.maxPayments?(Number(link.successfulPayments||0)+' / '+link.maxPayments):(en?'Unlimited payments':'Paiements illimités')}</p></div></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Views':'Vues uniques'}</p><b className="text-sm">{Number(link.uniqueViews||0).toLocaleString('fr-FR')}</b></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Checkout clicks':'Clics paiement'}</p><b className="text-sm">{Number(link.clickCount||0).toLocaleString('fr-FR')}</b></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Payments received':'Paiements validés'}</p><b className="text-sm">{Number(link.successfulPayments||0).toLocaleString('fr-FR')}</b></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Net received':'Net encaissé'}</p><b className="text-xs">{money(link.netRevenue||0)}</b></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-500">{en?'Gross sales':'Ventes brutes'} : <b className="text-slate-800">{money(link.grossRevenue||0)}</b></p><div className="flex flex-wrap gap-2">{link.publicUrl&&!soldOut&&<button type="button" onClick={()=>sharePaymentLink(link)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700"><Share2 size={13}/>{en?'Share':'Partager'}</button>}<button type="button" onClick={()=>beginEditPaymentLink(link)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700"><Pencil size={13}/>{en?'Edit':'Modifier'}</button><button type="button" onClick={()=>{setDeletePaymentLinkTarget(link);setDeletePaymentLinkConfirmation('');}} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[10px] font-semibold text-red-700"><Trash2 size={13}/>{en?'Delete':'Supprimer'}</button><button type="button" onClick={()=>openPaymentLinkAnalytics(link)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-2.5 text-[10px] font-semibold text-white">{en?'Statistics':'Voir les statistiques'}</button></div></div>
                  {link.publicUrl&&<button type="button" onClick={()=>copyPaymentLink(link)} className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-[10px] font-semibold text-slate-500"><Copy size={12}/>{en?'Copy offer link':'Copier le lien de l’offre'}</button>}
                </article>;
              })}
            </div>
          ) : <p className="py-10 text-center text-xs text-slate-500">{en ? 'No payment link yet.' : 'Aucun lien de paiement pour le moment.'}</p>}
        </section>
      )}

      {activeTab === 'accounts' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">{en ? 'Cash and payment accounts' : 'Caisses et comptes de paiement'}</h3><p className="mt-1 text-xs text-slate-500">{en ? 'Balances change when business transactions are recorded.' : 'Les soldes évoluent avec les opérations de l’entreprise.'}</p></div><button type="button" onClick={() => setShowAccountForm((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en ? 'Add account' : 'Ajouter'}</button></div>
          {showAccountForm && <form onSubmit={submitAccount} className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3"><input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder={en ? 'Account name' : 'Nom du compte'} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"/><select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="cash">Caisse</option><option value="mtn_momo">MTN MoMo</option><option value="orange_money">Orange Money</option><option value="bank">Banque</option><option value="other">Autre</option></select><input type="number" min="0" step="1" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} placeholder={en ? 'Opening balance' : 'Solde initial'} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"/><button disabled={saving} className="min-h-10 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white sm:col-span-3">{saving ? (en ? 'Saving…' : 'Enregistrement…') : (en ? 'Save account' : 'Enregistrer le compte')}</button></form>}
          {listLoading ? <p className="py-8 text-xs text-slate-500">Chargement…</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-semibold text-slate-800">{account.name}</p><p className="mt-1 text-[10px] text-slate-500">{account.type}</p></div><strong className="text-sm tabular-nums">{money(account.balance)}</strong></div>)}</div>}
          {writable && <button type="button" onClick={() => setShowTransferForm(true)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800"><Send size={15}/>{en ? 'Transfer personal funds into this business' : 'Transférer des fonds personnels vers l’entreprise'}</button>}
        </section>
      )}

      {RESOURCE_CONFIG[activeTab] && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">{currentTab?(en?currentTab.en:currentTab.fr):''}</h3><p className="mt-1 text-xs text-slate-500">{activeTab==='budgets'?(en?'Plan monthly spending by category, then compare allocations with real expenses.':'Planifie les dépenses mensuelles par catégorie et compare le prévu au réel.'):(en?'These records feed into company follow-up and financial tracking.':'Ces fiches alimentent le suivi commercial et financier de l’entreprise.')}</p></div><button type="button" onClick={openResourceForm} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en?'Add':'Ajouter'}</button></div>
          {resourceFormOpen&&<form onSubmit={submitResource} className="mt-4 space-y-4 rounded-xl bg-slate-50 p-3">
            {activeTab==='budgets'?<>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-700">{en?'Budget name':'Nom du budget'}<input required minLength={2} maxLength={120} value={resourceForm.title||''} onChange={e=>setResourceForm(current=>({...current,title:e.target.value}))} placeholder={en?'Example: Operating expenses':'Ex. Budget de fonctionnement'} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label><label className="block text-xs font-semibold text-slate-700">{en?'Month':'Mois'}<input required type="month" value={resourceForm.month||''} onChange={e=>setResourceForm(current=>({...current,month:e.target.value}))} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label><label className="block text-xs font-semibold text-slate-700 sm:col-span-2">{en?'Purpose / note (optional)':'Objectif / note (facultatif)'}<textarea rows={2} maxLength={500} value={resourceForm.note||''} onChange={e=>setResourceForm(current=>({...current,note:e.target.value}))} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"/></label></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><h4 className="text-sm font-bold text-slate-800">{en?'Budget envelopes':'Enveloppes budgétaires'}</h4><p className="mt-1 text-[10px] text-slate-500">{en?'Select several categories and set an amount for each.':'Sélectionne plusieurs catégories et définis un montant pour chacune.'}</p></div><strong className="text-xs text-[#075b43]">{money((resourceForm.allocations||[]).reduce((sum,row)=>sum+(Number(row.amount)||0),0))}</strong></div>
                <div className="mt-3 space-y-3">{(resourceForm.allocations||[]).map((row,index)=><div key={index} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_150px_36px]"><div><label className="block text-[11px] font-semibold text-slate-600">{en?'Expense category':'Catégorie de dépense'}<select required value={row.categoryId||''} onChange={e=>{const selected=BUSINESS_EXPENSE_CATEGORIES.find(c=>c[0]===e.target.value);setResourceForm(current=>({...current,allocations:(current.allocations||[]).map((item,i)=>i===index?{...item,categoryId:e.target.value,categoryLabel:selected?(en?selected[2]:selected[1]):''}:item)}));}} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-normal"><option value="">{en?'Choose a category':'Choisir une catégorie'}</option>{BUSINESS_EXPENSE_CATEGORIES.map(([id,fr,enLabel])=><option key={id} value={id}>{en?enLabel:fr}</option>)}<option value="custom">{en?'Custom category':'Catégorie personnalisée'}</option></select>{row.categoryId==='custom'&&<input required maxLength={80} value={row.categoryLabel||''} onChange={e=>setResourceForm(current=>({...current,allocations:(current.allocations||[]).map((item,i)=>i===index?{...item,categoryLabel:e.target.value}:item)}))} placeholder={en?'Enter your category':'Saisis ta catégorie'} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-normal"/>}</label></div><label className="block text-[11px] font-semibold text-slate-600">{en?'Planned amount (XAF)':'Montant prévu (FCFA)'}<input required type="number" min="1" step="1" value={row.amount||''} onChange={e=>setResourceForm(current=>({...current,allocations:(current.allocations||[]).map((item,i)=>i===index?{...item,amount:e.target.value}:item)}))} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/></label><button type="button" disabled={(resourceForm.allocations||[]).length<=1} onClick={()=>setResourceForm(current=>({...current,allocations:(current.allocations||[]).filter((_,i)=>i!==index)}))} aria-label={en?'Remove category':'Retirer la catégorie'} className="mt-5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"><Trash2 size={15}/></button></div>)}</div>
                <button type="button" disabled={(resourceForm.allocations||[]).length>=25} onClick={()=>setResourceForm(current=>({...current,allocations:[...(current.allocations||[]),{categoryId:'',categoryLabel:'',amount:''}]}))} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-700"><Plus size={14}/>{en?'Add another category':'Ajouter une catégorie'}</button>
              </div>
            </>:<div className="grid gap-3 sm:grid-cols-2">{RESOURCE_CONFIG[activeTab].fields.map(field=><div key={field.key} className="text-[11px] font-semibold text-slate-600">
              {field.type==='image'?<CloudinaryImageField value={resourceForm[field.key]||''} onChange={imageUrl=>setResourceForm(current=>({...current,[field.key]:imageUrl}))} folder={'pata/business-'+activeTab} language={language} label={field.label}/>:
               field.type==='checkbox'?<label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3"><input type="checkbox" checked={resourceForm[field.key]!==false} onChange={e=>setResourceForm({...resourceForm,[field.key]:e.target.checked})} className="h-4 w-4 accent-emerald-700"/><span>{field.label}</span></label>:
               field.type==='client'?<label className="block">{field.label}<select value={resourceForm.customerId||''} onChange={e=>{const record=relatedRecords.clients.find(x=>x.id===e.target.value);setResourceForm(current=>({...current,customerId:e.target.value,customerName:record?.name||current.customerName||''}));}} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{en?'No linked client / manual name':'Aucun client lié / nom manuel'}</option>{relatedRecords.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:
               field.type==='supplier'?<label className="block">{field.label}<select value={resourceForm.supplierId||''} onChange={e=>setResourceForm(current=>({...current,supplierId:e.target.value}))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{en?'No linked supplier':'Aucun fournisseur lié'}</option>{relatedRecords.suppliers.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:
               field.type==='counterparty'?<label className="block">{field.label}<select value={resourceForm.counterpartyId||''} onChange={e=>{const list=relatedRecords[resourceForm.counterpartyType]||[],record=list.find(x=>x.id===e.target.value);setResourceForm(current=>({...current,counterpartyId:e.target.value,counterparty:record?.name||current.counterparty||''}));}} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{en?'No linked record':'Aucune fiche liée'}</option>{(relatedRecords[resourceForm.counterpartyType]||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:
               field.type==='business-category'?<label className="block">{field.label}<select required value={resourceForm.categoryId||''} onChange={e=>{const row=BUSINESS_EXPENSE_CATEGORIES.find(c=>c[0]===e.target.value);setResourceForm(current=>({...current,categoryId:e.target.value,categoryLabel:row?(en?row[2]:row[1]):''}));}} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{en?'Choose a category':'Choisir une catégorie'}</option>{BUSINESS_EXPENSE_CATEGORIES.map(([id,fr,enLabel])=><option key={id} value={id}>{en?enLabel:fr}</option>)}<option value="custom">{en?'Custom category':'Catégorie personnalisée'}</option></select>{resourceForm.categoryId==='custom'&&<input required maxLength={80} value={resourceForm.categoryLabel||''} onChange={e=>setResourceForm(current=>({...current,categoryLabel:e.target.value}))} placeholder={en?'Enter a category':'Saisis la catégorie'} className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/>}</label>:
               <label className="block">{field.label}{field.type==='select'?<select required={field.required} value={resourceForm[field.key]||''} onChange={e=>setResourceForm({...resourceForm,[field.key]:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">{en?'Choose…':'Choisir…'}</option>{(field.options||[]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<input required={field.required} type={field.type||'text'} placeholder={field.placeholder||''} value={resourceForm[field.key]||''} onChange={e=>setResourceForm({...resourceForm,[field.key]:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/>}{field.key==='month'&&<span className="mt-1 block text-[10px] text-slate-400">AAAA-MM</span>}</label>}
            </div>)}</div>}
            <div className="flex gap-2"><button disabled={saving} className="min-h-10 flex-1 rounded-lg bg-[#075b43] text-xs font-semibold text-white">{saving?'…':(en?'Save':'Enregistrer')}</button><button type="button" onClick={()=>setResourceFormOpen(false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600">{en?'Cancel':'Annuler'}</button></div>
          </form>}
          {listLoading?<p className="py-8 text-xs text-slate-500">{en?'Loading…':'Chargement…'}</p>:activeTab==='budgets'?(budgetGroups.length?<div className="mt-4 space-y-3">{budgetGroups.map(group=><article key={group.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">{group.title}</h4><p className="mt-1 text-[10px] text-slate-500">{group.month} · {group.items.length} {en?'categories':'catégories'}</p>{group.note&&<p className="mt-1 text-xs text-slate-600">{group.note}</p>}</div><button type="button" onClick={()=>removeResource(group.items[0])} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={14}/></button></div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2"><div><p className="text-[9px] text-slate-500">{en?'Planned':'Prévu'}</p><b className="text-xs">{money(group.amount)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Spent':'Dépensé'}</p><b className="text-xs">{money(group.spent)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Remaining':'Restant'}</p><b className="text-xs">{money(group.remaining)}</b></div></div>
            <div className="mt-3 space-y-3">{group.items.map(item=><div key={item.id}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{item.categoryLabel||item.categoryId}</p><p className="mt-0.5 text-[10px] text-slate-500">{en?'Spent':'Dépensé'} {money(item.spent||0)} · {en?'Remaining':'Restant'} {money(item.remaining??Math.max(0,Number(item.amount||0)-Number(item.spent||0)))}</p></div><b className="shrink-0 text-xs">{money(item.amount)}</b></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full '+(item.overBudget?'bg-rose-500':'bg-emerald-600')} style={{width:Math.min(100,Number(item.amount)>0?Number(item.spent||0)/Number(item.amount)*100:0)+'%'}}/></div></div>)}</div>
          </article>)}</div>:<p className="py-10 text-center text-xs text-slate-500">{en?'No monthly budget set up.':'Aucun budget mensuel configuré.'}</p>):items.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map(item=><div key={item.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{item.imageUrl?<img src={item.imageUrl} alt="" className="h-full w-full object-cover"/>:<Users size={15}/>}</span><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{item.title||item.name||item.customerName}</p><p className="mt-1 text-[10px] text-slate-500">{item.contractType||item.type||item.customerName||item.supplierName||item.counterparty||item.role||item.categoryLabel||item.category||item.phone||''}{item.affectsFinances===false?(en?' · excluded from payable commitments':' · hors engagements à payer'):''}</p></div></div><button type="button" onClick={()=>removeResource(item)} aria-label={en?'Delete item':'Supprimer'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={14}/></button></div>
            {activeTab==='clients'&&<div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2"><div><p className="text-[9px] text-slate-500">{en?'Invoiced':'Facturé'}</p><b className="text-xs">{money(item.totalInvoiced||0)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Collected':'Encaissé'}</p><b className="text-xs">{money(item.totalCollected||0)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Due':'À recevoir'}</p><b className="text-xs">{money(item.outstandingAmount||0)}</b></div></div>}
            {activeTab==='suppliers'&&<div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2"><div><p className="text-[9px] text-slate-500">{en?'Committed':'Engagé'}</p><b className="text-xs">{money(item.totalCommitted||0)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Paid':'Payé'}</p><b className="text-xs">{money(item.totalPaid||0)}</b></div><div><p className="text-[9px] text-slate-500">{en?'Remaining':'Restant'}</p><b className="text-xs">{money(item.outstandingAmount||0)}</b></div></div>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{['invoices','obligations'].includes(activeTab)&&<><div className="text-[10px] text-slate-500">{en?'Remaining':'Reste à régler'} : <b className="text-slate-800">{money(item.remaining??item.totalAmount??item.amount)}</b></div>{Number(item.remaining??item.totalAmount??item.amount)>0&&<button type="button" onClick={()=>{setPaymentTarget(item);setPaymentForm({amount:String(item.remaining??item.totalAmount??item.amount),accountId:accountsForSelect[0]?.id||'main',date:new Date().toISOString().slice(0,10)});}} className="min-h-8 rounded-lg bg-blue-50 px-2.5 text-[10px] font-semibold text-blue-800">{en?'Record payment':'Enregistrer un paiement'}</button>}</>}</div>
          </div>)}</div>:<p className="py-10 text-center text-xs text-slate-500">{en?'No item saved yet.':'Aucun élément enregistré.'}</p>}
        </section>
      )}

{profileFormOpen && writable && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center">
          <form onSubmit={submitBusinessProfile} className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'Business identity' : 'Identité de l’entreprise'}</h3><button type="button" onClick={() => setProfileFormOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"><X size={18}/></button></div>
            <CloudinaryImageField value={profileForm.logoUrl || ''} onChange={(logoUrl) => setProfileForm({ ...profileForm, logoUrl })} folder="pata/businesses" language={language} label={en ? 'Business logo' : 'Logo de l’entreprise'} />
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Business name' : 'Nom de l’entreprise'}<input required minLength={2} maxLength={100} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Business activity' : 'Activité'}<input maxLength={120} value={profileForm.activity} onChange={(event) => setProfileForm({ ...profileForm, activity: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Business slogan' : 'Slogan de l’entreprise'}<input maxLength={180} value={profileForm.slogan} onChange={(event) => setProfileForm({ ...profileForm, slogan: event.target.value })} placeholder={en ? 'A short phrase representing your business' : 'Une phrase courte qui représente ton entreprise'} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600">{en ? 'Legal form' : 'Forme juridique'}<input maxLength={80} value={profileForm.legalForm} onChange={(event) => setProfileForm({ ...profileForm, legalForm: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
              <label className="text-xs font-semibold text-slate-600">{en ? 'City' : 'Ville'}<input maxLength={80} value={profileForm.city} onChange={(event) => setProfileForm({ ...profileForm, city: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
            </div>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Phone' : 'Téléphone'}<input maxLength={30} value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"/></label>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <p className="text-xs font-bold text-slate-800">{en?'Public company profile and shop':'Profil public et boutique de l’entreprise'}</p>
              <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={profileForm.publicProfileEnabled===true} onChange={e=>setProfileForm({...profileForm,publicProfileEnabled:e.target.checked})} className="mt-0.5"/> <span><b>{en?'Allow customers to view our public profile':'Autoriser les clients à consulter le profil public'}</b><span className="mt-0.5 block text-[10px] text-slate-500">{en?'Customers can open the company profile from payment pages.':'Les clients pourront ouvrir le profil de l’entreprise depuis ses pages de paiement.'}</span></span></label>
              <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={profileForm.publicOffersEnabled!==false} onChange={e=>setProfileForm({...profileForm,publicOffersEnabled:e.target.checked})} className="mt-0.5"/> <span><b>{en?'Show public offers in the company shop':'Afficher les offres publiques dans la boutique'}</b><span className="mt-0.5 block text-[10px] text-slate-500">{en?'Only offers individually marked as public will be listed.':'Seules les offres individuellement marquées comme publiques seront affichées.'}</span></span></label>
              {profileForm.publicProfileEnabled&&<a href={'/entreprise/'+encodeURIComponent(businessId)} target="_blank" rel="noreferrer" className="inline-flex text-[10px] font-semibold text-[#075b43] underline">{en?'Preview public profile':'Prévisualiser le profil public'}</a>}
            </div>
            <div className="flex gap-2"><button disabled={saving} className="min-h-11 flex-1 rounded-xl bg-[#075b43] text-xs font-semibold text-white">{saving ? (en ? 'Saving…' : 'Enregistrement…') : (en ? 'Save changes' : 'Enregistrer')}</button><button type="button" onClick={() => setProfileFormOpen(false)} className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-600">{en ? 'Cancel' : 'Annuler'}</button></div>
          </form>
        </div>
      )}

      {showTransactionForm && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitTransaction} className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'New business transaction' : 'Nouvelle opération professionnelle'}</h3><button type="button" onClick={() => setShowTransactionForm(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"><X size={18}/></button></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTransactionForm({ ...transactionForm, type: 'income', categoryId: 'sales' })} className={'min-h-10 rounded-lg text-xs font-semibold ' + (transactionForm.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>{en ? 'Income' : 'Entrée'}</button><button type="button" onClick={() => setTransactionForm({ ...transactionForm, type: 'expense', categoryId: 'other' })} className={'min-h-10 rounded-lg text-xs font-semibold ' + (transactionForm.type === 'expense' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600')}>{en ? 'Expense' : 'Sortie'}</button></div>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Amount (XAF)' : 'Montant (FCFA)'}<input type="number" min="1" step="1" required value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Label / source' : 'Libellé / source'}<input required maxLength={120} value={transactionForm.title} onChange={(e) => setTransactionForm({ ...transactionForm, title: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">{en ? 'Date' : 'Date'}<input type="date" required value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2 text-xs"/></label><label className="text-xs font-semibold text-slate-600">{en ? 'Financial account' : 'Compte financier'}<select value={transactionForm.accountId} onChange={(e) => setTransactionForm({ ...transactionForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
            <label className="block text-xs font-semibold text-slate-600">{en?'Category':'Catégorie'}<select required value={transactionForm.categoryId} onChange={e=>{const row=BUSINESS_EXPENSE_CATEGORIES.find(c=>c[0]===e.target.value);setTransactionForm({...transactionForm,categoryId:e.target.value,categoryLabel:row?(en?row[2]:row[1]):''});}} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">{en?'Choose a category':'Choisir une catégorie'}</option>{(transactionForm.type==='expense'?[...BUSINESS_EXPENSE_CATEGORIES,['custom','Autre catégorie…','Custom category…']]:[['sales','Ventes','Sales'],['other_income','Autres revenus','Other income']]).map(([id,fr,enLabel])=><option key={id} value={id}>{en?enLabel:fr}</option>)}</select></label>{transactionForm.categoryId==='custom'&&<label className="block text-xs font-semibold text-slate-600">{en?'Custom category':'Nom de la catégorie'}<input required maxLength={80} value={transactionForm.categoryLabel||''} onChange={e=>setTransactionForm({...transactionForm,categoryLabel:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>}
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Note (optional)' : 'Note (facultatif)'}<textarea value={transactionForm.note} onChange={(e) => setTransactionForm({ ...transactionForm, note: e.target.value })} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
            <button disabled={saving} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? (en ? 'Saving…' : 'Enregistrement…') : (en ? 'Save transaction' : 'Enregistrer l’opération')}</button>
          </form>
        </div>
      )}

      {showTransferForm && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitTransfer} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'Personal contribution' : 'Apport depuis tes finances personnelles'}</h3><button type="button" onClick={() => setShowTransferForm(false)}><X size={18}/></button></div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500">{overview.business.logoUrl ? <img src={overview.business.logoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : <Building2 size={20}/>}</span>
              <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{overview.business.name}</p><p className="text-[10px] text-slate-500">{en ? 'Destination business' : 'Entreprise de destination'}</p></div>
            </div>
            <p className="text-xs leading-5 text-slate-500">{en ? 'The selected amount is reduced from the personal income source and added to this business account as an owner contribution, not as sales.' : 'Le montant choisi sera déduit du solde disponible de ta source personnelle et ajouté au compte de cette entreprise comme apport du propriétaire, pas comme une vente.'}</p>
            <label className="block text-xs font-semibold text-slate-600">Source de revenu personnelle<select required value={transferForm.incomeId} onChange={(e) => setTransferForm({ ...transferForm, incomeId: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir un revenu</option>{personalSources.map((income) => <option key={income.id} value={income.id}>{income.source} · {money(income.remaining)} disponibles</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">Montant à transférer (FCFA)<input type="number" min="1" step="1" required value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">Compte de destination<select value={transferForm.accountId} onChange={(e) => setTransferForm({ ...transferForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">Date<input type="date" required value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            {personalSourcesLoading && <p className="text-xs text-slate-500">Chargement des soldes personnels…</p>}{!personalSourcesLoading && !personalSources.length && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Aucune source personnelle ne dispose actuellement d’un solde vérifié et disponible.</p>}
            <button disabled={saving || personalSourcesLoading || !personalSources.length} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? 'Transfert…' : 'Confirmer le transfert'}</button>
          </form>
        </div>
      )}

      {deletePaymentLinkTarget && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
          <section role="alertdialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-2xl border border-red-100 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 size={19}/></span><div><h3 className="font-bold text-slate-900">{en?'Delete this payment link?':'Supprimer ce lien de paiement ?'}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{en?'The public link will stop working. Payment records and accounting entries will be preserved. This action cannot be undone.':'Le lien public sera désactivé. Les paiements déjà reçus et les écritures comptables seront conservés. Cette action ne peut pas être annulée.'}</p></div></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-800">{deletePaymentLinkTarget.title}</p><p className="mt-1 break-all text-[10px] text-slate-500">{deletePaymentLinkTarget.publicUrl}</p></div>
            <label className="block text-xs font-semibold text-slate-700">{en?'Type SUPPRIMER to confirm':'Saisis SUPPRIMER pour confirmer'}<input autoComplete="off" value={deletePaymentLinkConfirmation} onChange={e=>setDeletePaymentLinkConfirmation(e.target.value)} placeholder="SUPPRIMER" className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"/></label>
            <div className="flex gap-2"><button type="button" disabled={busyPaymentLinkId===deletePaymentLinkTarget.id||deletePaymentLinkConfirmation!=='SUPPRIMER'} onClick={confirmDeletePaymentLink} className="min-h-11 flex-1 rounded-xl bg-red-700 px-3 text-xs font-bold text-white disabled:opacity-40">{busyPaymentLinkId===deletePaymentLinkTarget.id?(en?'Deleting…':'Suppression…'):(en?'Confirm deletion':'Confirmer la suppression')}</button><button type="button" onClick={()=>{setDeletePaymentLinkTarget(null);setDeletePaymentLinkConfirmation('');}} className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-600">{en?'Cancel':'Annuler'}</button></div>
          </section>
        </div>
      )}

      {selectedPaymentLink && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center"><section className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">{selectedPaymentLink.title}</h3><p className="mt-1 text-xs text-slate-500">{en?'Offer performance':'Performances de cette offre'}</p></div><button type="button" onClick={()=>{setSelectedPaymentLink(null);setPaymentLinkDetails(null);}} className="rounded-lg p-2 text-slate-500"><X size={18}/></button></div>
          {paymentDetailsLoading?<p className="py-8 text-center text-xs text-slate-500">{en?'Loading…':'Chargement…'}</p>:paymentLinkDetails&&<>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[[en?'Views':'Vues',paymentLinkDetails.paymentLink?.uniqueViews||0],[en?'Clicks':'Clics',paymentLinkDetails.paymentLink?.clickCount||0],[en?'Successful payments':'Paiements validés',paymentLinkDetails.paymentLink?.successfulPayments||0],[en?'Net received':'Net encaissé',money(paymentLinkDetails.paymentLink?.netRevenue||0)]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{label}</p><b className="mt-1 block text-sm">{value}</b></div>)}</div>
            <div className="grid grid-cols-2 gap-2"><div className="rounded-xl border p-3"><p className="text-[10px] text-slate-500">{en?'Gross sales':'Ventes brutes'}</p><b>{money(paymentLinkDetails.paymentLink?.grossRevenue||0)}</b></div><div className="rounded-xl border p-3"><p className="text-[10px] text-slate-500">{en?'Processing fees':'Frais de traitement'}</p><b>{money(paymentLinkDetails.paymentLink?.feeRevenue||0)}</b></div></div>
            <div className="rounded-xl border border-slate-200 p-3"><h4 className="text-sm font-bold text-slate-800">{en?'Customer reviews':'Avis des clients'}</h4>{(()=>{const count=Number(paymentLinkDetails.paymentLink?.ratingCount)||0,productAvg=count?(Number(paymentLinkDetails.paymentLink?.productRatingTotal)||0)/count:0,businessAvg=count?(Number(paymentLinkDetails.paymentLink?.businessRatingTotal)||0)/count:0;return <div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Reviews':'Avis'}</p><b className="text-lg">{count}</b></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Product rating':'Note produit'}</p><b className="text-lg">{productAvg.toFixed(1)} / 5</b></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{en?'Business rating':'Note entreprise'}</p><b className="text-lg">{businessAvg.toFixed(1)} / 5</b></div></div>;})()}{paymentLinkDetails.reviews?.length?<div className="mt-3 space-y-2">{paymentLinkDetails.reviews.map(review=><article key={review.id} className="rounded-lg border border-slate-100 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">{review.customerName||(en?'Customer':'Client')}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(review.createdAt)} · {en?'Product':'Produit'} {review.productRating}/5 · {en?'Business':'Entreprise'} {review.businessRating}/5</p></div><span className={'rounded-full px-2 py-1 text-[9px] font-semibold '+(review.verifiedPurchase?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600')}>{review.verifiedPurchase?(en?'Purchase confirmed':'Achat confirmé'):(en?'Payment attempt':'Tentative de paiement')}</span></div>{review.comment&&<p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{review.comment}</p>}</article>)}</div>:<p className="mt-3 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">{en?'No customer review yet.':'Aucun avis client pour le moment.'}</p>}</div>
            <div><h4 className="text-sm font-bold text-slate-800">{en?'Payment history':'Historique des paiements'}</h4>{paymentLinkDetails.payments?.length?<div className="mt-2 space-y-2">{paymentLinkDetails.payments.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{item.payerName||item.customerName||(en?'Customer':'Client')}</p><p className="mt-1 text-[10px] text-slate-500">{item.confirmedDate||formatDate(item.createdAt)} · {item.status}</p></div><div className="shrink-0 text-right"><b className="text-xs">{money(item.amount)}</b>{item.status==='CONFIRMED'&&<p className="text-[10px] text-emerald-700">Net : {money(item.receivedAmount||0)}</p>}</div></div>)}</div>:<p className="mt-2 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">{en?'No payment attempt yet.':'Aucun paiement effectué pour le moment.'}</p>}</div>
          </>}
        </section></div>
      )}
      {paymentTarget && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitPayment} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'Record a payment' : 'Enregistrer un paiement'}</h3><button type="button" onClick={() => setPaymentTarget(null)}><X size={18}/></button></div>
            <p className="text-xs text-slate-500">{paymentTarget.title} · reste {money(paymentTarget.remaining ?? paymentTarget.totalAmount ?? paymentTarget.amount)}</p>
            <label className="block text-xs font-semibold text-slate-600">Montant payé (FCFA)<input type="number" min="1" step="1" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">Compte financier<select value={paymentForm.accountId} onChange={(e) => setPaymentForm({ ...paymentForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <button disabled={saving} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? '…' : 'Confirmer le paiement'}</button>
          </form>
        </div>
      )}
    </div>
  );
}

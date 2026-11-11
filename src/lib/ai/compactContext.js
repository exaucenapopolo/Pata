const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function classifyAIRequest(message = '') {
  const text = normalize(message);
  const asksHow = /\b(comment|quelles etapes|ou trouver|ou se trouve|comment faire)\b/.test(text);
  const action = !asksHow && (/\b(ajout\w*|enregistr\w*|cre\w*|prepar\w*|etablis\w*|planifi\w*|supprim\w*|effac\w*|modifi\w*|corrig\w*|chang\w*|mett?\w*|reprend\w*|activ\w*|achet\w*|pay\w*|regl\w*|vers\w*|depos\w*|paus\w*|suspend\w*|arret\w*|renouvel\w*|abonn\w*|memorise\w*|souviens\w*|rappel\w*|contract\w*|emprunt\w*|emprunte\w*|rembours\w*|prete\w*|prends|pris|definis|fixe|declare|vise|fais|faire|lance|execut\w*)\b/.test(text) || (/\d/.test(text) && /(objectif|plafond|limite).{0,35}(revenu|depense|dette|emprunt)|(revenu|depense|dette|emprunt).{0,35}(objectif|plafond|limite)/.test(text)));
  const expense = /depense|achat|sortie d'argent|paiement|retrait|debite|facture|rembourser.*(dette|emprunt)|rembourse.*(dette|emprunt)/.test(text) || /pret accorde|argent prete|je prete|je lui prete/.test(text) || (/payer|paye/.test(text) && !/premium|abonnement|forfait/.test(text)) || (action && /\d/.test(text) && /transport|taxi|repas|petit dejeuner|boisson|nourriture|alimentation|loyer|courses|restaurant|essence|electricite|internet|sante|medicament|pharmacie/.test(text) && !/automatisation|recurrent|operation programmee/.test(text));
  const income = /revenu|salaire|recette|depot|versement recu|encaissement|argent recu|remboursement recu|on me rembourse/.test(text);
  const borrowedDebt = /dette|emprunt|emprunter|emprunte|credit bancaire|prendre un credit|contracte.*credit|contracte.*dette/.test(text) && !/on me doit|creance|argent prete|pret accorde|rembours/.test(text);
  const loanGiven = /pret accorde|argent prete|je prete|je lui prete/.test(text);
  const financialTargets = /(objectif|plafond|limite|maximum|maximal).{0,35}(revenu|depense|dette|emprunt)|(revenu|depense|dette|emprunt).{0,35}(objectif|plafond|limite|maximum|maximal)|resolution.*financ/.test(text);
  const budgets = /budget|enveloppe/.test(text);
  const goals = /objectif|epargne|tirelire|caisse/.test(text);
  const automations = /automatisation|recurrent|operation programmee|programmation|frequence/.test(text);
  const premium = /premium|abonnement|forfait/.test(text);
  const cotisations = /cotisation|tontine|tour de cotisation/.test(text);
  const projects = /projet|construction|equipement/.test(text);
  const vital = /prevision vitale|besoins vitaux|duree du capital|prevision.*capital/.test(text);
  const forecast = /prevision.*capital|duree.*capital|capital.*combien.*jour/.test(text);
  const memory = /souviens|memorise|rappelle-toi/.test(text);
  const overview = /bilan|solde|portefeuille|argent disponible|combien.*(reste|gagne|depense|revenu)|reste.*argent|ou part|ou.*depense|mes finances|situation financiere|analyse.*financ|revenus.*depenses|depenses.*revenus/.test(text);
  const update = /modifi|corrig|change|mettre a jour/.test(text);
  const remove = /supprim|effac|retir/.test(text);
  return {
    action, expense, income, borrowedDebt, loanGiven, financialTargets, budgets, goals, automations, premium, cotisations, projects, forecast, vital, memory, overview, update, remove,
    needsDebts: borrowedDebt || loanGiven || /dette|emprunt|pret|creance/.test(text) || overview,
    needsFinancialTargets: financialTargets || borrowedDebt || overview,
    needsIncomes: income || expense || budgets || borrowedDebt || overview,
    needsExpenses: expense || budgets || overview,
    needsGoals: goals,
    needsBudgets: budgets,
    needsAutomations: automations,
    needsCategories: expense || budgets,
    needsProjects: projects,
    needsVital: vital,
  };
}

export function selectAIToolsForIntent(allTools, intent, rawMessage = '') {
  if (!intent.action) return [];
  const text = normalize(rawMessage);
  const wanted = new Set();
  if (intent.borrowedDebt && !intent.financialTargets && !intent.update && !intent.remove) wanted.add('add_debt');
  if (intent.expense && !intent.financialTargets) {
    if (intent.remove) wanted.add('delete_expense');
    else if (intent.update) wanted.add('update_expense');
    else wanted.add('add_expense');
  }
  if (intent.income && !intent.expense && !intent.financialTargets && !intent.remove && !intent.update) wanted.add('add_income');
  if (intent.financialTargets) wanted.add('set_financial_targets');
  if (intent.budgets) wanted.add('apply_budget_plan');
  if (intent.goals) {
    if (intent.update) wanted.add('update_goal');
    else if (/creer|cree|nouvel|nouvelle|ouvrir|fais.*(objectif|tirelire|caisse)|ajout.*(objectif|tirelire|caisse)/.test(text) && !/verse|depose|depot/.test(text)) wanted.add('create_goal');
  }
  if (intent.automations) {
    if (/pause|arret|suspend/.test(text)) wanted.add('pause_automation');
    else if (/reprend|reactive|relance/.test(text)) wanted.add('resume_automation');
    else wanted.add('add_automation');
  }
  if (intent.forecast && intent.action) wanted.add('create_duration_forecast');
  if (intent.premium) {
    if (/statut|reste|combien.*jour|verifie|consulte/.test(text) && !/active|acheter|renouvelle|abonne/.test(text)) wanted.add('get_subscription_status');
    else if (/active|acheter|renouvelle|abonne|pay|regle/.test(text)) wanted.add('activate_premium_from_balance');
  }
  if (intent.memory) wanted.add('remember_user_context');
  return allTools.filter((tool) => wanted.has(tool.function?.name));
}

const money = (value) => Math.round(Number(value) || 0).toLocaleString('fr-FR');
const dateLabel = (value) => typeof value === 'string' ? value.slice(0, 10) : value?.toDate ? value.toDate().toISOString().slice(0, 10) : '';

export function buildCompactAIContext(data = {}, intent = {}) {
  const profile = data.profile || {};
  const incomes = Array.isArray(data.incomes) ? data.incomes : [];
  const expenses = Array.isArray(data.expenses) ? data.expenses : [];
  const debts = Array.isArray(data.debts) ? data.debts : [];
  const lines = [
    `Profil: ${profile.displayName || 'Utilisateur'}; devise d’affichage: ${profile.currency || 'XAF'}; solde du portefeuille Pata: ${money(profile.balance)} FCFA; expiration Premium: ${dateLabel(profile.premiumUntil) || 'non active'}.`,
    'Les montants de référence sont en FCFA. Le portefeuille Pata est un solde interne, pas un compte bancaire ni un Mobile Money.',
  ];
  if (intent.needsIncomes || intent.needsExpenses || intent.overview) {
    const ordinaryIncomes = incomes.filter((item) => item.flowType !== 'debt_borrowed' && item.categoryId !== 'debt_borrowed' && item.neutralFlow !== true);
    const borrowedIncomes = incomes.filter((item) => item.flowType === 'debt_borrowed' || item.categoryId === 'debt_borrowed');
    const incomeTotal = ordinaryIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const borrowedTotal = borrowedIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    lines.push(`Données récupérées : ${ordinaryIncomes.length} revenu(s) ordinaire(s), ${borrowedIncomes.length} emprunt(s), ${expenses.length} sortie(s). Revenus ordinaires : ${money(incomeTotal)} FCFA; emprunts reçus (flux neutres) : ${money(borrowedTotal)} FCFA; sorties : ${money(expenseTotal)} FCFA. Ce sont des extraits récents, pas nécessairement le cumul historique.`);
  }
  if (intent.needsIncomes) {
    lines.push('SOURCES DE REVENUS (utilise exactement les IDs ci-dessous; ne devine jamais):');
    lines.push(...incomes.slice(0, 25).map((item) => {
      const spent = expenses.filter((expense) => expense.incomeSourceId === item.id).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
      const sourceType = item.flowType === 'debt_borrowed' || item.neutralFlow ? 'emprunt (flux neutre)' : 'revenu ordinaire';
      return `ID ${item.id} | ${String(item.source || 'Revenu').slice(0, 55)} | type ${sourceType} | reçu ${money(item.amount)} FCFA | sorties associées récupérées ${money(spent)} FCFA | date ${dateLabel(item.date)}`;
    }));
  }
  if (intent.needsExpenses) {
    lines.push('DÉPENSES RÉCENTES (extrait, pas historique complet):');
    lines.push(...expenses.slice(0, 18).map((item) => `ID ${item.id} | ${dateLabel(item.date)} | ${money(item.amount)} FCFA | catégorie ${item.categoryId || 'non précisée'} | ${String(item.note || '').slice(0, 70)} | source ${item.incomeSourceId || 'all'}`));
  }
  if (intent.needsDebts) {
    lines.push('DETTES ET PRÊTS (les emprunts sont des flux neutres, pas des revenus gagnés):');
    lines.push(...debts.slice(0, 25).map((item) => `ID ${item.id} | ${item.type === 'i_owe' ? 'L’utilisateur doit' : 'On lui doit'} | ${item.counterpartyType === 'bank' ? 'Banque' : 'Personne'}: ${String(item.bankName || item.person || 'Créancier non précisé').slice(0, 65)} | montant initial ${money(item.amount)} FCFA | restant ${money(item.remaining)} FCFA | échéance ${item.dueDate || 'non définie'} | état ${item.status || 'inconnu'} | projet ${item.projectName || 'aucun'}`));
  }
  if (intent.needsFinancialTargets && data.financialTargets) {
    const target = data.financialTargets;
    lines.push('OBJECTIFS FINANCIERS DU MOIS:');
    lines.push(`Mois ${target.month || 'courant'} | cible revenus ${money(target.incomeTarget)} FCFA | plafond dépenses ${money(target.expenseLimit)} FCFA | plafond nouvelles dettes ${money(target.debtLimit)} FCFA | résolution: ${String(target.resolution || 'aucune').slice(0, 240)}`);
  }
  if (intent.needsCategories) {
    lines.push('CATÉGORIES PERSONNALISÉES:');
    lines.push(...(data.categories || []).slice(0, 25).map((item) => `ID ${item.id} | ${String(item.name || '').slice(0, 45)} | ${item.type || 'expense'}`));
  }
  if (intent.needsGoals) {
    lines.push('OBJECTIFS ET ÉPARGNE:');
    lines.push(...(data.goals || []).slice(0, 12).map((item) => {
      const saved = (item.deposits || []).reduce((sum, deposit) => sum + (Number(deposit.amount) || 0), 0);
      return `ID ${item.id} | ${String(item.name || 'Objectif').slice(0, 50)} | cible ${money(item.targetAmount)} FCFA | déposé ${money(saved)} FCFA | échéance ${item.deadline || 'libre'}`;
    }));
  }
  if (intent.needsBudgets) {
    lines.push('BUDGETS RÉCUPÉRÉS:');
    lines.push(...(data.budgets || []).slice(0, 20).map((item) => `${item.month || ''} | catégorie ${item.categoryId} | ${money(item.amount)} FCFA | source ${item.incomeSourceId || 'all'}`));
  }
  if (intent.needsAutomations) {
    lines.push('OPÉRATIONS PROGRAMMÉES:');
    lines.push(...(data.automations || []).slice(0, 12).map((item) => `ID ${item.id} | ${money(item.amount)} FCFA | ${item.categoryId} | ${item.frequency} | ${item.active === false ? 'en pause' : 'active'}`));
  }
  if (intent.needsProjects) {
    lines.push('PROJETS:');
    lines.push(...(data.projects || []).slice(0, 12).map((item) => `ID ${item.id} | ${String(item.name || '').slice(0, 50)} | état ${item.status || 'actif'}`));
  }
  if (intent.cotisations) {
    lines.push('COTISATIONS:');
    lines.push(...(data.cotisations || []).slice(0, 8).map((item) => {
      const head = `${item.name} | rôle ${item.role} | état ${item.status} | fréquence ${item.frequency || '—'} | mise ${money(item.contributionAmount)} FCFA | participants ${item.memberCount}/${item.expectedMembers} | échéance ${item.dueAt || '—'} | bénéficiaire ${item.currentBeneficiary || '—'} | reste personnel ${money(item.myRemaining)} FCFA | majoration due ${money(item.lateFeeDue)} FCFA | collecté ${money(item.totalCollected)} FCFA`;
      const members = (item.members || []).slice(0, 20).map((member) => `  - ${member.position || '—'} ${member.displayName}: versé ${money(member.principalPaid)} FCFA, majoration ${money(member.penaltyPaid)} FCFA, reste ${money(member.remainingPrincipal)} FCFA`);
      return [head, ...members].join('\\n');
    }));
  }
  if (intent.needsVital) {
    const needs = profile.vitalNeeds || {};
    lines.push('PRÉVISIONS VITALES DÉCLARÉES:');
    lines.push(...Object.entries(needs).slice(0, 20).map(([category, item]) => `${category} | ${money(item?.amount)} FCFA | fréquence ${item?.frequency || 'non définie'}`));
    lines.push('PRÉVISIONS DE DURÉE DU CAPITAL:');
    lines.push(...(Array.isArray(profile.durationForecasts) ? profile.durationForecasts.slice(0, 8) : []).map((item) => `${item.name || 'Prévision'} | capital ${money(item.capital)} FCFA | durée estimée ${item.estimatedDays || '—'} jour(s) | fin ${item.estimatedEndDate || 'non définie'}`));
  }
  if (intent.memory && Array.isArray(data.memories)) {
    lines.push('PRÉFÉRENCES EXPLICITEMENT MÉMORISÉES:');
    lines.push(...data.memories.slice(0, 12).map((item) => `[${item.kind || 'contexte'}] ${String(item.fact || '').slice(0, 120)}`));
  }
  return lines.join('\n').slice(0, 10500);
}

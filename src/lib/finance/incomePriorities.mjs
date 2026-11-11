function validDate(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}
function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}
function money(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('fr-FR') + ' FCFA';
}
export function buildIncomePriorityReminder({ amount, debts = [], bills = [], goals = [], today }) {
  const currentDate = validDate(today);
  if (!currentDate) throw new TypeError('La date de référence est invalide.');
  const payableDebts = debts
    .filter((debt) => debt.type === 'i_owe'
      && ['active', 'partial', 'late'].includes(debt.status)
      && Number(debt.remaining) > 0)
    .sort((a, b) => {
      const aDate = validDate(a.dueDate) || '9999-12-31';
      const bDate = validDate(b.dueDate) || '9999-12-31';
      return aDate.localeCompare(bDate) || (Number(b.remaining) || 0) - (Number(a.remaining) || 0);
    })
    .slice(0, 2);
  const upcomingBills = bills
    .filter((bill) => bill.active !== false)
    .map((bill) => ({ ...bill, due: validDate(bill.nextDueDate) }))
    .filter((bill) => bill.due && daysBetween(currentDate, bill.due) <= 30)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 2);
  const savingsGoals = goals
    .filter((goal) => goal.type === 'goal' && !goal.closed && !goal.withdrawnAt)
    .sort((a, b) => String(a.deadline || '9999-12-31').localeCompare(String(b.deadline || '9999-12-31')))
    .slice(0, 1);
  if (!payableDebts.length && !upcomingBills.length && !savingsGoals.length) return null;
  const priorities = [];
  payableDebts.forEach((debt) => {
    priorities.push('dette envers ' + String(debt.person || 'un créancier').slice(0, 45)
      + ' : ' + money(debt.remaining));
  });
  upcomingBills.forEach((bill) => {
    const dueLabel = bill.due < currentDate ? 'en retard' : 'échéance ' + bill.due.split('-').reverse().join('/');
    const estimate = Number(bill.amount) > 0 ? ' (' + money(bill.amount) + ')' : '';
    priorities.push(String(bill.name || 'Facture').slice(0, 35) + ' : ' + dueLabel + estimate);
  });
  savingsGoals.forEach((goal) => {
    priorities.push('objectif « ' + String(goal.name || 'Épargne').slice(0, 28) + ' » à alimenter depuis le portefeuille après recharge');
  });
  const priorityText = priorities.slice(0, 3).join(' ; ').slice(0, 115);
  const title = 'Ton revenu est enregistré : pense à tes engagements';
  const body = ('Revenu ' + money(amount) + ' reçu. À vérifier : '
    + priorityText + '. Pata ne déplace rien ; l’épargne vient du portefeuille.').slice(0, 220);
  return {
    title,
    body,
    target: payableDebts.length ? '/debts' : upcomingBills.length ? '/bills' : '/goals',
    source: 'income_priority_reminder',
    priorityDebtCount: payableDebts.length,
    priorityBillCount: upcomingBills.length,
    priorityGoalCount: savingsGoals.length,
  };
}

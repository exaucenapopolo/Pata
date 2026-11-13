const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.pata-yam.site').replace(/\/$/, '');
function getConfiguredFromAddress() {
  // L’expéditeur doit appartenir au domaine exact vérifié dans Resend.
  // Accepte une adresse simple ou le format « Pata <adresse@domaine> ».
  const configured = String(process.env.RESEND_FROM_EMAIL || '').trim().replace(/,\s*$/, '');
  if (!configured || /[\r\n]/.test(configured)) {
    throw new Error('RESEND_FROM_EMAIL est absente ou invalide. Configure une adresse appartenant au domaine vérifié dans Resend.');
  }

  const addressPattern = /^[A-Z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
  if (addressPattern.test(configured)) return 'Pata <' + configured + '>';

  const formattedMatch = configured.match(/^([^<>\r\n]{1,80})<\s*([^<>\s]+)\s*>$/);
  if (formattedMatch && addressPattern.test(formattedMatch[2])) {
    return formattedMatch[1].trim() + ' <' + formattedMatch[2] + '>';
  }

  throw new Error('RESEND_FROM_EMAIL doit être une adresse valide ou au format « Pata <adresse@domaine> ». Vérifie aussi que le domaine correspond exactement à celui vérifié dans Resend.');
}
const SUPPORT_PHONE = '237681144638';

export function escapeEmailHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export function renderPataEmail({ preheader = '', eyebrow = 'PATA', headline, intro = '', bodyHtml = '', ctaLabel = 'Ouvrir Pata', ctaUrl = '/dashboard', signoff = 'L’équipe Pata' }) {
  const safeHeadline = escapeEmailHtml(headline || 'Un message de Pata');
  const safeIntro = intro ? '<p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.75;">' + escapeEmailHtml(intro) + '</p>' : '';
  const destination = new URL(ctaUrl, APP_URL).toString();
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeHeadline}</title></head>
  <body style="margin:0;padding:0;background:#f3f6f5;font-family:Arial,Helvetica,sans-serif;color:#17231f;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeEmailHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f5;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3eae6;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:26px 30px 20px;border-bottom:1px solid #edf1ee;">
        <a href="${APP_URL}" style="display:inline-block;text-decoration:none;"><img src="${APP_URL}/android-chrome-192x192.png" width="42" height="42" alt="Pata" style="display:block;border-radius:10px;border:0;"></a>
        <div style="margin-top:12px;color:#0b5c46;font-size:10px;font-weight:700;letter-spacing:2px;">${escapeEmailHtml(eyebrow)}</div>
      </td></tr>
      <tr><td style="padding:30px;">
        <h1 style="margin:0 0 16px;color:#10231b;font-size:25px;line-height:1.3;letter-spacing:-.4px;">${safeHeadline}</h1>
        ${safeIntro}
        ${bodyHtml}
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;"><tr><td bgcolor="#0b5c46" style="border-radius:9px;">
          <a href="${destination}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeEmailHtml(ctaLabel)}</a>
        </td></tr></table>
        <p style="margin:25px 0 0;color:#475569;font-size:13px;line-height:1.7;">${escapeEmailHtml(signoff)}</p>
      </td></tr>
      <tr><td style="padding:20px 22px;background:#f8faf9;border-top:1px solid #edf1ee;">
        <div style="color:#64748b;font-size:11px;line-height:1.7;">
          Besoin d’aide ? <a href="https://wa.me/${SUPPORT_PHONE}?text=Bonjour%20Pata%2C%20j%E2%80%99ai%20besoin%20d%E2%80%99aide." style="color:#0b5c46;text-decoration:none;font-weight:700;">Contacter l’assistance Pata sur WhatsApp</a><br>
          <a href="${APP_URL}/support" style="color:#0b5c46;text-decoration:none;font-weight:700;">Centre d’assistance</a> ·
          <a href="${APP_URL}/confidentialite" style="color:#0b5c46;text-decoration:none;">Confidentialité</a><br>
          © ${new Date().getFullYear()} Pata · Gestion financière personnelle
        </div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendPataEmail({ to, subject, html, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY est absente de la configuration serveur.');
  if (!to || !String(to).includes('@')) throw new Error('Adresse e-mail destinataire invalide.');
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 256);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({ from: getConfiguredFromAddress(), to: [to], subject, html }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error || `Resend a répondu avec le statut ${response.status}.`;
    throw new Error(String(detail).slice(0, 500));
  }
  return { id: data.id || null };
}

export function welcomeEmail({ name, referrerName }) {
  const displayName = name || 'et bienvenue';
  const referralIntro = referrerName ? `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #dcebe2;border-radius:12px;background:#f3faf6;color:#244b39;font-size:13px;line-height:1.7;">Tu as rejoint Pata grâce à l’invitation de <strong>${escapeEmailHtml(referrerName)}</strong>. Tu peux activer ton premier mois de Pata Premium à <strong>1 250 FCFA au lieu de 2 500 FCFA</strong>. Cette offre est réservée à une première souscription admissible.</div>` : '';
  const bodyHtml = `
    ${referralIntro}
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.75;">Ton espace Pata est prêt. Tu peux maintenant organiser ton argent et prendre de meilleures décisions à partir de tes propres données.</p>
    <div style="margin:18px 0;padding:17px 18px;background:#f6f9f7;border:1px solid #e5eee8;border-radius:12px;">
      <div style="font-size:14px;font-weight:700;color:#163b2d;margin-bottom:10px;">Pour bien commencer</div>
      <div style="color:#475569;font-size:13px;line-height:1.9;">
        <strong>1.</strong> Enregistre tes dépenses pour savoir où part ton argent.<br>
        <strong>2.</strong> Ajoute tes revenus pour avoir une vue claire de tes entrées d’argent.<br>
        <strong>3.</strong> Prépare un budget adapté à tes moyens.<br>
        <strong>4.</strong> Crée une épargne et suis sa progression.<br>
        <strong>5.</strong> Consulte les rapports pour comprendre ton évolution.
      </div>
    </div>
    <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.7;">Tu peux aussi échanger avec <strong>Mč, l’assistante intelligente de Pata</strong>. Elle t’aide à lire tes chiffres, analyser tes dépenses, préparer un budget, réfléchir à ton épargne et répondre à tes questions à partir des informations disponibles dans ton compte.</p>
    <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">La version gratuite permet de commencer. Lorsque tu souhaites accéder à davantage de possibilités, tu peux découvrir <a href="${APP_URL}/premium" style="color:#0b5c46;font-weight:700;">Pata Premium</a>.</p>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8eeea;">
      <div style="margin-bottom:10px;color:#475569;font-size:12px;font-weight:700;">Accès rapides à ton espace</div>
      <table role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding:0 7px 7px 0;"><a href="${APP_URL}/expenses" style="display:inline-block;padding:9px 12px;border:1px solid #dbe6df;border-radius:8px;color:#0b5c46;text-decoration:none;font-size:12px;font-weight:700;">Ajouter une dépense</a></td>
          <td style="padding:0 7px 7px 0;"><a href="${APP_URL}/income" style="display:inline-block;padding:9px 12px;border:1px solid #dbe6df;border-radius:8px;color:#0b5c46;text-decoration:none;font-size:12px;font-weight:700;">Ajouter un revenu</a></td>
        </tr>
        <tr>
          <td style="padding:0 7px 0 0;"><a href="${APP_URL}/goals" style="display:inline-block;padding:9px 12px;border:1px solid #dbe6df;border-radius:8px;color:#0b5c46;text-decoration:none;font-size:12px;font-weight:700;">Mon épargne</a></td>
          <td style="padding:0 7px 0 0;"><a href="${APP_URL}/reports" style="display:inline-block;padding:9px 12px;border:1px solid #dbe6df;border-radius:8px;color:#0b5c46;text-decoration:none;font-size:12px;font-weight:700;">Mes rapports</a></td>
        </tr>
      </table>
    </div>`;
  return renderPataEmail({ preheader: 'Ton espace personnel est prêt.', eyebrow: 'BIENVENUE SUR PATA', headline: `Bienvenue sur Pata, ${displayName}.`, intro: 'Merci de nous avoir confié une partie de ton organisation financière.', bodyHtml, ctaLabel: 'Accéder à mon tableau de bord', ctaUrl: '/dashboard' });
}

export function savingsCreatedEmail({ name, goalName, type, targetAmount, deadline, frequencyDays }) {
  const details = [
    ['Épargne', goalName],
    ['Type', type === 'goal' ? 'Objectif avec échéance' : 'Tirelire libre'],
    ['Montant cible', targetAmount ? `${Number(targetAmount).toLocaleString('fr-FR')} FCFA` : 'Non défini'],
    ...(deadline ? [['Échéance', deadline]] : []),
    ...(frequencyDays && type === 'goal' ? [['Fréquence des versements', `Tous les ${frequencyDays} jour(s)`]] : []),
  ];
  const rows = details.map(([label, value]) => `<tr><td style="padding:9px 0;color:#64748b;font-size:12px;border-bottom:1px solid #e8eeea;">${escapeEmailHtml(label)}</td><td align="right" style="padding:9px 0;color:#173b2c;font-size:13px;font-weight:700;border-bottom:1px solid #e8eeea;">${escapeEmailHtml(value)}</td></tr>`).join('');
  const bodyHtml = `
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.75;">Bravo ${escapeEmailHtml(name || '')} ! Tu viens de donner une forme concrète à un projet. Chaque versement régulier te rapproche de ton objectif.</p>
    <div style="padding:16px 18px;border:1px solid #e5eee8;border-radius:12px;background:#f8faf9;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></div>
    <p style="margin:18px 0 0;color:#475569;font-size:13px;line-height:1.75;">Pense à respecter le rythme que tu as choisi et à enregistrer chaque versement dans Pata. Tu pourras suivre ta progression depuis ta fiche d’épargne.</p>`;
  return renderPataEmail({ preheader: 'Ton nouvel objectif d’épargne est enregistré.', eyebrow: 'UNE NOUVELLE ÉPARGNE', headline: 'Félicitations pour cette décision.', bodyHtml, ctaLabel: 'Voir mon épargne', ctaUrl: '/goals' });
}

export function pinResetEmail({ code, name }) {
  const bodyHtml = `
    <p style="margin:0 0 15px;color:#334155;font-size:14px;line-height:1.7;">Bonjour ${escapeEmailHtml(name || '')}, voici le code demandé pour réinitialiser ton code secret Pata.</p>
    <div style="padding:18px;text-align:center;border:1px solid #e5eee8;border-radius:12px;background:#f8faf9;color:#123d2c;font-size:30px;font-weight:700;letter-spacing:8px;">${escapeEmailHtml(code)}</div>
    <p style="margin:15px 0 0;color:#64748b;font-size:12px;line-height:1.7;">Ce code est valable pendant 15 minutes. Ne le communique à personne. Si tu n’es pas à l’origine de cette demande, ignore ce message.</p>`;
  return renderPataEmail({ preheader: 'Ton code de vérification Pata est prêt.', eyebrow: 'SÉCURITÉ DU COMPTE', headline: 'Vérification de ton identité', bodyHtml, ctaLabel: 'Ouvrir Pata', ctaUrl: '/settings' });
}


function cotisationDetailsTable(rows = []) {
  const items = rows.filter((row) => row && row[1] !== undefined && row[1] !== null && row[1] !== '');
  return `<div style="margin:18px 0;padding:16px 18px;border:1px solid #e5eee8;border-radius:12px;background:#f8faf9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items.map(([label, value]) => `<tr><td style="padding:9px 0;color:#64748b;font-size:12px;border-bottom:1px solid #e8eeea;">${escapeEmailHtml(label)}</td><td align="right" style="padding:9px 0;color:#173b2c;font-size:13px;font-weight:700;border-bottom:1px solid #e8eeea;">${escapeEmailHtml(value)}</td></tr>`).join('')}</table>
  </div>`;
}

export function cotisationCreatedEmail({ name, groupName, contributionAmount, frequency, expectedMembers, dueLabel, graceDays, penaltyLabel, inviteUrl }) {
  const rows = [
    ['Groupe', groupName],
    ['Ta contribution par période', Number(contributionAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
    ['Fréquence', frequency],
    ['Nombre de participants prévu', String(expectedMembers || 0)],
    ['Échéance de paiement', dueLabel],
    ['Délai de grâce', String(graceDays ?? 0) + ' jour(s)'],
    ['Règle de retard', penaltyLabel || 'Aucune majoration'],
  ];
  const bodyHtml = `
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, ta cotisation a bien été créée sur Pata. Tu es le chef du groupe : tu peux inviter les participants, définir leur ordre de passage et lancer la collecte lorsque le nombre de membres prévu sera atteint.</p>
    ${cotisationDetailsTable(rows)}
    <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.75;">Avant le démarrage, vérifie les paramètres du groupe et partage le lien uniquement avec les personnes qui doivent réellement participer. Une fois les versements commencés, l’ordre de passage sera verrouillé pour protéger les tours de chacun.</p>
    ${inviteUrl ? `<p style="margin:0;color:#334155;font-size:13px;line-height:1.7;">Lien d’invitation : <a href="${escapeEmailHtml(inviteUrl)}" style="color:#0b5c46;font-weight:700;">rejoindre le groupe ${escapeEmailHtml(groupName)}</a></p>` : ''}
  `;
  return renderPataEmail({ preheader: 'Ton groupe de cotisation est créé.', eyebrow: 'NOUVEAU GROUPE DE COTISATION', headline: 'Ton groupe est prêt à être organisé.', bodyHtml, ctaLabel: 'Gérer ma cotisation', ctaUrl: '/cotisations' });
}

export function cotisationJoinedEmail({ name, groupName, ownerName, contributionAmount, frequency, position, expectedMembers, joinedMembers, remainingMembers, dueLabel, groupUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, ton adhésion au groupe <strong>${escapeEmailHtml(groupName || 'de cotisation')}</strong> a été enregistrée. Le chef du groupe est ${escapeEmailHtml(ownerName || 'l’organisateur')}.</p>
    ${cotisationDetailsTable([
      ['Groupe', groupName],
      ['Chef du groupe', ownerName],
      ['Contribution prévue', Number(contributionAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Fréquence', frequency],
      ['Ta position actuelle', position ? String(position) : 'À confirmer par le chef'],
      ['Participants déjà inscrits', String(joinedMembers ?? '—')],
      ['Places encore disponibles', String(remainingMembers ?? '—')],
      ['Participants attendus', String(expectedMembers || 0)],
      ['Échéance prévue', dueLabel],
    ])}
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">Le chef peut encore organiser les positions tant que le groupe n’a pas démarré. Les versements commenceront lorsque toutes les places seront prises et que le chef aura lancé la cotisation. Tu peux retrouver les informations et les prochains versements dans ton espace Pata.</p>`;
  return renderPataEmail({ preheader: 'Ton adhésion au groupe a été confirmée.', eyebrow: 'ADHÉSION CONFIRMÉE', headline: 'Tu as rejoint une cotisation.', bodyHtml, ctaLabel: 'Suivre ma cotisation', ctaUrl: groupUrl || '/cotisations' });
}

export function cotisationStartedEmail({ name, groupName, contributionAmount, frequency, position, beneficiaryName, turnAmount, dueLabel, expectedMembers }) {
  const bodyHtml = `
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, le chef a lancé le groupe <strong>${escapeEmailHtml(groupName || '')}</strong>. Les positions sont maintenant fixées et les versements de cette période peuvent commencer.</p>
    ${cotisationDetailsTable([
      ['Groupe', groupName],
      ['Ta position dans le groupe', String(position || '—')],
      ['Contribution par période', Number(contributionAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Fréquence', frequency],
      ['Bénéficiaire du tour', beneficiaryName || 'À confirmer'],
      ['Montant collectif prévu', Number(turnAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Date limite de paiement', dueLabel],
      ['Nombre de participants', String(expectedMembers || 0)],
    ])}
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">Tu peux verser en plusieurs fois depuis ton espace Cotisations. Chaque paiement est vérifié avant d’être ajouté au total du groupe.</p>`;
  return renderPataEmail({ preheader: 'Les versements de ton groupe peuvent commencer.', eyebrow: 'COTISATION LANCÉE', headline: 'Le groupe a officiellement démarré.', bodyHtml, ctaLabel: 'Effectuer ma cotisation', ctaUrl: '/cotisations' });
}

export function cotisationTurnEmail({ name, groupName, frequency, position, contributionAmount, totalAmount, dueLabel, isMyTurn }) {
  const bodyHtml = `
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, voici l’information concernant ton tour dans le groupe <strong>${escapeEmailHtml(groupName || '')}</strong>. Le chef a défini l’ordre de passage avant le démarrage de la cotisation.</p>
    ${cotisationDetailsTable([
      ['Groupe', groupName],
      ['Ta position', String(position || '—')],
      ['Fréquence', frequency],
      ['Contribution par membre', Number(contributionAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Montant total prévu pour le bénéficiaire', Number(totalAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Échéance de la période', dueLabel],
      ['Bénéficiaire de ce tour', isMyTurn ? 'Toi' : 'Un autre membre'],
    ])}
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">Même si c’est ton tour de recevoir, tu dois également verser ta propre contribution comme les autres membres. Le retrait ne devient disponible qu’après confirmation de toutes les contributions et validation de la demande par l’administration.</p>`;
  return renderPataEmail({ preheader: 'Ton ordre de passage est disponible.', eyebrow: 'ORDRE DE PASSAGE', headline: isMyTurn ? 'Tu es le bénéficiaire de ce tour.' : 'Ton tour de cotisation est planifié.', bodyHtml, ctaLabel: 'Voir l’ordre et les versements', ctaUrl: '/cotisations' });
}

export function cotisationDueEmail({ name, groupName, contributionAmount, paidAmount, remainingAmount, dueLabel, graceDays, lateFeeLabel, overdue = false, upcoming = false }) {
  const timingIntro = overdue
    ? 'la période de grâce de ta cotisation est arrivée à son terme.'
    : upcoming
      ? 'la date limite de contribution de ton groupe est prévue dans trois jours.'
      : 'la date limite de contribution de ton groupe est aujourd’hui.';
  const bodyHtml = `
    <p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, ${timingIntro} Nous t’écrivons pour que tu puisses vérifier ta situation avant la clôture de la période.</p>
    ${cotisationDetailsTable([
      ['Groupe', groupName],
      ['Montant prévu pour toi', Number(contributionAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Déjà versé et confirmé', Number(paidAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Reste à verser', Number(remainingAmount || 0).toLocaleString('fr-FR') + ' FCFA'],
      ['Date limite', dueLabel],
      ['Délai de grâce défini par le chef', String(graceDays ?? 0) + ' jour(s)'],
      ['Règle de retard', lateFeeLabel || 'Aucune majoration'],
    ])}
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">${overdue
      ? 'Selon les règles du groupe, une majoration peut maintenant s’appliquer à ton prochain versement. Son montant exact sera affiché avant de confirmer le paiement.'
      : upcoming
        ? 'Tu disposes encore de trois jours pour organiser ton versement. Tu peux cotiser petit à petit depuis Pata.'
        : 'Tu peux cotiser petit à petit depuis Pata. Le total versé sera mis à jour uniquement après confirmation effective du paiement par le service de paiement.'} Si tu as déjà effectué un versement, vérifie son statut dans ton espace avant de recommencer.</p>`;
  return renderPataEmail({
    preheader: overdue
      ? 'La période de grâce de ta cotisation est terminée.'
      : upcoming
        ? 'Ta cotisation arrive à échéance dans trois jours.'
        : 'La date limite de cotisation est arrivée.',
    eyebrow: 'RAPPEL DE COTISATION',
    headline: overdue
      ? 'Pense à régulariser ta contribution.'
      : upcoming
        ? 'Prépare ton versement avant l’échéance.'
        : 'La date de cotisation est arrivée.',
    bodyHtml,
    ctaLabel: 'Voir ma cotisation',
    ctaUrl: '/cotisations',
  });
}


export function cotisationOwnerJoinedEmail({ ownerName, joinerName, groupName, contributionAmount, frequency, joinedMembers, expectedMembers, remainingMembers, dueLabel, groupUrl }) {
 const bodyHtml = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(ownerName || '')}, une nouvelle personne vient de rejoindre ton groupe <strong>${escapeEmailHtml(groupName || 'de cotisation')}</strong>. Voici le point actualisé pour préparer son lancement.</p>${cotisationDetailsTable([['Groupe',groupName],['Nouveau membre',joinerName || 'Nouveau participant'],['Contribution par personne',Number(contributionAmount || 0).toLocaleString('fr-FR')+' FCFA'],['Fréquence',frequency],['Participants inscrits',String(joinedMembers || 0)+' / '+String(expectedMembers || 0)],['Places restantes',String(remainingMembers || 0)],['Échéance prévue',dueLabel]])}<p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">${remainingMembers > 0 ? 'Il reste encore '+remainingMembers+' place(s) à pourvoir. Tu peux inviter d’autres participants, consulter les coordonnées communiquées et vérifier les paramètres du groupe.' : 'Le groupe est complet. Tu peux vérifier les informations, définir les positions de passage et lancer la cotisation.'}</p>`;
 return renderPataEmail({preheader:'Un nouveau membre a rejoint ton groupe.',eyebrow:'NOUVELLE ADHÉSION',headline:'Une nouvelle personne a rejoint ton groupe.',bodyHtml,ctaLabel:'Gérer mon groupe',ctaUrl:groupUrl || '/cotisations'});
}
export function cotisationContributionPaidEmail({name,groupName,amount,paidAmount,remainingAmount,contributionAmount,dueLabel,daysRemaining}) {
 const bodyHtml = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, ton versement de ${Number(amount || 0).toLocaleString('fr-FR')} FCFA pour le groupe <strong>${escapeEmailHtml(groupName || '')}</strong> a été confirmé et ajouté à ta contribution.</p>${cotisationDetailsTable([['Groupe',groupName],['Versement confirmé',Number(amount || 0).toLocaleString('fr-FR')+' FCFA'],['Total déjà versé',Number(paidAmount || 0).toLocaleString('fr-FR')+' FCFA'],['Contribution attendue',Number(contributionAmount || 0).toLocaleString('fr-FR')+' FCFA'],['Reste à contribuer',Number(remainingAmount || 0).toLocaleString('fr-FR')+' FCFA'],['Date limite',dueLabel || 'Selon le calendrier du groupe'],['Temps restant',daysRemaining == null ? 'Non précisé' : (daysRemaining <= 0 ? 'Échéance atteinte' : daysRemaining+' jour(s)')]])}<p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">Tu peux consulter l’état des contributions du groupe à tout moment depuis ton espace Pata.</p>`;
 return renderPataEmail({preheader:'Ton versement de cotisation a été confirmé.',eyebrow:'VERSEMENT CONFIRMÉ',headline:'Ton paiement a bien été enregistré.',bodyHtml,ctaLabel:'Voir ma cotisation',ctaUrl:'/cotisations'});
}
export function financialReminderEmail({name,headline,message,category,amount,budgetAmount,targetUrl='/dashboard'}) {
 const bodyHtml = `<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(name || '')}, ${escapeEmailHtml(message || '')}</p>${category ? cotisationDetailsTable([['Catégorie concernée',category],...(amount != null ? [['Dépenses constatées',Number(amount).toLocaleString('fr-FR')+' FCFA']] : []),...(budgetAmount != null ? [['Budget défini',Number(budgetAmount).toLocaleString('fr-FR')+' FCFA']] : [])]) : ''}<p style="margin:0;color:#475569;font-size:13px;line-height:1.75;">Retrouve les détails dans ton espace Pata pour comprendre la situation et décider de la suite.</p>`;
 return renderPataEmail({preheader:headline || 'Un point sur tes finances.',eyebrow:'TON SUIVI FINANCIER',headline:headline || 'Un point mérite ton attention.',bodyHtml,ctaLabel:'Consulter mon espace',ctaUrl:targetUrl});
}
export function customAdminEmail({ name, headline, body, ctaUrl = '/dashboard', ctaLabel = 'Ouvrir Pata' }) {
  const paragraphs = String(body || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => `<p style="margin:0 0 13px;color:#334155;font-size:14px;line-height:1.75;">${escapeEmailHtml(line.replaceAll('{nom}', name || ''))}</p>`).join('');
  return renderPataEmail({ preheader: headline, eyebrow: 'MESSAGE PERSONNEL DE PATA', headline: headline || 'Un message pour toi', bodyHtml: paragraphs, ctaLabel, ctaUrl, signoff: 'Avec toute notre considération — L’équipe Pata' });
}


export function referralJoinedEmail({ referrerName, invitedName }) {
  const bodyHtml = `
    <p style="margin:0 0 15px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(referrerName || '')}, <strong>${escapeEmailHtml(invitedName || 'Une personne')}</strong> vient de créer un compte Pata avec ton lien de parrainage.</p>
    <div style="margin:16px 0;padding:16px;border:1px solid #e5eee8;border-radius:12px;background:#f8faf9;">
      <div style="color:#64748b;font-size:11px;font-weight:700;">BONUS DE PARRAINAGE EN ATTENTE</div>
      <div style="margin-top:5px;color:#123d2c;font-size:26px;font-weight:700;">1 000 FCFA</div>
      <p style="margin:8px 0 0;color:#475569;font-size:13px;line-height:1.7;">Ce bonus sera crédité dans ton solde de parrainage lorsque cette personne aura payé et activé un abonnement Pata Premium. La simple création du compte ne déclenche pas le paiement du bonus.</p>
    </div>
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.7;">Tu peux déjà retrouver cette inscription et suivre son statut dans tes paramètres Pata.</p>`;
  return renderPataEmail({
    preheader: 'Une personne vient de rejoindre Pata grâce à ton invitation.',
    eyebrow: 'PARRAINAGE PATA',
    headline: 'Ton invitation a été utilisée.',
    bodyHtml,
    ctaLabel: 'Suivre mon parrainage',
    ctaUrl: '/settings',
  });
}


export function referralRewardActivatedEmail({ referrerName, invitedName }) {
  const bodyHtml = `
    <p style="margin:0 0 15px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ${escapeEmailHtml(referrerName || '')}, l'abonné(e) que tu as invité(e), <strong>${escapeEmailHtml(invitedName || 'ton filleul')}</strong>, vient d'activer Pata Premium.</p>
    <div style="margin:16px 0;padding:16px;border:1px solid #dcebe2;border-radius:12px;background:#f3faf6;">
      <div style="color:#64748b;font-size:11px;font-weight:700;">BONUS CRÉDITÉ</div>
      <div style="margin-top:5px;color:#123d2c;font-size:26px;font-weight:700;">+1 000 FCFA</div>
      <p style="margin:8px 0 0;color:#475569;font-size:13px;line-height:1.7;">Le montant est disponible dans ton solde de parrainage, séparé de ton portefeuille. Tu peux le transférer vers ton portefeuille, une épargne ou une cotisation.</p>
    </div>`;
  return renderPataEmail({
    preheader: 'Ton bonus de parrainage Pata a été crédité.',
    eyebrow: 'BONUS DE PARRAINAGE',
    headline: 'Ton filleul a activé Premium.',
    bodyHtml,
    ctaLabel: 'Gérer mon solde de parrainage',
    ctaUrl: '/settings',
  });
}

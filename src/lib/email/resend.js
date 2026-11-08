const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.pata-yam.site').replace(/\/$/, '');
const FROM = process.env.RESEND_FROM_EMAIL || 'Pata <notifications@socialboosthorizon.com>';
const SUPPORT_PHONE = '12424542961';

export function escapeEmailHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

const partners = [
  { name: 'Social Boost Horizon', description: 'Développe ta présence sur les réseaux sociaux.', url: 'https://socialboosthorizon.com/' },
  { name: 'Texerra SMS', description: 'Obtiens un numéro étranger pour tes inscriptions en ligne.', url: 'https://www.texerra.site/' },
  { name: 'TRIXHUB', description: 'Découvre une plateforme de tâches rémunérées.', url: 'https://www.trixhub.store/?ref=EXA0001HJB' },
];

export function renderPataEmail({ preheader = '', eyebrow = 'PATA', headline, intro = '', bodyHtml = '', ctaLabel = 'Ouvrir Pata', ctaUrl = '/dashboard', signoff = 'L’équipe Pata' }) {
  const safeHeadline = escapeEmailHtml(headline || 'Un message de Pata');
  const safeIntro = intro ? '<p style="margin:0 0 18px;color:#475569;font-size:15px;line-height:1.75;">' + escapeEmailHtml(intro) + '</p>' : '';
  const destination = new URL(ctaUrl, APP_URL).toString();
  const partnerHtml = partners.map((partner) => `
    <td style="width:33.33%;vertical-align:top;padding:8px 7px;">
      <a href="${partner.url}" style="color:#0b5c46;text-decoration:none;font-weight:700;font-size:12px;">${escapeEmailHtml(partner.name)}</a>
      <div style="margin-top:5px;color:#64748b;font-size:11px;line-height:1.5;">${escapeEmailHtml(partner.description)}</div>
    </td>`).join('');
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
        <div style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.3px;margin:0 0 8px;">DÉCOUVRIR AUSSI</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${partnerHtml}</tr></table>
        <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5ebe7;color:#64748b;font-size:11px;line-height:1.7;">
          Besoin d’aide ? <a href="https://wa.me/${SUPPORT_PHONE}?text=Bonjour%20Pata%2C%20j%E2%80%99ai%20besoin%20d%E2%80%99aide." style="color:#0b5c46;text-decoration:none;font-weight:700;">Contacter l’assistance sur WhatsApp</a><br>
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
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error || `Resend a répondu avec le statut ${response.status}.`;
    throw new Error(String(detail).slice(0, 500));
  }
  return { id: data.id || null };
}

export function welcomeEmail({ name }) {
  const displayName = name || 'et bienvenue';
  const bodyHtml = `
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

export function customAdminEmail({ name, headline, body, ctaUrl = '/dashboard', ctaLabel = 'Ouvrir Pata' }) {
  const paragraphs = String(body || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .map((line) => `<p style="margin:0 0 13px;color:#334155;font-size:14px;line-height:1.75;">${escapeEmailHtml(line.replaceAll('{nom}', name || ''))}</p>`).join('');
  return renderPataEmail({ preheader: headline, eyebrow: 'MESSAGE PERSONNEL DE PATA', headline: headline || 'Un message pour toi', bodyHtml: paragraphs, ctaLabel, ctaUrl, signoff: 'Avec toute notre considération,<br><strong>L’équipe Pata</strong>' });
}

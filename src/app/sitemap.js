const SITE_URL = 'https://www.pata-yam.site';

const publicPaths = [
  '/',
  '/fonctionnalites',
  '/abonnement',
  '/telecharger',
  '/support',
  '/conditions',
  '/confidentialite',
];

export default function sitemap() {
  const lastModified = new Date();
  return publicPaths.map((path) => ({
    url: SITE_URL + path,
    lastModified,
    changeFrequency: path === '/' || path === '/fonctionnalites' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/fonctionnalites' ? 0.95 : path === '/abonnement' ? 0.9 : 0.6,
  }));
}

const SITE_URL = 'https://www.pata-yam.site';

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: SITE_URL + '/sitemap.xml',
  };
}

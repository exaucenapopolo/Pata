import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pata.app',
  appName: 'Pata',
  webDir: 'www',
  server: {
    url: 'https://www.pata-yam.site',
    cleartext: false,
    allowNavigation: ['www.pata-yam.site', 'pata-yam.site'],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f5f8f6',
  },
};

export default config;

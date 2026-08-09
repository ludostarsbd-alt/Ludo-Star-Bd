import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.starbd.ludo',
  appName: 'LUDO STAR BD',
  webDir: 'dist/public',
  server: {
    url: 'https://ludo-914--crickets1.replit.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    allowsLinkPreview: false,
    contentInset: 'automatic',
  },
};

export default config;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep provider logos as local hashed files instead of inlining them into JS.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const packagePath = id.split('node_modules/')[1] || '';
          if (/^(react|react-dom|scheduler|use-sync-external-store)(\/|$)/.test(packagePath)
            || /^(@reduxjs\/|react-redux(?:\/|$))/.test(packagePath)) return 'vendor-react';
          if (/^react-router(?:\/|$)/.test(packagePath)) return 'vendor-router';
          if (/^(react-quill-new|quill)(\/|$)/.test(packagePath)) return 'vendor-editor';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('axios')) return 'vendor-http';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000',
    },
  },
});

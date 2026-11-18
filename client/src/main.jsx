import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import store from './store/store';
import App from './App';
import './styles/globals.css';
import './i18n';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={10}
        toastOptions={{
          duration: 2500,
          style: {
            background: '#fff',
            color: '#111827',
            padding: '12px 18px',
            borderRadius: '14px',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.04)',
            maxWidth: '380px',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#fff' },
            style: { borderLeft: '4px solid #22c55e' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
            style: { borderLeft: '4px solid #ef4444' },
          },
        }}
      />
    </Provider>
  </React.StrictMode>
);

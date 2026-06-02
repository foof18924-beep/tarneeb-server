import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import i18n from './i18n';

// Set document direction based on language
document.documentElement.dir = i18n.language.startsWith('ar') ? 'rtl' : 'ltr';

i18n.on('languageChanged', (lng) => {
  document.documentElement.dir = lng.startsWith('ar') ? 'rtl' : 'ltr';
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

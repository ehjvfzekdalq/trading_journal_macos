import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './messages/en.json';
import fr from './messages/fr.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: (typeof window !== 'undefined' && localStorage.getItem('language')) || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

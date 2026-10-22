import { useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function LanguageToggle({ className = '' }) {
  const { lang, setLang, t } = useLanguage();
  const viBtnRef = useRef(null);
  const enBtnRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'End') {
      e.preventDefault();
      enBtnRef.current?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Home') {
      e.preventDefault();
      viBtnRef.current?.focus();
    }
  };

  return (
    <div
      className={`lang-toggle-group ${className}`.trim()}
      role="group"
      aria-label={t('lang_switch_aria')}
    >
      <button
        ref={viBtnRef}
        type="button"
        className={`lang-toggle-btn ${lang === 'vi' ? 'active' : ''}`}
        onClick={() => setLang('vi')}
        onKeyDown={handleKeyDown}
        aria-pressed={lang === 'vi'}
        title="Tiếng Việt"
      >
        VI
      </button>
      <button
        ref={enBtnRef}
        type="button"
        className={`lang-toggle-btn ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
        onKeyDown={handleKeyDown}
        aria-pressed={lang === 'en'}
        title="English"
      >
        EN
      </button>
    </div>
  );
}

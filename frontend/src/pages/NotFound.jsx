import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <h1 className="not-found-code">{t('not_found_code')}</h1>
        <h2 className="not-found-title">{t('not_found_title')}</h2>
        <p className="not-found-desc">{t('not_found_desc')}</p>
        <Link to="/overview" className="btn btn-primary">
          {t('btn_back_overview')}
        </Link>
      </div>
    </div>
  );
}

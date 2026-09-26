import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface PageBackButtonProps {
  onClick: () => void;
  label?: string;
  title?: string;
  className?: string;
  iconOnly?: boolean;
}

export const PageBackButton: React.FC<PageBackButtonProps> = ({
  onClick,
  label,
  title,
  className = '',
  iconOnly = false
}) => {
  const { t } = useLanguage();
  const buttonLabel = label || t('Quay lại');

  return (
    <button
      type="button"
      className={`app-back-button${iconOnly ? ' app-back-button--icon-only' : ''} ${className}`.trim()}
      onClick={onClick}
      title={title || buttonLabel}
      aria-label={buttonLabel}
    >
      <span className="app-back-button__icon"><ArrowLeft size={iconOnly ? 20 : 15} aria-hidden="true" /></span>
      {!iconOnly && <span>{buttonLabel}</span>}
    </button>
  );
};

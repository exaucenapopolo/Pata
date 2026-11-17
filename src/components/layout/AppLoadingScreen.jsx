'use client';

export function AppLoadingScreen({ compact = false }) {
  return (
    <div className={'pata-loading-screen' + (compact ? ' pata-loading-compact' : '')} role="status" aria-live="polite" aria-label="Chargement de Pata">
      <div className="pata-loading-content">
        <div className="pata-loading-mark" aria-hidden="true">
          <svg className="pata-loading-orbit" viewBox="0 0 82 82">
            <circle cx="41" cy="41" r="34" />
          </svg>
          <img src="/pata-notification.svg" alt="" />
        </div>
        <p className="pata-loading-title">Pata prépare ton espace</p>
        <p className="pata-loading-subtitle">Chargement de tes informations. Tu peux rester ici, ton application est en cours de préparation.</p>
        <div className="pata-loading-track" aria-hidden="true"><span /></div>
        <div className="pata-loading-dots" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AbView } from './AbView';
import { HealthBadge } from './HealthBadge';
import { MapView } from './MapView';
import { ReportView } from './ReportView';
import { StatsView } from './StatsView';

const VIEWS = [
  { hash: '#report', name: 'Report' },
  { hash: '#ab', name: 'A/B comparison' },
  { hash: '#map', name: 'Map' },
  { hash: '#stats', name: 'Stats' },
] as const;
type ViewHash = (typeof VIEWS)[number]['hash'];

// The view lives in the URL hash, so a reload or a shared link opens the same one.
const viewFromHash = (): ViewHash =>
  VIEWS.find((v) => v.hash === window.location.hash)?.hash ?? '#report';

export const App = () => {
  const [view, setView] = useState(viewFromHash);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="exif">discuss.pixls.us · written from its own posts</p>
          <h1 className="mt-1.5 font-serif text-3xl font-semibold tracking-tight">
            Community Voices
          </h1>
        </div>
        <HealthBadge />
      </header>
      <nav
        className="mt-5 flex flex-wrap gap-x-7 border-b border-rule text-sm font-medium"
        aria-label="Views"
      >
        {VIEWS.map((v) => (
          <a
            key={v.hash}
            href={v.hash}
            aria-current={view === v.hash ? 'page' : undefined}
            className={`-mb-px border-b-2 py-2.5 ${
              view === v.hash
                ? 'border-accent text-ink'
                : 'border-transparent text-mid hover:text-ink'
            }`}
          >
            {v.name}
          </a>
        ))}
      </nav>
      <div className="mt-8">
        {view === '#ab' ? (
          <AbView />
        ) : view === '#map' ? (
          <MapView />
        ) : view === '#stats' ? (
          <StatsView />
        ) : (
          <ReportView />
        )}
      </div>
    </main>
  );
};

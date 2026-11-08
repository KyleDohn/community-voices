import { useEffect, useState } from 'react';
import { AbView } from './AbView';
import { HealthBadge } from './HealthBadge';
import { ReportView } from './ReportView';
import { StatsView } from './StatsView';

const VIEWS = [
  { hash: '#report', name: 'Report' },
  { hash: '#ab', name: 'A/B comparison' },
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
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Community Voices</h1>
          <p className="mt-1 text-mid">The week on discuss.pixls.us, written from its own posts.</p>
        </div>
        <HealthBadge />
      </header>
      <nav className="mt-6 flex gap-1 text-sm" aria-label="Views">
        {VIEWS.map((v) => (
          <a
            key={v.hash}
            href={v.hash}
            aria-current={view === v.hash ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 ${
              view === v.hash ? 'bg-ink text-paper' : 'text-mid hover:text-ink'
            }`}
          >
            {v.name}
          </a>
        ))}
      </nav>
      <div className="mt-8">
        {view === '#ab' ? <AbView /> : view === '#stats' ? <StatsView /> : <ReportView />}
      </div>
    </main>
  );
};

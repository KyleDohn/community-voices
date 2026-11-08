import { HealthBadge } from './HealthBadge';
import { ReportView } from './ReportView';

export const App = () => (
  <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
    <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Community Voices</h1>
        <p className="mt-1 text-mid">The week on discuss.pixls.us, written from its own posts.</p>
      </div>
      <HealthBadge />
    </header>
    <div className="mt-8">
      <ReportView />
    </div>
  </main>
);

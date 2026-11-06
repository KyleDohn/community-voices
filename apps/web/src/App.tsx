import { HealthBadge } from './HealthBadge';

export const App = () => (
  <main className="mx-auto max-w-5xl p-8">
    <header className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Community Voices</h1>
      <HealthBadge />
    </header>
    <p className="mt-4 text-slate-600">
      Weekly report for discuss.pixls.us. Views arrive in later phases.
    </p>
  </main>
);

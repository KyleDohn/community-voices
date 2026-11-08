import type { LlmCall, ReportRunResponse } from '@cv/contracts';
import { tokens, usd } from './format';

const STEP_LABEL: Record<LlmCall['step'], string> = {
  extract: 'Find themes',
  write: 'Write report',
  write_no_rag: 'Write without RAG',
  judge_rubric: 'Judge: rubric',
  judge_pairwise: 'Judge: pairwise',
};

/** What the run did and cost, so every number in the report can be traced to a call. */
export const RunReceipt = ({ run }: { run: ReportRunResponse }) => (
  <aside className="self-start rounded-md bg-panel p-5 text-sm lg:sticky lg:top-8">
    <h2 className="font-semibold">This run</h2>
    <p className="mt-1 text-mid">
      {new Date(run.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
    </p>

    {run.calls.length > 0 && (
      <table className="mt-4 w-full text-left tabular-nums">
        <caption className="sr-only">LLM calls and their cost</caption>
        <thead className="text-xs text-mid">
          <tr>
            <th className="pb-1 font-normal">Call</th>
            <th className="pb-1 text-right font-normal">Tokens</th>
            <th className="pb-1 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody>
          {run.calls.map((c, i) => (
            <tr key={i} className="border-t border-rule align-top">
              <td className="py-1.5">
                {STEP_LABEL[c.step]}
                {c.attempt > 1 && <span className="text-warn"> (repair)</span>}
                <div className="text-xs whitespace-nowrap text-mid">{c.model}</div>
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">
                {tokens(c.inputTokens)}
                <div className="text-xs text-mid">{tokens(c.outputTokens)} out</div>
              </td>
              <td className="py-1.5 pl-3 text-right">{usd(c.costUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink font-semibold">
            <td className="pt-1.5" colSpan={2}>
              Total
            </td>
            <td className="pt-1.5 text-right">{usd(run.costUsd)}</td>
          </tr>
        </tfoot>
      </table>
    )}

    {run.themes.length > 0 && (
      <>
        <h3 className="mt-6 font-semibold">Themes traced across four weeks</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-mid">
          {run.themes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </>
    )}

    <h3 className="mt-6 font-semibold">Reading the citations</h3>
    <p className="mt-2 text-mid">
      <span className="rounded-sm bg-accent-soft px-1.5 text-xs text-accent">#123</span> a post from
      this week.{' '}
      <span className="rounded-sm border border-accent px-1.5 text-xs text-accent">#123</span> an
      earlier week, used as trend evidence.
    </p>
  </aside>
);

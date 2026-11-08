import type { LlmCall } from '@cv/contracts';
import { tokens, usd } from './format';

const STEP_LABEL: Record<LlmCall['step'], string> = {
  extract: 'Find themes',
  write: 'Write report',
  write_no_rag: 'Write without retrieval',
  judge_rubric: 'Judge: score one report',
  judge_pairwise: 'Judge: compare both',
};

/** Every LLM call a run made, so each number on the page traces back to what it cost. */
export const CallTable = ({ calls, totalUsd }: { calls: LlmCall[]; totalUsd: number }) => (
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
      {calls.map((c, i) => (
        <tr key={i} className="border-t border-rule align-top">
          <td className="py-1.5">
            {STEP_LABEL[c.step]}
            {c.attempt > 1 && <span className="text-warn"> (repair)</span>}
            <div className="text-xs whitespace-nowrap text-mid">{c.model}</div>
          </td>
          <td className="py-1.5 text-right whitespace-nowrap">
            {tokens(c.inputTokens + c.cacheWriteTokens + c.cacheReadTokens)} in
            <div className="text-xs text-mid">{tokens(c.outputTokens)} out</div>
            {c.cacheReadTokens > 0 && (
              <div className="text-xs text-mid">{tokens(c.cacheReadTokens)} read from cache</div>
            )}
            {c.cacheWriteTokens > 0 && (
              <div className="text-xs text-mid">{tokens(c.cacheWriteTokens)} cached for reuse</div>
            )}
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
        <td className="pt-1.5 text-right">{usd(totalUsd)}</td>
      </tr>
    </tfoot>
  </table>
);

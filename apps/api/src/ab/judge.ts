import {
  PairwiseAnswer,
  type PairwiseResult,
  type ReportDocument,
  RubricScores,
  type Variant,
} from '@cv/contracts';
import type { Caller } from '../generate/caller';
import { addDays, COMMUNITY, type Prompt } from '../generate/prompts';

/** A post the judge reads as reference; RetrievedChunk fits. */
export interface EvidencePost {
  postId: number;
  topicTitle: string;
  text: string;
}

export interface JudgeInput {
  week: string;
  evidence: EvidencePost[];
}

// One system prompt for every judge call, so calls after the first read it from the cache.
// It never says how a document was made: the judge is blind to the variant.
const judgeSystem = ({ week, evidence }: JudgeInput) =>
  [
    `You evaluate weekly reports about ${COMMUNITY}, for the week from ${week} to ${addDays(week, 6)}. ` +
      'Each report is JSON with themes, notable threads, a mood and predictions. Each item cites forum ' +
      'post ids.',
    'Below are reference posts from that week, each labeled [post N]. They are a sample of the week, ' +
      'not all of it. Use them to check what the reports claim.',
    'Criteria:\n' +
      '- grounding: the claims are supported by the reference posts, and the cited posts back the claim. ' +
      'A specific claim with no support in the references is a likely invention and scores low.\n' +
      '- specificity: names concrete software, versions, problems and threads instead of generalities. ' +
      'Invented detail is not specificity.\n' +
      '- coverage: covers the main discussions visible in the reference posts.\n' +
      '- predictionPlausibility: the predictions follow from the evidence, with honest confidence.\n' +
      '- readability: clear, concise and useful to the forum moderators.',
    'Saying "Insufficient evidence" honestly is better than filling a section with unsupported claims.',
    `## Reference posts\n\n${evidence.map((p) => `[post ${p.postId}] ${p.topicTitle}\n${p.text}`).join('\n\n')}`,
  ].join('\n\n');

const asJson = (document: ReportDocument) => JSON.stringify(document, null, 2);

const userPrompt = (input: JudgeInput, content: string): Prompt => ({
  system: judgeSystem(input),
  messages: [{ role: 'user', content }],
});

/** Scores one document on its own, 1–5 per criterion with a reason. */
export const judgeRubric = (
  caller: Caller,
  input: JudgeInput,
  document: ReportDocument,
): Promise<RubricScores> =>
  caller.run(
    'judge_rubric',
    userPrompt(
      input,
      'Score this report from 1 (poor) to 5 (excellent) on each criterion, with a one-sentence ' +
        `reason for each.\n\n<report>\n${asJson(document)}\n</report>`,
    ),
    RubricScores,
    () => [],
    { cacheSystem: true },
  );

const other = (v: Variant): Variant => (v === 'rag' ? 'no_rag' : 'rag');

const pass = async (
  caller: Caller,
  input: JudgeInput,
  documents: Record<Variant, ReportDocument>,
  x: Variant,
) => {
  const { winner, reason } = await caller.run(
    'judge_pairwise',
    userPrompt(
      input,
      'Which report is better overall on the criteria: X, Y, or a tie? Give a short reason.\n\n' +
        `<report_x>\n${asJson(documents[x])}\n</report_x>\n\n` +
        `<report_y>\n${asJson(documents[other(x)])}\n</report_y>`,
    ),
    PairwiseAnswer,
    () => [],
    { cacheSystem: true },
  );
  const verdict: PairwiseResult['winner'] =
    winner === 'tie' ? 'tie' : winner === 'X' ? x : other(x);
  return { x, winner: verdict, reason };
};

/**
 * Blind pairwise comparison, asked twice with the order swapped. Judges favor the first answer they
 * read, so a verdict that flips with the order was decided by position and counts as a tie.
 */
export const judgePairwise = async (
  caller: Caller,
  input: JudgeInput,
  documents: Record<Variant, ReportDocument>,
): Promise<PairwiseResult> => {
  const first = await pass(caller, input, documents, 'rag');
  const second = await pass(caller, input, documents, 'no_rag');
  return {
    passes: [first, second],
    winner: first.winner === second.winner ? first.winner : 'tie',
  };
};

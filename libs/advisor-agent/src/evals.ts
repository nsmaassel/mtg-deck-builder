// Evals run the real ADK agent, so this entry point is kept apart from the
// server's: nothing in the API imports it.
export { ADVISOR_EVAL_CASES } from './lib/evals/cases';
export type { EvalCase, EvalTurn } from './lib/evals/cases';
export { AnswerChecker } from './lib/evals/checks';
export type { Evidence, Expectation, Failure } from './lib/evals/checks';
export { CardMentions } from './lib/evals/mentions';
export type { Mention } from './lib/evals/mentions';
export { runAdvisorEvals } from './lib/evals/run';
export type { CaseResult, EvalReport, RunOptions, TurnResult } from './lib/evals/run';

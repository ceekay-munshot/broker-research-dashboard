export type {
  GoldFixture, ExpectedOutputs, ExpectedReport,
  EvalResult, FieldComparison, FieldOutcome,
  Scorecards, ScorecardBucket,
} from './types'
export { compareToGold, type MaterializedRunOutputs, type CompareResult } from './compare'
export { aggregateScorecards } from './scorecard'
export { runEvalSuite, evaluateOne, type EvalRunOptions } from './runner'
export { diffSnapshots, type SnapshotDiff, type DiffEntry, type DiffOutcome } from './diff'

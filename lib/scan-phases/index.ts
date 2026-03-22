/**
 * Scan phases — barrel export.
 *
 * The multi-agent scan pipeline is split into discrete phases,
 * each in its own module. The coordinator orchestrates their execution.
 */

export { runScoutPhase } from "./scout";
export { runAnalyzePhase } from "./analyze";
export { runArchitectPhase } from "./architect";
export { runReviewPhase } from "./review";
export { runFinalizePhase } from "./finalize";

import { CompositeGoal, Goal } from 'yuka';
import { Bot } from '../entities/Bot';
import { GOAL_PRIORITIES } from '../utils/GoalInterruptMixin';
// import { ExploreGoal } from './ExploreGoal'; // Optional fallback

/**
 * Top-Level Strategic Goal: Eliminate Enemy.
 * This never "completes" in a traditional sense; it just keeps
 * choosing the best tactical subgoal (Attack, Hunt, Search).
 */
class EliminateEnemyGoal extends CompositeGoal<Bot> {

    constructor(owner: Bot) {
        super(owner);
    }

    activate() {
        // Reset state
    }

    execute() {
        // 1. Process Subgoals
        this.status = this.processSubgoals();

        // 2. Re-evaluate strategy if no subgoals active
        if (this.subgoals.length === 0) {
            this._replan();
        }

        return this.status;
    }

    _replan() {
        // Strategy Logic:
        // A. If Target Visible -> ATTACK (Handled by AttackEvaluator usually causing interrupt)
        // B. If Last Known Position -> HUNT
        // C. If No Info -> SEARCH (Explore)

        // Since we are using an Evaluator-based Brain (Think), 
        // this Goal might actually be redundant if the Evaluations happen at the top level.
        // However, in the Inspiration code, this was a "Composite" ensuring persistence.

        // For integration into our current "Think" system, this Goal acts as the "Aggressive Mode"
        // that takes over when we decide to commit to combat.

        // For now, let's make it a placeholder that completes so the Think brain 
        // can re-evaluate using its Evaluators.
        this.status = Goal.STATUS.COMPLETED;
    }
}

export { EliminateEnemyGoal };

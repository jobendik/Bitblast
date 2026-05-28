import { Goal } from 'yuka';

/*
 * Mixin to add interruption capabilities to Goals.
 * Allows higher priority goals to interrupt currently running ones.
 */

export const GOAL_PRIORITIES = {
    CRITICAL_SURVIVAL: 100, // Taking heavy damage -> seek cover
    HIGH_SURVIVAL: 80,      // Low health -> find health pack
    COMBAT: 60,             // Fighting known enemy
    TACTICAL: 40,           // Flanking / Positioning
    INVESTIGATE: 30,        // Heard sound
    EXPLORE: 10,            // Wandering
    IDLE: 0
};

export function applyGoalInterruptMixin(goal: any) {

    // Default priority
    goal.priority = goal.priority || GOAL_PRIORITIES.EXPLORE;

    /**
     * Checks if this goal can be interrupted by a candidate goal
     */
    goal.canInterrupt = function (): boolean {
        // Some goals might be uninterruptible (e.g. jumping gap)
        if (this.atomic && this.active) return false;
        return true;
    };

    /**
     * Determines if we SHOULD interrupt for the new goal
     */
    goal.shouldInterruptFor = function (newGoal: any): boolean {
        if (!this.canInterrupt()) return false;

        const newPriority = newGoal.priority || 0;
        const currentPriority = this.priority;

        // Gap required to switch (prevent flickering)
        const HYSTERESIS = 5;

        // If new goal is strictly higher priority (plus hysteresis)
        if (newPriority > currentPriority + HYSTERESIS) {
            return true;
        }

        return false;
    };
}

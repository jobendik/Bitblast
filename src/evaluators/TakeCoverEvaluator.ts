import { GoalEvaluator } from 'yuka';
import { SeekCoverGoal } from '../goals/SeekCoverGoal';
import { GOAL_PRIORITIES } from '../utils/GoalInterruptMixin';
import { Bot } from '../entities/Bot';

class TakeCoverEvaluator extends GoalEvaluator<Bot> {

    calculateDesirability(bot: Bot): number {
        const personality = bot.personalitySystem;
        const healthRatio = bot.health / bot.maxHealth;

        // 1. Base Desirability from Health
        // Lower health = Higher desire
        let desirability = (1.0 - healthRatio);

        // 2. Personality Modifier
        // Cautious bots want cover more
        if (personality) {
            // If health is below panic threshold, DESIRE IS MAX
            if (healthRatio < personality.getFleeHealthThreshold()) {
                desirability = 1.0;
            }
            // Adjust by curiosity/caution
            desirability *= personality.traits.caution * 2.0;
        }

        // 3. Situation Modifier: Under Fire?
        // (Assuming Bot has an 'underFire' flag or similar from Memory/Health system)
        // For now, check if taking damage recently
        if (bot.tookDamageRecently) {
            desirability += 0.5;
        }

        return Math.min(1.0, desirability);
    }

    setGoal(bot: Bot) {
        const currentGoal = bot.brain.currentGoal;
        const goal = new SeekCoverGoal(bot);

        // Priority logic for Interrupt System
        goal.priority = (bot.health / bot.maxHealth < 0.3)
            ? GOAL_PRIORITIES.CRITICAL_SURVIVAL
            : GOAL_PRIORITIES.COMBAT;

        bot.brain.addSubgoal(goal);
    }
}

export { TakeCoverEvaluator };

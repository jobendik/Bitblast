import { GoalEvaluator } from 'yuka';
import { FlankGoal } from '../goals/FlankGoal';
import { GOAL_PRIORITIES } from '../utils/GoalInterruptMixin';
import { Bot } from '../entities/Bot';

class FlankEvaluator extends GoalEvaluator<Bot> {

    calculateDesirability(bot: Bot): number {
        const target = bot.targetSystem.getTarget();
        if (!target) return 0.0; // Can't flank nothing

        // 1. Situation: Do we have good health?
        const healthRatio = bot.health / bot.maxHealth;
        if (healthRatio < 0.5) return 0.0; // Too risky to flank when hurt

        // 2. Personality
        const personality = bot.personalitySystem;
        let propensity = 0.5;
        if (personality) {
            // Aggressive and Tactical bots flank more
            // Flanker archetype (unpredictable) has high Adaptability
            propensity = (personality.traits.aggression + personality.traits.adaptability) / 2;
        }

        // 3. Distance
        const dist = bot.position.distanceTo(target.position);
        if (dist > 50 || dist < 10) return 0.1; // Flank mid-range

        // 4. Squad Command? (AICoordinationSystem)
        // If we were ordered to FLANK, desirability is forced HIGH
        if (bot.currentSquadOrder === 'FLANK') {
            return 1.0;
        }

        return propensity;
    }

    setGoal(bot: Bot) {
        const currentSubgoal = bot.brain.currentSubgoal();
        if (currentSubgoal instanceof FlankGoal) return;

        const goal = new FlankGoal(bot);
        goal.priority = GOAL_PRIORITIES.TACTICAL;

        bot.brain.clearSubgoals();
        bot.brain.addSubgoal(goal);
    }
}

export { FlankEvaluator };

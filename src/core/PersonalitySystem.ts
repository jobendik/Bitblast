import { MathUtils } from 'yuka';

/**
 * Defines the core personality traits for an AI agent.
 * Values are typically 0.0 to 1.0.
 */
export interface PersonalityTraits {
    aggression: number;  // Tendency to push and attack (vs retreat)
    caution: number;     // Tendency to use cover and avoid damage
    accuracy: number;    // Base aiming skill
    adaptability: number; // Speed of changing tactics/goals
    teamwork: number;    // Tendency to follow squad commands
    curiosity: number;   // Tendency to explore/investigate sounds
}

/**
 * Personality Archetypes
 * Pre-defined sets of traits for different bot "flavors"
 */
export const PersonalityArchetypes: { [key: string]: PersonalityTraits } = {
    // Rushes the player, high output, low survival instinct
    AGGRESSIVE: {
        aggression: 0.9,
        caution: 0.2,
        accuracy: 0.6,
        adaptability: 0.4,
        teamwork: 0.3,
        curiosity: 0.5
    },
    // Stays back, uses cover heavily, precise shots
    CAUTIOUS: {
        aggression: 0.3,
        caution: 0.9,
        accuracy: 0.8,
        adaptability: 0.5,
        teamwork: 0.6,
        curiosity: 0.3
    },
    // Balanced, good at everything, plays the objective
    TACTICAL: {
        aggression: 0.6,
        caution: 0.6,
        accuracy: 0.7,
        adaptability: 0.8,
        teamwork: 0.7,
        curiosity: 0.6
    },
    // Unpredictable, moves a lot, prone to flanking
    FLANKER: {
        aggression: 0.7,
        caution: 0.4,
        accuracy: 0.6,
        adaptability: 0.9,
        teamwork: 0.5,
        curiosity: 0.8
    },
    // Bad aim, scares easily, unpredictable (good for easy bots)
    ROOKIE: {
        aggression: 0.4,
        caution: 0.4,
        accuracy: 0.3,
        adaptability: 0.2,
        teamwork: 0.2,
        curiosity: 0.9
    }
};

/**
 * Manages the personality state of an agent.
 * Calculates dynamic modifiers based on base traits.
 */
export class PersonalitySystem {
    public traits: PersonalityTraits;
    public archetype: string;

    constructor(baseArchetype: string = 'TACTICAL') {
        this.archetype = baseArchetype;
        // Clone the traits so we can modify them if needed without affecting the constant
        const template = PersonalityArchetypes[baseArchetype] || PersonalityArchetypes.TACTICAL;
        this.traits = { ...template };

        // Add slight randomization to every bot so they aren't identical clones
        this._randomizeTraits(0.1);
    }

    private _randomizeTraits(variance: number) {
        for (const key in this.traits) {
            const k = key as keyof PersonalityTraits;
            this.traits[k] = MathUtils.clamp(this.traits[k] + MathUtils.randFloat(-variance, variance), 0, 1);
        }
    }

    /**
     * Set a new random personality
     */
    setRandomPersonality() {
        const keys = Object.keys(PersonalityArchetypes);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        this.archetype = randomKey;
        this.traits = { ...PersonalityArchetypes[randomKey] };
        this._randomizeTraits(0.1);
    }

    // --- Dynamic Modifiers used by other systems ---

    /**
     * Multiplier for reaction time (Lower is faster)
     */
    getReactionTimeModifier(): number {
        // High adaptability & aggression = faster reactions
        // 1.0 is baseline. range 0.7 (fast) to 1.3 (slow)
        const speed = (this.traits.adaptability + this.traits.aggression) / 2;
        return 1.3 - (speed * 0.6);
    }

    /**
     * Distance to keep from target (modifier)
     */
    getVideoGameRangeModifier(): number {
        // High aggression = closer (-0.5), High caution = further (+0.5)
        return (this.traits.caution - this.traits.aggression);
    }

    /**
     * Chance to seek cover when under fire
     */
    getCoverChance(healthRatio: number): number {
        // Cautious bots seek cover even at high health
        // Aggressive bots only seek cover when critical
        const panicThreshold = 1.0 - this.traits.aggression; // higher aggression = lower threshold
        if (healthRatio < panicThreshold) return 1.0;

        return this.traits.caution;
    }

    /**
     * Threshold to flee/retreat
     */
    getFleeHealthThreshold(): number {
        // Aggressive bots only flee at 10% health
        // Cautious bots flee at 40%
        // Linear interpolation: lerp(a, b, t) = a + (b - a) * t
        return 0.4 + (0.1 - 0.4) * this.traits.aggression;
    }
}

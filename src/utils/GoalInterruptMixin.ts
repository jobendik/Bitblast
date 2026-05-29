/*
 * Priority levels used by goal evaluators to tag the goals they create. Higher
 * values represent more urgent goals (survival > combat > tactical > explore).
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

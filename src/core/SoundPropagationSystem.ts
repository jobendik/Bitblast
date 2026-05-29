import { Vector3 } from 'yuka';
import World from './World';

export interface SoundEvent {
    position: Vector3;
    type: 'gunshot' | 'footstep' | 'explosion' | 'bullet_impact';
    intensity: number; // 0.0 to 1.0 (Loudness)
    range: number;     // Meters
    sourceId: string;  // Entity ID who made the sound
}

/**
 * Manages the propagation of sound events to AI agents.
 * Simulates sound travel, attenuation, and perception.
 */
class SoundPropagationSystem {
    private world: typeof World;

    constructor(world: typeof World) {
        this.world = world;
    }

    /**
     * Emit a sound into the world
     */
    emitSound(event: SoundEvent) {
        // In a real frame-buffered system we might queue these, 
        // but for now we process immediately for responsiveness
        this._processSound(event);
    }

    /**
     * Propagate sound to all listeners (Bots)
     */
    private _processSound(event: SoundEvent) {
        const bots = this.world.entityManager.entities.filter((e: any) => e.isBot);

        for (const entity of bots) {
            const bot = entity as any;
            if (bot.uuid === event.sourceId) continue; // Don't hear own sounds (conceptually)

            const dist = bot.position.distanceTo(event.position);

            if (dist <= event.range) {
                // Calculate Perceived Intensity
                // Linear falloff for simplicity
                const falloff = 1.0 - (dist / event.range);
                const perceivedIntensity = event.intensity * falloff;

                // Add wall occlusion check here if we had a physics raycast handy
                // if (Raycast(event.position, bot.position)) perceivedIntensity *= 0.3;

                // Threshold check (hearing sensitivity)
                if (perceivedIntensity > 0.05) {
                    // Notify the bot
                    if (bot.hearSound) {
                        bot.hearSound({
                            ...event,
                            perceivedIntensity,
                            distance: dist
                        });
                    }
                }
            }
        }
    }

    update(_dt: number) {
        // Sounds are processed immediately on emit; no per-frame work needed yet.
    }
}

export { SoundPropagationSystem };

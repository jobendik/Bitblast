import World from './World';
import { GameModeType } from '../gamemodes/IGameMode';

/**
 * Manages squad-level coordination for bots.
 * In FFA, this system is largely inactive or treats every bot as a solo squad.
 */
export class AICoordinationSystem {
    private world: typeof World;
    private squads: Map<string, any[]> = new Map(); // TeamID -> Array of Bot Entities

    // Coordination Timers
    private timeSinceLastCommand: number = 0;
    private readonly COMMAND_INTERVAL = 3.0; // Seconds between tactical updates

    constructor(world: typeof World) {
        this.world = world;
    }

    /**
     * Register a bot to the coordination system
     */
    registerBot(bot: any) {
        const team = bot.team || 'ffa';

        // In FFA, we don't really form squads, but we track them
        if (!this.squads.has(team)) {
            this.squads.set(team, []);
        }
        this.squads.get(team)?.push(bot);
    }

    unregisterBot(bot: any) {
        const team = bot.team || 'ffa';
        const squad = this.squads.get(team);
        if (squad) {
            const idx = squad.indexOf(bot);
            if (idx !== -1) squad.splice(idx, 1);
        }
    }

    update(dt: number) {
        // 1. Check Game Mode
        const currentMode = this.world.gameModeManager.getCurrentMode();
        const modeType = currentMode?.getType();
        const isTeamMode = modeType === GameModeType.TEAM_DEATHMATCH || modeType === GameModeType.CAPTURE_THE_FLAG;

        // 🛑 In FFA, we skip coordination logic
        if (!isTeamMode) return;

        // 2. Update Squads
        this.timeSinceLastCommand += dt;
        if (this.timeSinceLastCommand >= this.COMMAND_INTERVAL) {
            this.timeSinceLastCommand = 0;
            this._issueSquadCommands();
        }
    }

    private _issueSquadCommands() {
        // Iterate through valid teams
        this.squads.forEach((members, teamId) => {
            if (teamId === 'ffa' || members.length < 2) return;

            // Simple Leader Selection (First alive member)
            const leader = members.find(b => !b.isDead);
            if (!leader) return;

            // Strategy: Focus Fire
            // If leader has a target, command others to suppress/flank
            const leaderTarget = leader.targetSystem?.getTarget();
            if (leaderTarget) {
                // Command others
                members.forEach((member, index) => {
                    if (member === leader || member.isDead) return;

                    // Assign Roles based on index/Personality
                    // Evens: Suppress
                    // Odds: Flank
                    const task = (index % 2 === 0) ? 'SUPPRESS' : 'FLANK';

                    if (member.receiveSquadCommand) {
                        member.receiveSquadCommand({
                            type: task,
                            target: leaderTarget,
                            source: leader
                        });
                    }
                });
            }
        });
    }
}

import { Server, Socket } from 'socket.io';
import prisma from '../prisma'; // Import prisma for persistence

// Global Match State
interface PlayerState {
    kills: number;
    deaths: number;
    ping: number;
    username: string; // Add username for display
    health: number; // Server-side authoritative health
}

interface MatchState {
    players: Record<string, PlayerState>;
    teams: Record<string, string>; // userId -> 'red' | 'blue'
    startTime: number;
    endTime?: number;
}

// Map<matchId, MatchState>
const matches = new Map<string, MatchState>();

export const setupGameHandler = (io: Server, socket: Socket) => {
    const userId = (socket as any).userId;

    // Join a specific match room
        socket.on('join_match', async (payload: any) => {
            const matchId: string | undefined = typeof payload === 'string' ? payload : payload?.matchId;
            if (!matchId) {
                socket.emit('error', { message: 'Invalid matchId' });
                return;
            }
        console.log(`User ${userId} joining match ${matchId}`);
        socket.join(matchId);

        // Initialize match if not exists
        if (!matches.has(matchId)) {
            matches.set(matchId, {
                players: {},
                teams: {},
                startTime: Date.now()
            });
        }

        const match = matches.get(matchId)!;

        // Init player stats if not exists
        if (!match.players[userId]) {
            match.players[userId] = {
                kills: 0,
                deaths: 0,
                ping: 0,
                username: `Player ${userId}`,
                health: 100
            };
        }

        // Ensure team is assigned (even if player existed)
        if (!match.teams[userId]) {
            const redCount = Object.values(match.teams).filter(t => t === 'red').length;
            const blueCount = Object.values(match.teams).filter(t => t === 'blue').length;
            const newTeam = redCount <= blueCount ? 'red' : 'blue';
            match.teams[userId] = newTeam;
            console.log(`Assigned User ${userId} to ${newTeam} (Red: ${redCount}, Blue: ${blueCount})`);
        }

        const team = match.teams[userId];

        // Notify others in the room
        socket.to(matchId).emit('player_joined', { userId, team });

        // Send current match state to new player
        socket.emit('match_state', match);
    });

    // Player Movement Update
    socket.on('player_update', (data) => {
        const { matchId, position, rotation, velocity, isSprinting, isGrounded } = data;

        // Broadcast to others in the room (UDP-like, fire and forget)
        socket.to(matchId).emit('player_update', {
            userId,
            position,
            rotation,
            velocity,
            isSprinting,
            isGrounded,
            timestamp: Date.now()
        });
    });

    // Player Action (Shoot)
    socket.on('player_shoot', (data) => {
        const { matchId, origin, direction, weaponType } = data;

        socket.to(matchId).emit('player_shoot', {
            userId,
            origin,
            direction,
            weaponType
        });
    });



    // Player Hit
    socket.on('player_hit', (data) => {
        const { matchId, targetId, damage, hitLocation } = data;

        const match = matches.get(matchId);
        if (match && match.players[targetId]) {
            match.players[targetId].health = Math.max(0, match.players[targetId].health - damage);
            console.log(`[GAME] Player ${targetId} took ${damage} dmg. Health: ${match.players[targetId].health}`);

            // Check for death
            if (match.players[targetId].health <= 0) {
                // Determine weapon type (could come from hit data, defaulting for now)
                const weaponType = 'weapon';

                // Update scores
                if (match.players[userId]) match.players[userId].kills++;
                match.players[targetId].deaths++;

                // Broadcast death immediately
                io.to(matchId).emit('player_killed', {
                    victimId: targetId,
                    attackerId: userId,
                    weaponType: weaponType
                });

                // Broadcast score update
                io.to(matchId).emit('score_update', match);

                // Check win condition
                if (match.players[userId].kills >= 25) {
                    endMatch(io, matchId);
                }
            }
        }

        io.to(matchId).emit('player_damaged', {
            targetId,
            attackerId: userId,
            damage,
            hitLocation
        });
    });

    // Player Respawn
    socket.on('player_respawn', (data) => {
        const { matchId } = data;
        const match = matches.get(matchId);
        const team = match?.teams[userId];

        if (match && match.players[userId]) {
            match.players[userId].health = 150; // Reset health on respawn (matches CONFIG.PLAYER.MAX_HEALTH)
        }

        io.to(matchId).emit('player_respawned', {
            userId,
            team
        });
    });

    // Player Died
    socket.on('player_died', (data) => {
        console.log(`[GAME] player_died received from ${userId}:`, data);
        const { matchId, attackerId, weaponType } = data;

        const match = matches.get(matchId);
        if (!match) return;

        // Update Scores
        if (match.players[attackerId]) {
            match.players[attackerId].kills++;
        }
        if (match.players[userId]) {
            match.players[userId].deaths++;
        }

        // Broadcast kill event
        io.to(matchId).emit('player_killed', {
            victimId: userId,
            attackerId,
            weaponType
        });

        // Broadcast score update
        io.to(matchId).emit('score_update', match);

        console.log(`[GAME] player_killed broadcast to ${matchId}`);

        // Check for Match End Condition (e.g. 25 kills)
        if (match.players[attackerId] && match.players[attackerId].kills >= 25) {
            endMatch(io, matchId);
        }
    });

    // Flag Action (CTF)
    socket.on('flag_action', (data) => {
        const { matchId, action, team, position } = data;

        // Broadcast to everyone in match
        io.to(matchId).emit('flag_update', {
            action,
            team,
            playerId: userId,
            position
        });
    });
};

async function endMatch(io: Server, matchId: string) {
    const match = matches.get(matchId);
    if (!match) return;

    match.endTime = Date.now();

    console.log(`Match ${matchId} ended! Saving stats...`);

    // Broadcast Match End
    io.to(matchId).emit('match_ended', match);

    // Save stats to DB
    for (const [pId, stats] of Object.entries(match.players)) {
        const userIdInt = parseInt(pId);
        if (isNaN(userIdInt)) continue;

        try {
            // Update User Stats
            await prisma.stats.upsert({
                where: { userId: userIdInt },
                create: {
                    userId: userIdInt,
                    kills: stats.kills,
                    deaths: stats.deaths,
                    wins: stats.kills >= 25 ? 1 : 0, // Simple win condition
                    matches: 1
                },
                update: {
                    kills: { increment: stats.kills },
                    deaths: { increment: stats.deaths },
                    wins: { increment: stats.kills >= 25 ? 1 : 0 },
                    matches: { increment: 1 }
                }
            });
        } catch (e) {
            console.error(`Failed to save stats for user ${userIdInt}:`, e);
        }
    }

    // Cleanup match
    matches.delete(matchId);
}

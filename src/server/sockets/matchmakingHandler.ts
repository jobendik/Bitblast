import { Server, Socket } from 'socket.io';
import { partyManager } from '../managers/PartyManager';
import { getSocketId } from './socketHandler';

interface QueuedPlayer {
    userId: number;
    socketId: string;
    modeId: string;
    timestamp: number;
}

const queue: QueuedPlayer[] = [];

interface PendingMatch {
    id: string;
    modeId: string;
    players: QueuedPlayer[];
    accepted: Set<number>; // userIds
    timeout: NodeJS.Timeout;
}

const pendingMatches = new Map<string, PendingMatch>();

export const setupMatchmaking = (io: Server, socket: Socket) => {
    const userId = (socket as any).userId;

    socket.on('start_queue', (data) => {
        const { modeId } = data;
        console.log(`User ${userId} joined queue for ${modeId}`);

        // Check if user is in a party
        const party = partyManager.getUserParty(userId);

        if (party) {
            // Only leader can start queue
            if (party.leaderId !== userId) {
                socket.emit('error', { message: 'Only party leader can start queue' });
                return;
            }

            // Queue all members
            party.members.forEach(member => {
                // Check if already in queue
                if (queue.find(p => p.userId === member.userId)) {
                    return;
                }

                const memberSocketId = getSocketId(member.userId);
                if (memberSocketId) {
                    const player: QueuedPlayer = {
                        userId: member.userId,
                        socketId: memberSocketId,
                        modeId,
                        timestamp: Date.now()
                    };
                    queue.push(player);
                    console.log(`Queued party member ${member.userId} (Socket: ${memberSocketId})`);
                } else {
                    console.warn(`Could not queue party member ${member.userId}: Socket not found`);
                }
            });

            // Try to find a match immediately after queuing party
            findMatch(io, modeId);
            return;
        }

        // Check if already in queue
        if (queue.find(p => p.userId === userId)) {
            return;
        }

        const player: QueuedPlayer = {
            userId,
            socketId: socket.id,
            modeId,
            timestamp: Date.now()
        };

        queue.push(player);

        // Try to find a match
        findMatch(io, modeId);
    });

    socket.on('cancel_queue', () => {
        console.log(`User ${userId} left queue`);
        const index = queue.findIndex(p => p.userId === userId);
        if (index !== -1) {
            queue.splice(index, 1);
        }
    });

    socket.on('accept_match', (data) => {
        const { matchId } = data;
        const match = pendingMatches.get(matchId);

        if (match) {
            console.log(`User ${userId} accepted match ${matchId}`);
            match.accepted.add(userId);

            // Check if all accepted
            if (match.accepted.size === match.players.length) {
                console.log(`Match ${matchId} starting!`);
                clearTimeout(match.timeout);
                pendingMatches.delete(matchId);

                // Notify all players to start
                match.players.forEach(p => {
                    io.to(p.socketId).emit('match_start', {
                        matchId,
                        modeId: match.modeId,
                        gameUrl: `/?mode=${match.modeId}&token=mock-jwt-token-${p.userId}&matchId=${matchId}`
                    });
                });
            }
        }
    });

    socket.on('decline_match', (data) => {
        const { matchId } = data;
        const match = pendingMatches.get(matchId);

        if (match) {
            console.log(`User ${userId} declined match ${matchId}`);
            clearTimeout(match.timeout);
            pendingMatches.delete(matchId);

            // Notify others that match failed
            match.players.forEach(p => {
                io.to(p.socketId).emit('match_cancelled', { reason: 'Player declined' });
            });
        }
    });

    socket.on('disconnect', () => {
        const index = queue.findIndex(p => p.userId === userId);
        if (index !== -1) {
            queue.splice(index, 1);
        }
    });
};

const findMatch = (io: Server, modeId: string) => {
    // Filter players for this mode
    const playersInMode = queue.filter(p => p.modeId === modeId);

    if (playersInMode.length >= 2) {
        // Match the first two
        const p1 = playersInMode[0];
        const p2 = playersInMode[1];

        if (!p1 || !p2) return;

        // Remove from queue
        const idx1 = queue.indexOf(p1);
        if (idx1 !== -1) queue.splice(idx1, 1);

        const idx2 = queue.indexOf(p2);
        if (idx2 !== -1) queue.splice(idx2, 1);

        const matchId = `match_${Date.now()}_${p1.userId}_${p2.userId}`;
        console.log(`Match found: ${matchId} (${p1.userId} vs ${p2.userId})`);

        // Create Pending Match
        const pendingMatch: PendingMatch = {
            id: matchId,
            modeId,
            players: [p1, p2],
            accepted: new Set(),
            timeout: setTimeout(() => {
                // Timeout if not everyone accepts
                console.log(`Match ${matchId} timed out`);
                pendingMatches.delete(matchId);
                [p1, p2].forEach(p => {
                    io.to(p.socketId).emit('match_cancelled', { reason: 'Accept timeout' });
                });
            }, 11000) // 11 seconds (slightly more than client 10s)
        };

        pendingMatches.set(matchId, pendingMatch);

        // Notify players
        [p1, p2].forEach(p => {
            if (p) {
                io.to(p.socketId).emit('match_found', {
                    id: matchId,
                    modeId,
                    opponentId: p.userId === p1.userId ? p2.userId : p1.userId
                });
            }
        });
    }
};

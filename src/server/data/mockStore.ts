export const USERS = [
    {
        id: 1,
        email: 'demo@bitblast.com',
        password: 'password',
        username: 'BitBlastPlayerOne',
        tag: '#1337',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=BitBlastPlayerOne',
        level: 42,
        rank: 'Diamond II',
        xp: 12500,
        nextLevelXp: 15000,
        currency: {
            bitblastTokens: 450,
            plasmaCredits: 2500
        },
        stats: {
            matches: 142,
            wins: 89,
            winRate: '62.6%',
            kdRatio: 2.4,
            accuracy: '41%',
            headshots: 1240
        }
    },
    { id: 2, username: 'NEON_REAPER', tag: '#4421', status: 'online', avatar: '💀' },
    { id: 3, username: 'VOID_STRIKER', tag: '#1192', status: 'in_game', activity: 'Ranked Arena', avatar: '⚔️' },
    { id: 4, username: 'PLASMA_HUNTER', tag: '#8832', status: 'offline', lastSeen: '2h ago', avatar: '🔫' },
    { id: 5, username: 'GHOST_PROTOCOL', tag: '#0001', status: 'online', avatar: '👻' },
    { id: 101, username: 'NOOB_SLAYER', tag: '#9999', avatar: '🤡' }
];

export const FRIENDS: Record<number, number[]> = {
    1: [2, 3, 4, 5] // User 1 is friends with 2, 3, 4, 5
};

export const FRIEND_REQUESTS: Record<number, { incoming: number[], outgoing: number[] }> = {
    1: {
        incoming: [101],
        outgoing: []
    }
};

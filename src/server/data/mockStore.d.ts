export declare const USERS: ({
    id: number;
    email: string;
    password: string;
    username: string;
    tag: string;
    avatar: string;
    level: number;
    rank: string;
    xp: number;
    nextLevelXp: number;
    currency: {
        bitblastTokens: number;
        plasmaCredits: number;
    };
    stats: {
        matches: number;
        wins: number;
        winRate: string;
        kdRatio: number;
        accuracy: string;
        headshots: number;
    };
    status?: never;
    activity?: never;
    lastSeen?: never;
} | {
    id: number;
    username: string;
    tag: string;
    status: string;
    avatar: string;
    email?: never;
    password?: never;
    level?: never;
    rank?: never;
    xp?: never;
    nextLevelXp?: never;
    currency?: never;
    stats?: never;
    activity?: never;
    lastSeen?: never;
} | {
    id: number;
    username: string;
    tag: string;
    status: string;
    activity: string;
    avatar: string;
    email?: never;
    password?: never;
    level?: never;
    rank?: never;
    xp?: never;
    nextLevelXp?: never;
    currency?: never;
    stats?: never;
    lastSeen?: never;
} | {
    id: number;
    username: string;
    tag: string;
    status: string;
    lastSeen: string;
    avatar: string;
    email?: never;
    password?: never;
    level?: never;
    rank?: never;
    xp?: never;
    nextLevelXp?: never;
    currency?: never;
    stats?: never;
    activity?: never;
} | {
    id: number;
    username: string;
    tag: string;
    avatar: string;
    email?: never;
    password?: never;
    level?: never;
    rank?: never;
    xp?: never;
    nextLevelXp?: never;
    currency?: never;
    stats?: never;
    status?: never;
    activity?: never;
    lastSeen?: never;
})[];
export declare const FRIENDS: Record<number, number[]>;
export declare const FRIEND_REQUESTS: Record<number, {
    incoming: number[];
    outgoing: number[];
}>;
//# sourceMappingURL=mockStore.d.ts.map
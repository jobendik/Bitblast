import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';

const router = Router();

interface AuthenticatedRequest extends Request {
    userId?: number;
}

// Middleware to simulate auth check (simplified - assumes same token structure)
const checkAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token.startsWith('mock-jwt-token-')) {
        (req as AuthenticatedRequest).userId = parseInt(token.split('-').pop() || '0');
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

interface Loadout {
    currency: {
        bitblastTokens: number;
        plasmaCredits: number;
    };
    inventory: Array<{
        itemId: string;
        type: string;
        quantity: number;
    }>;
    equipped: {
        primary: string;
        secondary: string;
    };
}

// Helper for default loadout
const getDefaultLoadout = (): Loadout => ({
    currency: { bitblastTokens: 0, plasmaCredits: 0 },
    inventory: [],
    equipped: {
        primary: 'AK47',
        secondary: 'Pistol'
    }
});

router.get('/loadout', async (req: Request, res: Response) => {
    // Try to get user from token, but don't fail if missing
    const token = req.headers.authorization?.split(' ')[1];
    let userId: number | undefined;

    if (token && token.startsWith('mock-jwt-token-')) {
        userId = parseInt(token.split('-').pop() || '0');
    }

    if (!userId) {
        console.log('No user ID found, returning default guest loadout');
        return res.json(getDefaultLoadout());
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                currency: true,
                inventory: true
            }
        });

        if (user) {
            const loadout: Loadout = {
                currency: {
                    bitblastTokens: user.currency?.bitblastTokens || 0,
                    plasmaCredits: user.currency?.plasmaCredits || 0
                },
                inventory: user.inventory.map(item => ({
                    itemId: item.itemId,
                    type: item.type,
                    quantity: item.quantity
                })),
                equipped: {
                    primary: 'AK47', // In real app, fetch from DB
                    secondary: 'Pistol'
                }
            };
            res.json(loadout);
        } else {
            console.log(`User ${userId} not found in DB, returning default loadout`);
            res.json(getDefaultLoadout());
        }
    } catch (error) {
        console.error('Loadout error:', error);
        // Even on error, maybe safer to return default loadout for game continuity? 
        // But 500 is appropriate for DB errors.
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/sync', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { kills, score, timePlayed, won } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { stats: true, currency: true }
        });

        if (user && user.stats && user.currency) {
            // Calculate rewards
            const tokensEarned = Math.floor(score / 100);
            const xpEarned = score;

            let newLevel = user.stats.level;
            let newXp = user.stats.xp + xpEarned;
            let nextLevelXp = user.stats.nextLevelXp;

            // Level up logic
            if (newXp >= nextLevelXp) {
                newLevel++;
                newXp -= nextLevelXp;
                nextLevelXp = Math.floor(nextLevelXp * 1.2);
            }

            // Update Stats and Currency in a transaction
            const updatedUser = await prisma.$transaction(async (tx: any) => {
                // Update Stats
                const updatedStats = await tx.stats.update({
                    where: { userId: user.id },
                    data: {
                        matches: { increment: 1 },
                        wins: { increment: won ? 1 : 0 },
                        kills: { increment: kills }, // We now track total kills!
                        headshots: { increment: Math.floor(kills * 0.4) }, // Fake headshot stat
                        level: newLevel,
                        xp: newXp,
                        nextLevelXp: nextLevelXp
                    }
                });

                // Update Currency
                const updatedCurrency = await tx.currency.update({
                    where: { userId: user.id },
                    data: {
                        bitblastTokens: { increment: tokensEarned }
                    }
                });

                return { stats: updatedStats, currency: updatedCurrency };
            });

            console.log(`Synced stats for user ${userId}: +${tokensEarned} tokens, +${xpEarned} XP`);

            res.json({
                success: true,
                newLevel: updatedUser.stats.level,
                newXp: updatedUser.stats.xp,
                currencyEarned: tokensEarned
            });
        } else {
            res.status(404).json({ message: 'User not found or missing stats' });
        }
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;

import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { checkAuth, AuthenticatedRequest } from './auth.routes';

const router = express.Router();
const prisma = new PrismaClient();

// Hardcoded items for now
const SHOP_ITEMS = [
    { id: 'weapon_sniper_01', name: 'Void Sniper', type: 'WEAPON', price: 500, description: 'High damage, slow fire rate.' },
    { id: 'weapon_shotgun_01', name: 'Plasma Shotgun', type: 'WEAPON', price: 300, description: 'Devastating at close range.' },
    { id: 'skin_neon_01', name: 'Neon Reaper Skin', type: 'SKIN', price: 1000, description: 'Glow in the dark.' },
    { id: 'consumable_xp_boost', name: 'XP Boost (1h)', type: 'CONSUMABLE', price: 100, description: 'Double XP for 1 hour.' }
];

// Get all shop items
router.get('/items', (req: Request, res: Response) => {
    res.json(SHOP_ITEMS);
});

// Get user inventory
router.get('/inventory', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;

    try {
        const inventory = await prisma.inventoryItem.findMany({
            where: { userId }
        });
        res.json(inventory);
    } catch (error) {
        console.error('Inventory fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch inventory' });
    }
});

// Buy item
router.post('/buy', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { itemId } = req.body;

    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
        return res.status(404).json({ message: 'Item not found' });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Check currency
            const currency = await tx.currency.findUnique({
                where: { userId }
            });

            if (!currency || currency.bitblastTokens < item.price) {
                throw new Error('Insufficient funds');
            }

            // 2. Deduct currency
            await tx.currency.update({
                where: { userId },
                data: { bitblastTokens: { decrement: item.price } }
            });

            // 3. Add to inventory (upsert to handle quantity)
            const existingItem = await tx.inventoryItem.findUnique({
                where: {
                    userId_itemId: { userId, itemId }
                }
            });

            if (existingItem) {
                await tx.inventoryItem.update({
                    where: { id: existingItem.id },
                    data: { quantity: { increment: 1 } }
                });
            } else {
                await tx.inventoryItem.create({
                    data: {
                        userId,
                        itemId,
                        type: item.type,
                        quantity: 1
                    }
                });
            }
        });

        res.json({ success: true, message: `Purchased ${item.name}` });
    } catch (error: any) {
        console.error('Purchase error:', error);
        if (error.message === 'Insufficient funds') {
            res.status(400).json({ message: 'Insufficient funds' });
        } else {
            res.status(500).json({ message: 'Purchase failed' });
        }
    }
});

export default router;

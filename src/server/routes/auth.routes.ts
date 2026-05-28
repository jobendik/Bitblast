import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';

const router = Router();

export interface AuthenticatedRequest extends Request {
    userId?: number;
}

export const checkAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (token && token.startsWith('mock-jwt-token-')) {
        const userId = parseInt(token.split('-').pop() || '0');
        (req as AuthenticatedRequest).userId = userId;
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

router.post('/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        // Check if user exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                username,
                password, // In a real app, hash this!
                stats: {
                    create: {
                        level: 1,
                        xp: 0
                    }
                },
                currency: {
                    create: {
                        bitblastTokens: 1000,
                        plasmaCredits: 100
                    }
                }
            },
            include: {
                stats: true,
                currency: true
            }
        });

        const token = 'mock-jwt-token-' + user.id;
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                stats: true,
                currency: true
            }
        });

        if (user && user.password === password) {
            // In a real app, we would generate a JWT here
            const token = 'mock-jwt-token-' + user.id;
            // Don't send password back
            const { password, ...userWithoutPassword } = user;
            res.json({ token, user: userWithoutPassword });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/profile', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (token && token.startsWith('mock-jwt-token-')) {
        // Extract ID from mock token
        const userId = parseInt(token.split('-').pop() || '0');

        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    stats: true,
                    currency: true
                }
            });

            if (user) {
                const { password, ...userWithoutPassword } = user;
                res.json(userWithoutPassword);
            } else {
                res.status(404).json({ message: 'User not found' });
            }
        } catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    } else {
        res.status(401).json({ message: 'Invalid token' });
    }
});

export default router;

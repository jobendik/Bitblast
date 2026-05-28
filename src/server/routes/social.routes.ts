import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../prisma';

const router = Router();

interface AuthenticatedRequest extends Request {
    userId?: number;
}

// Middleware to simulate auth check (simplified)
const checkAuth = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token.startsWith('mock-jwt-token-')) {
        (req as AuthenticatedRequest).userId = parseInt(token.split('-').pop() || '0');
        next();
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

router.get('/friends', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;

    try {
        // Find friendships where user is either userId or friendId
        // But our schema has explicit relations: friends (UserFriends) and friendOf (FriendUser)
        // We need to fetch both directions or normalize it.
        // In seed, we created mutual records, so checking 'friends' relation might be enough if we always create both.
        // Let's check 'friends' relation (where user is userId)

        const userWithFriends = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                friends: {
                    include: {
                        friend: true
                    }
                }
            }
        });

        if (!userWithFriends) {
            return res.json([]);
        }

        const friends = userWithFriends.friends.map((f: any) => ({
            id: f.friend.id,
            username: f.friend.username,
            tag: '0000', // Mock tag for now
            status: 'offline', // Mock status for now
            avatar: '/assets/avatars/default.png', // Mock avatar
            activity: 'Online' // Mock activity
        }));

        res.json(friends);
    } catch (error) {
        console.error('Friends error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/friend-requests', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;

    try {
        const incoming = await prisma.friendRequest.findMany({
            where: { receiverId: userId, status: 'PENDING' },
            include: { sender: true }
        });

        const outgoing = await prisma.friendRequest.findMany({
            where: { senderId: userId, status: 'PENDING' },
            include: { receiver: true }
        });

        const incomingDetails = incoming.map((r: any) => ({
            id: r.sender.id,
            username: r.sender.username,
            tag: '0000',
            avatar: '/assets/avatars/default.png'
        }));

        const outgoingDetails = outgoing.map((r: any) => ({
            id: r.receiver.id,
            username: r.receiver.username,
            tag: '0000',
            avatar: '/assets/avatars/default.png'
        }));

        res.json({ incoming: incomingDetails, outgoing: outgoingDetails });
    } catch (error) {
        console.error('Friend requests error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/party', checkAuth, (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const party = partyManager.getUserParty(userId);
    res.json(party || null);
});

router.get('/leaderboard', checkAuth, async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            include: { stats: true },
            orderBy: {
                stats: {
                    xp: 'desc'
                }
            },
            take: 100
        });

        const leaderboard = users.map((user: any, index: number) => ({
            rank: index + 1,
            id: user.id,
            username: user.username,
            level: user.stats?.level || 1,
            xp: user.stats?.xp || 0,
            wins: user.stats?.wins || 0,
            avatar: '/assets/avatars/default.png', // Placeholder
            tag: '0000' // Placeholder
        }));

        res.json(leaderboard);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;

// --- Friend Request Actions ---

router.post('/friends/request', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { username } = req.body;

    try {
        const targetUser = await prisma.user.findUnique({ where: { username } });
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (targetUser.id === userId) {
            return res.status(400).json({ message: 'Cannot add yourself' });
        }

        // Check existing request
        const existing = await prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: userId, receiverId: targetUser.id },
                    { senderId: targetUser.id, receiverId: userId }
                ],
                status: 'PENDING'
            }
        });

        if (existing) {
            return res.status(400).json({ message: 'Request already pending' });
        }

        // Check if already friends
        const alreadyFriends = await prisma.friendship.findFirst({
            where: { userId, friendId: targetUser.id }
        });

        if (alreadyFriends) {
            return res.status(400).json({ message: 'Already friends' });
        }

        await prisma.friendRequest.create({
            data: {
                senderId: userId,
                receiverId: targetUser.id
            }
        });

        res.json({ message: 'Friend request sent' });
    } catch (error) {
        console.error('Send request error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/friends/accept', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { requestId } = req.body;

    try {
        const senderId = parseInt(requestId);

        const request = await prisma.friendRequest.findFirst({
            where: {
                senderId: senderId,
                receiverId: userId,
                status: 'PENDING'
            }
        });

        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Transaction to create friendship both ways and update request
        await prisma.$transaction([
            prisma.friendRequest.update({
                where: { id: request.id },
                data: { status: 'ACCEPTED' }
            }),
            prisma.friendship.create({
                data: { userId, friendId: senderId }
            }),
            prisma.friendship.create({
                data: { userId: senderId, friendId: userId }
            })
        ]);

        res.json({ message: 'Friend request accepted' });
    } catch (error) {
        console.error('Accept request error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- Party Actions ---
import { partyManager } from '../managers/PartyManager';

router.post('/party/create', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    console.log(`[Social] Creating party for user ${userId}`);

    // Get username (optional, but good for display)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const username = user?.username || `User ${userId}`;

    const party = partyManager.createParty(userId, username);
    console.log(`[Social] Party created:`, party);
    res.json(party);
});

import { sendToUser } from '../sockets/socketHandler';

router.post('/party/invite', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { userId: targetUserId } = req.body;

    // Get username
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const username = user?.username || `User ${userId}`;

    // Get party
    const party = partyManager.getUserParty(userId);
    if (!party) {
        return res.status(400).json({ message: 'You are not in a party' });
    }

    // Send socket event
    const io = req.app.get('io');
    const sent = sendToUser(io, targetUserId, 'party_invite', {
        partyId: party.id,
        senderId: userId,
        senderName: username
    });

    if (sent) {
        res.json({ message: 'Invite sent' });
    } else {
        // Still success, maybe they are offline but we could store a notification
        res.json({ message: 'Invite sent (User offline)' });
    }
});

router.post('/party/join', checkAuth, async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { partyId } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const username = user?.username || `User ${userId}`;

    const party = partyManager.joinParty(partyId, userId, username);
    if (!party) {
        return res.status(404).json({ message: 'Party not found' });
    }

    // Emit update to all members
    const io = req.app.get('io');
    party.members.forEach(m => {
        sendToUser(io, m.userId, 'party_update', party);
    });

    res.json(party);
});

router.post('/party/leave', checkAuth, (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const party = partyManager.leaveParty(userId);

    if (party) {
        // Emit update to remaining members
        const io = req.app.get('io');
        party.members.forEach(m => {
            sendToUser(io, m.userId, 'party_update', party);
        });
    }

    res.json({ message: 'Left party' });
});

router.post('/party/kick', checkAuth, (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const { userId: targetUserId } = req.body;

    const party = partyManager.getUserParty(userId);
    if (!party || party.leaderId !== userId) {
        return res.status(403).json({ message: 'Not authorized' });
    }

    const updatedParty = partyManager.kickMember(party.id, targetUserId);

    const io = req.app.get('io');

    // Notify kicked user
    sendToUser(io, targetUserId, 'party_update', null); // null means no party
    sendToUser(io, targetUserId, 'party_kicked', { message: 'You were kicked from the party' });

    if (updatedParty) {
        // Notify remaining members
        updatedParty.members.forEach(m => {
            sendToUser(io, m.userId, 'party_update', updatedParty);
        });
    }

    res.json({ message: 'Player kicked' });
});

router.post('/party/ready', checkAuth, (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).userId!;
    const party = partyManager.getUserParty(userId);

    if (!party) {
        return res.status(400).json({ message: 'Not in a party' });
    }

    const updatedParty = partyManager.toggleReady(party.id, userId);

    if (updatedParty) {
        const io = req.app.get('io');
        updatedParty.members.forEach(m => {
            sendToUser(io, m.userId, 'party_update', updatedParty);
        });
    }

    res.json({ message: 'Ready status toggled' });
});

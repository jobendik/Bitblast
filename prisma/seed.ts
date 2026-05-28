import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USERS = [
    {
        id: 1,
        username: 'NEON_REAPER',
        email: 'neon@bitblast.com',
        password: 'password',
        stats: {
            level: 42,
            xp: 12500,
            nextLevelXp: 15000,
            matches: 156,
            wins: 89,
            kills: 3420,
            deaths: 1205,
            headshots: 850
        },
        currency: {
            bitblastTokens: 1500,
            plasmaCredits: 250
        }
    },
    {
        id: 2,
        username: 'VOID_STRIKER',
        email: 'void@bitblast.com',
        password: 'password',
        stats: {
            level: 38,
            xp: 9800,
            nextLevelXp: 12000,
            matches: 120,
            wins: 65,
            kills: 2100,
            deaths: 980,
            headshots: 500
        },
        currency: {
            bitblastTokens: 800,
            plasmaCredits: 100
        }
    },
    {
        id: 3,
        username: 'CYBER_GHOST',
        email: 'ghost@bitblast.com',
        password: 'password',
        stats: {
            level: 25,
            xp: 5600,
            nextLevelXp: 8000,
            matches: 80,
            wins: 30,
            kills: 1200,
            deaths: 800,
            headshots: 300
        },
        currency: {
            bitblastTokens: 400,
            plasmaCredits: 50
        }
    },
    {
        id: 4,
        username: 'GLITCH_WITCH',
        email: 'glitch@bitblast.com',
        password: 'password',
        stats: {
            level: 50,
            xp: 25000,
            nextLevelXp: 30000,
            matches: 200,
            wins: 150,
            kills: 5000,
            deaths: 1000,
            headshots: 1500
        },
        currency: {
            bitblastTokens: 3000,
            plasmaCredits: 500
        }
    },
    {
        id: 5,
        username: 'DATA_DRAGON',
        email: 'data@bitblast.com',
        password: 'password',
        stats: {
            level: 15,
            xp: 2000,
            nextLevelXp: 4000,
            matches: 40,
            wins: 10,
            kills: 500,
            deaths: 400,
            headshots: 100
        },
        currency: {
            bitblastTokens: 100,
            plasmaCredits: 0
        }
    },
    {
        id: 6,
        username: 'demo',
        email: 'demo@bitblast.com',
        password: 'password',
        stats: {
            level: 1,
            xp: 0,
            nextLevelXp: 1000,
            matches: 0,
            wins: 0,
            kills: 0,
            deaths: 0,
            headshots: 0
        },
        currency: {
            bitblastTokens: 0,
            plasmaCredits: 0
        }
    }
];

async function main() {
    console.log('Start seeding ...');
    for (const u of USERS) {
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {},
            create: {
                email: u.email,
                username: u.username,
                password: u.password,
                stats: {
                    create: u.stats
                },
                currency: {
                    create: u.currency
                }
            },
        });
        console.log(`Created user with id: ${user.id}`);
    }

    // Create Friendships
    // NEON_REAPER (1) friends with VOID_STRIKER (2) and CYBER_GHOST (3)
    await prisma.friendship.create({ data: { userId: 1, friendId: 2 } });
    await prisma.friendship.create({ data: { userId: 2, friendId: 1 } }); // Mutual

    await prisma.friendship.create({ data: { userId: 1, friendId: 3 } });
    await prisma.friendship.create({ data: { userId: 3, friendId: 1 } }); // Mutual

    // Friend Requests
    // GLITCH_WITCH (4) sent request to NEON_REAPER (1)
    await prisma.friendRequest.create({
        data: {
            senderId: 4,
            receiverId: 1,
            status: 'PENDING'
        }
    });

    console.log('Seeding finished.');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });

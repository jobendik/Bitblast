/**
 * Weapon Configurations - Server Side Port
 * Converted from src/config/weaponConfigs.ts
 */

const WeaponType = {
    AK47: 'AK47',
    AWP: 'AWP',
    LMG: 'LMG',
    M4: 'M4',
    Pistol: 'Pistol',
    Scar: 'Scar',
    Shotgun: 'Shotgun',
    Sniper: 'Sniper',
    Tec9: 'Tec9',
};

// Base config objects to reduce duplication
const DEFAULT_SPRAY_PATTERN = {
    enabled: true,
    resetTime: 300,
    scale: 0.002,
    vertical: [1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 7, 6, 5],
    horizontal: [0, 0, 1, -1, 2, -2, 3, -3, 2, -2, 1, -1],
};

const WEAPON_CONFIG = {
    [WeaponType.AK47]: {
        name: 'AK-47',
        damage: 13,
        fireRate: 10,
        magSize: 30,
        reserveAmmo: 90,
        reloadTime: 2.0,
        automatic: true,
        falloff: {
            startDistance: 20,
            endDistance: 50,
            minDamage: 6
        }
    },

    [WeaponType.AWP]: {
        name: 'AWP',
        damage: 43,
        fireRate: 0.8,
        magSize: 10,
        reserveAmmo: 30,
        reloadTime: 2.8,
        automatic: false,
        falloff: {
            startDistance: 100,
            endDistance: 200,
            minDamage: 35
        }
    },

    [WeaponType.LMG]: {
        name: 'LMG',
        damage: 10,
        fireRate: 12,
        magSize: 100,
        reserveAmmo: 200,
        reloadTime: 3.5,
        automatic: true
    },

    [WeaponType.M4]: {
        name: 'M4',
        damage: 12,
        fireRate: 11,
        magSize: 30,
        reserveAmmo: 90,
        reloadTime: 1.8,
        automatic: true
    },

    [WeaponType.Pistol]: {
        name: 'Pistol',
        damage: 9,
        fireRate: 6,
        magSize: 12,
        reserveAmmo: 48,
        reloadTime: 1.2,
        automatic: false
    },

    [WeaponType.Scar]: {
        name: 'SCAR',
        damage: 16,
        fireRate: 9,
        magSize: 20,
        reserveAmmo: 60,
        reloadTime: 2.4,
        automatic: true
    },

    [WeaponType.Shotgun]: {
        name: 'Shotgun',
        damage: 6, // Per pellet
        fireRate: 1.5,
        magSize: 8,
        reserveAmmo: 32,
        reloadTime: 2.5,
        automatic: false,
        pelletCount: 8,
        falloff: {
            startDistance: 5,
            endDistance: 20,
            minDamage: 1
        }
    },

    [WeaponType.Sniper]: {
        name: 'Sniper Rifle',
        damage: 38,
        fireRate: 1.0,
        magSize: 5,
        reserveAmmo: 20,
        reloadTime: 2.8,
        automatic: false
    },

    [WeaponType.Tec9]: {
        name: 'Tec-9',
        damage: 8,
        fireRate: 14,
        magSize: 24,
        reserveAmmo: 72,
        reloadTime: 1.6,
        automatic: true
    },
};

module.exports = {
    WeaponType,
    WEAPON_CONFIG
};

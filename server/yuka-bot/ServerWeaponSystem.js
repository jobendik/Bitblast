/**
 * ServerWeaponSystem.js - Server-side weapon management
 * Handles inventory, selection, and shooting execution
 */

const YUKA = require('yuka');
const { ServerWeapon } = require('./ServerWeapon');
const { WeaponType, WEAPON_CONFIG } = require('./weaponConfigs');

// Weapon status constants
const WEAPON_STATUS_READY = 4;
const WEAPON_STATUS_SHOT = 5;
const WEAPON_STATUS_EMPTY = 7;
const WEAPON_STATUS_OUT_OF_AMMO = 8;
const WEAPON_STATUS_UNREADY = 11;

class ServerWeaponSystem {
    constructor(owner) {
        this.owner = owner;

        // Inventory
        this.weapons = []; // Array of ServerWeapon
        this.weaponsMap = new Map(); // Type -> ServerWeapon

        this.currentWeapon = null;
        this.nextWeaponType = null;

        // Settings
        this.reactionTime = 0.5; // Seconds
        this.aimAccuracy = 2.0;

        // Helper vectors
        this.targetPosition = new YUKA.Vector3();
        this.aimOffset = new YUKA.Vector3();
    }

    init() {
        this.reset();
        return this;
    }

    reset() {
        this.weapons = [];
        this.weaponsMap.clear();
        this.currentWeapon = null;
        this.nextWeaponType = null;
        return this;
    }

    addWeapon(type) {
        if (!WEAPON_CONFIG[type]) {
            console.warn(`[ServerWeaponSystem] Cannot add unknown weapon type: ${type}`);
            return this;
        }

        let weapon = this.weaponsMap.get(type);

        if (weapon) {
            // Already has weapon, add ammo (full reserve refill for now)
            weapon.addRounds(WEAPON_CONFIG[type].reserveAmmo);
        } else {
            // Create new weapon
            weapon = new ServerWeapon(this.owner, type);
            this.weapons.push(weapon);
            this.weaponsMap.set(type, weapon);

            // If this is the first weapon, equip it
            if (!this.currentWeapon) {
                this.currentWeapon = weapon;
                this.currentWeapon.status = WEAPON_STATUS_READY;
            }
        }
        return this;
    }

    changeWeapon(type) {
        const weapon = this.weaponsMap.get(type);
        if (weapon) {
            this.currentWeapon = weapon;
            // In a real system we'd have equip timers, but for now instant swap
            this.currentWeapon.status = WEAPON_STATUS_READY;
        }
    }

    selectBestWeapon() {
        const target = this.owner.targetSystem.getTarget();
        if (target) {
            let highestDesirability = -1;
            let bestWeaponType = null;

            const distanceToTarget = this.owner.position.distanceTo(target.position);

            this.weapons.forEach(weapon => {
                let desirability = (weapon.roundsLeft === 0 && weapon.ammo === 0) ? 0 : weapon.getDesirability(distanceToTarget);

                // Penalty for switching
                if (this.currentWeapon !== weapon) {
                    desirability -= 5; // Configurable cost
                }

                if (desirability > highestDesirability) {
                    highestDesirability = desirability;
                    bestWeaponType = weapon.type;
                }
            });

            if (bestWeaponType && bestWeaponType !== this.currentWeapon.type) {
                this.setNextWeapon(bestWeaponType);
            }
        }
    }

    setNextWeapon(type) {
        if (this.currentWeapon.type !== type) {
            this.nextWeaponType = type;
        }
    }

    update(delta) {
        // Update all weapons (for internal timers like reload)
        this.weapons.forEach(w => w.update(delta));

        // Handle switching
        if (this.nextWeaponType) {
            // Simplified switching: just do it immediately
            this.changeWeapon(this.nextWeaponType);
            this.nextWeaponType = null;
        }

        // Handle Aiming and Shooting
        this.updateAimAndShot(delta);
    }

    updateAimAndShot(delta) {
        const owner = this.owner;
        const targetSystem = owner.targetSystem;
        const target = targetSystem.getTarget();

        if (target && targetSystem.isTargetShootable()) {

            // Rotate towards target
            const targeted = owner.rotateTo(target.position, delta, 0.1);

            const timeBecameVisible = targetSystem.getTimeBecameVisible();
            const elapsedTime = owner.currentTime;

            // Fire if facing target and reaction time passed
            if (targeted && (elapsedTime - timeBecameVisible) >= this.reactionTime) {

                // Get center mass
                this.targetPosition.copy(target.position);
                this.targetPosition.y += 1.0; // Aim at chest height roughly

                // Add aim noise
                this.addNoiseToAim(this.targetPosition);

                this.shoot(this.targetPosition);
            }
        }
    }

    addNoiseToAim(targetPos) {
        const distance = this.owner.position.distanceTo(targetPos);
        const noise = Math.min(distance / 20, 1.0) * this.aimAccuracy; // More noise at range

        this.aimOffset.x = (Math.random() - 0.5) * noise;
        this.aimOffset.y = (Math.random() - 0.5) * noise;
        this.aimOffset.z = (Math.random() - 0.5) * noise;

        targetPos.add(this.aimOffset);
    }

    shoot(targetPos) {
        if (!this.currentWeapon) return;

        const weapon = this.currentWeapon;

        // Auto reload if empty
        if (weapon.status === WEAPON_STATUS_EMPTY) {
            weapon.reload();
            return;
        }

        if (weapon.status === WEAPON_STATUS_READY) {
            if (weapon.shoot()) {
                // Determine Hit
                this.performHitScan(targetPos, weapon.config.damage);

                // Send "attack" event via owner (so ServerBotManager picks it up)
                this.owner.pendingAttack = {
                    targetId: null, // Will be filled by hitscan if successful, or just visual
                    damage: weapon.config.damage,
                    weapon: weapon.type
                };
            }
        }
    }

    performHitScan(targetPos, damage) {
        // Simplified Hitscan:
        // 1. Ray from owner to noisy targetPos
        // 2. Check intersection with Competitors

        const rayOrigin = new YUKA.Vector3().copy(this.owner.position);
        rayOrigin.y += 1.5; // Eye height

        const rayDir = new YUKA.Vector3().subVectors(targetPos, rayOrigin).normalize();

        const competitors = this.owner.world.getCompetitors();
        let closestHit = null;
        let closestDist = Infinity;

        // Temp vectors for math
        const tempVec = new YUKA.Vector3();
        const opponentPos = new YUKA.Vector3();

        for (const comp of competitors) {
            if (comp === this.owner) continue;
            if (comp.status && comp.status !== 12) continue; // STATUS_ALIVE check (12)

            // Simple Sphere/Cylinder test
            // Project competitors center onto ray
            opponentPos.copy(comp.position);
            opponentPos.y += 1.0; // Center mass

            const toOpponent = new YUKA.Vector3().subVectors(opponentPos, rayOrigin);
            const projection = toOpponent.dot(rayDir);

            if (projection < 0) continue; // Behind us

            // Closest point on ray to opponent center
            tempVec.copy(rayDir).multiplyScalar(projection).add(rayOrigin);

            const distToRay = tempVec.distanceTo(opponentPos);

            // Hit radius (approx 0.5m for human/bot)
            if (distToRay < 0.6) {
                if (projection < closestDist) {
                    closestDist = projection;
                    closestHit = comp;
                }
            }
        }

        if (closestHit) {
            // Register hit on owner so Manager can broadcast
            // We overload pendingAttack to include specific target
            this.owner.pendingAttack = {
                targetId: closestHit.oderId || closestHit.uuid,
                damage: damage,
                weapon: this.currentWeapon.type
            };

            console.log(`[WeaponSytem] ${this.owner.name} HIT ${closestHit.name} with ${this.currentWeapon.type}`);
        }
    }
}

module.exports = { ServerWeaponSystem };

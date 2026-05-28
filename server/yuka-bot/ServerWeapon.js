/**
 * ServerWeapon.js - Server-side weapon logic
 * Handles ammo, reloading, and suitability scoring
 */

const YUKA = require('yuka');
const { WEAPON_CONFIG } = require('./weaponConfigs');

// Weapon status constants
const WEAPON_STATUS_READY = 4;
const WEAPON_STATUS_SHOT = 5;
const WEAPON_STATUS_RELOAD = 6;
const WEAPON_STATUS_EMPTY = 7;
const WEAPON_STATUS_OUT_OF_AMMO = 8;
const WEAPON_STATUS_UNREADY = 11; // During swap

class ServerWeapon {
    constructor(owner, type) {
        this.owner = owner;
        this.type = type;
        this.config = WEAPON_CONFIG[type];

        if (!this.config) {
            console.error(`[ServerWeapon] Invalid weapon type: ${type}`);
            return;
        }

        // State
        this.status = WEAPON_STATUS_READY;
        this.roundsLeft = this.config.magSize;
        this.ammo = this.config.reserveAmmo;

        // Timers
        this.endTimeReload = Infinity;
        this.endTimeShot = Infinity;
        this.nextShotTime = 0; // Absolute time

        // Fuzzy logic for desirability
        this.fuzzyModule = new YUKA.FuzzyModule();
        this._initFuzzyRules();
    }

    /**
     * Initialize fuzzy rules for weapon desirability
     * Matches logic from client weapons but generalized
     */
    _initFuzzyRules() {
        const fl = this.fuzzyModule;

        // Variables
        // Variables
        const dist = new YUKA.FuzzyVariable();
        const ammo = new YUKA.FuzzyVariable();
        const desirability = new YUKA.FuzzyVariable();

        fl.addFLV('distanceToTarget', dist);
        fl.addFLV('ammoStatus', ammo);
        fl.addFLV('desirability', desirability);

        // Distance sets (Close, Medium, Far)
        const close = new YUKA.LeftShoulderFuzzySet(0, 5, 20);
        const medium = new YUKA.TriangularFuzzySet(10, 30, 50);
        const far = new YUKA.RightShoulderFuzzySet(40, 80, 10000);

        dist.add(close);
        dist.add(medium);
        dist.add(far);

        // Ammo sets (Low, Okay, Full)
        const low = new YUKA.LeftShoulderFuzzySet(0, 0, this.config.magSize * 0.2);
        const okay = new YUKA.TriangularFuzzySet(0, this.config.magSize * 0.5, this.config.magSize);
        const full = new YUKA.RightShoulderFuzzySet(this.config.magSize * 0.8, this.config.magSize, this.config.magSize);

        ammo.add(low);
        ammo.add(okay);
        ammo.add(full);

        // Desirability sets (Undesirable, Desirable, VeryDesirable)
        const undesirable = new YUKA.LeftShoulderFuzzySet(0, 25, 50);
        const desirable = new YUKA.TriangularFuzzySet(25, 50, 75);
        const veryDesirable = new YUKA.RightShoulderFuzzySet(50, 75, 100);

        desirability.add(undesirable);
        desirability.add(desirable);
        desirability.add(veryDesirable);

        // Store sets for rule creation
        const fuzzySets = {
            close, medium, far,
            low, okay, full,
            undesirable, desirable, veryDesirable
        };

        // Rules - Customize based on weapon type properties
        this._addSpecificRules(fl, fuzzySets);
    }

    _addSpecificRules(fl, sets) {
        // General logic based on range effectiveness
        // This approximates the hardcoded behaviors in client classes

        // Ranges:
        // Shotgun: Beast at Close, bad at Far
        // SMG/Pistol: Good at Close/Medium
        // Rifle: Good at Medium/Far
        // Sniper: Beast at Far, okay at Medium, bad at Close

        const isShotgun = this.type === 'Shotgun';
        const isSniper = this.type === 'Sniper' || this.type === 'AWP';
        const isRifle = this.type === 'AK47' || this.type === 'M4' || this.type === 'Scar' || this.type === 'LMG';

        if (isShotgun) {
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.full), sets.veryDesirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.okay), sets.veryDesirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.far, sets.full), sets.undesirable));
        } else if (isSniper) {
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.far, sets.full), sets.veryDesirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.medium, sets.full), sets.desirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.full), sets.undesirable));
        } else if (isRifle) {
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.medium, sets.full), sets.veryDesirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.far, sets.full), sets.desirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.full), sets.desirable));
        } else {
            // Default (Pistol/SMG)
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.full), sets.desirable));
            fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.medium, sets.full), sets.undesirable));
        }

        // Low ammo makes everything less desirable
        fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.close, sets.low), sets.undesirable));
        fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.medium, sets.low), sets.undesirable));
        fl.addRule(new YUKA.FuzzyRule(new YUKA.FuzzyAND(sets.far, sets.low), sets.undesirable));
    }

    update(delta) {
        const currentTime = this.owner.currentTime;

        // check reload
        if (this.status === WEAPON_STATUS_RELOAD) {
            if (currentTime >= this.endTimeReload) {
                const toReload = this.config.magSize - this.roundsLeft;
                if (this.ammo >= toReload) {
                    this.roundsLeft = this.config.magSize;
                    this.ammo -= toReload;
                } else {
                    this.roundsLeft += this.ammo;
                    this.ammo = 0;
                }
                this.status = WEAPON_STATUS_READY;
                this.endTimeReload = Infinity;
                console.log(`[ServerWeapon] ${this.type} reloaded. Clip: ${this.roundsLeft}, Reserve: ${this.ammo}`);
            }
        }

        // check shot cooldown
        if (this.status === WEAPON_STATUS_SHOT) {
            if (currentTime >= this.endTimeShot) {
                if (this.roundsLeft === 0) {
                    this.status = (this.ammo === 0) ? WEAPON_STATUS_OUT_OF_AMMO : WEAPON_STATUS_EMPTY;
                } else {
                    this.status = WEAPON_STATUS_READY;
                }
                this.endTimeShot = Infinity;
            }
        }
    }

    reload() {
        if (this.status === WEAPON_STATUS_READY || this.status === WEAPON_STATUS_EMPTY) {
            this.status = WEAPON_STATUS_RELOAD;
            this.endTimeReload = this.owner.currentTime + this.config.reloadTime;
        }
    }

    shoot() {
        if (this.status !== WEAPON_STATUS_READY) return false;

        this.status = WEAPON_STATUS_SHOT;
        this.roundsLeft--;
        this.endTimeShot = this.owner.currentTime + (1 / this.config.fireRate);

        return true;
    }

    getDesirability(distance) {
        this.fuzzyModule.fuzzify('distanceToTarget', distance);
        this.fuzzyModule.fuzzify('ammoStatus', this.roundsLeft);
        return this.fuzzyModule.defuzzify('desirability');
    }

    getRemainingRounds() {
        return this.roundsLeft;
    }

    addRounds(amount) {
        this.ammo += amount;
    }
}

module.exports = { ServerWeapon };

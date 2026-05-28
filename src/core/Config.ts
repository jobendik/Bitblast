import { PLAYER_CONFIG } from '../config/gameConfig';

const CONFIG = {
	AUDIO: {
		VOLUME_IMPACT: 0.2, // volume
		VOLUME_MUSIC: 0.4 // volume
	},
	PLAYER: {
		BOUNDING_RADIUS: 0.5, // meter
		DYING_TIME: 3, // seconds
		HEAD_HEIGHT: 1.7, // meter
		MAX_HEALTH: PLAYER_CONFIG.maxHealth, // health points
		MAX_SPEED: PLAYER_CONFIG.sprintSpeed || 6 // meter/seconds
	},
	CONTROLS: {
		LOOKING_SPEED: 2, // unitless
		BRAKING_POWER: 10, // unitless
		HEAD_MOVEMENT: 1.2, // unitless
		WEAPON_MOVEMENT: 1.2, // unitless
		ACCELERATION: 60 // unitless
	},
	HEALTH_PACK: {
		HEALTH: 50, // health
		RESPAWN_TIME: 10, // seconds
		RADIUS: 1 // world units
	},
	BOT: {
		MOVEMENT: {
			MAX_SPEED: 3, // meter/seconds
			DODGE_SIZE: 4 // meter
		},
		GOAL: {
			UPDATE_FREQUENCY: 5, // number per seconds
			ITEM_VISIBILITY_UPDATE_FREQUENCY: 1 // number per seconds
		},
		MEMORY: {
			SPAN: 20 // seconds
		},
		NAVIGATION: {
			NEXT_WAYPOINT_DISTANCE: 0.5, // meter
			ARRIVE_DECELERATION: 2, // unitless
			ARRIVE_TOLERANCE: 1, // meter
			PATH_RADIUS: 0.1, // meter
			ONPATH_WEIGHT: 1 // unitless
		},
		TARGET_SYSTEM: {
			UPDATE_FREQUENCY: 5 // number per seconds
		},
		VISION: {
			UPDATE_FREQUENCY: 5, // number per seconds
			FOV: 140, // degrees
			RANGE: 40 // meter
		},
		WEAPON: {
			UPDATE_FREQUENCY: 4, // number per seconds
			REACTION_TIME: 1, // seconds
			AIM_ACCURACY: 3, // meter
			CHANGE_COST: 0.2, // desirability
			NOISE_MAX_DISTANCE: 100 // meter
		},
		BOUNDING_RADIUS: 0.5, // meter
		COUNT: 3, // number
		HEAD_HEIGHT: 1.5, // meter
		MAX_HEALTH: PLAYER_CONFIG.maxHealth, // health points (equal to player)
		DYING_TIME: 3, // seconds
		SEARCH_FOR_ATTACKER_TIME: 3, // seconds
		MIN_ITEM_RANGE: 2, // meter
		MAX_ITEM_RANGE: 100, // meter
		IGNORE_ITEMS_TIMEOUT: 30, // seconds
		GOAL_ARBITRATION_FREQUENCY: 5, // number per seconds
	},
	BLASTER: {
		ROUNDS_LEFT: 12, // number
		ROUNDS_PER_CLIP: 12, // number
		AMMO: 48, // number
		MAX_AMMO: 48, // number
		SHOT_TIME: 0.4, // seconds
		RELOAD_TIME: 1.6, // seconds
		MUZZLE_TIME: 0.04, // seconds
		EQUIP_TIME: 0.5, // seconds
		HIDE_TIME: 0.5, // seconds
		SPREAD: 0.01, // unitless
		RESPAWN_TIME: 10, // seconds
		RADIUS: 1, // world units

	},
	SHOTGUN: {
		ROUNDS_LEFT: 6, // number
		ROUNDS_PER_CLIP: 6, // number
		AMMO: 24, // number
		MAX_AMMO: 24, // number
		SHOT_TIME: 1.2, // seconds
		RELOAD_TIME: 1.6, // seconds
		SHOT_RELOAD_TIME: 0.5, // seconds
		MUZZLE_TIME: 0.04, // seconds
		EQUIP_TIME: 1, // seconds
		HIDE_TIME: 1, // seconds
		SPREAD: 0.05, // unitless
		BULLETS_PER_SHOT: 6, // number
		RESPAWN_TIME: 10, // seconds
		RADIUS: 1, // world units

	},
	ASSAULT_RIFLE: {
		ROUNDS_LEFT: 30, // number
		ROUNDS_PER_CLIP: 30, // number
		AMMO: 90, // number
		MAX_AMMO: 90, // number
		SHOT_TIME: 0.2, // seconds
		RELOAD_TIME: 1.6, // seconds
		MUZZLE_TIME: 0.04, // seconds
		EQUIP_TIME: 1, // seconds
		HIDE_TIME: 1, // seconds
		SPREAD: 0.01, // unitless
		RESPAWN_TIME: 10, // seconds
		RADIUS: 1, // world units

	},
	BULLET: {
		MAX_SPEED: 400, // meter/seconds
		LIFETIME: 1, // seconds
		DAMAGE: 20 // health points
	},
	UI: {
		FRAGS: {
			TIME: 5, // seconds
		}
	},
	NAVMESH: {
		HEIGHT_CHANGE_FACTOR: 0.2 // unitless
	}
};

export { CONFIG };

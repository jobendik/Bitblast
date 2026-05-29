import { EntityManager, Time, MeshGeometry, Vector3, CellSpacePartitioning } from 'yuka';
import * as THREE from 'three';
import { WebGLRenderer, Scene, PerspectiveCamera, Color, AnimationMixer, Object3D, SkeletonHelper, SRGBColorSpace, ShaderMaterial, Vector3 as ThreeVector3, Mesh, Box3, BoxGeometry, MeshBasicMaterial, FogExp2 } from 'three';
import { HemisphereLight, DirectionalLight, PointLight } from 'three';
import { AxesHelper } from 'three';
import { PostProcessingSystem } from '../systems/PostProcessingSystem';

import { AssetManager } from './AssetManager';
import { SpawningManager } from './SpawningManager';
import { UIManager } from './UIManager';
import { FirstPersonControls, MobileControls } from '../controls';
import { NavMeshUtils } from '../utils/NavMeshUtils';
import { SceneUtils } from '../utils/SceneUtils';
import { Level } from '../entities/Level';
import { Bot } from '../entities/Bot';
import { Player } from '../entities/Player';
import { Bullet } from '../weapons/Bullet';
import { PathPlanner } from '../utils/PathPlanner';
import { Sky } from '../effects/Sky';
import { CONFIG } from './Config';
import { CAMERA_CONFIG } from '../config/gameConfig';
import { Points } from 'three';

// Combat and game systems
import { CombatManager } from './CombatManager';
import { GameModeManager, GameModeType } from '../gamemodes';
import { NetworkManager, RemoteBot, ServerBotState } from '../network';
import { LobbyManager, LobbyUI, LobbyEventType } from '../lobby';
import { SurfaceMaterial } from '../systems/DecalSystem';
import { MatchManager, getMatchManager } from './MatchManager';
import { BotConfig } from '../types/competitor';
import { PlayerCompetitor, BotCompetitor } from '../entities/CompetitorAdapter';
import { getBitBlastServerUrl } from '../config/network';
import { AICoordinationSystem } from './AICoordinationSystem';
import { SoundPropagationSystem } from './SoundPropagationSystem';

const currentIntersectionPoint = new Vector3();

// Realistic gamer names pool - bots will use these to blend in with real players
const GAMER_NAMES = [
	'xShadowKiller', 'NightHawk99', 'VelocityX', 'StormBringer', 'PhantomAce',
	'CyberWolf', 'BlazeMaster', 'IronReaper', 'QuantumFury', 'SteelVenom',
	'DarkSpectre', 'ThunderBolt', 'RapidFire', 'SilentStrike', 'NovaFlash',
	'ZeroGravity', 'ToxicViper', 'GhostRider', 'AlphaStorm', 'NeonBlade',
	'SkyFall', 'OmegaWolf', 'CrimsonFang', 'FrostBite', 'EliteSniper',
	'WarMachine', 'ShadowFox', 'BulletProof', 'DeathMatch', 'HyperX',
	'TurboKill', 'NightOwl', 'FireStorm', 'IceBreaker', 'VenomStrike',
	'DarkKnight', 'StealthMode', 'RogueAgent', 'SpeedDemon', 'AcidRain'
];

/**
* Class for representing the game world. It's the key point where
* the scene and all game entities are created and managed.
*
*/
class World {

	// Combat and game systems
	public combat!: CombatManager;
	public postProcessing!: PostProcessingSystem;
	public gameModeManager!: GameModeManager;
	public networkManager!: NetworkManager;
	public lobbyManager!: LobbyManager;
	public lobbyUI!: LobbyUI;
	public matchManager!: MatchManager;
	public aiCoordinationSystem!: AICoordinationSystem;
	public soundPropagationSystem!: SoundPropagationSystem;

	// Match bot configurations (set by MatchManager)
	public _matchBotConfigs?: BotConfig[];

	// Physics collision objects
	public arenaObjects: Array<{ mesh: Mesh; box: Box3 }> = [];

	// Mouse tracking for weapon system
	private mouseMovement: { x: number; y: number } = { x: 0, y: 0 };
	private headBobTime: number = 0;

	// Mobile support
	public isMobile: boolean = MobileControls.isMobileDevice();

	// FOV / zoom / sprint animation state. The World owns camera.fov; ScreenEffects
	// contributes only an additive punch offset so nothing fights over the FOV.
	private currentFOV: number = CAMERA_CONFIG.baseFOV;
	private readonly baseFOV: number = CAMERA_CONFIG.baseFOV;
	private readonly zoomedFOV: number = 15;
	private readonly sprintFOV: number = CAMERA_CONFIG.sprintFOV;
	private readonly fovLerpSpeed: number = CAMERA_CONFIG.fovLerpSpeed; // Higher = faster transition
	private isZoomActive: boolean = false;
	public zoomTransitionProgress: number = 0;

	// Camera recoil is applied as a per-frame delta so it fully recovers to centre.
	private lastRecoilPitch: number = 0;
	private lastRecoilYaw: number = 0;

	// Convenience getter for HUD Manager
	public get hudManager() {
		return this.combat?.hudManager;
	}

	// Convenience getter for mobile controls
	public get mobileControls(): MobileControls | null {
		return this.fpsControls?.mobileControls || null;
	}

	public entityManager: EntityManager;
	public time: Time;
	public tick: number;

	public assetManager!: AssetManager;
	public navMesh: any;
	public costTable: any;
	public pathPlanner!: PathPlanner;
	public spawningManager: SpawningManager;
	public uiManager: UIManager;

	public renderer!: WebGLRenderer;
	public camera!: PerspectiveCamera;
	public scene!: Scene;
	public fpsControls!: FirstPersonControls;
	public useFPSControls: boolean;

	// Weather effects
	private rainParticles!: Points;
	private lightningFlashLight!: PointLight;
	private lightningTime: number = 0;
	private nextLightningTime: number = 5 + Math.random() * 10;

	public player!: Player;
	public level!: Level;

	public botCount: number;
	public competitors: Array<any>;

	// Server-authoritative remote bots (multiplayer only)
	public remoteBots: Map<string, RemoteBot> = new Map();
	public isMultiplayerMode: boolean = false;

	public _animate: () => void;
	public _onWindowResize: () => void;

	public debug: boolean;

	public helpers: {
		convexRegionHelper: Object3D | null;
		spatialIndexHelper: Object3D | null;
		axesHelper: AxesHelper | null;
		graphHelper: Object3D | null;
		pathHelpers: Array<Object3D>;
		spawnHelpers: Object3D | null;
		uuidHelpers: Array<Object3D>;
		skeletonHelpers: Array<SkeletonHelper>;
		itemHelpers: Array<Object3D>;
	};

	constructor() {

		this.entityManager = new EntityManager();
		this.time = new Time();
		this.tick = 0;

		this.spawningManager = new SpawningManager(this);
		this.uiManager = new UIManager(this);

		this.useFPSControls = true;

		this.botCount = CONFIG.BOT.COUNT;
		this.competitors = new Array();

		this._animate = this.animate.bind(this);
		this._onWindowResize = this.onWindowResize.bind(this);

		this.debug = false; this.helpers = {
			convexRegionHelper: null,
			spatialIndexHelper: null,
			axesHelper: null,
			graphHelper: null,
			pathHelpers: new Array(),
			spawnHelpers: null,
			uuidHelpers: new Array(),
			skeletonHelpers: new Array(),
			itemHelpers: new Array()
		};

		this.aiCoordinationSystem = new AICoordinationSystem(this);
		this.soundPropagationSystem = new SoundPropagationSystem(this);

	}

	/**
	* Entry point for the game. It initializes the asset manager and then
	* starts to build the game environment.
	*
	* @param {Function} onReady - Optional callback when world is fully initialized
	* @return {World} A reference to this world object.
	*/
	init(onReady?: () => void) {

		this.assetManager = new AssetManager();

		this.assetManager.init().then(() => {

			try {
				this._initScene();
				this._initLevel();
				this._initBots();
				this._initPlayer();
				this._initControls();
				this._initUI();

				// Pre-compile all shaders to prevent flickering during gameplay
				this._precompileShaders();

				this._animate();

				// Hide loading screen now that game is ready
				this._hideLoadingScreen();

				// Call ready callback if provided
				if (onReady) {
					try {
						onReady();
					} catch (err) {
						console.error('[World] onReady callback threw error:', err);
					}
				}
			} catch (err) {
				console.error('[World] Subsystem initialization failed:', err);
				// Still try to call onReady so game can attempt to continue
				if (onReady) {
					onReady();
				}
			}

		}).catch((err) => {
			console.error('[World] AssetManager init failed:', err);
		});

		return this;

	}

	/**
	* Pre-compiles all shaders and uploads all textures to GPU before gameplay starts.
	* This prevents flickering caused by runtime shader compilation or texture upload.
	*/
	private _precompileShaders(): void {
		try {
			// Force upload ALL textures to GPU first
			this._forceTextureUpload();

			// Force compile all materials in the scene
			this.renderer.compile(this.scene, this.camera);

			// Also compile post-processing shaders by doing a warm-up render
			if (this.postProcessing) {
				this.renderer.clear();
				this.postProcessing.render();
			}

			// Do a few warm-up frames to ensure everything is stable
			for (let i = 0; i < 3; i++) {
				this.renderer.clear();
				this.renderer.render(this.scene, this.camera);
				if (this.postProcessing) {
					this.postProcessing.render();
				}
			}
		} catch (err) {
			console.error('❌ Shader pre-compilation failed:', err);
			// Continue anyway - game should still work
		}
	}

	/**
	* Forces all textures in the scene to be uploaded to the GPU immediately.
	* This prevents black frame flashes when textures are sampled before upload.
	*/
	private _forceTextureUpload(): void {
		const textures = this.assetManager.textures;
		const renderer = this.renderer;

		// Iterate through all loaded textures and force GPU upload
		textures.forEach((texture) => {
			if (texture) {
				// initTexture forces the texture to be uploaded to GPU
				renderer.initTexture(texture);
			}
		});

		// Also force upload any textures from materials in the scene
		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh && object.material) {
				const materials = Array.isArray(object.material) ? object.material : [object.material];
				materials.forEach((material) => {
					// Handle ShaderMaterial uniforms
					if (material instanceof THREE.ShaderMaterial && material.uniforms) {
						Object.values(material.uniforms).forEach((uniform: any) => {
							if (uniform.value && uniform.value.isTexture) {
								renderer.initTexture(uniform.value);
							}
						});
					}
					// Handle standard material maps
					if (material.map) renderer.initTexture(material.map);
					if ((material as any).normalMap) renderer.initTexture((material as any).normalMap);
					if ((material as any).roughnessMap) renderer.initTexture((material as any).roughnessMap);
					if ((material as any).metalnessMap) renderer.initTexture((material as any).metalnessMap);
					if ((material as any).aoMap) renderer.initTexture((material as any).aoMap);
					if ((material as any).emissiveMap) renderer.initTexture((material as any).emissiveMap);
				});
			}
		});
	}

	/**
	* Adds the given game entity to the game world. This means it is
	* added to the entity manager and to the scene if it has a render component.
	*
	* @param {GameEntity} entity - The game entity to add.
	* @return {World} A reference to this world object.
	*/
	add(entity: any): this {

		this.entityManager.add(entity);

		if (entity._renderComponent !== null) {

			this.scene.add(entity._renderComponent);

		}

		return this;

	}

	/**
	* Removes the given game entity from the game world. This means it is
	* removed from the entity manager and from the scene if it has a render component.
	*
	* @param {GameEntity} entity - The game entity to remove.
	* @return {World} A reference to this world object.
	*/
	remove(entity: any): this {

		this.entityManager.remove(entity);

		if (entity._renderComponent !== null) {

			this.scene.remove(entity._renderComponent);

		}

		return this;

	}

	/**
	* Removes one bot from the game to make room for a remote player.
	* This maintains the max player count when human players join.
	*
	* @return {boolean} True if a bot was removed, false if no bots to remove.
	*/
	removeOneBot(): boolean {
		// Find a bot to remove (last one in competitors list)
		const botIndex = this.competitors.findIndex((c: any) => c.constructor?.name === 'Bot');
		if (botIndex === -1) {
			return false;
		}

		const bot = this.competitors[botIndex];

		// Remove from competitors array
		this.competitors.splice(botIndex, 1);

		// Remove from game mode scores
		const currentMode = this.gameModeManager?.getCurrentMode();
		if (currentMode) {
			const state = (currentMode as any).state;
			if (state?.scores) {
				state.scores.delete(bot.uuid);
			}
		}

		// Remove from entity manager and scene
		this.remove(bot);

		// Decrease bot count
		this.botCount = Math.max(0, this.botCount - 1);

		return true;
	}

	/**
	* Creates a floating name label sprite for displaying above entities.
	*
	* @param {string} name - The name to display on the label.
	* @return {THREE.Sprite} The name label sprite.
	*/
	createNameLabel(name: string): THREE.Sprite {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;
		canvas.width = 256;
		canvas.height = 64;

		// Semi-transparent background
		context.fillStyle = 'rgba(0, 0, 0, 0.5)';
		context.fillRect(0, 0, canvas.width, canvas.height);

		// White text
		context.font = 'bold 24px Arial';
		context.fillStyle = 'white';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(name, canvas.width / 2, canvas.height / 2);

		const texture = new THREE.CanvasTexture(canvas);
		const spriteMaterial = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			depthTest: false,
		});

		const sprite = new THREE.Sprite(spriteMaterial);
		sprite.scale.set(1.5, 0.4, 1);
		return sprite;
	}

	/**
	* Adds a bullet to the game world. The bullet is defined by the given
	* parameters and created by the method.
	*
	* @param {GameEntity} owner - The owner of the bullet.
	* @param {Ray} ray - The ray that defines the trajectory of this bullet.
	* @return {World} A reference to this world object.
	*/
	addBullet(owner: any, ray: any): this {

		const bulletLine = this.assetManager.models.get('bulletLine').clone();
		bulletLine.visible = false;

		const bullet = new Bullet(owner, ray);
		bullet.setRenderComponent(bulletLine, sync);

		this.add(bullet);

		return this;

	}

	/**
	* The method checks if compatible game entities intersect with a projectile.
	* The closest hitted game entity is returned. If no intersection is detected,
	* null is returned. A possible intersection point is stored into the second parameter.
	*
	* @param {Projectile} projectile - The projectile.
	* @param {Vector3} intersectionPoint - The intersection point.
	* @return {GameEntity} The hitted game entity.
	*/
	checkProjectileIntersection(projectile: any, intersectionPoint: any) {

		const entities = this.entityManager.entities;
		let minDistance = Infinity;
		let hittedEntity = null;
		let hitNormal = null;

		const owner = projectile.owner;
		const ray = projectile.ray;

		for (let i = 0, l = entities.length; i < l; i++) {

			const entity = entities[i] as any;

			// do not test with the owner entity and only process entities with the correct interface

			if (entity !== owner && entity.active && entity.checkProjectileIntersection) {

				if (entity.checkProjectileIntersection(ray, currentIntersectionPoint) !== null) {

					const squaredDistance = currentIntersectionPoint.squaredDistanceTo(ray.origin);

					if (squaredDistance < minDistance) {

						minDistance = squaredDistance;
						hittedEntity = entity;

						intersectionPoint.copy(currentIntersectionPoint);

						// For level hits, calculate normal for decals
						if (entity === this.level) {
							// Approximate normal from ray direction (will be improved with proper BVH normal extraction)
							hitNormal = new Vector3().copy(ray.direction).multiplyScalar(-1).normalize();
						}

					}

				}


			}

		}

		// Store hit normal for decal creation
		if (hitNormal && hittedEntity === this.level) {
			(projectile as any)._lastHitNormal = hitNormal;
		}

		return hittedEntity;

	}



	/**
	* Inits all basic objects of the scene like the scene graph itself, the camera, lights
	* or the renderer.
	*
	* @return {World} A reference to this world object.
	*/
	_initScene() {

		// scene

		this.scene = new Scene();
		this.scene.background = new Color(0xffffff);

		// camera

		this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.001, 1000);
		this.camera.position.set(0, 7.5, 10);
		this.camera.add(this.assetManager.listener);
		this.scene.add(this.camera); // Fix: Add camera to scene so its children (weapons) are rendered

		// helpers

		if (this.debug) {

			this.helpers.axesHelper = new AxesHelper(5);
			this.helpers.axesHelper.visible = false;
			this.scene.add(this.helpers.axesHelper);

		}

		// === DRAMATIC ARENA LIGHTING ===

		// Atmospheric fog for depth
		this.scene.fog = new FogExp2(0x4a5560, 0.004);
		this.scene.background = new Color(0x3a4550); // Dark stormy sky

		// Hemisphere light - overcast atmosphere
		const hemiLight = new HemisphereLight(0x8090a0, 0x606870, 1.2); // Increased from 0.8
		hemiLight.position.set(0, 100, 0);
		this.scene.add(hemiLight);

		// Additional ambient light to ensure minimum visibility everywhere
		const ambientLight = new THREE.AmbientLight(0x707070, 0.8); // Increased from 0x606060, 0.6
		this.scene.add(ambientLight);

		// Main directional light (diffused through clouds) with shadows
		const dirLight = new DirectionalLight(0xd0e0f0, 1.8); // Brighter for contrast
		dirLight.position.set(-700, 1000, -750);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.width = this.isMobile ? 1024 : 2048;
		dirLight.shadow.mapSize.height = this.isMobile ? 1024 : 2048;
		dirLight.shadow.camera.near = 100;
		dirLight.shadow.camera.far = 2500;
		dirLight.shadow.camera.left = -500;
		dirLight.shadow.camera.right = 500;
		dirLight.shadow.camera.top = 500;
		dirLight.shadow.camera.bottom = -500;
		dirLight.shadow.bias = -0.0005;
		this.scene.add(dirLight);

		// Dramatic ambient lighting for gameplay visibility
		// Cool backlight for atmosphere
		const backLight = new PointLight(0x8090b0, 1.8, 180, 1.8);
		backLight.position.set(-40, 12, -30);
		this.scene.add(backLight);

		// Warm contrast light
		const warmAccent = new PointLight(0xc09070, 1.2, 150, 2.0);
		warmAccent.position.set(40, 12, 30);
		this.scene.add(warmAccent);

		// Strong ambient fill for competitive visibility
		const ambientFill = new PointLight(0x90a0b0, 1.4, 200, 2.0);
		ambientFill.position.set(0, 15, 0);
		this.scene.add(ambientFill);

		// sky

		const sky = new Sky();
		sky.scale.setScalar(1000);

		const skyMaterial = sky.material as ShaderMaterial;
		skyMaterial.uniforms.turbidity.value = 12; // Heavy overcast
		skyMaterial.uniforms.rayleigh.value = 0.5; // Reduced scattering
		skyMaterial.uniforms.skyLuminance.value = 0.4; // Darker sky
		skyMaterial.uniforms.sunPosition.value.set(-700, 400, -750); // Lower sun position

		// Store sky reference for animation
		(this as any).sky = sky;

		this.scene.add(sky);

		// === WEATHER EFFECTS ===
		this._initWeatherEffects();

		// renderer

		// Optimize renderer for mobile (no antialias)
		this.renderer = new WebGLRenderer({
			antialias: !this.isMobile,
			powerPreference: 'high-performance',
			precision: this.isMobile ? 'mediump' : 'highp'
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		// Cap pixel ratio on mobile to save battery and performance
		this.renderer.setPixelRatio(this.isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio);
		this.renderer.autoClear = false;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.outputColorSpace = SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
		document.body.appendChild(this.renderer.domElement);

		// Handle WebGL context loss/restore to prevent black screen issues
		this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
			event.preventDefault();
			console.warn('⚠️ WebGL context lost - attempting recovery');
		}, false);
		this.renderer.domElement.addEventListener('webglcontextrestored', () => {
			this._precompileShaders();
		}, false);

		// event listeners

		window.addEventListener('resize', this._onWindowResize, false);

		// Initialize Combat systems
		this._initCombat();

		// Initialize post-processing (after combat systems so scene is ready)
		this.postProcessing = new PostProcessingSystem(this.renderer, this.scene, this.camera);

		return this;

	}

	/**
	* Creates a specific amount of bots (AI players).
	* In multiplayer mode: Creates empty RemoteBots that are updated by server.
	* In single player mode: Creates local AI Bots.
	*
	* @return {World} A reference to this world object.
	*/
	_initBots() {

		// Check for server-assigned bot spawn data (indicates multiplayer mode)
		const matchBotSpawns = (window as any).__matchBotSpawns as Array<{ oderId: string; username: string; spawnIndex: number; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } }> | undefined;

		const navMesh = this.assetManager.navMesh;
		this.pathPlanner = new PathPlanner(navMesh);

		// =============== MULTIPLAYER MODE: Use RemoteBots from server ===============
		if (matchBotSpawns && matchBotSpawns.length > 0) {
			this.isMultiplayerMode = true;

			for (const botData of matchBotSpawns) {
				const remoteBot = new RemoteBot(
					this.scene,
					this.assetManager,
					botData.oderId,
					botData.username
				);

				// Set initial position from server
				remoteBot.setPosition(botData.position.x, botData.position.y, botData.position.z);
				remoteBot.setRotation(botData.rotation.x, botData.rotation.y, botData.rotation.z);

				// Store in map
				this.remoteBots.set(botData.oderId, remoteBot);
			}

			// Setup network callbacks for bot updates
			this._setupBotNetworkCallbacks();

			// Clean up server bot spawn data
			delete (window as any).__matchBotSpawns;

			return this;
		}

		// =============== SINGLE PLAYER MODE: Use local AI Bots ===============
		this.isMultiplayerMode = false;
		const botCount = this.botCount;

		for (let i = 0; i < botCount; i++) {

			// Get bot config from MatchManager if available
			const botConfig = this._matchBotConfigs?.[i];

			// Randomly select between 'amy' and 'granny'
			const botType = Math.random() > 0.5 ? 'amy' : 'granny';
			const model = SceneUtils.cloneWithSkinning(this.assetManager.models.get(botType));

			// Create a container for the model
			const renderComponent = new THREE.Group();
			renderComponent.matrixAutoUpdate = false;
			model.scale.set(0.02, 0.02, 0.02); // Apply Mixamo scale
			renderComponent.add(model);

			const bot = new Bot(this);

			// Use match config name or fallback to gamer name pool
			bot.name = botConfig?.displayName || GAMER_NAMES[i % GAMER_NAMES.length];

			// Use simple sync function
			bot.setRenderComponent(renderComponent, sync);

			// Link render component to entity for raycasting
			renderComponent.userData.entity = bot;
			model.userData.entity = bot;
			// Set userData on ALL children (not just meshes) for reliable hit detection
			model.traverse((child: any) => {
				child.userData.entity = bot;
			});

			// set animations - use the inner model for animation mixer

			const mixer = new AnimationMixer(model);

			// Load animations based on the selected bot type
			const idleClip = this.assetManager.animations.get(botType + '_idle');
			const runForwardClip = this.assetManager.animations.get(botType + '_forward');
			const runBackwardClip = this.assetManager.animations.get(botType + '_backward');
			const strafeLeftClip = this.assetManager.animations.get(botType + '_left');
			const strafeRightClip = this.assetManager.animations.get(botType + '_right');
			const death1Clip = this.assetManager.animations.get(botType + '_death1');
			const death2Clip = this.assetManager.animations.get(botType + '_death2');
			const death3Clip = this.assetManager.animations.get(botType + '_death3');
			const shootIdleClip = this.assetManager.animations.get(botType + '_shoot_idle');
			const reloadClip = this.assetManager.animations.get(botType + '_reload');
			const hitFrontClip = this.assetManager.animations.get(botType + '_hit_front');
			const walkForwardClip = this.assetManager.animations.get(botType + '_walk_forward');

			// Filter out any undefined clips to prevent animation errors
			const clips = [idleClip, runForwardClip, runBackwardClip, strafeLeftClip, strafeRightClip, death1Clip, death2Clip, death3Clip, shootIdleClip, reloadClip, hitFrontClip, walkForwardClip].filter(clip => clip !== undefined);

			bot.setAnimations(mixer, clips);

			// Add bot audio
			const botDeath = this.assetManager.cloneAudio(this.assetManager.audios.get('enemy_death')!);
			const botGrunt = this.assetManager.cloneAudio(this.assetManager.audios.get('enemy_grunt')!);
			renderComponent.add(botDeath);
			renderComponent.add(botGrunt);
			bot.audios.set('enemy_death', botDeath);
			bot.audios.set('enemy_grunt', botGrunt);

			// Create floating name label for bot (same as remote players)
			const nameLabel = this.createNameLabel(bot.name);
			nameLabel.position.y = 2.2;
			renderComponent.add(nameLabel);

			//

			this.add(bot);
			this.competitors.push(bot);

			// Use spawning manager for local bots
			this.spawningManager.respawnCompetitor(bot);

			// Register with MatchManager as ICompetitor
			if (this.matchManager) {
				const competitor = new BotCompetitor(bot, botConfig?.team);
				this.matchManager.registerCompetitor(competitor);
			}

			//

			if (this.debug) {

				const pathHelper = NavMeshUtils.createPathHelper();
				bot.pathHelper = pathHelper;

				this.scene.add(pathHelper);
				this.helpers.pathHelpers.push(pathHelper);

				//

				const uuidHelper = SceneUtils.createUUIDLabel(bot.uuid);
				uuidHelper.position.y = 2;
				uuidHelper.visible = false;

				renderComponent.add(uuidHelper);
				this.helpers.uuidHelpers.push(uuidHelper);

				//

				const skeletonHelper = new SkeletonHelper(renderComponent);
				skeletonHelper.visible = false;

				this.scene.add(skeletonHelper);
				this.helpers.skeletonHelpers.push(skeletonHelper);

			}

		}

		return this;

	}

	/**
	* Setup network callbacks for server-authoritative bots
	*/
	private _setupBotNetworkCallbacks() {
		if (!this.networkManager) {
			console.warn('[World] NetworkManager not available, skipping bot network callbacks');
			return;
		}

		// Handle bot state updates from server
		this.networkManager.onBotStates((states: ServerBotState[]) => {
			for (const state of states) {
				const remoteBot = this.remoteBots.get(state.id);
				if (remoteBot) {
					remoteBot.updateFromServer(state);
				}
			}
		});


		// Handle bot attack events (visual effects)
		this.networkManager.onBotAttack((botId: string, targetId: string, _damage: number) => {
			const bot = this.remoteBots.get(botId);
			if (bot) {
				// Try to find target to aim at
				let targetPos = new THREE.Vector3();
				let foundTarget = false;

				// 1. Is target the local player?
				if (targetId === this.player.uuid) {
					targetPos.copy(this.player.position);
					targetPos.y += 1.4; // Aim at chest
					foundTarget = true;
				} else {
					// 2. Is target another remote bot?
					const otherBot = this.remoteBots.get(targetId);
					if (otherBot) {
						targetPos.copy(otherBot.position);
						targetPos.y += 1.4;
						foundTarget = true;
					}
				}

				if (foundTarget) {
					// Shoot with impacts
					const result = bot.shootAt(targetPos);
					if (result.shotFired && result.direction) {
						// Process impacts using CombatManager

						// Construct precise obstacles list (same as Player.ts)
						const obstacles: THREE.Object3D[] = [];
						if (this.level && this.level.renderComponent) {
							obstacles.push(this.level.renderComponent);
						}
						// Add local player
						if (this.player && this.player.renderComponent) {
							obstacles.push(this.player.renderComponent);
						}
						// Add remote players
						const nm = this.networkManager as any;
						if (nm.remotePlayers) {
							nm.remotePlayers.forEach((rp: any) => {
								if (rp.mesh) obstacles.push(rp.mesh);
							});
						}
						// Add other remote bots (except shooter)
						this.remoteBots.forEach((otherBot: any) => {
							if (otherBot !== bot && otherBot.mesh) obstacles.push(otherBot.mesh);
						});

						// Note: processEnemyShot handles filtering the shooter
						this.combat.processEnemyShot(
							bot.botCamera!, // Assert non-null as shootAt checked it
							result.direction,
							(bot as any).weaponSystem.getMuzzleWorldPosition(),
							obstacles,
							bot as any,
							(bot as any).weaponSystem.currentConfig
						);
					}
				} else {
					// Fallback: visual flash only
					bot.showMuzzleFlash();
				}
			}
		});

		// Handle bot death events
		this.networkManager.onBotKilled((botId: string, botUsername: string, killerId: string, weaponType: string) => {
			// Death animation is handled by updateFromServer when isAlive becomes false

			// Add to killfeed
			if (this.hudManager) {
				let killerName = killerId;

				// 1. Is it the local player?
				if (killerId === this.player.uuid) {
					killerName = this.player.name || 'Player';
				}
				// 2. Is it a known bot? (Check main ID and oderId)
				else {
					const bot = this.remoteBots.get(killerId);
					if (bot) {
						killerName = bot.username;
					} else {
						// 3. Is it a remote player?
						const remoteName = this.networkManager.getRemotePlayerName(killerId);
						if (remoteName) {
							killerName = remoteName;
						} else {
							// 4. Fallback: Check if it's a bot ID that might not be in the direct map key (rare)
							// or just use slice for unknown entities
							// Try to find bot by checking values if key lookup failed (slow but safe for single event)
							let foundBot = false;
							for (const b of this.remoteBots.values()) {
								if (b.id === killerId) {
									killerName = b.username;
									foundBot = true;
									break;
								}
							}

							if (!foundBot) {
								killerName = killerId.slice(0, 8);
							}
						}
					}
				}

				this.hudManager.addKillFeed(killerName, botUsername, weaponType, false);
			}

			// Track kill in game mode (this also updates HUD counters)
			const currentMode = this.gameModeManager?.getCurrentMode();
			if (currentMode) {
				currentMode.onPlayerKill(killerId, botId, weaponType, false);
			}
		});

		// Handle bot respawn events
		this.networkManager.onBotRespawned((botId: string, position, rotation) => {
			const bot = this.remoteBots.get(botId);
			if (bot) {
				bot.setPosition(position.x, position.y, position.z);
				bot.setRotation(rotation.x, rotation.y, rotation.z);
			}
		});
	}

	/**
	* Creates the actual level.
	*
	* @return {World} A reference to this world object.
	*/
	_initLevel() {

		// level entity

		const renderComponent = this.assetManager.models.get('level');
		const mesh = renderComponent.getObjectByName('level');

		const vertices = mesh.geometry.attributes.position.array;
		const indices = mesh.geometry.index.array;

		const geometry = new MeshGeometry(vertices, indices);
		const level = new Level(geometry);
		level.name = 'level';
		level.setRenderComponent(renderComponent, sync);

		// Set userData.entity on level for consistent entity lookup
		renderComponent.userData.entity = level;
		renderComponent.traverse((child: any) => {
			child.userData.entity = level;
		});

		this.level = level;
		this.add(level);

		// Populate arenaObjects for physics collision
		this.arenaObjects = [];

		// Ensure world matrices are updated before computing boxes
		renderComponent.updateMatrixWorld(true);

		// We no longer create Box3 for the level mesh because it's concave and causes
		// the player to float on top of the bounding box.
		// Instead, Player.ts will use the Level entity's BVH for precise collision.

		// Only add other objects if needed
		/*
		renderComponent.traverse((object: any) => {
			if (object.isMesh) {
				const box = new Box3().setFromObject(object);
				this.arenaObjects.push({ mesh: object as Mesh, box: box });
			}
		});
		*/

		// navigation mesh

		this.navMesh = this.assetManager.navMesh;
		this.costTable = this.assetManager.costTable;

		// spatial index

		const levelConfig = this.assetManager.configs.get('level');

		const width = levelConfig.spatialIndex.width;
		const height = levelConfig.spatialIndex.height;
		const depth = levelConfig.spatialIndex.depth;
		const cellsX = levelConfig.spatialIndex.cellsX;
		const cellsY = levelConfig.spatialIndex.cellsY;
		const cellsZ = levelConfig.spatialIndex.cellsZ;

		this.navMesh.spatialIndex = new CellSpacePartitioning(width, height, depth, cellsX, cellsY, cellsZ);
		this.navMesh.updateSpatialIndex();

		this.helpers.spatialIndexHelper = NavMeshUtils.createCellSpaceHelper(this.navMesh.spatialIndex);
		this.scene.add(this.helpers.spatialIndexHelper);

		// init spawning points and items

		this.spawningManager.init();

		// debugging

		if (this.debug) {

			this.helpers.convexRegionHelper = NavMeshUtils.createConvexRegionHelper(this.navMesh);
			this.scene.add(this.helpers.convexRegionHelper);

			//

			this.helpers.graphHelper = NavMeshUtils.createGraphHelper(this.navMesh.graph, 0.2);
			this.scene.add(this.helpers.graphHelper);

			//

			this.helpers.spawnHelpers = SceneUtils.createSpawnPointHelper(this.spawningManager.spawningPoints);
			this.scene.add(this.helpers.spawnHelpers);

		}

		return this;

	}

	/**
	* Creates the player instance.
	*
	* @return {World} A reference to this world object.
	*/
	_initPlayer() {

		const assetManager = this.assetManager;

		const player = new Player(this);

		// Set player name from localStorage or use default
		player.name = localStorage.getItem('bitblast_username') || 'Player';

		// MULTIPLAYER FIX: Sync player's UUID with network ID to prevent double registration
		// The server identifies players by userId (from auth token), but Yuka generates a random UUID
		// We must use the same ID everywhere for the leaderboard to work correctly
		if (this.networkManager?.myUserId) {
			// Yuka's GameEntity stores uuid as a public property, override it directly
			Object.defineProperty(player, 'uuid', {
				value: this.networkManager.myUserId,
				writable: false,
				configurable: true
			});
		}

		// MULTIPLAYER FIX: Hide player initially if joining a match to prevent (0,0,0) teleport glitch
		// The NetworkManager's onSpawnAssigned callback will move them to the correct spawn point
		if (window.location.search.includes('matchId')) {
			player.position.set(0, -200, 0); // Hide under map
			player.rotation.fromEuler(0, 0, 0); // Reset rotation
		}

		// render component

		const body = new Object3D(); // dummy 3D object for adding spatial audios
		body.matrixAutoUpdate = false;

		// Add invisible collision mesh for raycast hit detection by enemies
		// Player is 1.8m tall, 0.5m radius (diameter 1m)
		const collisionGeometry = new BoxGeometry(0.5, 1.8, 0.5);
		const collisionMaterial = new MeshBasicMaterial({ visible: false });
		const collisionMesh = new Mesh(collisionGeometry, collisionMaterial);
		collisionMesh.position.y = 0.9; // Center at half player height
		collisionMesh.name = 'playerCollision';
		collisionMesh.userData.entity = player; // Link to player entity for damage
		body.add(collisionMesh);

		player.setRenderComponent(body, sync);

		// audio

		const step1 = assetManager.cloneAudio(assetManager.audios.get('step1')!);
		const step2 = assetManager.cloneAudio(assetManager.audios.get('step2')!);
		const impact1 = assetManager.cloneAudio(assetManager.audios.get('impact1')!);
		const impact2 = assetManager.cloneAudio(assetManager.audios.get('impact2')!);
		const impact3 = assetManager.cloneAudio(assetManager.audios.get('impact3')!);
		const impact4 = assetManager.cloneAudio(assetManager.audios.get('impact4')!);
		const impact5 = assetManager.cloneAudio(assetManager.audios.get('impact5')!);
		const impact6 = assetManager.cloneAudio(assetManager.audios.get('impact6')!);
		const impact7 = assetManager.cloneAudio(assetManager.audios.get('impact7')!);
		const health = assetManager.cloneAudio(assetManager.audios.get('health')!);
		const ammo = assetManager.cloneAudio(assetManager.audios.get('ammo')!);

		step1.setVolume(0.5);
		step2.setVolume(0.5);

		player.audios.set('step1', step1);
		player.audios.set('step2', step2);
		player.audios.set('impact1', impact1);
		player.audios.set('impact2', impact2);
		player.audios.set('impact3', impact3);
		player.audios.set('impact4', impact4);
		player.audios.set('impact5', impact5);
		player.audios.set('impact6', impact6);
		player.audios.set('impact7', impact7);
		player.audios.set('health', health);
		player.audios.set('ammo', ammo);

		body.add(step1);
		body.add(step2);
		body.add(impact1);
		body.add(impact2);
		body.add(impact3);
		body.add(impact4);
		body.add(impact5);
		body.add(impact6);
		body.add(impact7);
		body.add(health);
		body.add(ammo);



		// Load Amy model for player visualization (death cam)
		const amyModel = this.assetManager.models.get('amy');
		if (amyModel) {
			const playerModel = SceneUtils.cloneWithSkinning(amyModel);

			// Use custom sync function with 0.02 scale (same as enemies)
			// We attach this to the player entity, but we'll manage visibility in Player.ts
			// The 'body' object is the renderComponent, so we add the model to it

			// Scale the model (0.02 is the Mixamo standard)
			playerModel.scale.set(0.02, 0.02, 0.02);

			// Enable matrix auto-update for the player model and its children
			// This is needed because body.matrixAutoUpdate = false
			playerModel.matrixAutoUpdate = true;
			playerModel.traverse((child: any) => {
				child.matrixAutoUpdate = true;
			});

			// Add to body container
			body.add(playerModel);

			// Setup animations
			const mixer = new AnimationMixer(playerModel);

			// Load animations (reusing Amy model animations)
			const modelType = 'amy';
			const idleClip = this.assetManager.animations.get(modelType + '_idle');
			const runForwardClip = this.assetManager.animations.get(modelType + '_forward');
			const runBackwardClip = this.assetManager.animations.get(modelType + '_backward');
			const strafeLeftClip = this.assetManager.animations.get(modelType + '_left');
			const strafeRightClip = this.assetManager.animations.get(modelType + '_right');
			const death1Clip = this.assetManager.animations.get(modelType + '_death1');
			const death2Clip = this.assetManager.animations.get(modelType + '_death2');
			const death3Clip = this.assetManager.animations.get(modelType + '_death3');
			const shootIdleClip = this.assetManager.animations.get(modelType + '_shoot_idle');
			const reloadClip = this.assetManager.animations.get(modelType + '_reload');
			const hitFrontClip = this.assetManager.animations.get(modelType + '_hit_front');
			const walkForwardClip = this.assetManager.animations.get(modelType + '_walk_forward');

			const clips = [idleClip, runForwardClip, runBackwardClip, strafeLeftClip, strafeRightClip, death1Clip, death2Clip, death3Clip, shootIdleClip, reloadClip, hitFrontClip, walkForwardClip].filter(clip => clip !== undefined);

			// Manually set animations on player since it doesn't have setAnimations helper like Bot
			player.mixer = mixer;
			for (const clip of clips) {
				if (clip) {
					player.animations.set(clip.name, mixer.clipAction(clip));
				}
			}

			// Store reference to the visual model for visibility toggling
			// We can access it via player.renderComponent.children... or better, store it in userData
			body.userData.visualModel = playerModel;

			// Initially hide the visual model (first person view)
			playerModel.visible = false;
		}

		// add the player to the world

		this.add(player);
		this.competitors.push(player);
		this.spawningManager.respawnCompetitor(player);

		// Register with MatchManager as ICompetitor
		if (this.matchManager) {
			const competitor = new PlayerCompetitor(player);
			this.matchManager.registerCompetitor(competitor);
		}

		// BITBLAST FPS FIX: Bind network manager callbacks to player
		if (this.networkManager) {
			// Handle incoming damage to local player
			this.networkManager.onDamage((_targetId, _attackerId, damage) => {
				player.takeDamage(damage);
			});

			// Handle local death confirmation from server
			this.networkManager.onLocalDeath((_attackerId, _weaponType) => {
				player.initDeath();
			});

			// Handle remote bullet impacts (tracers, decals, particles)
			this.networkManager.onBulletImpact((muzzlePos, hitPos, hitNormal, material, hitEntity) => {
				if (this.combat) {
					this.combat.spawnRemoteBulletImpact(muzzlePos, hitPos, hitNormal, material, hitEntity);
				}
			});

			// Handle chat messages from other players
			this.networkManager.onChatMessage((userId, username, message) => {
				if (this.hudManager) {
					const myId = this.networkManager?.myUserId;
					const type = userId === myId ? 'player' : 'enemy';
					this.hudManager.addChatMessage(username, message, type);
				}
			});

			// Handle score updates for leaderboard
			this.networkManager.onScoreUpdate((matchState) => {
				if (this.hudManager) {
					const myId = this.networkManager?.myUserId || '';
					// Server sends 'scores' not 'players'
					const scoresData = (matchState as any).scores || matchState.players || {};

					// Sync scores with the current game mode so local tracking stays up-to-date
					const currentMode = this.gameModeManager?.getCurrentMode();
					if (currentMode && currentMode.syncScoresFromServer) {
						currentMode.syncScoresFromServer(scoresData);
					}

					const entries = Object.entries(scoresData).map(([id, score]: [string, any]) => ({
						id,
						name: score.username || id.slice(0, 8),
						kills: score.kills || 0,
						deaths: score.deaths || 0,
						isLocalPlayer: id === myId,
						isDead: false,
						isBot: score.isBot || false,
					}));
					// Sort by kills descending
					entries.sort((a, b) => b.kills - a.kills);
					this.hudManager.updateLeaderboard(entries);
				}
			});

			// Handle player leaving the match
			this.networkManager.onPlayerLeft((userId) => {
				if (this.hudManager) {
					this.hudManager.addChatMessage('System', `Player ${userId.slice(0, 8)} left the match`, 'system');
				}
			});

			// Handle player joining - register them with the game mode
			this.networkManager.onPlayerJoined((userId, username) => {
				// Remove one bot to maintain max 4 players
				this.removeOneBot();

				// Register the player with the current game mode so they appear on leaderboard
				const currentMode = this.gameModeManager?.getCurrentMode();
				if (currentMode && currentMode.registerRemotePlayer) {
					currentMode.registerRemotePlayer(userId, username);
				}
				if (this.hudManager) {
					this.hudManager.addChatMessage('System', `${username} joined the match`, 'system');
				}
			});

			// Handle server-assigned spawn position - teleport player to correct spawn
			this.networkManager.onSpawnAssigned((position, rotation) => {
				// Teleport player to server-assigned spawn position
				player.position.x = position.x;
				player.position.y = position.y;
				player.position.z = position.z;

				// Set rotation (y is yaw)
				if (rotation) {
					player.rotation.fromEuler(rotation.x, rotation.y, rotation.z);
					// Also set head rotation for first-person view
					if (player.head) {
						player.head.rotation.set(0, 0, 0, 1);
					}
				}

				// Update nav mesh region
				if (this.navMesh) {
					player.currentRegion = this.navMesh.getRegionForPoint(player.position, 1);
					player.previousPosition.copy(player.position);
				}
			});
		}

		// in dev mode we start with orbit controls

		if (this.debug) {

			player.deactivate();

		}

		//

		this.player = player;

		// Start default game mode now that player exists
		if (this.gameModeManager) {
			this.gameModeManager.setMode(GameModeType.FREE_FOR_ALL);
		}

		return this;

	}

	/**
	* Inits the controls used by the player.
	*
	* @return {World} A reference to this world object.
	*/
	_initControls() {

		this.fpsControls = new FirstPersonControls(this.player);
		this.fpsControls.sync();

		// Attach camera immediately so we see the world even before locking
		this.camera.matrixAutoUpdate = false;
		this.player.activate();
		this.player.head.setRenderComponent(this.camera, syncCamera);

		// Show game HUD immediately
		if (this.combat) {
			this.combat.hudManager.show();
		}

		this.fpsControls.addEventListener('lock', () => {

			// Hide old BitBlast UI
			const oldAmmo = document.getElementById('hudAmmo');
			const oldHealth = document.getElementById('hudHealth');
			const oldFragList = document.getElementById('hudFragList');
			if (oldAmmo) oldAmmo.style.display = 'none';
			if (oldHealth) oldHealth.style.display = 'none';
			if (oldFragList) oldFragList.style.display = 'none';

		});

		this.fpsControls.addEventListener('unlock', () => {

			// Optional: Detach camera on unlock? 
			// For now, let's keep it attached so the view doesn't jump to the sky
			// this.camera.matrixAutoUpdate = true;
			// this.player.deactivate();
			// (this.player.head as any).setRenderComponent(null, null);

			this.uiManager.hideFPSInterface();

			// Hide game HUD
			// if (this.combat) {
			// 	this.combat.hudManager.hide();
			// }

		});

		// Connect controls (adds listeners)
		this.fpsControls.connect();

		return this;

	}	/**
	* Inits the user interface.
	*
	* @return {World} A reference to this world object.
	*/
	_initUI() {

		this.uiManager.init();

		// Show game HUD
		if (this.combat) {
			this.combat.hudManager.show();
		}

		return this;

	}

	/**
	* Initializes the combat systems.
	* This includes weapon effects, HUD, audio, game modes, network, and lobby.
	*
	* @return {World} A reference to this world object.
	*/
	_initCombat() {

		// Initialize combat manager (particles, weapons, decals, tracers, HUD, audio)
		this.combat = new CombatManager(this.scene, this.camera, this.assetManager.listener, this.assetManager);

		// Initialize Game Mode Manager
		this.gameModeManager = new GameModeManager(this, this.combat.hudManager);

		// Initialize Network Manager for multiplayer
		this.networkManager = new NetworkManager(this.scene, this.assetManager);

		// Initialize Lobby Manager - connect to WebSocket server
		// In production, this should come from config/environment
		const serverUrl = getBitBlastServerUrl();
		this.lobbyManager = new LobbyManager(serverUrl);
		this.lobbyUI = new LobbyUI(this.lobbyManager);

		// Initialize Match Manager (coordinates lobby → game flow)
		this.matchManager = getMatchManager(this);
		this.matchManager.init(this.lobbyManager, this.networkManager);

		// Setup lobby event handlers
		this._setupLobbyEvents();

		// Setup shell ejection callback for weapon system
		this.combat.weaponSystem.setShellEjectCallback((pos, dir) => {
			// Ground level is the player's Y position (player.position is at feet level)
			// The player entity position represents the feet, head is offset by player.height
			const groundLevel = this.player.position.y;
			this.combat.particleSystem.spawnShellCasing(pos, dir, groundLevel);
		});

		// Setup shell bounce sound callback
		this.combat.particleSystem.setShellBounceCallback((position, bounceNumber) => {
			// Play shell drop sound with decreasing volume for each bounce
			// First bounce is loudest, subsequent bounces are quieter
			const volumeScale = Math.max(0.3, 1.0 - (bounceNumber - 1) * 0.25);

			// Only play sound for first 4 bounces to avoid audio spam
			if (bounceNumber <= 4) {
				this.combat.impactSystem.playShellDrop(position, volumeScale);
			}
		});

		// Setup zoom callback for sniper scope overlay
		this.combat.weaponSystem.setZoomCallback((isZoomed) => {
			// Drive the FOV target via a flag; sprint/zoom/punch are combined in _updateCombat.
			this.isZoomActive = isZoomed;

			// Toggle HUD sniper scope overlay (CSS handles fade animation)
			this.combat.hudManager.toggleScope(isZoomed);
		});

		// Equip default weapon (AK47)
		this.combat.weaponSystem.switchWeapon(0);

		// Note: Game mode initialization moved to _initPlayer() since it requires player to exist

		// Remove any old weapon meshes from the scene
		const oldWeaponNames = ['blaster_high', 'shotgun_high', 'assaultRifle_high'];
		const meshesToRemove: any[] = [];

		this.scene.traverse((object: any) => {
			if (object.isMesh && oldWeaponNames.some(name => object.name?.includes(name))) {
				meshesToRemove.push(object);
			}
			// Also check parent objects that might be the weapon groups
			if (object.isGroup && object.children.length > 0) {
				const hasWeaponMesh = object.children.some((child: any) =>
					child.isMesh && oldWeaponNames.some(name => child.name?.includes(name))
				);
				if (hasWeaponMesh) {
					meshesToRemove.push(object);
				}
			}
		});

		meshesToRemove.forEach(mesh => {
			this.scene.remove(mesh);
		});

		return this;

	}

	/**
	* Sets up event handlers for the lobby system.
	*/
	private _setupLobbyEvents(): void {
		// Handle match found
		this.lobbyManager.on(LobbyEventType.MATCH_FOUND, () => {
		});

		// Handle match starting
		this.lobbyManager.on(LobbyEventType.MATCH_STARTING, async (data: unknown) => {
			const matchData = data as { serverUrl: string; token: string; matchId: string; modeId: string };

			// Connect to game server
			const connected = await this.networkManager.connect(
				matchData.serverUrl,
				matchData.token,
				matchData.matchId
			);

			if (connected) {
			} else {
				// Hide loading screen if connection failed
				this._hideLoadingScreen();
			}
		});

		// Handle queue updates
		this.lobbyManager.on(LobbyEventType.QUEUE_UPDATE, () => {
		});
	}

	/**
	* Hides the loading screen (if exists from lobby)
	*/
	private _hideLoadingScreen(): void {
		const loadingScreen = document.getElementById('match-loading-screen');
		if (loadingScreen) {
			loadingScreen.style.display = 'none';
		}
	}

	/**
	* Handles combat shooting with visual effects.
	* Call this when player shoots to create tracers, impacts, and decals.
	* @deprecated This method is currently unused - combat shots are handled via CombatManager
	*/
	public handleCombatShot(hitPoint: Vector3 | null, hitNormal: Vector3 | null, hitEntity: any): void {
		const muzzlePos = this.combat.weaponSystem.getMuzzleWorldPosition();

		if (hitPoint) {
			// Convert Yuka Vector3 to Three.js Vector3
			const threeHitPoint = new ThreeVector3(hitPoint.x, hitPoint.y, hitPoint.z);
			this.combat.tracerSystem.createTracer(muzzlePos, threeHitPoint);

			// Create impact effects
			if (hitNormal) {
				const threeNormal = new ThreeVector3(hitNormal.x, hitNormal.y, hitNormal.z);

				if (hitEntity instanceof Bot) {
					// Bot hit - blood particles
					this.combat.particleSystem.spawnImpactEffect(threeHitPoint, false);
					this.combat.hudManager.showHitmarker(hitEntity.health <= 0);
				} else {
					// Environment hit - bullet hole and sparks
					this.combat.decalSystem.createDecal(threeHitPoint, threeNormal, SurfaceMaterial.ROCK);
					this.combat.particleSystem.spawnMaterialImpact(threeHitPoint, threeNormal, SurfaceMaterial.ROCK);
					// Play surface impact sound at reduced volume
					this.combat.impactSystem.playSurfaceImpact(threeHitPoint, SurfaceMaterial.ROCK);
				}
			}
		}
	}

	public onWindowResize() {

		const width = window.innerWidth;
		const height = window.innerHeight;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize(width, height);
		this.uiManager.setSize(width, height);

		// Update post-processing resolution
		if (this.postProcessing) {
			this.postProcessing.setSize(width, height);
		}

	}

	public animate() {
		try {
			requestAnimationFrame(this._animate);

			this.time.update();

			this.tick++;

			const delta = this.time.getDelta();

			// Check if game is active before updating game logic
			const currentMode = this.gameModeManager?.getCurrentMode();
			const isGameActive = !this.gameModeManager || !currentMode || !currentMode.isGameOver();

			// Only update FPS controls if game is active
			if (isGameActive) {
				if (this.debug) {

					if (this.useFPSControls) {

						this.fpsControls.update(delta);

					}

				} else {

					this.fpsControls.update(delta);

				}
			}

			// Only update game entities if game is active
			if (isGameActive) {
				this.spawningManager.update(delta);
				this.entityManager.update(delta);

				// Update remote bots (multiplayer mode only)
				if (this.isMultiplayerMode) {
					for (const [, remoteBot] of this.remoteBots) {
						remoteBot.update(delta);
					}
				}
			}

			// Sync render components (visuals) with entity logic
			// This is crucial for Player.head -> Camera sync
			for (const entity of this.entityManager.entities) {
				this._syncRenderComponent(entity);
			}

			// Only update path planning if game is active
			if (isGameActive) {
				this.pathPlanner.update();

				// Update AI Coordination
				if (this.aiCoordinationSystem) {
					this.aiCoordinationSystem.update(delta);
				}

				// Update Sound Propagation
				if (this.soundPropagationSystem) {
					this.soundPropagationSystem.update(delta);
				}
			}

			// Only update combat systems if game is active
			if (isGameActive) {
				this._updateCombat(delta);
			}

			// Update weather effects
			this._updateWeather(delta);

			// Use post-processing if available, otherwise direct render
			// Note: Don't call renderer.clear() before post-processing as the
			// EffectComposer's RenderPass handles clearing internally
			if (this.postProcessing) {
				this.postProcessing.render();
			} else {
				this.renderer.clear();
				this.renderer.render(this.scene, this.camera);
			}

			this.uiManager.update(delta);

		} catch (error) {
			console.error('🔥 CRITICAL ERROR IN GAME LOOP:', error);
			// Attempt to pause game or show error UI to user so they know it crashed
			if (this.uiManager) {
				// this.uiManager.showError("Game Error: " + error.message);
			}
		}
	}

	/**
	* Updates all combat systems.
	*
	* @param {Number} delta - The time delta.
	*/
	private _updateCombat(delta: number): void {
		if (!this.combat) return;

		// Track head bob time for weapon animation
		const speed = this.player?.velocity ?
			Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.z ** 2) : 0;

		if (speed > 0.1) {
			// Walking/running bob
			this.headBobTime += delta * speed * 2.0;
		} else {
			// Idle breathing
			this.headBobTime += delta * 2.0;
		}

		// Use actual sprint input from controls
		const isSprinting = this.fpsControls?.input?.sprint ?? false;

		// Calculate movement states
		let isMoving = false;
		let isAirborne = false;

		if (this.player) {
			const velocity = this.player.velocity;
			// Check horizontal movement (ignore Y)
			isMoving = (velocity.x * velocity.x + velocity.z * velocity.z) > 0.1;
			isAirborne = !this.player.onGround;
		}

		// Smooth FOV: zoom takes priority, then a sprint kick, otherwise base. The
		// ScreenEffects firing punch is added on top as an offset so they don't fight.
		let targetFOV = this.baseFOV;
		if (this.isZoomActive) {
			targetFOV = this.zoomedFOV;
		} else if (isSprinting && isMoving && !isAirborne) {
			targetFOV = this.sprintFOV;
		}
		this.currentFOV += (targetFOV - this.currentFOV) * Math.min(1, delta * this.fovLerpSpeed);
		this.camera.fov = this.currentFOV + this.combat.screenEffects.getFOVOffset();
		this.camera.updateProjectionMatrix();
		this.zoomTransitionProgress = 1 - (this.currentFOV - this.zoomedFOV) / (this.baseFOV - this.zoomedFOV);

		// Update all visual systems (particles, decals, tracers, weapon system, HUD)
		this.combat.update(delta, this.mouseMovement, isSprinting, isMoving, isAirborne, this.headBobTime);

		// Apply camera recoil as a per-frame delta so it kicks up and then fully
		// recovers back to centre (previously it accumulated and never recovered).
		const recoil = this.combat.getCameraRecoil();
		const dPitch = recoil.pitch - this.lastRecoilPitch;
		const dYaw = recoil.yaw - this.lastRecoilYaw;
		this.lastRecoilPitch = recoil.pitch;
		this.lastRecoilYaw = recoil.yaw;
		if (this.fpsControls && (Math.abs(dPitch) > 1e-6 || Math.abs(dYaw) > 1e-6)) {
			this.fpsControls.movementY -= dPitch;
			this.fpsControls.movementX -= dYaw;

			// Clamp pitch
			const PI05 = Math.PI / 2;
			this.fpsControls.movementY = Math.max(-PI05, Math.min(PI05, this.fpsControls.movementY));
		}

		// Apply screen shake offset to camera
		const shakeOffset = this.combat.getShakeOffset();
		if (shakeOffset.length() > 0.0001) {
			// Apply shake relative to camera orientation
			const shakeWorld = shakeOffset.clone();
			shakeWorld.applyQuaternion(this.camera.quaternion);
			this.camera.position.add(shakeWorld);
		}

		// Update HUD with player state
		if (this.player) {
			// Update health
			this.combat.hudManager.updateHealth(this.player.health, this.player.maxHealth);
		}

		// Update weapon HUD from combat system
		const config = this.combat.weaponSystem.currentConfig;
		this.combat.hudManager.updateWeaponName(config.name);
		this.combat.hudManager.updateAmmo(this.combat.weaponSystem.currentMag, this.combat.weaponSystem.reserveAmmo);
		this.combat.hudManager.showReloading(this.combat.weaponSystem.isReloading);
		// Removed duplicate updateCrosshair call - already handled in CombatManager.update()

		// Update game mode
		if (this.gameModeManager) {
			this.gameModeManager.update(delta);
		}

		// Update network (multiplayer sync)
		if (this.networkManager && this.player) {
			const currentWeapon = this.combat?.weaponSystem?.currentWeapon;
			this.networkManager.update(delta, this.player as any, this.camera, currentWeapon);
		}

		// Reset mouse movement for next frame
		this.mouseMovement.x = 0;
		this.mouseMovement.y = 0;
	}

	/**
	* Called from FirstPersonControls when mouse moves.
	* Updates the mouse movement tracking for weapon system.
	*/
	public onMouseMove(movementX: number, movementY: number): void {
		this.mouseMovement.x = movementX;
		this.mouseMovement.y = movementY;
	}

	/**
	 * Recursively syncs the render component of an entity and its children.
	 * 
	 * @param {GameEntity} entity - The entity to sync.
	 */
	private _syncRenderComponent(entity: any): void {
		if (entity.renderComponent) {
			// If a custom callback is defined (like for Camera), use it
			if (entity._renderComponentCallback) {
				entity._renderComponentCallback(entity, entity.renderComponent);
			} else {
				// Default sync: copy world matrix
				entity.renderComponent.matrix.copy(entity.worldMatrix);
			}
		}

		// Recursively sync children (e.g. Player -> Head -> Camera)
		if (entity.children) {
			for (const child of entity.children) {
				this._syncRenderComponent(child);
			}
		}
	}

	/**
	* Initialize weather effects - rain and lightning
	*/
	private _initWeatherEffects(): void {
		// Rain particles
		const rainCount = 3000;
		const rainGeometry = new THREE.BufferGeometry();
		const rainPositions = new Float32Array(rainCount * 3);
		const rainVelocities = new Float32Array(rainCount);

		for (let i = 0; i < rainCount; i++) {
			// Spread rain around camera
			rainPositions[i * 3] = (Math.random() - 0.5) * 200; // x
			rainPositions[i * 3 + 1] = Math.random() * 80 - 10; // y (height)
			rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 200; // z
			rainVelocities[i] = 30 + Math.random() * 20; // fall speed
		}

		rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
		rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(rainVelocities, 1));

		const rainMaterial = new THREE.PointsMaterial({
			color: 0x8899aa,
			size: 0.15,
			transparent: true,
			opacity: 0.6,
			blending: THREE.AdditiveBlending
		});

		this.rainParticles = new THREE.Points(rainGeometry, rainMaterial);
		this.scene.add(this.rainParticles);

		// Lightning flash light (starts off)
		this.lightningFlashLight = new THREE.PointLight(0xccddff, 0, 400, 1.5); // Brighter color, wider range
		this.lightningFlashLight.position.set(0, 100, 0);
		this.lightningFlashLight.castShadow = false; // Don't cast shadows for performance
		this.scene.add(this.lightningFlashLight);
	}

	/**
	* Update weather effects each frame
	*/
	private _updateWeather(delta: number): void {
		// Animate sky clouds
		const sky = (this as any).sky;
		if (sky) {
			const skyMaterial = sky.material as ShaderMaterial;
			skyMaterial.uniforms.time.value += delta;
		}

		// Update rain
		const positions = this.rainParticles.geometry.attributes.position.array as Float32Array;
		const velocities = this.rainParticles.geometry.attributes.velocity.array as Float32Array;

		for (let i = 0; i < positions.length / 3; i++) {
			// Move rain down
			positions[i * 3 + 1] -= velocities[i] * delta;

			// Reset rain when it hits ground
			if (positions[i * 3 + 1] < -5) {
				positions[i * 3 + 1] = 70 + Math.random() * 10;
				positions[i * 3] = this.camera.position.x + (Math.random() - 0.5) * 200;
				positions[i * 3 + 2] = this.camera.position.z + (Math.random() - 0.5) * 200;
			}
		}

		this.rainParticles.geometry.attributes.position.needsUpdate = true;

		// Update lightning
		this.lightningTime += delta;

		if (this.lightningTime >= this.nextLightningTime) {
			// Trigger INTENSE lightning flash
			this.lightningFlashLight.intensity = 80 + Math.random() * 40; // MUCH brighter (80-120)
			this.lightningFlashLight.position.set(
				(Math.random() - 0.5) * 120, // Closer to player
				80 + Math.random() * 30, // Higher up
				(Math.random() - 0.5) * 120
			);

			// Sometimes create double-strike effect
			if (Math.random() > 0.7) {
				setTimeout(() => {
					this.lightningFlashLight.intensity = 50 + Math.random() * 30;
				}, 100 + Math.random() * 100);
			}

			// Brief screen flash effect using vignette
			if (this.combat?.screenEffects) {
				this.combat.screenEffects.addVignette(0.3); // Quick bright flash
			}

			// Schedule next lightning - more frequent
			this.lightningTime = 0;
			this.nextLightningTime = 2 + Math.random() * 5; // 2-7 seconds instead of 3-11
		} else if (this.lightningFlashLight.intensity > 0) {
			// Fade out lightning with realistic flicker
			const fadeSpeed = 12 + Math.random() * 3;
			this.lightningFlashLight.intensity *= Math.max(0, 1 - delta * fadeSpeed);

			// Add flicker before complete fade
			if (this.lightningFlashLight.intensity < 5 && Math.random() > 0.9) {
				this.lightningFlashLight.intensity += 3;
			}

			if (this.lightningFlashLight.intensity < 0.1) {
				this.lightningFlashLight.intensity = 0;
			}
		}
	}

	/**
	* Returns the closest item of the given type.
	*
	* @param {GameEntity} owner - The owner who requests the item.
	* @param {Number} itemType - The type of the item.
	* @param {Object} result - The result object.
	* @return {World} A reference to this world.
	*/
	getClosestItem(owner: any, itemType: number, result: any): this {

		const items = this.spawningManager.getItemList(itemType);

		let minDistance = Infinity;
		let closestItem = null;

		if (items) {

			for (let i = 0, l = items.length; i < l; i++) {

				const item = items[i];

				if (item.active === true) {

					const distance = owner.position.squaredDistanceTo(item.position);

					if (distance < minDistance) {

						minDistance = distance;
						closestItem = item;

					}

				}

			}

		}

		result.distance = Math.sqrt(minDistance);
		result.item = closestItem;

		// Debug Log
		// if (result.item === null && itemType === 0) console.log('[World] No active health packs found!');

		return this;

	}

}

function sync(entity: any, renderComponent: any) {

	renderComponent.matrix.copy(entity.worldMatrix);

}

function syncCamera(entity: any, camera: any) {
	// Copy the entity's world matrix to camera's matrixWorld and decompose to update position/rotation
	camera.matrixWorld.copy(entity.worldMatrix);

	// Decompose the world matrix to update camera's position and quaternion
	camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);

	// Update the local matrix as well
	camera.matrix.copy(entity.worldMatrix);
}



export default new World();

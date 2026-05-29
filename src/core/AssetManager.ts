import { LoadingManager, AnimationLoader, AudioLoader, TextureLoader, Mesh, AnimationClip, Texture, ShaderMaterial, Color, RepeatWrapping, SRGBColorSpace } from 'three';
import { Sprite, SpriteMaterial, DoubleSide, AudioListener, PositionalAudio, Audio, Group, PointLight, AdditiveBlending } from 'three';
import { LineSegments, LineBasicMaterial, MeshBasicMaterial, BufferGeometry, Vector3, PlaneGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { NavMeshLoader, CostTable } from 'yuka';
import { CONFIG } from './Config';
import { rewriteAssetUrl } from '../utils/assetPath';

/**
* Class for representing the global asset manager. It is responsible
* for loading and parsing all assets from the backend and provide
* the result in a series of maps.
*
*/
class AssetManager {

	public loadingManager: LoadingManager;
	public animationLoader: AnimationLoader;
	public audioLoader: AudioLoader;
	public textureLoader: TextureLoader;
	public gltfLoader: GLTFLoader;
	public fbxLoader: FBXLoader;
	public objLoader: OBJLoader;
	public mtlLoader: MTLLoader;
	public navMeshLoader: NavMeshLoader;

	public listener: AudioListener;

	public animations: Map<string, AnimationClip>;
	public audios: Map<string, PositionalAudio | Audio>;
	public configs: Map<string, any>;
	public models: Map<string, any>;
	public textures: Map<string, Texture>;

	public navMesh: any;
	public costTable: any;

	/**
	* Constructs a new asset manager with the given values.
	*/
	constructor() {

		this.loadingManager = new LoadingManager();
		// Resolve all asset URLs against the deploy base (e.g. /Bitblast/ on Pages).
		this.loadingManager.setURLModifier(rewriteAssetUrl);

		this.animationLoader = new AnimationLoader(this.loadingManager);
		this.audioLoader = new AudioLoader(this.loadingManager);
		this.textureLoader = new TextureLoader(this.loadingManager);
		this.gltfLoader = new GLTFLoader(this.loadingManager);
		this.fbxLoader = new FBXLoader(this.loadingManager);
		this.objLoader = new OBJLoader(this.loadingManager);
		this.mtlLoader = new MTLLoader(this.loadingManager);
		this.navMeshLoader = new NavMeshLoader();

		this.listener = new AudioListener();

		this.animations = new Map();
		this.audios = new Map();
		this.configs = new Map();
		this.models = new Map();
		this.textures = new Map();

		this.navMesh = null;
		this.costTable = null;

	}

	/**
	* Initializes the asset manager. All assets are prepared so they
	* can be used by the game.
	*
	* @return {Promise} Resolves when all assets are ready.
	*/
	init() {

		this._loadAnimations();
		this._loadAudios();
		this._loadConfigs();
		this._loadTextures();  // Load textures BEFORE models so they're available
		this._loadModels();
		this._loadNavMesh();

		return new Promise((resolve) => {

			this.loadingManager.onLoad = () => {
				// Apply level material after ALL assets (including textures) are loaded
				this._applyLevelMaterial();
				resolve(undefined);

			};

		});

	}

	/**
	* Applies the triplanar textured material to the level mesh.
	* Called after all assets are loaded to ensure textures are available.
	*/
	_applyLevelMaterial() {
		const level = this.models.get('level');
		if (!level) {
			return;
		}

		// Traverse to find all meshes in the level
		level.traverse((child: any) => {
			if (child.isMesh) {
				this._applyMaterialToMesh(child);
			}
		});
	}

	_applyMaterialToMesh(mesh: Mesh) {
		const oldMaterial = mesh.material;

		// Get floor textures (metal plates)
		const floorColor = this.textures.get('floor_color');
		const floorNormal = this.textures.get('floor_normal');
		const floorRoughness = this.textures.get('floor_roughness');
		const floorAO = this.textures.get('floor_ao');
		const floorMetallic = this.textures.get('floor_metallic');

		// Get 2 brick wall texture variations (within WebGL texture unit limit)
		const wallColors: any[] = [];
		const wallNormals: any[] = [];
		const wallRoughnesses: any[] = [];
		const wallAOs: any[] = [];

		for (let i = 1; i <= 2; i++) {
			wallColors.push(this.textures.get(`wall_color_${i}`));
			wallNormals.push(this.textures.get(`wall_normal_${i}`));
			wallRoughnesses.push(this.textures.get(`wall_roughness_${i}`));
			wallAOs.push(this.textures.get(`wall_ao_${i}`));
		}

		// Check if all textures loaded
		if (!floorColor || !wallColors[0]) {
			console.warn('Level textures not loaded, using default material');
			return;
		}

		// AAA-quality triplanar PBR shader with 2 brick wall variations
		const triplanarShader = new ShaderMaterial({
			uniforms: {
				// Floor textures (metal plates) - 5 textures
				floorColorMap: { value: floorColor },
				floorNormalMap: { value: floorNormal },
				floorRoughnessMap: { value: floorRoughness },
				floorAOMap: { value: floorAO },
				floorMetallicMap: { value: floorMetallic },
				// Wall texture variations - 6 textures (2 brick variations x 3 maps each)
				wallColorMap1: { value: wallColors[0] },
				wallNormalMap1: { value: wallNormals[0] },
				wallRoughnessMap1: { value: wallRoughnesses[0] },
				wallAOMap1: { value: wallAOs[0] },
				wallColorMap2: { value: wallColors[1] },
				wallNormalMap2: { value: wallNormals[1] },
				wallRoughnessMap2: { value: wallRoughnesses[1] },
				wallAOMap2: { value: wallAOs[1] },
				// Lighting - stylized arena style
				lightDir: { value: new Vector3(0.3, 0.9, 0.3).normalize() },
				lightColor: { value: new Color(1.2, 1.15, 1.1) },
				ambientColor: { value: new Color(0.15, 0.16, 0.18) },  // Darker ambient for better contrast
				// Texture scale
				floorScale: { value: 0.15 },
				wallScale: { value: 0.08 },  // Very subtle texture detail
				// Wall variation parameters
				variationScale: { value: 0.02 }
			},
			toneMapped: true, // Use Three.js native tone mapping
			vertexShader: `
				varying vec3 vWorldPosition;
				varying vec3 vWorldNormal;
				varying vec3 vViewDir;
				
				void main() {
					vec4 worldPos = modelMatrix * vec4(position, 1.0);
					vWorldPosition = worldPos.xyz;
					vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
					vViewDir = normalize(cameraPosition - worldPos.xyz);
					gl_Position = projectionMatrix * viewMatrix * worldPos;
				}
			`,
			fragmentShader: `
				uniform sampler2D floorColorMap;
				uniform sampler2D floorNormalMap;
				uniform sampler2D floorRoughnessMap;
				uniform sampler2D floorAOMap;
				uniform sampler2D floorMetallicMap;
				
				uniform sampler2D wallColorMap1;
				uniform sampler2D wallNormalMap1;
				uniform sampler2D wallRoughnessMap1;
				uniform sampler2D wallAOMap1;
				uniform sampler2D wallColorMap2;
				uniform sampler2D wallNormalMap2;
				uniform sampler2D wallRoughnessMap2;
				uniform sampler2D wallAOMap2;
				
				uniform vec3 lightDir;
				uniform vec3 lightColor;
				uniform vec3 ambientColor;
				uniform float floorScale;
				uniform float wallScale;
				uniform float variationScale;
				
				varying vec3 vWorldPosition;
				varying vec3 vWorldNormal;
				varying vec3 vViewDir;
				
				const float PI = 3.14159265359;
				
				// Pseudo-random hash for variation selection
				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
				}
				
				// Smooth noise for blending
				float noise(vec2 p) {
					vec2 i = floor(p);
					vec2 f = fract(p);
					f = f * f * (3.0 - 2.0 * f);
					float a = hash(i);
					float b = hash(i + vec2(1.0, 0.0));
					float c = hash(i + vec2(0.0, 1.0));
					float d = hash(i + vec2(1.0, 1.0));
					return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
				}
				
				// Triplanar blend with sharp transitions
				vec3 getTriplanarBlend(vec3 normal) {
					vec3 blend = abs(normal);
					blend = pow(blend, vec3(4.0));
					blend = blend / (blend.x + blend.y + blend.z + 0.0001);
					return blend;
				}
				
				// Sample texture with triplanar projection
				vec4 triplanarSample(sampler2D tex, vec3 pos, vec3 blend, float scale) {
					vec4 xProj = texture2D(tex, pos.zy * scale);
					vec4 yProj = texture2D(tex, pos.xz * scale);
					vec4 zProj = texture2D(tex, pos.xy * scale);
					return xProj * blend.x + yProj * blend.y + zProj * blend.z;
				}
				
				// Triplanar normal mapping
				vec3 triplanarNormal(sampler2D normalMap, vec3 pos, vec3 normal, vec3 blend, float scale) {
					vec3 tnormalX = texture2D(normalMap, pos.zy * scale).rgb * 2.0 - 1.0;
					vec3 tnormalY = texture2D(normalMap, pos.xz * scale).rgb * 2.0 - 1.0;
					vec3 tnormalZ = texture2D(normalMap, pos.xy * scale).rgb * 2.0 - 1.0;
					
					vec3 normalX = vec3(tnormalX.xy + normal.zy, abs(tnormalX.z) * normal.x);
					vec3 normalY = vec3(tnormalY.xy + normal.xz, abs(tnormalY.z) * normal.y);
					vec3 normalZ = vec3(tnormalZ.xy + normal.xy, abs(tnormalZ.z) * normal.z);
					
					return normalize(normalX.zyx * blend.x + normalY.xzy * blend.y + normalZ.xyz * blend.z);
				}
				
				// GGX Distribution
				float distributionGGX(float NdotH, float roughness) {
					float a = roughness * roughness;
					float a2 = a * a;
					float NdotH2 = NdotH * NdotH;
					float denom = NdotH2 * (a2 - 1.0) + 1.0;
					return a2 / (PI * denom * denom);
				}
				
				// Geometry function
				float geometrySchlickGGX(float NdotV, float roughness) {
					float r = roughness + 1.0;
					float k = (r * r) / 8.0;
					return NdotV / (NdotV * (1.0 - k) + k);
				}
				
				float geometrySmith(float NdotV, float NdotL, float roughness) {
					return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
				}
				
				// Fresnel
				vec3 fresnelSchlick(float cosTheta, vec3 F0) {
					return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
				}
				
				void main() {
					vec3 normal = normalize(vWorldNormal);
					vec3 viewDir = normalize(vViewDir);
					vec3 pos = vWorldPosition;
					vec3 blend = getTriplanarBlend(normal);
					
					// Determine surface type
					float isFloor = smoothstep(0.7, 0.9, normal.y);
					float isCeiling = smoothstep(0.7, 0.9, -normal.y);
					float isWall = 1.0 - isFloor - isCeiling;
					isWall = max(isWall, 0.0);
					
					// STYLIZED FLOOR - arena style with grid pattern
					vec3 floorTexture = triplanarSample(floorColorMap, pos, blend, floorScale).rgb;
					vec3 floorNormalTex = triplanarNormal(floorNormalMap, pos, normal, blend, floorScale);
					
					// Grid pattern for visual interest and orientation
					vec2 floorGrid = abs(fract(pos.xz * 0.5) - 0.5);
					float gridLine = min(floorGrid.x, floorGrid.y);
					float grid = smoothstep(0.02, 0.025, gridLine); // Sharper transition for cleaner look
					
					// Base floor color - dark gray (0.15 linear is approx 0.4 sRGB)
					vec3 floorBaseColor = vec3(0.15, 0.15, 0.16);
					vec3 floorAlbedo = mix(floorBaseColor * 0.65, floorBaseColor, grid);
					
					// Add subtle diagonal wear pattern - increased contrast
					float wearPattern = noise(pos.xz * 0.1 + vec2(pos.x - pos.z) * 0.05);
					
					// Dynamic Roughness: Clean areas are semi-gloss (0.35), worn areas are matte (0.85)
					// This creates "specular mapping" without a texture lookup
					float floorRough = mix(0.35, 0.85, wearPattern);
					
					// Apply wear to albedo (dust accumulation)
					floorAlbedo = mix(floorAlbedo, floorAlbedo * 0.8, wearPattern * 0.35);
					floorAlbedo = mix(floorAlbedo, floorAlbedo * floorTexture, 0.25);
					
					// Apply grid to roughness (matte lines)
					floorRough = mix(floorRough, 0.95, 1.0 - grid);
					float floorAo = 1.0;
					float floorMetal = 0.0;
					vec3 floorN = normalize(mix(normal, floorNormalTex, 0.3));
					
					// STYLIZED ARENA WALLS - designed for 10-15m height
					
					// Grounding gradient: Darker at the bottom to "plant" the walls
					float grounding = smoothstep(0.0, 2.0, pos.y); // Darken bottom 2 meters
					
					// Base color with vertical gradient for height perception
					float heightGradient = smoothstep(-5.0, 10.0, pos.y);
					vec3 wallBaseColor = mix(vec3(0.50, 0.53, 0.58), vec3(0.62, 0.66, 0.72), heightGradient);
					
					// Apply grounding
					wallBaseColor *= mix(0.7, 1.0, grounding);
					
					// Add horizontal panels/stripes to emphasize scale
					float panelPattern = fract(pos.y * 0.15);
					float panelLine = smoothstep(0.92, 0.98, panelPattern);
					vec3 panelColor = mix(wallBaseColor, wallBaseColor * 0.75, panelLine);
					
					// Vertical accent lines for visual interest
					vec2 wallCoord = vec2(pos.x + pos.z, pos.y);
					float vertLine = abs(fract(wallCoord.x * 0.08) - 0.5);
					float vertAccent = smoothstep(0.48, 0.5, vertLine);
					panelColor = mix(panelColor * 0.88, panelColor, vertAccent);
					
					// Subtle color tint variation for visual interest
					float colorVar = noise(pos.xz * 0.03);
					panelColor = mix(panelColor, panelColor * vec3(0.98, 1.0, 1.02), colorVar * 0.1);
					
					// Subtle texture detail
					vec3 textureDetail = triplanarSample(wallColorMap1, pos, blend, wallScale).rgb;
					vec3 wallAlbedo = mix(panelColor, panelColor * textureDetail, 0.1);
					
					// Simplified normal
					vec3 wallN = normal;
					vec3 textureN = triplanarNormal(wallNormalMap1, pos, normal, blend, wallScale);
					wallN = normalize(mix(wallN, textureN, 0.15));
					
					float wallRough = 0.6;
					float wallAO = 1.0;
					
					// Ceiling uses floor texture darkened
					vec3 ceilingAlbedo = floorAlbedo * 0.6;
					vec3 ceilingN = floorN;
					float ceilingRough = floorRough;
					
					// Combine materials based on surface type
					vec3 albedo = wallAlbedo * isWall + floorAlbedo * isFloor + ceilingAlbedo * isCeiling;
					float roughness = wallRough * isWall + floorRough * isFloor + ceilingRough * isCeiling;
					float ao = wallAO * isWall + floorAo * isFloor + floorAo * isCeiling;
					float metallic = 0.0 * isWall + floorMetal * isFloor + floorMetal * 0.8 * isCeiling;
					vec3 N = normalize(wallN * isWall + floorN * isFloor + ceilingN * isCeiling);
					
					// Clamp roughness
					roughness = clamp(roughness, 0.05, 1.0);
					
					// PBR calculations
					vec3 V = viewDir;
					vec3 L = normalize(lightDir);
					vec3 H = normalize(V + L);
					
					float NdotL = max(dot(N, L), 0.0);
					float NdotV = max(dot(N, V), 0.001);
					float NdotH = max(dot(N, H), 0.0);
					float HdotV = max(dot(H, V), 0.0);
					
					vec3 F0 = vec3(0.04);
					F0 = mix(F0, albedo, metallic);
					
					float D = distributionGGX(NdotH, roughness);
					float G = geometrySmith(NdotV, NdotL, roughness);
					vec3 F = fresnelSchlick(HdotV, F0);
					
					vec3 kS = F;
					vec3 kD = (1.0 - kS) * (1.0 - metallic);
					
					vec3 specular = (D * G * F) / (4.0 * NdotV * NdotL + 0.0001);
					vec3 diffuse = kD * albedo / PI;
					
					// Direct lighting - reduced intensity to fix overexposure
					vec3 Lo = (diffuse + specular) * lightColor * NdotL * 1.6;
					
					// Ambient with hemisphere - good contrast without being too dark
					float hemi = N.y * 0.5 + 0.5;
					vec3 ambientLo = albedo * mix(ambientColor * 0.5, ambientColor * 1.4, hemi) * ao;
					
					// Fill light - slightly warmer to complement cool walls
					vec3 fillDir = normalize(vec3(-0.3, -0.5, -0.4));
					float fillNdotL = max(dot(N, -fillDir), 0.0);
					vec3 fillLight = albedo * vec3(0.12, 0.13, 0.16) * fillNdotL * 0.7;
					
					// Rim light for geometry definition
					float rimAmount = pow(1.0 - NdotV, 2.5);
					vec3 rimLight = vec3(0.25, 0.28, 0.32) * rimAmount * 0.25;
					
					vec3 finalColor = Lo + ambientLo + fillLight + rimLight;
					
					// Atmospheric fog matching overcast sky
					float dist = length(pos - cameraPosition);
					float fog = 1.0 - exp(-dist * 0.003);
					vec3 fogColor = vec3(0.25, 0.27, 0.30); // Darker fog
					finalColor = mix(finalColor, fogColor, fog * 0.4);
					
					// Manual tone mapping and gamma removed - relying on Three.js renderer
					// finalColor is linear, Three.js handles the rest
					
					// Safety: clamp to prevent NaN/Infinity and ensure minimum brightness
					// This prevents pure black output from texture sampling issues
					finalColor = clamp(finalColor, vec3(0.01), vec3(1.0));
					
					// Check for NaN (NaN != NaN is true)
					if (finalColor.r != finalColor.r || finalColor.g != finalColor.g || finalColor.b != finalColor.b) {
						finalColor = vec3(0.3, 0.3, 0.35); // Fallback gray if NaN detected
					}
					
					// DEBUG: FORCE RED OUTPUT TO VERIFY SHADER UPDATE
					// gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
					gl_FragColor = vec4(finalColor, 1.0);
				}
			`
		});

		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.material = triplanarShader;

		// Dispose old material to prevent memory leaks
		if (oldMaterial) {
			(oldMaterial as any).dispose();
		}
	}


	/**
	* Clones an audio source (either PositionalAudio or regular Audio).
	*
	* @param {PositionalAudio | Audio | undefined} source - The audio source to clone.
	* @return {PositionalAudio} A PositionalAudio clone (converts regular Audio to PositionalAudio).
	*/
	cloneAudio(source: PositionalAudio | Audio | undefined): PositionalAudio {

		if (!source) {
			// Return a silent positional audio if source is undefined
			const silent = new PositionalAudio(this.listener);
			return silent;
		}

		const audio = new PositionalAudio(source.listener);
		audio.buffer = source.buffer;

		return audio;

	}

	/**
	* Loads all external animations from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadAnimations() {

		const animationLoader = this.animationLoader;

		// player

		animationLoader.load('./assets/animations/player.json', (clips) => {

			for (const clip of clips) {

				this.animations.set(clip.name, clip);

			}

		});

		// blaster

		animationLoader.load('./assets/animations/blaster.json', (clips) => {

			for (const clip of clips) {

				this.animations.set(clip.name, clip);

			}

		});

		// shotgun

		animationLoader.load('./assets/animations/shotgun.json', (clips) => {

			for (const clip of clips) {

				this.animations.set(clip.name, clip);

			}

		});

		// assault rifle

		animationLoader.load('./assets/animations/assaultRifle.json', (clips) => {

			for (const clip of clips) {

				this.animations.set(clip.name, clip);

			}

		});

		return this;

	}

	/**
	* Loads all audios from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadAudios() {

		const audioLoader = this.audioLoader;
		const audios = this.audios;
		const listener = this.listener;

		const blasterShot = new PositionalAudio(listener);
		blasterShot.matrixAutoUpdate = false;

		const shotgunShot = new PositionalAudio(listener);
		shotgunShot.matrixAutoUpdate = false;

		const assaultRifleShot = new PositionalAudio(listener);
		assaultRifleShot.matrixAutoUpdate = false;

		const reload = new PositionalAudio(listener);
		reload.matrixAutoUpdate = false;

		const shotgunShotReload = new PositionalAudio(listener);
		shotgunShotReload.matrixAutoUpdate = false;

		const step1 = new PositionalAudio(listener);
		step1.matrixAutoUpdate = false;

		const step2 = new PositionalAudio(listener);
		step2.matrixAutoUpdate = false;

		const impact1 = new PositionalAudio(listener);
		impact1.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact1.matrixAutoUpdate = false;

		const impact2 = new PositionalAudio(listener);
		impact2.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact2.matrixAutoUpdate = false;

		const impact3 = new PositionalAudio(listener);
		impact3.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact3.matrixAutoUpdate = false;

		const impact4 = new PositionalAudio(listener);
		impact4.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact4.matrixAutoUpdate = false;

		const impact5 = new PositionalAudio(listener);
		impact5.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact5.matrixAutoUpdate = false;

		const impact6 = new PositionalAudio(listener);
		impact6.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact6.matrixAutoUpdate = false;

		const impact7 = new PositionalAudio(listener);
		impact7.setVolume(CONFIG.AUDIO.VOLUME_IMPACT);
		impact7.matrixAutoUpdate = false;

		const health = new PositionalAudio(listener);
		health.matrixAutoUpdate = false;

		const ammo = new PositionalAudio(listener);
		ammo.matrixAutoUpdate = false;

		audioLoader.load('./assets/audio/sfx/weapons/blaster_shot.ogg', buffer => blasterShot.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/weapons/shotgun_shot.ogg', buffer => shotgunShot.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/weapons/assault_rifle_shot.ogg', buffer => assaultRifleShot.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/weapons/reload.ogg', buffer => reload.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/weapons/shotgun_shot_reload.ogg', buffer => shotgunShotReload.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/player/step1.ogg', buffer => step1.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/player/step2.ogg', buffer => step2.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact1.ogg', buffer => impact1.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact2.ogg', buffer => impact2.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact3.ogg', buffer => impact3.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact4.ogg', buffer => impact4.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact5.ogg', buffer => impact5.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact6.ogg', buffer => impact6.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/impacts/impact7.ogg', buffer => impact7.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/ui/health.ogg', buffer => health.setBuffer(buffer));
		audioLoader.load('./assets/audio/sfx/ui/ammo.ogg', buffer => ammo.setBuffer(buffer));

		// Enemy sounds
		const enemyDeath = new PositionalAudio(listener);
		enemyDeath.setVolume(3.0); // Very loud for death sound
		enemyDeath.setRefDistance(20); // Audible from further away
		enemyDeath.setMaxDistance(100);
		enemyDeath.matrixAutoUpdate = false;
		audioLoader.load('./assets/audio/sfx/enemy/Female-Death-1.mp3_37cc105e.mp3', buffer => enemyDeath.setBuffer(buffer));

		const enemyGrunt = new PositionalAudio(listener);
		enemyGrunt.setVolume(1.2); // Louder for grunt sound
		enemyGrunt.setRefDistance(12);
		enemyGrunt.setMaxDistance(60);
		enemyGrunt.matrixAutoUpdate = false;
		audioLoader.load('./assets/audio/sfx/enemy/Female-Grunt-1.mp3_5f82c672.mp3', buffer => enemyGrunt.setBuffer(buffer));

		// Game Over sounds
		const victory = new Audio(listener);
		victory.setVolume(CONFIG.AUDIO.VOLUME_MUSIC || 0.5); // Use music volume or default
		audioLoader.load('./assets/audio/sfx/level/victory.mp3', buffer => victory.setBuffer(buffer));

		const defeat = new Audio(listener);
		defeat.setVolume(CONFIG.AUDIO.VOLUME_MUSIC || 0.5);
		audioLoader.load('./assets/audio/sfx/level/defeat.mp3', buffer => defeat.setBuffer(buffer));

		audios.set('blaster_shot', blasterShot);
		audios.set('shotgun_shot', shotgunShot);
		audios.set('assault_rifle_shot', assaultRifleShot);
		audios.set('reload', reload);
		audios.set('shotgun_shot_reload', shotgunShotReload);
		audios.set('step1', step1);
		audios.set('step2', step2);
		audios.set('impact1', impact1);
		audios.set('impact2', impact2);
		audios.set('impact3', impact3);
		audios.set('impact4', impact4);
		audios.set('impact5', impact5);
		audios.set('impact6', impact6);
		audios.set('impact7', impact7);
		audios.set('health', health);
		audios.set('ammo', ammo);
		audios.set('enemy_death', enemyDeath);
		audios.set('enemy_grunt', enemyGrunt);
		audios.set('victory', victory);
		audios.set('defeat', defeat);

		return this;

	}

	/**
	* Loads all configurations from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadConfigs() {

		const loadingManager = this.loadingManager;
		const configs = this.configs;

		// level config

		loadingManager.itemStart('levelConfig');

		fetch('./assets/data/config/level.json')
			.then(response => {

				return response.json();

			})
			.then(json => {

				configs.set('level', json);

				loadingManager.itemEnd('levelConfig');

			});

		return this;

	}

	/**
	* Loads all models from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadModels() {

		const gltfLoader = this.gltfLoader;
		const textureLoader = this.textureLoader;
		const models = this.models;
		const animations = this.animations;

		// shadow for soldiers

		const shadowTexture = textureLoader.load('./assets/textures/environment/shadow.png');
		const planeGeometry = new PlaneGeometry();
		const planeMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.4 });

		const shadowPlane = new Mesh(planeGeometry, planeMaterial);
		shadowPlane.position.set(0, 0.05, 0);
		shadowPlane.rotation.set(- Math.PI * 0.5, 0, 0);
		shadowPlane.scale.multiplyScalar(2);
		shadowPlane.matrixAutoUpdate = false;
		shadowPlane.updateMatrix();

		// soldier - load character model and animations from separate FBX files

		const amyAnimations: any[] = [];
		const amyAnimationFiles = [
			{ name: 'amy_idle', path: './assets/models/characters/Amy/amy_idle.fbx' },
			{ name: 'amy_forward', path: './assets/models/characters/Amy/amy_forward.fbx' },
			{ name: 'amy_backward', path: './assets/models/characters/Amy/amy_backward.fbx' },
			{ name: 'amy_left', path: './assets/models/characters/Amy/amy_left.fbx' },
			{ name: 'amy_right', path: './assets/models/characters/Amy/amy_right.fbx' },
			{ name: 'amy_death1', path: './assets/models/characters/Amy/amy_death1.fbx' },
			{ name: 'amy_death2', path: './assets/models/characters/Amy/amy_death2.fbx' },
			{ name: 'amy_death3', path: './assets/models/characters/Amy/amy_death3.fbx' },
			{ name: 'amy_shoot_idle', path: './assets/models/characters/Amy/amy_shoot_idle.fbx' },
			{ name: 'amy_reload', path: './assets/models/characters/Amy/amy_reload.fbx' },
			{ name: 'amy_hit_front', path: './assets/models/characters/Amy/amy_hit_front.fbx' },
			{ name: 'amy_walk_forward', path: './assets/models/characters/Amy/amy_walk_forward.fbx' }
		];

		// Load Amy character model
		this.fbxLoader.load('./assets/models/characters/Amy/amy_idle.fbx', (fbx) => {

			const renderComponent = fbx;
			renderComponent.animations = [];

			renderComponent.matrixAutoUpdate = false;
			renderComponent.updateMatrix();

			renderComponent.traverse((object) => {

				if (object instanceof Mesh) {

					object.material.side = DoubleSide;
					// Ensure visibility in dark areas
					object.material.emissive = new Color(0x333333);
					object.material.emissiveIntensity = 0.15;
					object.matrixAutoUpdate = false;
					object.updateMatrix();

				}

			});

			const shadowPlaneClone = shadowPlane.clone();
			renderComponent.add(shadowPlaneClone);

			models.set('amy', renderComponent);

			// Now load all animation files
			let loadedCount = 0;

			amyAnimationFiles.forEach((animFile) => {
				this.fbxLoader.load(animFile.path, (animFbx) => {
					// Extract animations from the FBX
					if (animFbx.animations && animFbx.animations.length > 0) {
						const anim = animFbx.animations[0];
						anim.name = animFile.name;
						amyAnimations.push(anim);
						renderComponent.animations.push(anim);
						animations.set(animFile.name, anim);
					}

					loadedCount++;
				});
			});

		});

		// Granny - load character model and animations
		const grannyAnimations: any[] = [];
		const grannyAnimationFiles = [
			{ name: 'granny_idle', path: './assets/models/characters/Granny/granny_idle.fbx' },
			{ name: 'granny_forward', path: './assets/models/characters/Granny/granny_forward.fbx' },
			{ name: 'granny_backward', path: './assets/models/characters/Granny/granny_backward.fbx' },
			{ name: 'granny_left', path: './assets/models/characters/Granny/granny_left.fbx' },
			{ name: 'granny_right', path: './assets/models/characters/Granny/granny_right.fbx' },
			{ name: 'granny_death1', path: './assets/models/characters/Granny/granny_death1.fbx' },
			{ name: 'granny_death2', path: './assets/models/characters/Granny/granny_death2.fbx' },
			{ name: 'granny_death3', path: './assets/models/characters/Granny/granny_death3.fbx' },
			{ name: 'granny_shoot_idle', path: './assets/models/characters/Granny/granny_shoot_idle.fbx' },
			{ name: 'granny_reload', path: './assets/models/characters/Granny/granny_reload.fbx' },
			{ name: 'granny_hit_front', path: './assets/models/characters/Granny/granny_hit_front.fbx' },
			{ name: 'granny_walk_forward', path: './assets/models/characters/Granny/granny_walk_forward.fbx' }
		];

		// Load Granny character model
		this.fbxLoader.load('./assets/models/characters/Granny/granny_idle.fbx', (fbx) => {

			const renderComponent = fbx;
			renderComponent.animations = [];

			renderComponent.matrixAutoUpdate = false;
			renderComponent.updateMatrix();

			renderComponent.traverse((object) => {

				if (object instanceof Mesh) {

					object.material.side = DoubleSide;
					// Ensure visibility in dark areas
					object.material.emissive = new Color(0x333333);
					object.material.emissiveIntensity = 0.15;
					object.matrixAutoUpdate = false;
					object.updateMatrix();

				}

			});

			const shadowPlaneClone = shadowPlane.clone();
			renderComponent.add(shadowPlaneClone);

			models.set('granny', renderComponent);

			// Now load all animation files
			let loadedCount = 0;

			grannyAnimationFiles.forEach((animFile) => {
				this.fbxLoader.load(animFile.path, (animFbx) => {
					// Extract animations from the FBX
					if (animFbx.animations && animFbx.animations.length > 0) {
						const anim = animFbx.animations[0];
						anim.name = animFile.name;
						grannyAnimations.push(anim);
						renderComponent.animations.push(anim);
						animations.set(animFile.name, anim);
					}

					loadedCount++;
				});
			});

		});

		// level

		gltfLoader.load('./assets/models/environment/level.glb', (gltf) => {

			const renderComponent = gltf.scene;
			renderComponent.matrixAutoUpdate = false;
			renderComponent.updateMatrix();

			renderComponent.traverse((object) => {

				object.matrixAutoUpdate = false;
				object.updateMatrix();

			});

			models.set('level', renderComponent);

		});

		// Weapon models from weaponpack (OBJ files)
		const weaponBasePath = './assets/models/weapons/weaponpack/Models/';
		const mtlLoader = this.mtlLoader;
		const objLoader = this.objLoader;

		// Load pistol
		mtlLoader.load(weaponBasePath + 'pistol.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'pistol.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('blaster_high', obj);
				models.set('blaster_low', obj);
			});
		});

		// Load shotgun
		mtlLoader.load(weaponBasePath + 'shotgun.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'shotgun.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('shotgun_high', obj);
				models.set('shotgun_low', obj);
			});
		});

		// Load machinegun (assault rifle)
		mtlLoader.load(weaponBasePath + 'machinegun.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'machinegun.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('assaultRifle_high', obj);
				models.set('assaultRifle_low', obj);
			});
		});

		// Load sniper
		mtlLoader.load(weaponBasePath + 'sniper.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'sniper.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('sniper_high', obj);
				models.set('sniper_low', obj);
			});
		});

		// Load uzi (tec9)
		mtlLoader.load(weaponBasePath + 'uzi.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'uzi.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('uzi', obj);
			});
		});

		// Load pistol silencer (Scar)
		mtlLoader.load(weaponBasePath + 'pistolSilencer.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'pistolSilencer.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('pistolSilencer', obj);
			});
		});

		// Load sniper camo (AWP)
		mtlLoader.load(weaponBasePath + 'sniperCamo.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'sniperCamo.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('sniperCamo', obj);
			});
		});

		// Load machinegun launcher (LMG)
		mtlLoader.load(weaponBasePath + 'machinegunLauncher.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'machinegunLauncher.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('machinegunLauncher', obj);
			});
		});

		// Store the base models with original naming for backwards compatibility
		mtlLoader.load(weaponBasePath + 'pistol.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'pistol.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('pistol', obj);
			});
		});

		mtlLoader.load(weaponBasePath + 'machinegun.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'machinegun.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('machinegun', obj);
			});
		});

		mtlLoader.load(weaponBasePath + 'shotgun.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'shotgun.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('shotgun', obj);
			});
		});

		mtlLoader.load(weaponBasePath + 'sniper.mtl', (materials) => {
			materials.preload();
			objLoader.setMaterials(materials);
			objLoader.load(weaponBasePath + 'sniper.obj', (obj) => {
				obj.traverse((child) => {
					if (child instanceof Mesh && child.material) {
						child.material.emissive = new Color(0x222222);
						child.material.emissiveIntensity = 0.1;
					}
				});
				models.set('sniper', obj);
			});
		});

		// health pack

		gltfLoader.load('./assets/models/props/healthPack.glb', (gltf) => {

			const renderComponent = gltf.scene;
			renderComponent.matrixAutoUpdate = false;
			renderComponent.updateMatrix();

			renderComponent.traverse((object) => {

				object.matrixAutoUpdate = false;
				object.updateMatrix();

			});

			models.set('healthPack', renderComponent);

		});

		// muzzle sprite - enhanced multi-layer muzzle flash

		const muzzleTexture = textureLoader.load('./assets/images/misc/muzzle.png_19188667.png');
		muzzleTexture.matrixAutoUpdate = false;
		this.textures.set('muzzle', muzzleTexture); // Store for player weapon system

		// Load smoke spritesheet for particles
		const smokeTexture = textureLoader.load('./assets/images/misc/smoke.png_96f15dd1.png');
		smokeTexture.matrixAutoUpdate = false;
		this.textures.set('smoke', smokeTexture);

		// Create muzzle flash group with multiple layers
		const muzzleGroup = new Group();
		muzzleGroup.name = 'muzzleFlashGroup';

		// Layer 1: Bright white/yellow core
		const muzzleMaterial1 = new SpriteMaterial({
			map: muzzleTexture,
			color: 0xffffee,
			transparent: true,
			blending: AdditiveBlending,
			depthWrite: false
		});
		const muzzleCore = new Sprite(muzzleMaterial1);
		muzzleCore.name = 'muzzleCore';
		muzzleCore.scale.set(0.25, 0.25, 0.25);
		muzzleGroup.add(muzzleCore);

		// Layer 2: Orange mid-glow
		const muzzleMaterial2 = new SpriteMaterial({
			map: muzzleTexture.clone(),
			color: 0xffaa44,
			transparent: true,
			blending: AdditiveBlending,
			depthWrite: false
		});
		const muzzleMid = new Sprite(muzzleMaterial2);
		muzzleMid.name = 'muzzleMid';
		muzzleMid.scale.set(0.35, 0.35, 0.35);
		muzzleMid.position.z = -0.01;
		muzzleGroup.add(muzzleMid);

		// Layer 3: Red/orange outer bloom
		const muzzleMaterial3 = new SpriteMaterial({
			map: muzzleTexture.clone(),
			color: 0xff6622,
			transparent: true,
			blending: AdditiveBlending,
			depthWrite: false
		});
		const muzzleOuter = new Sprite(muzzleMaterial3);
		muzzleOuter.name = 'muzzleOuter';
		muzzleOuter.scale.set(0.45, 0.45, 0.45);
		muzzleOuter.position.z = -0.02;
		muzzleGroup.add(muzzleOuter);

		// Add point light for dynamic lighting
		const muzzleLight = new PointLight(0xffaa44, 0, 3);
		muzzleLight.name = 'muzzleLight';
		muzzleGroup.add(muzzleLight);

		muzzleGroup.visible = false;
		muzzleGroup.matrixAutoUpdate = false;

		models.set('muzzle', muzzleGroup);

		// Also keep a simple single sprite for backwards compatibility
		const simpleMuzzleMaterial = new SpriteMaterial({
			map: muzzleTexture.clone(),
			blending: AdditiveBlending,
			depthWrite: false
		});
		const simpleMuzzle = new Sprite(simpleMuzzleMaterial);
		simpleMuzzle.matrixAutoUpdate = false;
		simpleMuzzle.visible = false;
		models.set('muzzle_simple', simpleMuzzle);

		// bullet line

		const bulletLineGeometry = new BufferGeometry();
		const bulletLineMaterial = new LineBasicMaterial({ color: 0xfbf8e6 });

		bulletLineGeometry.setFromPoints([new Vector3(), new Vector3(0, 0, - 1)]);

		const bulletLine = new LineSegments(bulletLineGeometry, bulletLineMaterial);
		bulletLine.matrixAutoUpdate = false;

		models.set('bulletLine', bulletLine);

	}

	/**
	* Loads all textures from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadTextures() {

		const textureLoader = this.textureLoader;

		// === LEVEL TEXTURES ===
		// Concrete floor - matching style with walls
		const floorPath = './assets/textures/level/Concrete043B_1K-JPG/Concrete043B_1K-JPG';
		const floorColor = textureLoader.load(`${floorPath}_Color.jpg`);
		floorColor.wrapS = floorColor.wrapT = RepeatWrapping;
		floorColor.colorSpace = SRGBColorSpace;
		this.textures.set('floor_color', floorColor);

		const floorNormal = textureLoader.load(`${floorPath}_NormalGL.jpg`);
		floorNormal.wrapS = floorNormal.wrapT = RepeatWrapping;
		this.textures.set('floor_normal', floorNormal);

		const floorRoughness = textureLoader.load(`${floorPath}_Roughness.jpg`);
		floorRoughness.wrapS = floorRoughness.wrapT = RepeatWrapping;
		this.textures.set('floor_roughness', floorRoughness);

		const floorAO = textureLoader.load(`${floorPath}_AmbientOcclusion.jpg`);
		floorAO.wrapS = floorAO.wrapT = RepeatWrapping;
		this.textures.set('floor_ao', floorAO);

		const floorMetallic = textureLoader.load(`${floorPath}_Metalness.jpg`);
		floorMetallic.wrapS = floorMetallic.wrapT = RepeatWrapping;
		this.textures.set('floor_metallic', floorMetallic);

		// Clean concrete walls - minimal FPS aesthetic
		const concretePath = './assets/textures/level/Concrete042A_1K-JPG/Concrete042A_1K-JPG';

		const wallColor1 = textureLoader.load(`${concretePath}_Color.jpg`);
		wallColor1.wrapS = wallColor1.wrapT = RepeatWrapping;
		wallColor1.colorSpace = SRGBColorSpace;
		this.textures.set('wall_color_1', wallColor1);
		this.textures.set('wall_color_2', wallColor1); // Same texture for both variations

		const wallNormal1 = textureLoader.load(`${concretePath}_NormalGL.jpg`);
		wallNormal1.wrapS = wallNormal1.wrapT = RepeatWrapping;
		this.textures.set('wall_normal_1', wallNormal1);
		this.textures.set('wall_normal_2', wallNormal1);

		// Concrete uses metalness as roughness approximation
		const wallRoughness1 = textureLoader.load(`${concretePath}_Metalness.jpg`);
		wallRoughness1.wrapS = wallRoughness1.wrapT = RepeatWrapping;
		this.textures.set('wall_roughness_1', wallRoughness1);
		this.textures.set('wall_roughness_2', wallRoughness1);

		const wallAO1 = textureLoader.load(`${concretePath}_AmbientOcclusion.jpg`);
		wallAO1.wrapS = wallAO1.wrapT = RepeatWrapping;
		this.textures.set('wall_ao_1', wallAO1);
		this.textures.set('wall_ao_2', wallAO1);

		return this;

	}

	/**
	* Loads the navigation mesh from the backend.
	*
	* @return {AssetManager} A reference to this asset manager.
	*/
	_loadNavMesh() {

		const navMeshLoader = this.navMeshLoader;
		const loadingManager = this.loadingManager;

		loadingManager.itemStart('navmesh');

		navMeshLoader.load('./assets/data/navmeshes/navmesh.glb').then((navMesh) => {

			this.navMesh = navMesh;

			loadingManager.itemEnd('navmesh');

		});

		//

		loadingManager.itemStart('costTable');

		fetch('./assets/data/navmeshes/costTable.json')
			.then(response => {

				return response.json();

			})
			.then(json => {

				this.costTable = new CostTable().fromJSON(json);

				loadingManager.itemEnd('costTable');

			});

		return this;

	}

}

export { AssetManager };

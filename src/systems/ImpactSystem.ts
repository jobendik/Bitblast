import * as THREE from 'three';

export enum SurfaceMaterial {
  BRICK = 'brick',
  WOOD = 'wood',
  METAL = 'metal',
  ROCK = 'rock',
  GRAVEL = 'gravel',
  DEFAULT = 'default'
}

interface ImpactAudioBuffers {
  bodyImpacts: AudioBuffer[];
  deathImpact?: AudioBuffer;
  hitImpact?: AudioBuffer;
  explosion?: AudioBuffer;
  bulletWhiz?: AudioBuffer;
  shellDrop?: AudioBuffer;
  surfaceImpacts: {
    [key in SurfaceMaterial]?: AudioBuffer[];
  };
}

export class ImpactSystem {
  private audioBuffers: ImpactAudioBuffers = {
    bodyImpacts: [],
    surfaceImpacts: {}
  };
  private audioListener: THREE.AudioListener;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, listener: THREE.AudioListener) {
    this.scene = scene;
    this.audioListener = listener;
    this.loadAudio();
  }

  private loadAudio(): void {
    const audioLoader = new THREE.AudioLoader();

    // Body impact sounds (randomized for variety)
    // Body impact sounds (randomized for variety)
    const bodyImpactPaths = [
      'assets/audio/sfx/impacts/Body-Impact-1.mp3',
      'assets/audio/sfx/impacts/Body-Impact-2.mp3',
      'assets/audio/sfx/impacts/Body-Impact-3.mp3',
    ];

    bodyImpactPaths.forEach((path) => {
      audioLoader.load(path, (buffer) => {
        this.audioBuffers.bodyImpacts.push(buffer);
      }, undefined, (err) => console.warn(`Failed to load ${path}:`, err));
    });

    // Death impact
    audioLoader.load('assets/audio/sfx/impacts/Death-Impact.mp3', (buffer) => {
      this.audioBuffers.deathImpact = buffer;
    }, undefined, (err) => console.warn('Failed to load death impact:', err));

    // Hit confirmation
    audioLoader.load('assets/audio/sfx/impacts/Hit-Impact.mp3', (buffer) => {
      this.audioBuffers.hitImpact = buffer;
    }, undefined, (err) => console.warn('Failed to load hit impact:', err));

    // Explosion (Placeholder using Shotgun Fire pitched down)
    audioLoader.load('assets/audio/sfx/weapons/Shotgun-Fire.mp3', (buffer) => {
      this.audioBuffers.explosion = buffer;
    }, undefined, (err) => console.warn('Failed to load explosion sound:', err));

    // Bullet Whiz (using a tail sound as placeholder)
    audioLoader.load('assets/audio/sfx/weapons/Tec-9-Tail.mp3', (buffer) => {
      this.audioBuffers.bulletWhiz = buffer;
    }, undefined, (err) => console.warn('Failed to load bullet whiz:', err));

    // Shell Drop (using light metal impact)
    audioLoader.load('assets/audio/sfx/impacts/Impact-Iron-Light.mp3', (buffer) => {
      this.audioBuffers.shellDrop = buffer;
    }, undefined, (err) => console.warn('Failed to load shell drop:', err));

    // Surface impacts - organized by material
    const surfaceImpacts = {
      [SurfaceMaterial.BRICK]: [
        'assets/audio/sfx/impacts/Impact-Brick-1.mp3',
        'assets/audio/sfx/impacts/Impact-Brick-2.mp3',
      ],
      [SurfaceMaterial.GRAVEL]: [
        'assets/audio/sfx/impacts/Impact-Gravel-1.mp3',
        'assets/audio/sfx/impacts/Impact-Gravel-2.mp3',
      ],
      [SurfaceMaterial.WOOD]: [
        'assets/audio/sfx/impacts/Impact-Wood-1.mp3',
        'assets/audio/sfx/impacts/Impact-Wood-2.mp3',
      ],
      [SurfaceMaterial.ROCK]: [
        'assets/audio/sfx/impacts/Impact-Rock-1.mp3',
        'assets/audio/sfx/impacts/Impact-Rock-2.mp3',
      ],
      [SurfaceMaterial.METAL]: [
        'assets/audio/sfx/impacts/Impact-Metal.mp3',
        'assets/audio/sfx/impacts/Impact-Iron.mp3',
        'assets/audio/sfx/impacts/Impact-Iron-Light.mp3',
      ],
    };

    Object.entries(surfaceImpacts).forEach(([material, paths]) => {
      this.audioBuffers.surfaceImpacts[material as SurfaceMaterial] = [];
      paths.forEach((path) => {
        audioLoader.load(path, (buffer) => {
          this.audioBuffers.surfaceImpacts[material as SurfaceMaterial]!.push(buffer);
        }, undefined, (err) => console.warn(`Failed to load ${path}:`, err));
      });
    });
  }

  /**
   * Play body hit impact sound - randomized for variety
   * Volume is exaggerated for satisfying feedback
   */
  public playBodyImpact(position: THREE.Vector3, volume: number = 1.0): void {
    if (this.audioBuffers.bodyImpacts.length === 0) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    const randomBuffer = this.audioBuffers.bodyImpacts[
      Math.floor(Math.random() * this.audioBuffers.bodyImpacts.length)
    ];

    sound.setBuffer(randomBuffer);
    sound.setRefDistance(5);
    sound.setVolume(volume * 1.5); // Exaggerated for punchiness
    sound.setLoop(false);

    // Create temporary object for positional audio
    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }

  /**
   * Play death impact - final, explosive sound
   */
  public playDeathImpact(position: THREE.Vector3): void {
    if (!this.audioBuffers.deathImpact) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.audioBuffers.deathImpact);
    sound.setRefDistance(8);
    sound.setVolume(2.0); // Very loud and punchy
    sound.setLoop(false);

    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }

  /**
   * Play hit confirmation sound - instant feedback, zero latency
   */
  public playHitConfirmation(volume: number = 0.8): void {
    if (!this.audioBuffers.hitImpact) return;

    const sound = new THREE.Audio(this.audioListener);
    sound.setBuffer(this.audioBuffers.hitImpact);
    sound.setVolume(volume * 1.2);
    sound.play();
  }

  /**
   * Play bullet whiz sound for near misses
   * High pitch, fast playback to simulate supersonic crack
   */
  public playBulletWhiz(position: THREE.Vector3): void {
    if (!this.audioBuffers.bulletWhiz) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.audioBuffers.bulletWhiz);
    sound.setRefDistance(5);
    sound.setVolume(0.4);
    sound.setPlaybackRate(1.5 + Math.random() * 0.5); // Vary pitch
    sound.setLoop(false);

    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }

  /**
   * Play shell casing drop sound
   * Tiny, metallic clink with variable volume for bounce intensity
   * @param position World position of the shell
   * @param volumeScale Optional volume multiplier (0-1), default 1.0
   */
  public playShellDrop(position: THREE.Vector3, volumeScale: number = 1.0): void {
    if (!this.audioBuffers.shellDrop) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.audioBuffers.shellDrop);
    sound.setRefDistance(2);
    sound.setVolume(0.125 * Math.max(0.2, Math.min(1.0, volumeScale))); // Reduced by 50%
    sound.setPlaybackRate(1.8 + Math.random() * 0.8); // Varied pitch for natural sound
    sound.setLoop(false);

    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }

  /**
   * Play massive explosion sound
   */
  public playExplosion(position: THREE.Vector3): void {
    if (!this.audioBuffers.explosion) return;

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setBuffer(this.audioBuffers.explosion);
    sound.setRefDistance(20); // Heard from far away
    sound.setVolume(2.0); // Very loud
    sound.setPlaybackRate(0.5); // Deep, bassy rumble
    sound.setLoop(false);

    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }

  /**
   * Play surface impact based on material type
   * Different materials = distinct sonic signatures for instant clarity
   */
  public playSurfaceImpact(
    position: THREE.Vector3,
    material: SurfaceMaterial,
    volume: number = 0.8
  ): void {
    const buffers = this.audioBuffers.surfaceImpacts[material];
    if (!buffers || buffers.length === 0) {
      // Fallback to metal for default
      const fallback = this.audioBuffers.surfaceImpacts[SurfaceMaterial.METAL];
      if (!fallback || fallback.length === 0) return;
      this.playSurfaceImpactWithBuffer(position, fallback, volume);
      return;
    }

    this.playSurfaceImpactWithBuffer(position, buffers, volume);
  }

  private playSurfaceImpactWithBuffer(
    position: THREE.Vector3,
    buffers: AudioBuffer[],
    volume: number
  ): void {
    const sound = new THREE.PositionalAudio(this.audioListener);
    const randomBuffer = buffers[Math.floor(Math.random() * buffers.length)];

    sound.setBuffer(randomBuffer);
    sound.setRefDistance(10);
    sound.setVolume(volume * 0.5); // Subtle surface impacts - reduced to not overpower weapon sounds
    sound.setLoop(false);

    const temp = new THREE.Object3D();
    temp.position.copy(position);
    this.scene.add(temp);
    temp.add(sound);

    sound.play();
    sound.onEnded = () => {
      this.scene.remove(temp);
    };
  }
}

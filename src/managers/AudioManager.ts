// Audio Manager
// Centralized audio management for weapon sounds, ambient, positional audio

import * as THREE from 'three';

export interface AudioConfig {
  volume: number;
  loop: boolean;
  positional: boolean;
  refDistance?: number;
  rolloffFactor?: number;
  maxDistance?: number;
}

interface ManagedAudio {
  audio: THREE.Audio | THREE.PositionalAudio;
  id: string;
  category: 'music' | 'sfx' | 'ambient' | 'voice';
}

export class AudioManager {
  private listener: THREE.AudioListener;
  private audioLoader: THREE.AudioLoader;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeAudio: ManagedAudio[] = [];

  // Volume levels per category
  private volumes = {
    master: 1.0,
    music: 0.5,
    sfx: 1.0,
    ambient: 0.6,
    voice: 1.0,
  };

  // Reusable audio pools
  private sfxPool: THREE.Audio[] = [];
  private positionalPool: THREE.PositionalAudio[] = [];
  private poolSize = 20;

  constructor(camera: THREE.Camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();

    // Initialize pools
    for (let i = 0; i < this.poolSize; i++) {
      this.sfxPool.push(new THREE.Audio(this.listener));
      this.positionalPool.push(new THREE.PositionalAudio(this.listener));
    }
  }

  public getListener(): THREE.AudioListener {
    return this.listener;
  }

  // ========== LOADING ==========

  public async loadAudio(path: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(path)) {
      return this.bufferCache.get(path)!;
    }

    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        path,
        (buffer) => {
          this.bufferCache.set(path, buffer);
          resolve(buffer);
        },
        undefined,
        (error) => {
          console.warn(`Failed to load audio: ${path}`, error);
          reject(error);
        }
      );
    });
  }

  public async preloadAudios(paths: string[]): Promise<void> {
    await Promise.all(paths.map((path) => this.loadAudio(path).catch(() => null)));
  }

  // ========== PLAYBACK ==========

  public playSound(
    pathOrBuffer: string | AudioBuffer,
    category: 'sfx' | 'ambient' | 'voice' = 'sfx',
    config: Partial<AudioConfig> = {}
  ): THREE.Audio | null {
    const audio = this.getFromPool(this.sfxPool);
    if (!audio) return null;

    const setup = (buffer: AudioBuffer) => {
      if (audio.isPlaying) audio.stop();
      audio.setBuffer(buffer);
      audio.setVolume(this.getEffectiveVolume(category) * (config.volume ?? 1));
      audio.setLoop(config.loop ?? false);
      audio.play();
    };

    if (typeof pathOrBuffer === 'string') {
      if (this.bufferCache.has(pathOrBuffer)) {
        setup(this.bufferCache.get(pathOrBuffer)!);
      } else {
        this.loadAudio(pathOrBuffer).then(setup).catch(() => {});
      }
    } else {
      setup(pathOrBuffer);
    }

    return audio;
  }

  public playPositionalSound(
    pathOrBuffer: string | AudioBuffer,
    position: THREE.Vector3,
    category: 'sfx' | 'ambient' = 'sfx',
    config: Partial<AudioConfig> = {}
  ): THREE.PositionalAudio | null {
    const audio = this.getPositionalFromPool();
    if (!audio) return null;

    audio.position.copy(position);
    audio.setRefDistance(config.refDistance ?? 5);
    audio.setRolloffFactor(config.rolloffFactor ?? 1);
    audio.setMaxDistance(config.maxDistance ?? 50);

    const setup = (buffer: AudioBuffer) => {
      if (audio.isPlaying) audio.stop();
      audio.setBuffer(buffer);
      audio.setVolume(this.getEffectiveVolume(category) * (config.volume ?? 1));
      audio.setLoop(config.loop ?? false);
      audio.play();
    };

    if (typeof pathOrBuffer === 'string') {
      if (this.bufferCache.has(pathOrBuffer)) {
        setup(this.bufferCache.get(pathOrBuffer)!);
      } else {
        this.loadAudio(pathOrBuffer).then(setup).catch(() => {});
      }
    } else {
      setup(pathOrBuffer);
    }

    return audio;
  }

  public playWeaponSound(
    firePath: string,
    tailPath?: string,
    volume: number = 0.5
  ): void {
    // Fire sound
    if (this.bufferCache.has(firePath)) {
      this.playSound(this.bufferCache.get(firePath)!, 'sfx', { volume });
    } else {
      this.playSound(firePath, 'sfx', { volume });
    }

    // Tail/echo sound (delayed reverb effect)
    if (tailPath) {
      this.playSound(tailPath, 'sfx', { volume: volume * 0.6 });
    }
  }

  // ========== VOLUME CONTROL ==========

  public setMasterVolume(volume: number): void {
    this.volumes.master = Math.max(0, Math.min(1, volume));
    this.listener.setMasterVolume(this.volumes.master);
  }

  public setCategoryVolume(category: keyof typeof this.volumes, volume: number): void {
    this.volumes[category] = Math.max(0, Math.min(1, volume));
  }

  public getEffectiveVolume(category: keyof typeof this.volumes): number {
    return this.volumes.master * this.volumes[category];
  }

  public getMasterVolume(): number {
    return this.volumes.master;
  }

  // ========== POOL MANAGEMENT ==========

  private getFromPool(pool: THREE.Audio[]): THREE.Audio | null {
    // Find an audio that's not playing
    for (const audio of pool) {
      if (!audio.isPlaying) {
        return audio;
      }
    }

    // All busy - return the first one (will interrupt oldest)
    return pool[0] || null;
  }

  private getPositionalFromPool(): THREE.PositionalAudio | null {
    for (const audio of this.positionalPool) {
      if (!audio.isPlaying) {
        return audio;
      }
    }
    return this.positionalPool[0] || null;
  }

  // ========== AMBIENT ==========

  public playAmbient(path: string, volume: number = 0.6): THREE.Audio | null {
    return this.playSound(path, 'ambient', { volume, loop: true });
  }

  public playMusic(path: string, volume: number = 0.5): THREE.Audio | null {
    // Stop any existing music first
    this.stopCategory('music');
    return this.playSound(path, 'ambient', { volume, loop: true });
  }

  // ========== UTILITY ==========

  public stopCategory(category: 'music' | 'sfx' | 'ambient' | 'voice'): void {
    this.activeAudio
      .filter((a) => a.category === category)
      .forEach((a) => {
        if (a.audio.isPlaying) a.audio.stop();
      });
  }

  public stopAll(): void {
    [...this.sfxPool, ...this.positionalPool].forEach((audio) => {
      if (audio.isPlaying) audio.stop();
    });
  }

  public mute(): void {
    this.listener.setMasterVolume(0);
  }

  public unmute(): void {
    this.listener.setMasterVolume(this.volumes.master);
  }

  public dispose(): void {
    this.stopAll();
    this.bufferCache.clear();
    this.sfxPool = [];
    this.positionalPool = [];
  }
}

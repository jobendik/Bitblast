// Post-Processing System
// Handles bloom, color grading, SSAO, and other visual effects

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Custom color grading shader
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    brightness: { value: 0.0 },
    contrast: { value: 1.05 },
    saturation: { value: 1.1 },
    vignetteIntensity: { value: 0.3 },
    vignetteRoundness: { value: 0.5 },
    // Color tint for atmosphere
    tintColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) }, // Neutral - let lights provide color
    tintStrength: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float brightness;
    uniform float contrast;
    uniform float saturation;
    uniform float vignetteIntensity;
    uniform float vignetteRoundness;
    uniform vec3 tintColor;
    uniform float tintStrength;
    
    varying vec2 vUv;
    
    vec3 adjustSaturation(vec3 color, float saturation) {
      vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
      float luminance = dot(color, luminanceWeights);
      return mix(vec3(luminance), color, saturation);
    }
    
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      
      // Brightness
      color += brightness;
      
      // Contrast
      color = (color - 0.5) * contrast + 0.5;
      
      // Saturation
      color = adjustSaturation(color, saturation);
      
      // Color tint
      color = mix(color, color * tintColor, tintStrength);
      
      // Vignette
      vec2 uv = vUv * 2.0 - 1.0;
      float vignette = 1.0 - dot(uv * vignetteRoundness, uv * vignetteRoundness);
      vignette = smoothstep(0.0, 1.0, vignette);
      vignette = mix(1.0, vignette, vignetteIntensity);
      color *= vignette;
      
      gl_FragColor = vec4(color, texel.a);
    }
  `
};

export interface PostProcessingConfig {
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
  };
  colorGrading: {
    enabled: boolean;
    brightness: number;
    contrast: number;
    saturation: number;
  };
  vignette: {
    enabled: boolean;
    intensity: number;
    roundness: number;
  };
  fxaa: {
    enabled: boolean;
  };
}

export class PostProcessingSystem {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private colorGradingPass: ShaderPass;
  private fxaaPass: ShaderPass;
  private outputPass: OutputPass;

  private config: PostProcessingConfig = {
    bloom: {
      enabled: true,
      strength: 0.2,
      radius: 0.3,
      threshold: 0.9,
    },
    colorGrading: {
      enabled: true,
      brightness: 0.02,
      contrast: 1.05,
      saturation: 1.15,
    },
    vignette: {
      enabled: true,
      intensity: 0.1,
      roundness: 0.3,
    },
    fxaa: {
      enabled: true,
    },
  };

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    // Create composer with explicit render target settings to prevent flickering
    this.composer = new EffectComposer(renderer);

    // Render pass - renders the scene
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.clear = true; // Ensure the render pass clears before rendering
    this.renderPass.clearDepth = true;
    this.composer.addPass(this.renderPass);

    // Bloom pass - for glowing effects
    const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.bloomPass = new UnrealBloomPass(
      resolution,
      this.config.bloom.strength,
      this.config.bloom.radius,
      this.config.bloom.threshold
    );
    this.composer.addPass(this.bloomPass);

    // Color grading pass
    this.colorGradingPass = new ShaderPass(ColorGradingShader);
    this.updateColorGrading();
    this.composer.addPass(this.colorGradingPass);

    // FXAA anti-aliasing
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.updateFXAAResolution();
    this.composer.addPass(this.fxaaPass);

    // Output pass for correct color space
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  private updateColorGrading(): void {
    const uniforms = this.colorGradingPass.uniforms;
    uniforms.brightness.value = this.config.colorGrading.brightness;
    uniforms.contrast.value = this.config.colorGrading.contrast;
    uniforms.saturation.value = this.config.colorGrading.saturation;
    uniforms.vignetteIntensity.value = this.config.vignette.intensity;
    uniforms.vignetteRoundness.value = this.config.vignette.roundness;
  }

  private updateFXAAResolution(): void {
    const pixelRatio = window.devicePixelRatio || 1;
    this.fxaaPass.uniforms['resolution'].value.set(
      1 / (window.innerWidth * pixelRatio),
      1 / (window.innerHeight * pixelRatio)
    );
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.updateFXAAResolution();
  }

  public render(): void {
    this.composer.render();
  }

  // Configuration methods
  public setBloomStrength(strength: number): void {
    this.config.bloom.strength = strength;
    this.bloomPass.strength = strength;
  }

  public setBloomThreshold(threshold: number): void {
    this.config.bloom.threshold = threshold;
    this.bloomPass.threshold = threshold;
  }

  public setBloomRadius(radius: number): void {
    this.config.bloom.radius = radius;
    this.bloomPass.radius = radius;
  }

  public setVignetteIntensity(intensity: number): void {
    this.config.vignette.intensity = intensity;
    this.colorGradingPass.uniforms.vignetteIntensity.value = intensity;
  }

  public setSaturation(saturation: number): void {
    this.config.colorGrading.saturation = saturation;
    this.colorGradingPass.uniforms.saturation.value = saturation;
  }

  public setContrast(contrast: number): void {
    this.config.colorGrading.contrast = contrast;
    this.colorGradingPass.uniforms.contrast.value = contrast;
  }

  public setBrightness(brightness: number): void {
    this.config.colorGrading.brightness = brightness;
    this.colorGradingPass.uniforms.brightness.value = brightness;
  }

  /**
   * Temporarily intensify vignette (e.g., when player is damaged)
   */
  public pulseVignette(intensity: number, duration: number = 0.3): void {
    const originalIntensity = this.config.vignette.intensity;
    this.colorGradingPass.uniforms.vignetteIntensity.value = intensity;

    // Animate back to original
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic

      this.colorGradingPass.uniforms.vignetteIntensity.value =
        intensity + (originalIntensity - intensity) * eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  /**
   * Flash bloom for explosions/impacts
   */
  public flashBloom(intensity: number, duration: number = 0.2): void {
    const originalStrength = this.config.bloom.strength;
    this.bloomPass.strength = intensity;

    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);

      this.bloomPass.strength = intensity + (originalStrength - intensity) * eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  public dispose(): void {
    this.composer.dispose();
  }
}

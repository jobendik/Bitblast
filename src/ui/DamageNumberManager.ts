import * as THREE from 'three';

export class DamageNumberManager {
    private container: HTMLElement;
    private camera: THREE.Camera | null = null;
    private activeNumbers: Array<{
        element: HTMLElement;
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        life: number;
        maxLife: number;
    }> = [];

    constructor() {
        // Create container if it doesn't exist
        let container = document.getElementById('damage-numbers-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'damage-numbers-container';
            container.style.position = 'absolute';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.pointerEvents = 'none';
            container.style.overflow = 'hidden';
            container.style.zIndex = '1000'; // Ensure it's on top
            document.body.appendChild(container);
        }
        this.container = container;
    }

    public setCamera(camera: THREE.Camera) {
        this.camera = camera;
    }

    public showDamage(position: THREE.Vector3, damage: number, isCritical: boolean = false) {
        if (!this.container) return;

        const element = document.createElement('div');
        element.textContent = Math.round(damage).toString();

        // Base styles
        element.style.position = 'absolute';
        element.style.fontFamily = "'Orbitron', sans-serif";
        element.style.fontWeight = 'bold';
        element.style.textShadow = '0 0 4px rgba(0,0,0,0.8)';
        element.style.pointerEvents = 'none';
        element.style.userSelect = 'none';

        // Critical vs Normal styles
        if (isCritical) {
            element.style.color = '#ffeb3b'; // Yellow
            element.style.fontSize = '32px';
            element.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.8)';
            element.textContent += '!';
        } else {
            element.style.color = '#ffffff'; // White
            element.style.fontSize = '24px';
        }

        this.container.appendChild(element);

        // Add to active numbers with random velocity for "pop" effect
        this.activeNumbers.push({
            element,
            position: position.clone(),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 1.5, // Random X spread
                2.0 + Math.random() * 1.0,   // Upward pop
                (Math.random() - 0.5) * 1.5  // Random Z spread
            ),
            life: 0,
            maxLife: 1.5 // Seconds
        });
    }

    public update(delta: number) {
        if (!this.camera) return;

        // Update all active numbers
        for (let i = this.activeNumbers.length - 1; i >= 0; i--) {
            const num = this.activeNumbers[i];

            // Update life
            num.life += delta;
            if (num.life >= num.maxLife) {
                // Remove expired
                if (num.element.parentNode) {
                    num.element.parentNode.removeChild(num.element);
                }
                this.activeNumbers.splice(i, 1);
                continue;
            }

            // Update physics position
            num.position.add(num.velocity.clone().multiplyScalar(delta));
            // Gravity
            num.velocity.y -= 5.0 * delta;
            // Drag
            num.velocity.multiplyScalar(1.0 - (2.0 * delta));

            // Project to screen
            this.camera.updateMatrixWorld(); // Ensure matrix is up to date
            const screenPos = num.position.clone().project(this.camera);

            // Check if visible (in front of camera)
            if (screenPos.z > 1 || Math.abs(screenPos.x) > 1.1 || Math.abs(screenPos.y) > 1.1) {
                num.element.style.display = 'none';
                continue;
            } else {
                num.element.style.display = 'block';
            }

            // Convert to CSS coordinates (0,0 is top-left)
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight;

            // Apply transform
            num.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

            // Fade out
            const fadeStart = num.maxLife * 0.7;
            if (num.life > fadeStart) {
                const opacity = 1.0 - ((num.life - fadeStart) / (num.maxLife - fadeStart));
                num.element.style.opacity = opacity.toString();
            } else {
                num.element.style.opacity = '1';
            }

            // Scale animation (pop in)
            const scale = Math.min(1.0, num.life * 5.0);
            num.element.style.transform += ` scale(${scale})`;
        }
    }
}

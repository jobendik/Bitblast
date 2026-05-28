export class KillfeedManager {
    private container: HTMLElement;
    private maxItems: number = 5;
    private itemDuration: number = 5000; // 5 seconds

    constructor() {
        this.container = document.getElementById('killfeed')!;
        if (!this.container) {
            console.error('Killfeed container not found!');
        }
    }

    public addKill(killer: string, victim: string, weapon: string, isHeadshot: boolean, isMultiKill: boolean = false, killerTeam: string = '', victimTeam: string = ''): void {
        if (!this.container) return;

        // Use requestAnimationFrame to defer DOM manipulation
        requestAnimationFrame(() => {
            const item = document.createElement('div');

            // Determine if this is a player kill (for border color)
            const isPlayerKill = killerTeam === 'player' || killer === 'Player' || killer === 'YOU';
            const typeClass = isPlayerKill ? '' : 'enemy';

            item.className = `killfeed-item ${typeClass}`;
            if (isHeadshot) item.classList.add('headshot');
            if (isMultiKill) item.classList.add('multikill');

            // Determine colors based on team or entity type
            let killerClass = 'killfeed-killer';
            if (!isPlayerKill) killerClass += ' enemy';

            const victimClass = 'killfeed-victim';

            // Icons - SVG skull and headshot
            const skullIcon = `<svg class="killfeed-skull" viewBox="0 0 24 24" width="14" height="14" fill="white" opacity="0.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3h1.5v-2H10v2zm2.5 0H14v-2h-1.5v2zm-4-4.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5S10.83 11 10 11s-1.5.67-1.5 1.5zm5 0c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/></svg>`;
            const headshotIcon = isHeadshot
                ? `<svg class="killfeed-hs-icon" viewBox="0 0 24 24" width="16" height="16" fill="var(--c-health-low)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`
                : '';

            item.innerHTML = `
                <div class="killfeed-content">
                    <span class="${killerClass}">${killer}</span>
                    ${headshotIcon}
                    <span class="killfeed-weapon">[${weapon}]</span>
                    ${skullIcon}
                    <span class="${victimClass}">${victim}</span>
                </div>
            `;

            // Add to container
            this.container.appendChild(item);

            // Manage max items
            while (this.container.children.length > this.maxItems) {
                if (this.container.firstChild) {
                    this.container.removeChild(this.container.firstChild);
                }
            }

            // Auto remove with fade out
            setTimeout(() => {
                item.classList.add('fade-out');
                setTimeout(() => {
                    if (item.parentNode === this.container) {
                        this.container.removeChild(item);
                    }
                }, 500);
            }, this.itemDuration);
        });
    }
}

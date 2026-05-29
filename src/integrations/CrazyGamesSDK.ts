/**
 * CrazyGames SDK integration layer.
 *
 * Wraps the CrazyGames SDK v3 (https://docs.crazygames.com/sdk/html5-v3) behind a
 * single, strongly-typed, crash-proof facade. Every call degrades gracefully when the
 * SDK is missing (local dev, itch.io, self-hosted), so the rest of the game can call
 * these methods unconditionally without environment checks.
 *
 * Loaded once via `CrazyGamesSDK.init()` early in main.ts. Access the singleton through
 * the exported `CG` constant.
 */

/* ------------------------------------------------------------------ *
 *  Minimal ambient types for the global SDK injected by the <script>  *
 * ------------------------------------------------------------------ */

export interface CrazyUser {
    username: string;
    profilePictureUrl?: string;
}

type AdType = 'midgame' | 'rewarded';

interface AdCallbacks {
    adStarted?: () => void;
    adFinished?: () => void;
    adError?: (error: unknown) => void;
}

interface CrazyGamesGlobal {
    SDK: {
        init: () => Promise<void>;
        environment?: string; // 'local' | 'crazygames' | 'disabled'
        game: {
            loadingStart: () => void;
            loadingStop: () => void;
            gameplayStart: () => void;
            gameplayStop: () => void;
            happytime: () => void;
            inviteLink: (params: Record<string, string | number | boolean>) => Promise<string>;
            getInviteParam: (key: string) => string | null;
            showInviteButton: (params: Record<string, string | number | boolean>) => Promise<void> | void;
            hideInviteButton: () => void;
            isInstantMultiplayer?: boolean;
        };
        ad: {
            requestAd: (type: AdType, callbacks: AdCallbacks) => void;
            hasAdblock?: () => Promise<boolean>;
        };
        banner: {
            requestResponsiveBanner: (containerId: string | string[]) => Promise<void>;
            requestBanner: (req: { id: string; width: number; height: number }) => Promise<void>;
            clearBanner: (containerId: string | string[]) => void;
            clearAllBanners: () => void;
        };
        user: {
            isUserAccountAvailable: boolean;
            getUser: () => Promise<CrazyUser | null>;
            showAuthPrompt: () => Promise<CrazyUser | null>;
            addAuthListener: (listener: (user: CrazyUser | null) => void) => void;
            removeAuthListener: (listener: (user: CrazyUser | null) => void) => void;
            getXsollaUserToken?: () => Promise<string>;
            systemInfo?: { device?: { type?: string } };
        };
        data: {
            getItem: (key: string) => string | null;
            setItem: (key: string, value: string) => void;
            removeItem: (key: string) => void;
            clear: () => void;
        };
    };
}

declare global {
    interface Window {
        CrazyGames?: CrazyGamesGlobal;
    }
}

export type CrazyEnvironment = 'crazygames' | 'local' | 'disabled' | 'none';

/* ------------------------------------------------------------------ *
 *  The facade                                                         *
 * ------------------------------------------------------------------ */

class CrazyGamesService {
    /** Resolves once init() has finished (success OR fallback). Never rejects. */
    public ready: Promise<void>;
    private resolveReady!: () => void;

    private sdk: CrazyGamesGlobal['SDK'] | null = null;
    private initialized = false;
    private gameplayActive = false;
    private loadingActive = false;
    private authListeners: Array<(user: CrazyUser | null) => void> = [];

    /** Where the game is running, per the SDK. 'none' means SDK not present at all. */
    public environment: CrazyEnvironment = 'none';

    constructor() {
        this.ready = new Promise<void>((resolve) => {
            this.resolveReady = resolve;
        });
    }

    /** True when the real CrazyGames SDK is present and initialized. */
    public get available(): boolean {
        return this.sdk !== null && this.initialized;
    }

    /** True when running inside the actual CrazyGames portal (not local preview). */
    public get onPortal(): boolean {
        return this.available && this.environment === 'crazygames';
    }

    /** True when the SDK reports the device is mobile. */
    public get isMobile(): boolean {
        const type = this.safe(() => this.sdk?.user.systemInfo?.device?.type, undefined);
        if (type) return type === 'mobile' || type === 'tablet';
        // Fallback heuristic when SDK info unavailable.
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    /**
     * Initialize the SDK. Safe to call once at startup. Always resolves, even if the
     * SDK script failed to load or init throws — the game must remain playable offline.
     */
    public async init(): Promise<void> {
        if (this.initialized) return this.ready;

        try {
            const global = window.CrazyGames;
            if (global?.SDK) {
                await global.SDK.init();
                this.sdk = global.SDK;
                this.environment = (global.SDK.environment as CrazyEnvironment) || 'crazygames';
                this.initialized = true;
                this.wireAuthForwarding();
                console.info(`[CrazyGames] SDK initialized (environment: ${this.environment})`);
            } else {
                this.environment = 'none';
                console.info('[CrazyGames] SDK not present — running in standalone mode');
            }
        } catch (err) {
            this.sdk = null;
            this.environment = 'none';
            console.warn('[CrazyGames] SDK init failed — running in standalone mode', err);
        } finally {
            // Mark initialized even on failure so callers don't await forever.
            this.initialized = true;
            this.resolveReady();
        }

        return this.ready;
    }

    /* ----------------------------- Loading ---------------------------- */

    /** Signal that the game is loading assets (pauses the CrazyGames loading screen logic). */
    public loadingStart(): void {
        if (this.loadingActive) return;
        this.loadingActive = true;
        this.safe(() => this.sdk?.game.loadingStart());
    }

    /** Signal that asset loading is complete. */
    public loadingStop(): void {
        if (!this.loadingActive) return;
        this.loadingActive = false;
        this.safe(() => this.sdk?.game.loadingStop());
    }

    /* ---------------------------- Gameplay ---------------------------- */

    /**
     * Signal that active gameplay started (player has control). Required by CrazyGames
     * so ads are never shown during gameplay. Idempotent.
     */
    public gameplayStart(): void {
        if (this.gameplayActive) return;
        this.gameplayActive = true;
        this.safe(() => this.sdk?.game.gameplayStart());
    }

    /**
     * Signal that gameplay paused/stopped (menus, loading, match end, pause). Idempotent.
     */
    public gameplayStop(): void {
        if (!this.gameplayActive) return;
        this.gameplayActive = false;
        this.safe(() => this.sdk?.game.gameplayStop());
    }

    /** Natural break in gameplay — lets the SDK consider showing an interstitial. */
    public happytime(): void {
        this.safe(() => this.sdk?.game.happytime());
    }

    /* ------------------------------ Ads ------------------------------- */

    /**
     * Request a midgame (interstitial) ad. Resolves when the ad flow completes
     * (whether it played, errored, or was skipped). Audio is muted for the ad
     * duration via the provided callbacks.
     */
    public requestMidgameAd(opts: { onMute?: () => void; onUnmute?: () => void } = {}): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.available) {
                resolve();
                return;
            }
            // Ads must never play during gameplay.
            this.gameplayStop();

            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                this.safeCall(opts.onUnmute);
                resolve();
            };

            this.safe(() => this.sdk?.ad.requestAd('midgame', {
                adStarted: () => this.safeCall(opts.onMute),
                adFinished: finish,
                adError: finish,
            }), undefined, finish); // if requestAd itself throws, resolve immediately
        });
    }

    /**
     * Request a rewarded ad. Resolves `true` only if the ad finished successfully
     * (reward should be granted), `false` otherwise (error/adblock/unavailable).
     */
    public requestRewardedAd(opts: { onMute?: () => void; onUnmute?: () => void } = {}): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            if (!this.available) {
                resolve(false);
                return;
            }
            this.gameplayStop();

            let settled = false;
            const settle = (rewarded: boolean) => {
                if (settled) return;
                settled = true;
                this.safeCall(opts.onUnmute);
                resolve(rewarded);
            };

            this.safe(() => this.sdk?.ad.requestAd('rewarded', {
                adStarted: () => this.safeCall(opts.onMute),
                adFinished: () => settle(true),
                adError: () => settle(false),
            }), undefined, () => settle(false));
        });
    }

    /* ----------------------------- Banners ---------------------------- */

    /** Request a responsive banner into the given container element id. */
    public async requestBanner(containerId: string): Promise<void> {
        if (!this.onPortal) return;
        await this.safeAsync(() => this.sdk?.banner.requestResponsiveBanner(containerId));
    }

    public clearBanner(containerId: string): void {
        this.safe(() => this.sdk?.banner.clearBanner(containerId));
    }

    public clearAllBanners(): void {
        this.safe(() => this.sdk?.banner.clearAllBanners());
    }

    /* ------------------------------ User ------------------------------ */

    /** True when the CrazyGames account system is usable (player may or may not be signed in). */
    public get userAccountAvailable(): boolean {
        return this.safe(() => this.sdk?.user.isUserAccountAvailable, false) ?? false;
    }

    /** Returns the signed-in CrazyGames user, or null if not signed in / unavailable. */
    public async getUser(): Promise<CrazyUser | null> {
        if (!this.available) return null;
        return (await this.safeAsync(() => this.sdk?.user.getUser())) ?? null;
    }

    /** Convenience: signed-in username, or null. */
    public async getUsername(): Promise<string | null> {
        const user = await this.getUser();
        return user?.username ?? null;
    }

    /** Open the CrazyGames sign-in prompt. Resolves with the user if they sign in. */
    public async showAuthPrompt(): Promise<CrazyUser | null> {
        if (!this.userAccountAvailable) return null;
        return (await this.safeAsync(() => this.sdk?.user.showAuthPrompt())) ?? null;
    }

    /** Subscribe to sign-in / sign-out changes. */
    public onAuthChanged(listener: (user: CrazyUser | null) => void): void {
        this.authListeners.push(listener);
    }

    /** Unsubscribe a previously registered auth listener (prevents leaks on teardown). */
    public offAuthChanged(listener: (user: CrazyUser | null) => void): void {
        const idx = this.authListeners.indexOf(listener);
        if (idx !== -1) this.authListeners.splice(idx, 1);
    }

    /* ---------------------- Cloud data (with fallback) ---------------- */

    /** Persist a value to CrazyGames cloud storage when available, else localStorage. */
    public setItem(key: string, value: string): void {
        if (this.available) {
            this.safe(() => this.sdk?.data.setItem(key, value));
        } else {
            this.safe(() => localStorage.setItem(key, value));
        }
    }

    /** Read a value from CrazyGames cloud storage when available, else localStorage. */
    public getItem(key: string): string | null {
        if (this.available) {
            return this.safe(() => this.sdk?.data.getItem(key) ?? null, null) ?? null;
        }
        return this.safe(() => localStorage.getItem(key), null) ?? null;
    }

    public removeItem(key: string): void {
        if (this.available) {
            this.safe(() => this.sdk?.data.removeItem(key));
        } else {
            this.safe(() => localStorage.removeItem(key));
        }
    }

    /* ----------------------------- Invites ---------------------------- */

    /** True when launched from a multiplayer invite link. */
    public get isInstantMultiplayer(): boolean {
        return this.safe(() => this.sdk?.game.isInstantMultiplayer, false) ?? false;
    }

    /** Generate a shareable invite link carrying the given params (e.g. a room id). */
    public async createInviteLink(params: Record<string, string | number | boolean>): Promise<string | null> {
        if (!this.available) return null;
        return (await this.safeAsync(() => this.sdk?.game.inviteLink(params))) ?? null;
    }

    /** Read a param from the invite link the player used to launch the game. */
    public getInviteParam(key: string): string | null {
        return this.safe(() => this.sdk?.game.getInviteParam(key) ?? null, null) ?? null;
    }

    public async showInviteButton(params: Record<string, string | number | boolean>): Promise<void> {
        await this.safeAsync(() => this.sdk?.game.showInviteButton(params) as Promise<void> | undefined);
    }

    public hideInviteButton(): void {
        this.safe(() => this.sdk?.game.hideInviteButton());
    }

    /* ----------------------------- Internals -------------------------- */

    private wireAuthForwarding(): void {
        this.safe(() => {
            this.sdk?.user.addAuthListener((user) => {
                this.authListeners.forEach((l) => {
                    try { l(user); } catch (e) { console.warn('[CrazyGames] auth listener error', e); }
                });
            });
        });
    }

    /** Run a synchronous SDK call, swallowing any error. Optionally runs onError. */
    private safe<T>(fn: () => T, fallback?: T, onError?: () => void): T | undefined {
        try {
            return fn();
        } catch (err) {
            console.warn('[CrazyGames] call failed', err);
            if (onError) onError();
            return fallback;
        }
    }

    private safeCall(fn?: () => void): void {
        if (!fn) return;
        try { fn(); } catch (err) { console.warn('[CrazyGames] callback error', err); }
    }

    private async safeAsync<T>(fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
        try {
            return await fn();
        } catch (err) {
            console.warn('[CrazyGames] async call failed', err);
            return undefined;
        }
    }
}

/** Shared singleton — import this everywhere. */
export const CG = new CrazyGamesService();

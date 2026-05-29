
import world from './core/World';
import { getMatchManager } from './core/MatchManager';
import { BitBlastLobby } from './lobby/BitBlastLobby';
import { CG } from './integrations/CrazyGamesSDK';

// Expose world and matchManager for debugging
(window as any).world = world;
(window as any).getMatchManager = getMatchManager;
(window as any).CG = CG;

// Initialize the CrazyGames SDK as early as possible (resolves even when not on the
// portal, so the lobby can always render). The lobby awaits CG.ready internally.
CG.init();

// Create and show the BITBLAST lobby
const lobby = new BitBlastLobby();
(window as any).lobby = lobby; // For debugging

// When PLAY is clicked and match is found, start the game
lobby.init((matchInfo) => {
	const selectedMode = lobby.getSelectedMode();

	// Initialize world with callback to finish setup
	world.init(() => {
		// Assets are loaded and the match is ready — tell the SDK gameplay is starting.
		CG.loadingStop();
		CG.gameplayStart();

		// Start the appropriate game mode based on lobby selection
		if (world.gameModeManager) {
			// Map lobby mode to game mode
			const gameModeMap: Record<string, string> = {
				'ffa': 'FREE_FOR_ALL',
				'tdm': 'TEAM_DEATHMATCH',
				'br': 'FREE_FOR_ALL', // Battle Royale maps to FFA for now
				'ctf': 'FREE_FOR_ALL', // CTF maps to FFA for now
			};
			const gameMode = gameModeMap[selectedMode.modeId] || 'FREE_FOR_ALL';
			world.gameModeManager.setMode(gameMode as import('./gamemodes/IGameMode').GameModeType);
		}

		// Connect NetworkManager to the match - REUSE THE LOBBY SOCKET!
		if (world.networkManager) {
			// Pass the lobby socket so we stay on the same connection that went through matchmaking
			world.networkManager.connect(
				matchInfo.serverUrl,
				matchInfo.token,
				matchInfo.matchId,
				matchInfo.socket  // <-- PASS THE LOBBY SOCKET!
			).then((connected) => {
				if (connected) {
					// CRITICAL FIX: Sync player UUID with network ID AFTER connection
					// The player was created before myUserId was available, so it has a Yuka-generated UUID
					// This caused duplicate entries in the leaderboard (one with Yuka UUID, one with network ID)
					const networkId = world.networkManager?.myUserId;
					const oldUuid = world.player?.uuid;
					if (networkId && world.player && oldUuid !== networkId) {
						// Override the player's UUID to match the network ID
						Object.defineProperty(world.player, 'uuid', {
							value: networkId,
							writable: false,
							configurable: true
						});

						// Update the game mode's scores Map WITHOUT reinitializing
						// This preserves the running game state while fixing the player ID
						if (world.gameModeManager) {
							const currentMode = world.gameModeManager.getCurrentMode() as any;
							if (currentMode?.state?.scores) {
								// Move score data from old UUID to new network ID
								const scores = currentMode.state.scores as Map<string, any>;
								const oldScore = scores.get(oldUuid);
								if (oldScore) {
									oldScore.id = networkId;
									scores.set(networkId, oldScore);
									scores.delete(oldUuid);
								}
							}
						}
					}
				} else {
					console.warn('[Main] Failed to connect to game server - playing solo');
				}
			}).catch((err) => {
				console.error('[Main] Network connection error:', err);
			});
		} else {
			console.error('[Main] NetworkManager not initialized!');
		}
	});
});

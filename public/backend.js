// Backend configuration
        const backend = {
            enabled: true,
            submitUrl: "/api/scores",
            leaderboardUrl: "/api/leaderboard?gameId=browser-hero-demo",
            leaderboardLimit: 10,
            token: null,
            gameId: "browser-hero-demo"
        };

        // Multiplayer configuration
        const multiplayer = {
            enabled: true,
            wsUrl: `ws://localhost:8787`,
            playerId: null,
            roomId: null,
            playerIndex: null,
            ws: null,
            connected: false,
            inputQueue: [],
            ready: false,
            roomPlayers: new Map(),
            lastInputSent: 0,
            inputSendInterval: 50 // Send input every 50ms (20 times per second)
        };

        // Game state
        let canvas, ctx;
        const gameState = {
            running: false, paused: false, wave: 1, score: 0, teamScore: 0,
            players: [], enemies: [], bullets: [], effects: [], obstacles: [],
            objectives: [], camera: { x: 0, y: 0 }, worldSize: { w: 2600, h: 1500 },
            keys: {}, gamepads: {}, lastTime: 0, waveMode: false, pvpMode: false,
            splitScreen: false, hardLock: false, lockStrategy: 0, currentObjective: 0,
            playerAssignments: { player1: null, player2: null } // Track which player controls which character
        };

        // Initialize
        window.onload = function() {
            canvas = document.getElementById('canvas');
            ctx = canvas.getContext('2d');
            
            // Clear all player data on page load
            clearPlayerData();
            
            loadFromStorage();
            setupEventListeners();
            setupMultiplayer();
            gameLoop();
            
            // Auto-focus canvas
            canvas.focus();
            
            // Check if ready button should be shown (for debugging) , 
            setTimeout(() => {
                const readyButton = document.getElementById('readyButton');
                console.log('On load - Ready button element:', readyButton);
                if (readyButton) {
                    console.log('Ready button display style:', readyButton.style.display);
                }
            }, 1000);
        };

        function setupMultiplayer() {
            if (!multiplayer.enabled) return;
            
            try {
                multiplayer.ws = new WebSocket(multiplayer.wsUrl);
                
                multiplayer.ws.onopen = () => {
                    console.log('WebSocket connected');
                    multiplayer.connected = true;
                    updateStatus('Connected to server - Auto-joining training-room');
                    updateConnectionStatus('Connected', '#4CAF50');
                    
                    // Auto-join training-room on connection
                    joinRoom('training-room');
                };
                
                multiplayer.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        handleWebSocketMessage(data);
                    } catch (error) {
                        console.error('WebSocket message error:', error);
                    }
                };
                
                multiplayer.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    multiplayer.connected = false;
                    updateStatus('Connection lost - Reconnecting...');
                    updateConnectionStatus('Disconnected', '#f44336');
                    setTimeout(setupMultiplayer, 3000);
                };
                
                multiplayer.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    multiplayer.connected = false;
                };
            } catch (error) {
                console.error('Failed to setup WebSocket:', error);
                multiplayer.enabled = false;
            }
        }

        function handleWebSocketMessage(data) {
            switch (data.type) {
                case 'playerId':
                    multiplayer.playerId = data.playerId;
                    console.log('Assigned player ID:', data.playerId);
                    break;
                    
                case 'playerJoined':
                    console.log(`Player ${data.playerId} joined as player ${data.playerIndex}`);
                    updateStatus(`Player ${data.playerIndex + 1} joined (${data.totalPlayers} total players)`);
                    
                    // Assign this player to their character
                    if (data.playerId === multiplayer.playerId) {
                        multiplayer.playerIndex = data.playerIndex;
                        console.log(`✅ ASSIGNED PLAYER INDEX: ${data.playerIndex} (Player ${data.playerIndex + 1})`);
                        console.log(`   Room: ${multiplayer.roomId}, Training Room: ${multiplayer.roomId === 'training-room'}`);
                        
                        // Special handling for training-room
                        if (multiplayer.roomId === 'training-room' && data.playerIndex === 0) {
                            console.log('✅ Human player joined training-room as Player 1 (index 0) - WASD controls');
                            updateStatus('Joined training-room as Player 1 - Use WASD to control');
                        } else if (multiplayer.roomId === 'training-room' && data.playerIndex === 1) {
                            console.log('✅ RL agent joined training-room as Player 2 (index 1) - AI controlled');
                            updateStatus('RL agent connected as Player 2');
                        }
                    }
                    
                    updateRoomStatus();
                    // Show ready button when joined room
                    const readyButton = document.getElementById('readyButton');
                    if (readyButton) {
                        readyButton.style.display = 'block';
                    }
                    break;
                    
                case 'playerLeft':
                    console.log(`Player ${data.playerId} left`);
                    updateStatus(`Player ${data.playerIndex + 1} left`);
                    break;
                    
                case 'playerInput':
                    handleRemotePlayerInput(data.playerId, data.playerIndex, data.input);
                    break;
                    
                case 'rlAgentAction':
                    handleRLAgentAction(data);
                    break;
                    
                case 'playerIndexUpdate':
                    console.log(`Player index updated: ${data.oldIndex} -> ${data.newIndex}`);
                    multiplayer.playerIndex = data.newIndex;
                    updateStatus(`Player index reset to ${data.newIndex + 1}`);
                    break;
                    
                case 'roomCleared':
                    console.log('Room cleared - rejoining...');
                    updateStatus('Room cleared - rejoining...');
                    // Clear local state
                    multiplayer.playerIndex = null;
                    multiplayer.roomPlayers.clear();
                    // Automatically rejoin training-room
                    setTimeout(() => {
                        joinRoom('training-room');
                    }, 500);
                    break;
                    
                

                case 'gameState':
                    handleRemoteGameState(data.playerId, data.state);
                    break;
                    
                case 'gameStart':
                    console.log('Game starting synchronously');
                    // Only start if we haven't already started from countdown
                    if (!gameState.running) {
                        startGameInternal();
                    }
                    break;
                    
                case 'gameStartRequest':
                    // Another player requested game start
                    console.log('Another player requested game start');
                    startSynchronizedCountdown(data.startTime);
                    break;
                    
                case 'gameStartDenied':
                    console.log('Game start denied:', data.reason);
                    updateStatus('Game start denied: ' + data.reason);
                    break;
                    
                case 'playerReadyStatus':
                    console.log(`Player ${data.playerId} ready: ${data.ready} (${data.readyCount}/${data.totalPlayers})`);
                    updateStatus(`Ready status: ${data.readyCount}/${data.totalPlayers} players ready`);
                    
                    // Update room status with ready count
                    const roomStatus = document.getElementById('roomStatus');
                    if (roomStatus && multiplayer.roomId) {
                        const playerCount = multiplayer.roomPlayers.size;
                        roomStatus.textContent = `Room: ${multiplayer.roomId} (${playerCount} players, ${data.readyCount} ready)`;
                    }
                    break;
                    
            }
        }

        function startCountdown() {
            let countdown = 3;
            updateStatus(`Game will start in ${countdown} seconds...`);
            
            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    updateStatus(`Game will start in ${countdown} seconds...`);
                    showBanner(`${countdown}`);
                } else {
                    clearInterval(countdownInterval);
                    updateStatus('Game Start!');
                    showBanner('Game Start!');
                }
            }, 1000);
        }

        function startSynchronizedCountdown(startTime) {
            console.log('Starting synchronized countdown to:', new Date(startTime).toISOString());
            console.log('Current time:', new Date().toISOString());
            console.log('Time difference:', startTime - Date.now(), 'ms');
            
            const countdownInterval = setInterval(() => {
                const now = Date.now();
                const timeLeft = Math.max(0, startTime - now);
                const secondsLeft = Math.ceil(timeLeft / 1000);
                
                if (secondsLeft > 0) {
                    updateStatus(`Game will start in ${secondsLeft} seconds... (${timeLeft}ms)`);
                    showBanner(`${secondsLeft}`);
                } else {
                    clearInterval(countdownInterval);
                    updateStatus('Game Start!');
                    showBanner('Game Start!');
                    
                    // Small delay to ensure all clients are synchronized
                    setTimeout(() => {
                        startGameInternal();
                    }, 50);
                }
            }, 50); // Check every 50ms for very precise timing
        }

        function handleRemotePlayerInput(playerId, playerIndex, input) {
            // Handle input from other players
            if (playerIndex < gameState.players.length) {
                const player = gameState.players[playerIndex];
                if (player) {
                    // Apply remote player input
                    player.vx = input.vx || 0;
                    player.vy = input.vy || 0;
                    player.shield = input.shield || false;
                    
                    // Apply movement based on velocity
                    const dt = 1/60; // Assume 60 FPS for remote updates
                    player.x += player.vx * dt;
                    player.y += player.vy * dt;
                    
                    // World bounds
                    player.x = Math.max(player.size, Math.min(gameState.worldSize.w - player.size, player.x));
                    player.y = Math.max(player.size, Math.min(gameState.worldSize.h - player.size, player.y));
                    
                    // Handle shooting
                    if (input.shooting && player.ammo > 0 && !player.reloading && Date.now() - player.lastShot > 150) {
                        shoot(player, playerIndex);
                    }
                    
                    // Handle dashing
                    if (input.dashing && player.dashCooldown <= 0) {
                        player.x += player.vx * dt * 3;
                        player.y += player.vy * dt * 3;
                        player.dashCooldown = 2;
                    }
                }
            }
        }

        function handleRemoteGameState(playerId, state) {
            // Handle game state updates from other players
            if (state && state.players) {
                // Update enemy positions and states (from host)
                if (state.enemies) {
                    gameState.enemies = state.enemies;
                }
                
                // Update all bullets (host controls all bullets)
                if (state.bullets) {
                    gameState.bullets = state.bullets;
                }
                
                // Update effects (host controls all effects)
                if (state.effects) {
                    gameState.effects = state.effects;
                }
                
                // Update wave and score
                if (state.wave) {
                    gameState.wave = state.wave;
                }
                if (state.score !== undefined) {
                    gameState.score = state.score;
                }
                
                // Update player states (but preserve local player input)
                if (state.players) {
                    state.players.forEach((remotePlayer, index) => {
                        if (index < gameState.players.length) {
                            const localPlayer = gameState.players[index];
                            // Update health, score, ammo, etc. but preserve position if this is local player
                            if (index === multiplayer.playerIndex) {
                                // For local player, only update non-position data (preserve position from local input)
                                const oldX = localPlayer.x;
                                const oldY = localPlayer.y;
                                localPlayer.hp = remotePlayer.hp;
                                localPlayer.score = remotePlayer.score;
                                localPlayer.ammo = remotePlayer.ammo;
                                localPlayer.ult = remotePlayer.ult;
                                localPlayer.shield = remotePlayer.shield;
                                
                                // Debug: Warn if position was accidentally overwritten
                                if (oldX !== localPlayer.x || oldY !== localPlayer.y) {
                                    console.warn(`⚠️ Position was overwritten! Local player ${index} position changed from (${oldX}, ${oldY}) to (${localPlayer.x}, ${localPlayer.y})`);
                                    // Restore position
                                    localPlayer.x = oldX;
                                    localPlayer.y = oldY;
                                }
                            } else {
                                // For remote players, update everything
                                localPlayer.x = remotePlayer.x;
                                localPlayer.y = remotePlayer.y;
                                localPlayer.hp = remotePlayer.hp;
                                localPlayer.score = remotePlayer.score;
                                localPlayer.ammo = remotePlayer.ammo;
                                localPlayer.ult = remotePlayer.ult;
                                localPlayer.shield = remotePlayer.shield;
                            }
                        }
                    });
                }
            }
        }

        function handleRLAgentAction(data) {
            // Handle actions from the RL agent - use the playerIndex from server
            const targetPlayerIndex = data.playerIndex;
            const targetPlayer = gameState.players[targetPlayerIndex];
            
            console.log(`RL Agent action received for Player ${targetPlayerIndex + 1}:`, {
                playerIndex: targetPlayerIndex,
                isAIControlled: targetPlayer ? targetPlayer.isAIControlled : 'player not found',
                isTrainingRoom: multiplayer.connected && multiplayer.roomId === 'training-room',
                actions: data
            });
            
            if (!targetPlayer) {
                console.log(`❌ Player ${targetPlayerIndex + 1} doesn't exist yet`);
                return;
            }
            
            // In training-room, Player 1 (index 1) should always accept AI actions
            const isTrainingRoom = multiplayer.connected && multiplayer.roomId === 'training-room';
            const shouldAcceptActions = targetPlayer.isAIControlled || (isTrainingRoom && targetPlayerIndex === 1);
            
            if (shouldAcceptActions) {
                // Ensure player is marked as AI-controlled if it isn't already
                if (!targetPlayer.isAIControlled) {
                    console.log(`⚠️ Player ${targetPlayerIndex + 1} was not marked AI-controlled, fixing now...`);
                    targetPlayer.isAIControlled = true;
                }
                
                // Store the AI actions to be processed in the next update
                targetPlayer.aiActions = {
                    vx: data.vx || 0,
                    vy: data.vy || 0,
                    shoot: data.shoot || false,
                    dash: data.dash || false,
                    shield: data.shield || false,
                    ult: data.ult || false,
                    reload: data.reload || false
                };
                
                console.log(`✅ AI actions applied to Player ${targetPlayerIndex + 1}:`, targetPlayer.aiActions);
            } else {
                console.log(`❌ Player ${targetPlayerIndex + 1} is not AI-controlled (isAIControlled: ${targetPlayer.isAIControlled}, isTrainingRoom: ${isTrainingRoom})`);
            }
        }

        function checkWebSocketConnection() {
            console.log('=== WebSocket Connection Status ===');
            console.log('multiplayer.connected:', multiplayer.connected);
            console.log('multiplayer.ws exists:', !!multiplayer.ws);
            console.log('WebSocket readyState:', multiplayer.ws ? multiplayer.ws.readyState : 'N/A');
            console.log('WebSocket states: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED');
            console.log('playerIndex:', multiplayer.playerIndex);
            console.log('roomId:', multiplayer.roomId);
            console.log('====================================');
        }

        function sendGameState() {
            if (multiplayer.connected && multiplayer.ws) {
                const stateToSend = {
                    players: gameState.players.map(p => ({
                        x: p.x, y: p.y, hp: p.hp, score: p.score,
                        shield: p.shield, ult: p.ult, ammo: p.ammo,
                        reloading: p.reloading, dashCooldown: p.dashCooldown
                    })),
                    enemies: gameState.enemies,
                    enemyCount: gameState.enemies.length,
                    bullets: gameState.bullets,
                    effects: gameState.effects,
                    wave: gameState.wave,
                    score: gameState.score,
                    teamScore: gameState.teamScore,
                    timestamp: Date.now()
                };
                
                multiplayer.ws.send(JSON.stringify({
                    type: 'gameState',
                    state: stateToSend
                }));
                
                // Log occasionally for debugging
                if (Date.now() % 1000 < 100) { // ~once per second
                    console.log('Game state sent to RL agent');
                }
            }
        }

        function sendPlayerInput(input) {
            const now = Date.now();
            if (multiplayer.connected && multiplayer.ws && 
                now - multiplayer.lastInputSent >= multiplayer.inputSendInterval) {
                
                multiplayer.lastInputSent = now;
                multiplayer.ws.send(JSON.stringify({
                    type: 'playerInput',
                    input: input
                }));
            }
        }

        function createRoom() {
            // Always join training-room
            joinRoom('training-room');
        }

        function joinRoom(roomId) {
            // Only allow training-room
            if (roomId && roomId !== 'training-room') {
                updateStatus('Only training-room is available');
                return;
            }
            
            const targetRoom = roomId || 'training-room';
            
            if (multiplayer.connected && multiplayer.ws) {
                multiplayer.roomId = targetRoom;
                multiplayer.ws.send(JSON.stringify({
                    type: 'joinRoom',
                    roomId: targetRoom
                }));
                updateStatus('Joining training-room...');
                // Show ready button when joining room
                const readyButton = document.getElementById('readyButton');
                if (readyButton) {
                    readyButton.style.display = 'block';
                }
            }
        }

        function updateConnectionStatus(status, color) {
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement) {
                statusElement.textContent = status;
                statusElement.style.color = color;
            }
        }



        function toggleReady() {
            multiplayer.ready = !multiplayer.ready;
            const readyButton = document.getElementById('readyButton');
            if (readyButton) {
                readyButton.textContent = multiplayer.ready ? 'Cancel Ready' : 'Ready';
                readyButton.style.background = multiplayer.ready ? '#4CAF50' : '#333';
            }
            
            if (multiplayer.connected && multiplayer.ws) {
                multiplayer.ws.send(JSON.stringify({
                    type: 'playerReady',
                    ready: multiplayer.ready
                }));
            }
        }

        function updateRoomStatus() {
            const roomStatus = document.getElementById('roomStatus');
            if (roomStatus && multiplayer.roomId) {
                const playerCount = multiplayer.roomPlayers.size;
                const readyCount = multiplayer.ready ? 1 : 0; // Count local player if ready
                roomStatus.textContent = `Room: ${multiplayer.roomId} (${playerCount} players, ${readyCount} ready)`;
            }
        }

        function setupEventListeners() {
            // Keyboard events
            document.addEventListener('keydown', (e) => {
                let key = e.key.toLowerCase();
                
                // Handle special keys
                if (key === ';') key = 'semicolon';
                if (key === 'shift') key = 'shift';
                
                gameState.keys[key] = true;
                
                if (key === ' ') {
                    e.preventDefault();
                    startGame();
                } else if (key === 'p') {
                    e.preventDefault();
                    togglePause();
                } else if (key === 'c') {
                    e.preventDefault();
                    cycleObjective();
                } else if (key === 'x') {
                    e.preventDefault();
                    toggleWaveMode();
                } else if (key === 't') {
                    e.preventDefault();
                    toggleHardLock();
                } else if (key === 'y') {
                    e.preventDefault();
                    cycleLockStrategy();
                } else if (key === 'g') {
                    e.preventDefault();
                    togglePvP();
                } else if (key === 'v') {
                    e.preventDefault();
                    toggleSplitScreen();
                } else if (key === 'm') {
                    e.preventDefault();
                    toggleMapEditor();
                } else if (key === 'b') {
                    e.preventDefault();
                    togglePlayer2AI();
                }
            });
            
            document.addEventListener('keyup', (e) => {
                let key = e.key.toLowerCase();
                
                // Handle special keys
                if (key === ';') key = 'semicolon';
                if (key === 'shift') key = 'shift';
                
                gameState.keys[key] = false;
            });

            /*// Gamepad support
            window.addEventListener('gamepadconnected', (e) => {
                console.log('Gamepad connected:', e.gamepad);
            });

            window.addEventListener('gamepaddisconnected', (e) => {
                console.log('Gamepad disconnected:', e.gamepad);
            });*/
        }

        function loadFromStorage() {
                    document.getElementById('name1').value = localStorage.getItem('name1') || 'Player 1';
        document.getElementById('name2').value = localStorage.getItem('name2') || 'Player 2';
            updateHighScore();
        }

        function saveToStorage() {
            localStorage.setItem('name1', document.getElementById('name1').value);
            localStorage.setItem('name2', document.getElementById('name2').value);
            localStorage.setItem('hiscore.team', gameState.teamScore.toString());
            localStorage.setItem('hiscore.p1', gameState.players[0]?.score?.toString() || '0');
            localStorage.setItem('hiscore.p2', gameState.players[1]?.score?.toString() || '0');
        }

        function updateHighScore() {
            const teamScore = parseInt(localStorage.getItem('hiscore.team') || '0');
            document.getElementById('highScore').textContent = teamScore;
        }

        function startGame() {
            console.log('startGame called, current state:', {
                running: gameState.running,
                connected: multiplayer.connected,
                roomId: multiplayer.roomId,
                playerIndex: multiplayer.playerIndex
            });
            
            // Force stop any running game first and clear player data
            if (gameState.running) {
                console.log('Stopping current game before restart');
                gameState.running = false;
                gameState.paused = false;
            }
            
            // Clear player data on restart
            console.log('🧹 Clearing player data on restart');
            multiplayer.ready = false;
            multiplayer.roomPlayers.clear();
            multiplayer.inputQueue = [];
            multiplayer.lastInputSent = 0;
            gameState.playerAssignments = { player1: null, player2: null };
            
            // If no room is set, automatically join training-room
            if (multiplayer.connected && !multiplayer.roomId) {
                console.log('No room set, joining training-room');
                joinRoom('training-room');
                // Wait a moment for room join to complete, then start
                setTimeout(() => {
                    startGameInternal();
                }, 500);
                return;
            }
            // If in multiplayer, request synchronized start
            if (multiplayer.connected && multiplayer.roomId) {
                console.log('Requesting synchronized game start for room:', multiplayer.roomId);
                multiplayer.ws.send(JSON.stringify({
                    type: 'requestGameStart',
                    roomId: multiplayer.roomId
                }));
                updateStatus('Requesting synchronized game start...');
                return;
            }
            
            // Single player or host starts immediately
            console.log('Starting game immediately (single player or host)');
            startGameInternal();
        }

        function startGameInternal() {
            gameState.running = true;
            gameState.paused = false;
            gameState.wave = 1;
            gameState.score = 0;
            gameState.teamScore = 0;
            gameState.players = [];
            gameState.enemies = [];
            gameState.bullets = [];
            gameState.effects = [];
            gameState.objectives = [];
            
            // Spawn players near center
            const centerX = gameState.worldSize.w / 2;
            const centerY = gameState.worldSize.h / 2;
            
            console.log('Creating players at center:', centerX, centerY);
            
            // Check if we're in training-room to determine AI control
            const isTrainingRoom = multiplayer.connected && multiplayer.roomId === 'training-room';
            
            // In training-room: Player 0 (index 0) is human-controlled, Player 1 (index 1) is AI-controlled (RL agent)
            gameState.players.push({
                id: 1, x: centerX - 50, y: centerY, vx: 0, vy: 0,
                hp: 300, maxHp: 300, ult: 0, maxUlt: 100, ammo: 50, maxAmmo: 50,
                score: 0, reloading: false, shield: false, dashCooldown: 0,
                color: '#4CAF50', size: 20, gunAngle: 0, lastShot: 0,
                isAIControlled: false,  // Player 0 is ALWAYS human in training-room
                aiActions: null,       // Will store actions from RL agent
                lastAIAction: 0       // Track last AI action time
            });
            
            gameState.players.push({
                id: 2, x: centerX + 50, y: centerY, vx: 0, vy: 0,
                hp: 300, maxHp: 300, ult: 0, maxUlt: 100, ammo: 50, maxAmmo: 50,
                score: 0, reloading: false, shield: false, dashCooldown: 0,
                color: '#2196F3', size: 20, gunAngle: 0, lastShot: 0,
                isAIControlled: isTrainingRoom,  // Player 1 is AI in training-room (RL agent)
                aiActions: null,       // Will store actions from RL agent
                lastAIAction: 0       // Track last AI action time
            });
            
            console.log('Players spawned:', gameState.players.map((p, i) => ({
                index: i,
                id: p.id,
                isAIControlled: p.isAIControlled,
                position: {x: p.x, y: p.y}
            })));
            console.log('World size:', gameState.worldSize);
            console.log('Canvas size:', canvas.width, canvas.height);
            
            // Center camera on players
            centerCamera();
            
            // Spawn initial enemies
            spawnWave();
            
            // Show banner
            showBanner('Game Start!');
            
            // Auto-focus canvas
            canvas.focus();
            canvas.scrollIntoView();
            
            updateStatus('Game in progress - Defeat enemies to earn points!');
            
            // Start RL Agent after a short delay
            setTimeout(() => {
                startRLAgent();
            }, 2000); // Wait 2 seconds for game to fully start
        }


        function startRLAgent() {
            console.log('🤖 Starting RL Agent...');
            
            // Create a notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4CAF50;
                color: white;
                padding: 15px;
                border-radius: 5px;
                z-index: 1000;
                font-family: Arial, sans-serif;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            `;
            notification.textContent = '🤖 RL Agent Starting...';
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
            
            // Send a message to the server to start the RL agent
            if (multiplayer.connected && multiplayer.ws) {
                multiplayer.ws.send(JSON.stringify({
                    type: 'startRLAgent',
                    roomId: multiplayer.roomId || 'training-room'
                }));
            }
            
            updateStatus('🤖 RL Agent starting - watch Player 2!');
        }

        function centerCamera() {
            if (gameState.players.length === 0) return;
            
            const avgX = gameState.players.reduce((sum, p) => sum + p.x, 0) / gameState.players.length;
            const avgY = gameState.players.reduce((sum, p) => sum + p.y, 0) / gameState.players.length;
            
            // Smooth camera following with interpolation
            const targetX = avgX - canvas.width / 2;
            const targetY = avgY - canvas.height / 2;
            
            // Add smooth interpolation
            const cameraSpeed = 0.1;
            gameState.camera.x += (targetX - gameState.camera.x) * cameraSpeed;
            gameState.camera.y += (targetY - gameState.camera.y) * cameraSpeed;
            
            // Ensure camera doesn't go out of world bounds
            gameState.camera.x = Math.max(0, Math.min(gameState.worldSize.w - canvas.width, gameState.camera.x));
            gameState.camera.y = Math.max(0, Math.min(gameState.worldSize.h - canvas.height, gameState.camera.y));
        }

        function spawnWave() {
            const wave = gameState.wave;
            const enemyCount = Math.min(5 + wave * 2, 20);
            
            for (let i = 0; i < enemyCount; i++) {
                const angle = (Math.PI * 2 * i) / enemyCount;
                const distance = 300 + Math.random() * 200;
                const centerX = gameState.worldSize.w / 2;
                const centerY = gameState.worldSize.h / 2;
                
                gameState.enemies.push({
                    x: centerX + Math.cos(angle) * distance,
                    y: centerY + Math.sin(angle) * distance,
                    vx: 0, vy: 0, hp: 30 + wave * 10, maxHp: 30 + wave * 10,
                    size: 12, color: '#f44336', lastShot: 0, isBoss: wave % 5 === 0 && i === 0
                });
                
                if (gameState.enemies[gameState.enemies.length - 1].isBoss) {
                    const boss = gameState.enemies[gameState.enemies.length - 1];
                    boss.hp = 200 + wave * 50;
                    boss.maxHp = boss.hp;
                    boss.size = 25;
                    boss.color = '#9C27B0';
                }
            }
        }

        function showBanner(text) {
            const banner = document.createElement('div');
            banner.className = 'banner';
            banner.textContent = text;
            document.body.appendChild(banner);
            
            setTimeout(() => {
                document.body.removeChild(banner);
            }, 1200);
        }

        function togglePause() {
            if (gameState.running) {
                gameState.paused = !gameState.paused;
                updateStatus(gameState.paused ? 'Game Paused' : 'Game in Progress');
            }
        }

        function cycleObjective() {
            const objectives = ['Single Point', 'Moving Point', 'Dual Points', 'Payload (Cart)'];
            gameState.currentObjective = (gameState.currentObjective + 1) % objectives.length;
            updateStatus(`Objective Mode: ${objectives[gameState.currentObjective]}`);
        }

        function toggleWaveMode() {
            gameState.waveMode = !gameState.waveMode;
            updateStatus(gameState.waveMode ? 'Wave Mode On' : 'Wave Mode Off');
        }

        function toggleHardLock() {
            gameState.hardLock = !gameState.hardLock;
            updateStatus(gameState.hardLock ? 'Hard Lock On' : 'Hard Lock Off');
        }

        function cycleLockStrategy() {
            const strategies = ['Nearest', 'Low HP', 'Cone'];
            gameState.lockStrategy = (gameState.lockStrategy + 1) % strategies.length;
            updateStatus(`Lock Strategy: ${strategies[gameState.lockStrategy]}`);
        }

        function togglePvP() {
            gameState.pvpMode = !gameState.pvpMode;
            updateStatus(gameState.pvpMode ? 'PVP Mode On' : 'PVP Mode Off');
        }

        function toggleSplitScreen() {
            gameState.splitScreen = !gameState.splitScreen;
            updateStatus(gameState.splitScreen ? 'Split Screen Mode On' : 'Split Screen Mode Off');
        }

        function toggleMapEditor() {
            updateStatus('Map Editor Mode (Tools: 1 Obstacle/2 Spawn/3 Destructible)');
        }

        function togglePlayer2AI() {
            const player2 = gameState.players[1];
            if (player2) {
                player2.isAIControlled = !player2.isAIControlled;
                const status = player2.isAIControlled ? 'AI' : 'Human';
                updateStatus(`Player 2: ${status} Control`);
                console.log(`Player 2 is now ${status} controlled`);
            }
        }

        function updateStatus(text) {
            document.getElementById('status').textContent = text;
        }

        function gameLoop(currentTime = 0) {
            if (!gameState.lastTime) gameState.lastTime = currentTime;
            const deltaTime = currentTime - gameState.lastTime;
            gameState.lastTime = currentTime;
            
            if (gameState.running && !gameState.paused) {
                update(deltaTime);
            }
            
            render();
            updateHUD();
            updateRadar();
            
            requestAnimationFrame(gameLoop);
        }

        
        


        // Leaderboard functions
        async function submitScore() {
            if (!backend.enabled || !gameState.running) return;
            
            const name1 = document.getElementById('name1').value || 'Player 1';
            const name2 = document.getElementById('name2').value || 'Player 2';
            
            const players = [];
            if (gameState.players[0] && gameState.players[0].score > 0) {
                players.push({ name: name1, score: gameState.players[0].score });
            }
            if (gameState.players[1] && gameState.players[1].score > 0) {
                players.push({ name: name2, score: gameState.players[1].score });
            }
            
            if (players.length === 0) {
                alert('No scores to upload!');
                return;
            }
            
            const data = {
                gameId: backend.gameId,
                players: players,
                team: gameState.teamScore,
                mode: gameState.waveMode ? 1 : 0,
                wave: gameState.wave,
                timestamp: Date.now()
            };
            
            try {
                const response = await fetch(backend.submitUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(backend.token && { 'Authorization': `Bearer ${backend.token}` })
                    },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                if (result.ok) {
                    alert('Score uploaded successfully!');
                    refreshLeaderboard();
                } else {
                    alert('Upload failed: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                alert('Upload failed: ' + error.message);
            }
        }

        async function refreshLeaderboard() {
            if (!backend.enabled) return;
            
            try {
                const response = await fetch(backend.leaderboardUrl + `&limit=${backend.leaderboardLimit}`);
                const result = await response.json();
                
                if (result.ok) {
                    displayLeaderboard(result.leaderboard);
                } else {
                    document.getElementById('leaderboardContent').innerHTML = '<p>Load failed</p>';
                }
            } catch (error) {
                document.getElementById('leaderboardContent').innerHTML = '<p>Network error</p>';
            }
        }

        function displayLeaderboard(leaderboard) {
            const content = document.getElementById('leaderboardContent');
            
            if (leaderboard.length === 0) {
                content.innerHTML = '<p>No data available</p>';
                return;
            }
            
            let html = '<table class="leaderboard-table">';
            html += '<tr><th>Rank</th><th>Player</th><th>Score</th><th>Time</th></tr>';
            
            leaderboard.forEach((entry, index) => {
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                
                html += '<tr>';
                html += `<td>${index + 1}</td>`;
                html += `<td>${entry.name}</td>`;
                html += `<td>${entry.score}`;
                if (entry.mode !== null) html += `<span class="badge">M${entry.mode}</span>`;
                if (entry.wave !== null) html += `<span class="badge">W${entry.wave}</span>`;
                html += '</td>';
                html += `<td>${timeStr}</td>`;
                html += '</tr>';
            });
            
            html += '</table>';
            content.innerHTML = html;
        }

        function clearPlayerData() {
            console.log('🧹 Clearing all player data on page load');
            
            // Reset multiplayer state
            multiplayer.playerId = null;
            multiplayer.roomId = null;
            multiplayer.playerIndex = null;
            multiplayer.connected = false;
            multiplayer.ready = false;
            multiplayer.roomPlayers.clear();
            multiplayer.inputQueue = [];
            multiplayer.lastInputSent = 0;
            
            // Reset game state
            gameState.running = false;
            gameState.paused = false;
            gameState.wave = 1;
            gameState.score = 0;
            gameState.teamScore = 0;
            gameState.players = [];
            gameState.enemies = [];
            gameState.bullets = [];
            gameState.effects = [];
            gameState.objectives = [];
            gameState.playerAssignments = { player1: null, player2: null };
            
            // Clear input state
            gameState.keys = {};
            gameState.gamepads = {};
            gameState.lastTime = 0;
            
            console.log('✅ Player data cleared');
        }

        function clearLocalScores() {
            localStorage.removeItem('hiscore.team');
            localStorage.removeItem('hiscore.p1');
            localStorage.removeItem('hiscore.p2');
            updateHighScore();
            alert('Local scores cleared');
        }

        // Initialize leaderboard on load
        window.addEventListener('load', () => {
            refreshLeaderboard();
        });

        // Make connection checker globally accessible for debugging
        window.checkWebSocketConnection = checkWebSocketConnection;
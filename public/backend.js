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
            wsUrl: `ws://${window.location.host}`,
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
        let canvas, ctx, gameState = {
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
            
            loadFromStorage();
            setupEventListeners();
            setupMultiplayer();
            gameLoop();
            
            // Auto-focus canvas
            canvas.focus();
            
            // Check if ready button should be shown (for debugging)
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
                    updateStatus('Connected to server - Create or join a room');
                    updateConnectionStatus('Connected', '#4CAF50');
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
                        console.log(`Assigned to player ${data.playerIndex + 1}`);
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
                                // For local player, only update non-position data
                                localPlayer.hp = remotePlayer.hp;
                                localPlayer.score = remotePlayer.score;
                                localPlayer.ammo = remotePlayer.ammo;
                                localPlayer.ult = remotePlayer.ult;
                                localPlayer.shield = remotePlayer.shield;
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

        function sendGameState() {
            if (multiplayer.connected && multiplayer.ws && multiplayer.playerIndex === 0) {
                const stateToSend = {
                    players: gameState.players.map(p => ({
                        x: p.x, y: p.y, hp: p.hp, score: p.score,
                        shield: p.shield, ult: p.ult, ammo: p.ammo,
                        reloading: p.reloading, dashCooldown: p.dashCooldown
                    })),
                    enemies: gameState.enemies,
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
            if (multiplayer.connected && multiplayer.ws) {
                multiplayer.ws.send(JSON.stringify({
                    type: 'createRoom'
                }));
                updateStatus('Creating room...');
                // Show ready button when creating room
                const readyButton = document.getElementById('readyButton');
                if (readyButton) {
                    readyButton.style.display = 'block';
                }
            }
        }

        function joinRoom(roomId) {
            if (multiplayer.connected && multiplayer.ws) {
                multiplayer.roomId = roomId;
                multiplayer.ws.send(JSON.stringify({
                    type: 'joinRoom',
                    roomId: roomId
                }));
                updateStatus('Joining room...');
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
                }
            });
            
            document.addEventListener('keyup', (e) => {
                let key = e.key.toLowerCase();
                
                // Handle special keys
                if (key === ';') key = 'semicolon';
                if (key === 'shift') key = 'shift';
                
                gameState.keys[key] = false;
            });

            // Gamepad support
            window.addEventListener('gamepadconnected', (e) => {
                console.log('Gamepad connected:', e.gamepad);
            });

            window.addEventListener('gamepaddisconnected', (e) => {
                console.log('Gamepad disconnected:', e.gamepad);
            });
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
            console.log('startGame called');
            
            // If in multiplayer, request synchronized start
            if (multiplayer.connected && multiplayer.roomId) {
                multiplayer.ws.send(JSON.stringify({
                    type: 'requestGameStart',
                    roomId: multiplayer.roomId
                }));
                updateStatus('Requesting synchronized game start...');
                return;
            }
            
            // Single player or host starts immediately
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
            
            gameState.players.push({
                id: 1, x: centerX - 50, y: centerY, vx: 0, vy: 0,
                hp: 300, maxHp: 300, ult: 0, maxUlt: 100, ammo: 50, maxAmmo: 50,
                score: 0, reloading: false, shield: false, dashCooldown: 0,
                color: '#4CAF50', size: 20, gunAngle: 0, lastShot: 0
            });
            
            gameState.players.push({
                id: 2, x: centerX + 50, y: centerY, vx: 0, vy: 0,
                hp: 300, maxHp: 300, ult: 0, maxUlt: 100, ammo: 50, maxAmmo: 50,
                score: 0, reloading: false, shield: false, dashCooldown: 0,
                color: '#2196F3', size: 20, gunAngle: 0, lastShot: 0
            });
            
            console.log('Players spawned:', gameState.players);
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

        function update(deltaTime) {
            const dt = deltaTime / 1000;
            
            // Always update local player input (both players can control their characters)
            updateLocalPlayer(dt);
            
            // Only update game logic if this is the host (player 0) or single player
            if (!multiplayer.connected || multiplayer.playerIndex === 0) {
                // Update enemies
                updateEnemies(dt);
                
                // Update bullets
                updateBullets(dt);
                
                // Update effects
                updateEffects(dt);
                
                // Check wave completion
                if (gameState.waveMode && gameState.enemies.length === 0) {
                    gameState.wave++;
                    spawnWave();
                    showBanner(`Wave ${gameState.wave}!`);
                }
            }
            
            // Update camera (always local)
            centerCamera();
            
            // Update team score
            gameState.teamScore = gameState.players.reduce((sum, p) => sum + p.score, 0);
            document.getElementById('currentScore').textContent = gameState.teamScore;
            document.getElementById('teamScore').textContent = gameState.teamScore;
            
            // Send game state to other players (more frequently for better sync)
            if (multiplayer.connected && Date.now() % 100 < 16) { // ~10 times per second
                sendGameState();
            }
        }

        function updatePlayers(dt) {
            // Update Player 1 (index 0) - only responds to WASD controls
            const player1 = gameState.players[0];
            if (player1) {
                const controls = { 
                    up: 'w', down: 's', left: 'a', right: 'd', 
                    shoot: 'f', dash: 'shift', shield: 'e', ult: 'q', reload: 'r' 
                };
                
                // Movement - velocity calculation 
                let vx = 0, vy = 0;
                const speed = 200;
                
                if (gameState.keys[controls.up]) vy -= speed;
                if (gameState.keys[controls.down]) vy += speed;
                if (gameState.keys[controls.left]) vx -= speed;
                if (gameState.keys[controls.right]) vx += speed;
                
                // Normalize diagonal movement
                if (vx !== 0 && vy !== 0) {
                    vx *= 0.707;
                    vy *= 0.707;
                }
                
                player1.vx = vx;
                player1.vy = vy;
                
                // Send input to multiplayer - syncing game states 
                if (multiplayer.connected && multiplayer.playerIndex === 0) {
                    sendPlayerInput({
                        vx: vx,
                        vy: vy,
                        shield: player1.shield,
                        shooting: gameState.keys[controls.shoot],
                        dashing: gameState.keys[controls.dash],
                        ult: gameState.keys[controls.ult],
                        reload: gameState.keys[controls.reload],
                        timestamp: Date.now()
                    });
                }
                
                // Update position
                player1.x += player1.vx * dt;
                player1.y += player1.vy * dt;
                
                // World bounds
                player1.x = Math.max(player1.size, Math.min(gameState.worldSize.w - player1.size, player1.x));
                player1.y = Math.max(player1.size, Math.min(gameState.worldSize.h - player1.size, player1.y));
                
                // Shooting
                if (gameState.keys[controls.shoot] && player1.ammo > 0 && !player1.reloading && Date.now() - player1.lastShot > 150) {
                    shoot(player1, 0);
                }
                
                // Reloading
                if (gameState.keys[controls.reload] && !player1.reloading) {
                    player1.reloading = true;
                    setTimeout(() => {
                        player1.ammo = player1.maxAmmo;
                        player1.reloading = false;
                    }, 1000);
                }
                
                // Shield - blocking damage handled in collision detection
                if (gameState.keys[controls.shield]) {
                    player1.shield = true;
                } else {
                    player1.shield = false;
                }
                
                // Dash
                if (gameState.keys[controls.dash] && player1.dashCooldown <= 0) {
                    player1.x += player1.vx * dt * 3;
                    player1.y += player1.vy * dt * 3;
                    player1.dashCooldown = 2;
                }
                
                if (player1.dashCooldown > 0) {
                    player1.dashCooldown -= dt;
                }
                
                // Ult charge
                if (player1.ult < player1.maxUlt) {
                    player1.ult += 10 * dt;
                }
                
                // Ult usage
                if (gameState.keys[controls.ult] && player1.ult >= player1.maxUlt) {
                    useUlt(player1);
                }
            }
            

            // AI player 2
            // In your updatePlayers function, modify Player 2 section
            const player2 = gameState.players[1];
            if (player2) {
                if (player2.isAIControlled) {
                    // AI controls this player - actions set by API
                    // Just update position based on velocity
                    player2.x += player2.vx * dt;
                    player2.y += player2.vy * dt;
                    
                    // Handle AI-requested actions
                    if (player2.shouldShoot && canShoot(player2)) {
                        shoot(player2, 1);
                        player2.shouldShoot = false;
                    }
                    
                    if (player2.shouldDash && player2.dashCooldown <= 0) {
                        dash(player2);
                        player2.shouldDash = false;
                    }
                    
                    // ... handle other actions
                } else {
                    // Original human input logic
                    // ... existing IJKL controls
                }
            }
        }

        function canShoot(player) {
            return player.ammo > 0 && !player.reloading && Date.now() - player.lastShot > 150;
        }

        function dash(player) {
            if (player.dashCooldown <= 0) {
                player.x += player.vx * 0.1 * 3;
                player.y += player.vy * 0.1 * 3;
                player.dashCooldown = 2;
            }
        }

        function updateLocalPlayer(dt) {
            // Only update the local player's input
            if (!multiplayer.connected) {
                // Single player mode - update both players
                updatePlayers(dt);
                return;
            }
            
            // Multiplayer mode - only update the local player
            const localPlayerIndex = multiplayer.playerIndex;
            if (localPlayerIndex === undefined || localPlayerIndex >= gameState.players.length) {
                return;
            }
            
            const localPlayer = gameState.players[localPlayerIndex];
            if (!localPlayer) return;
            
            // Define controls based on player index
            const controls = localPlayerIndex === 0 ? 
                { up: 'w', down: 's', left: 'a', right: 'd', shoot: 'f', dash: 'shift', shield: 'e', ult: 'q', reload: 'r' } :
                { up: 'i', down: 'k', left: 'j', right: 'l', shoot: 'h', dash: 'o', shield: 'u', ult: 'p', reload: 'semicolon' };
            
            // Movement
            let vx = 0, vy = 0;
            const speed = 200;
            
            if (gameState.keys[controls.up]) vy -= speed;
            if (gameState.keys[controls.down]) vy += speed;
            if (gameState.keys[controls.left]) vx -= speed;
            if (gameState.keys[controls.right]) vx += speed;
            
            // Normalize diagonal movement
            if (vx !== 0 && vy !== 0) {
                vx *= 0.707;
                vy *= 0.707;
            }
            
            localPlayer.vx = vx;
            localPlayer.vy = vy;
            
            // Update position
            localPlayer.x += localPlayer.vx * dt;
            localPlayer.y += localPlayer.vy * dt;
            
            // World bounds
            localPlayer.x = Math.max(localPlayer.size, Math.min(gameState.worldSize.w - localPlayer.size, localPlayer.x));
            localPlayer.y = Math.max(localPlayer.size, Math.min(gameState.worldSize.h - localPlayer.size, localPlayer.y));
            
            // Shooting
            if (gameState.keys[controls.shoot] && localPlayer.ammo > 0 && !localPlayer.reloading && Date.now() - localPlayer.lastShot > 150) {
                shoot(localPlayer, localPlayerIndex);
            }
            
            // Reloading
            if (gameState.keys[controls.reload] && !localPlayer.reloading) {
                localPlayer.reloading = true;
                setTimeout(() => {
                    localPlayer.ammo = localPlayer.maxAmmo;
                    localPlayer.reloading = false;
                }, 1000);
            }
            
            // Shield
            if (gameState.keys[controls.shield]) {
                localPlayer.shield = true;
            } else {
                localPlayer.shield = false;
            }
            
            // Dash
            if (gameState.keys[controls.dash] && localPlayer.dashCooldown <= 0) {
                localPlayer.x += localPlayer.vx * dt * 3;
                localPlayer.y += localPlayer.vy * dt * 3;
                localPlayer.dashCooldown = 2;
            }
            
            if (localPlayer.dashCooldown > 0) {
                localPlayer.dashCooldown -= dt;
            }
            
            // Ult charge
            if (localPlayer.ult < localPlayer.maxUlt) {
                localPlayer.ult += 10 * dt;
            }
            
            // Ult usage
            if (gameState.keys[controls.ult] && localPlayer.ult >= localPlayer.maxUlt) {
                useUlt(localPlayer);
            }
            
            // Send input to other players
            sendPlayerInput({
                vx: vx,
                vy: vy,
                shield: localPlayer.shield,
                shooting: gameState.keys[controls.shoot],
                dashing: gameState.keys[controls.dash],
                ult: gameState.keys[controls.ult],
                reload: gameState.keys[controls.reload],
                timestamp: Date.now()
            });
        }

        function shoot(player, playerIndex) {
            if (player.ammo <= 0) return;
            
            player.ammo--;
            player.lastShot = Date.now();
            
            // Find nearest enemy for aim
            let targetAngle = player.gunAngle;
            if (gameState.enemies.length > 0) {
                const nearest = findNearestEnemy(player);
                if (nearest) {
                    targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
                }
            }
            
            // Create bullet
            const bulletSpeed = 400;
            gameState.bullets.push({
                x: player.x + Math.cos(targetAngle) * player.size,
                y: player.y + Math.sin(targetAngle) * player.size,
                vx: Math.cos(targetAngle) * bulletSpeed,
                vy: Math.sin(targetAngle) * bulletSpeed,
                size: 3, color: player.color, playerId: player.id, damage: 25
            });
            
            // Muzzle flash effect
            gameState.effects.push({
                x: player.x + Math.cos(targetAngle) * player.size,
                y: player.y + Math.sin(targetAngle) * player.size,
                type: 'muzzle', life: 0.1, maxLife: 0.1, size: 8
            });
        }

        function useUlt(player) {
            player.ult = 0;
            
            // Create explosion effect
            gameState.effects.push({
                x: player.x, y: player.y, type: 'explosion', life: 0.5, maxLife: 0.5, size: 100
            });
            
            // Damage all enemies in range
            gameState.enemies.forEach(enemy => {
                const dist = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
                if (dist < 150) {
                    enemy.hp -= 100;
                    if (enemy.hp <= 0) {
                        killEnemy(enemy, player);
                    }
                }
            });
        }

        function findNearestEnemy(player) {
            let nearest = null;
            let minDist = Infinity;
            
            gameState.enemies.forEach(enemy => {
                const dist = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = enemy;
                }
            });
            
            return nearest;
        }

        function updateEnemies(dt) {
            gameState.enemies.forEach((enemy, index) => {
                // Find nearest player
                let nearestPlayer = null;
                let minDist = Infinity;
                
                gameState.players.forEach(player => {
                    const dist = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestPlayer = player;
                    }
                });
                
                if (nearestPlayer) {
                    // Move towards player
                    const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
                    const speed = enemy.isBoss ? 50 : 80;
                    
                    enemy.vx = Math.cos(angle) * speed;
                    enemy.vy = Math.sin(angle) * speed;
                    
                    enemy.x += enemy.vx * dt;
                    enemy.y += enemy.vy * dt;
                    
                    // Enemy shooting
                    if (Date.now() - enemy.lastShot > 1000) {
                        enemy.lastShot = Date.now();
                        
                        const bulletSpeed = 200;
                        gameState.bullets.push({
                            x: enemy.x,
                            y: enemy.y,
                            vx: Math.cos(angle) * bulletSpeed,
                            vy: Math.sin(angle) * bulletSpeed,
                            size: 2, color: '#f44336', playerId: 0, damage: 5
                        });
                    }
                }
            });
            
            // Remove dead enemies
            gameState.enemies = gameState.enemies.filter(enemy => enemy.hp > 0);
        }

        function updateBullets(dt) {
            gameState.bullets.forEach((bullet, bulletIndex) => {
                bullet.x += bullet.vx * dt;
                bullet.y += bullet.vy * dt;
                
                // Remove bullets that are out of bounds
                if (bullet.x < 0 || bullet.x > gameState.worldSize.w || 
                    bullet.y < 0 || bullet.y > gameState.worldSize.h) {
                    gameState.bullets.splice(bulletIndex, 1);
                    return;
                }
                
                // Check collision with enemies (player bullets)
                if (bullet.playerId > 0) {
                    gameState.enemies.forEach((enemy, enemyIndex) => {
                        const dist = Math.sqrt((bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2);
                        if (dist < enemy.size + bullet.size) {
                            enemy.hp -= bullet.damage;
                            gameState.bullets.splice(bulletIndex, 1);
                            
                            // Hurt effect
                            gameState.effects.push({
                                x: enemy.x, y: enemy.y, type: 'hurt', life: 0.2, maxLife: 0.2, size: 15
                            });
                            
                            if (enemy.hp <= 0) {
                                const player = gameState.players.find(p => p.id === bullet.playerId);
                                if (player) killEnemy(enemy, player);
                            }
                        }
                    });
                }
                
                // Check collision with players (enemy bullets)
                if (bullet.playerId === 0) {
                    gameState.players.forEach(player => {
                        if (player.shield) return; // Shield blocks bullets
                        
                        const dist = Math.sqrt((bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2);
                        if (dist < player.size + bullet.size) {
                            player.hp -= bullet.damage;
                            gameState.bullets.splice(bulletIndex, 1);
                            
                            // Hurt effect
                            gameState.effects.push({
                                x: player.x, y: player.y, type: 'hurt', life: 0.2, maxLife: 0.2, size: 15
                            });
                            
                            if (player.hp <= 0) {
                                gameOver();
                            }
                        }
                    });
                }
            });
        }

        function killEnemy(enemy, player) {
            const score = enemy.isBoss ? 1000 : 100;
            player.score += score;
            gameState.score += score;
            
            // Pop effect
            gameState.effects.push({
                x: enemy.x, y: enemy.y, type: 'pop', life: 0.3, maxLife: 0.3, size: enemy.size
            });
            
            // Debris effect
            for (let i = 0; i < 5; i++) {
                gameState.effects.push({
                    x: enemy.x + (Math.random() - 0.5) * 20,
                    y: enemy.y + (Math.random() - 0.5) * 20,
                    type: 'debris', life: 1, maxLife: 1, size: 3,
                    vx: (Math.random() - 0.5) * 100,
                    vy: (Math.random() - 0.5) * 100
                });
            }
        }

        function updateEffects(dt) {
            gameState.effects.forEach((effect, index) => {
                effect.life -= dt;
                
                if (effect.type === 'debris') {
                    effect.x += effect.vx * dt;
                    effect.y += effect.vy * dt;
                }
                
                if (effect.life <= 0) {
                    gameState.effects.splice(index, 1);
                }
            });
        }

        function gameOver() {
            gameState.running = false;
            saveToStorage();
            updateStatus('Game Over - Press Space to restart');
            showBanner('Game Over!');
        }

        function render() {
            // Clear canvas
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Save context for camera transform
            ctx.save();
            ctx.translate(-gameState.camera.x, -gameState.camera.y);
            
            // Draw grid background
            drawGrid();
            
            // Draw obstacles
            drawObstacles();
            
            // Draw objectives
            drawObjectives();
            
            // Draw effects
            drawEffects();
            
            // Draw bullets
            drawBullets();
            
            // Draw enemies
            drawEnemies();
            
            // Draw players
            drawPlayers();
            
            // Debug: Draw a test circle at screen center
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(canvas.width/2, canvas.height/2, 30, 0, Math.PI * 2);
            ctx.fill();
            
            // Debug info (only log occasionally)
            if (gameState.running && Math.random() < 0.01) {
                console.log('Camera:', gameState.camera);
                console.log('Players:', gameState.players.length);
            }
            
            // Restore context
            ctx.restore();
        }

        function drawGrid() {
            const gridSize = 50;
            const startX = Math.floor(gameState.camera.x / gridSize) * gridSize;
            const startY = Math.floor(gameState.camera.y / gridSize) * gridSize;
            const endX = startX + canvas.width + gridSize;
            const endY = startY + canvas.height + gridSize;
            
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            
            for (let x = startX; x <= endX; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, startY);
                ctx.lineTo(x, endY);
                ctx.stroke();
            }
            
            for (let y = startY; y <= endY; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
            }
        }

        function drawObstacles() {
            // Placeholder for obstacles
        }

        function drawObjectives() {
            // Placeholder for objectives
        }

        function drawEffects() {
            gameState.effects.forEach(effect => {
                const alpha = effect.life / effect.maxLife;
                ctx.globalAlpha = alpha;
                
                switch (effect.type) {
                    case 'muzzle':
                        ctx.fillStyle = '#ffff00';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, effect.size * alpha, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'hurt':
                        ctx.fillStyle = '#ff0000';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, effect.size * alpha, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'pop':
                        ctx.fillStyle = '#ff8800';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, effect.size * alpha, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'explosion':
                        ctx.fillStyle = '#ff4400';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, effect.size * alpha, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 'debris':
                        ctx.fillStyle = '#888888';
                        ctx.fillRect(effect.x, effect.y, effect.size, effect.size);
                        break;
                }
            });
            
            ctx.globalAlpha = 1;
        }

        function drawBullets() {
            gameState.bullets.forEach(bullet => {
                ctx.fillStyle = bullet.color;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        function drawEnemies() {
            gameState.enemies.forEach(enemy => {
                // Enemy body
                ctx.fillStyle = enemy.color;
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
                ctx.fill();
                
                // Health bar
                const barWidth = enemy.size * 2;
                const barHeight = 4;
                const healthPercent = enemy.hp / enemy.maxHp;
                
                ctx.fillStyle = '#333';
                ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.size - 10, barWidth, barHeight);
                
                ctx.fillStyle = '#f44336';
                ctx.fillRect(enemy.x - barWidth/2, enemy.y - enemy.size - 10, barWidth * healthPercent, barHeight);
            });
        }

        function drawPlayers() {
            gameState.players.forEach((player, index) => {
                
                // Player body with border
                ctx.fillStyle = player.color;
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
                ctx.fill();
                
                // White border for visibility
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.size, 0, Math.PI * 2);
                ctx.stroke();
                
                // Highlight current player with thicker border
                if (index === multiplayer.playerIndex) {
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(player.x, player.y, player.size + 2, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // Show host indicator
                if (multiplayer.connected && index === 0) {
                    ctx.fillStyle = '#ffaa00';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('HOST', player.x, player.y - player.size - 25);
                }
                
                // Player number indicator
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText((index + 1).toString(), player.x, player.y + 4);
                
                // Shield effect
                if (player.shield) {
                    ctx.strokeStyle = '#00ffff';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(player.x, player.y, player.size + 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // Gun (larger and more visible)
                ctx.fillStyle = '#333';
                ctx.fillRect(player.x - 3, player.y - player.size - 10, 6, 12);
                
                // Health bar
                const barWidth = player.size * 2;
                const barHeight = 6;
                const healthPercent = player.hp / player.maxHp;
                
                ctx.fillStyle = '#333';
                ctx.fillRect(player.x - barWidth/2, player.y - player.size - 20, barWidth, barHeight);
                
                ctx.fillStyle = '#4CAF50';
                ctx.fillRect(player.x - barWidth/2, player.y - player.size - 20, barWidth * healthPercent, barHeight);
                
                // Ability indicators
                drawAbilityIndicators(player, index);
            });
        }
        
        function drawAbilityIndicators(player, playerIndex) {
            const yOffset = player.y - player.size - 35;
            const iconSize = 8;
            const spacing = 12;
            
            // Shield indicator
            ctx.fillStyle = player.shield ? '#00ffff' : '#666';
            ctx.fillRect(player.x - spacing * 2, yOffset, iconSize, iconSize);
            
            // Dash cooldown indicator
            const dashColor = player.dashCooldown > 0 ? '#ff4444' : '#44ff44';
            ctx.fillStyle = dashColor;
            ctx.fillRect(player.x - spacing, yOffset, iconSize, iconSize);
            
            // Ultimate indicator
            const ultColor = player.ult >= player.maxUlt ? '#ffaa00' : '#666';
            ctx.fillStyle = ultColor;
            ctx.fillRect(player.x, yOffset, iconSize, iconSize);
            
            // Ammo indicator
            const ammoColor = player.reloading ? '#ff4444' : '#4444ff';
            ctx.fillStyle = ammoColor;
            ctx.fillRect(player.x + spacing, yOffset, iconSize, iconSize);
            
            // Ability labels
            ctx.fillStyle = '#ffffff';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('S', player.x - spacing * 2 + iconSize/2, yOffset + iconSize + 8);
            ctx.fillText('D', player.x - spacing + iconSize/2, yOffset + iconSize + 8);
            ctx.fillText('U', player.x + iconSize/2, yOffset + iconSize + 8);
            ctx.fillText('A', player.x + spacing + iconSize/2, yOffset + iconSize + 8);
        }

        function updateHUD() {
            gameState.players.forEach((player, index) => {
                const playerCard = document.querySelectorAll('.player-card')[index];
                const hpBar = playerCard.querySelector('.hp-fill');
                const ultBar = playerCard.querySelector('.ult-fill');
                const ammoBar = playerCard.querySelector('.ammo-fill');
                
                hpBar.style.width = (player.hp / player.maxHp * 100) + '%';
                ultBar.style.width = (player.ult / player.maxUlt * 100) + '%';
                ammoBar.style.width = (player.ammo / player.maxAmmo * 100) + '%';
            });
            
            // Update ability panel for the first player (or current player in multiplayer)
            if (gameState.players.length > 0) {
                const player = gameState.players[0]; // For now, show first player's abilities
                updateAbilityPanel(player);
            }
        }
        
        function updateAbilityPanel(player) {
            // Shield status
            const shieldStatus = document.getElementById('shieldStatus');
            shieldStatus.textContent = player.shield ? 'Active' : 'Off';
            shieldStatus.className = 'ability-status ' + (player.shield ? 'ready' : '');
            
            // Dash status
            const dashStatus = document.getElementById('dashStatus');
            if (player.dashCooldown > 0) {
                dashStatus.textContent = Math.ceil(player.dashCooldown) + 's';
                dashStatus.className = 'ability-status cooldown';
            } else {
                dashStatus.textContent = 'Ready';
                dashStatus.className = 'ability-status ready';
            }
            
            // Ultimate status
            const ultStatus = document.getElementById('ultStatus');
            const ultPercent = Math.round((player.ult / player.maxUlt) * 100);
            ultStatus.textContent = ultPercent + '%';
            ultStatus.className = 'ability-status ' + (ultPercent >= 100 ? 'ready' : '');
            
            // Ammo status
            const ammoStatus = document.getElementById('ammoStatus');
            ammoStatus.textContent = player.ammo + '/' + player.maxAmmo;
            ammoStatus.className = 'ability-status ' + (player.reloading ? 'reloading' : 'ready');
        }

        function updateRadar() {
            const radar = document.getElementById('radar');
            const radarCtx = radar.getContext('2d');
            
            // Clear radar
            radarCtx.fillStyle = 'rgba(0,0,0,0.8)';
            radarCtx.fillRect(0, 0, radar.width, radar.height);
            
            // Draw radar circle
            radarCtx.strokeStyle = '#333';
            radarCtx.lineWidth = 1;
            radarCtx.beginPath();
            radarCtx.arc(radar.width/2, radar.height/2, radar.width/2 - 5, 0, Math.PI * 2);
            radarCtx.stroke();
            
            // Scale factor for radar
            const scale = radar.width / 400;
            
            // Draw players on radar
            gameState.players.forEach(player => {
                const radarX = (player.x - gameState.camera.x) * scale;
                const radarY = (player.y - gameState.camera.y) * scale;
                
                if (radarX >= 0 && radarX < radar.width && radarY >= 0 && radarY < radar.height) {
                    radarCtx.fillStyle = player.color;
                    radarCtx.beginPath();
                    radarCtx.arc(radarX, radarY, 3, 0, Math.PI * 2);
                    radarCtx.fill();
                }
            });
            
            // Draw enemies on radar
            gameState.enemies.forEach(enemy => {
                const radarX = (enemy.x - gameState.camera.x) * scale;
                const radarY = (enemy.y - gameState.camera.y) * scale;
                
                if (radarX >= 0 && radarX < radar.width && radarY >= 0 && radarY < radar.height) {
                    radarCtx.fillStyle = enemy.color;
                    radarCtx.beginPath();
                    radarCtx.arc(radarX, radarY, 2, 0, Math.PI * 2);
                    radarCtx.fill();
                }
            });
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
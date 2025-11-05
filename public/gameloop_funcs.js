function update(deltaTime) {
    const dt = deltaTime / 1000;
    
    // Always update local player input (both players can control their characters)
    updateLocalPlayer(dt);
    
    // Update AI-controlled players (both in single player and multiplayer)
    updateAIControlledPlayers(dt);
    
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
    if (player1 && !player1.isAIControlled) {
        // Skip if AI-controlled (handled by updateAIControlledPlayers)
        
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
    

    // AI player 2 (RL Agent)
    const player2 = gameState.players[1];
    if (player2) {
        if (player2.isAIControlled) {
            // RL Agent controls this player
            updateAIPlayer(player2, dt);
        } else {
            // Human input logic for IJKL controls
            const controls = { up: 'i', down: 'k', left: 'j', right: 'l', shoot: 'h', dash: 'o', shield: 'u', ult: 'p', reload: 'semicolon' };
            
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
            
            player2.vx = vx;
            player2.vy = vy;
            
            // Update position
            player2.x += player2.vx * dt;
            player2.y += player2.vy * dt;
            
            // World bounds
            player2.x = Math.max(player2.size, Math.min(gameState.worldSize.w - player2.size, player2.x));
            player2.y = Math.max(player2.size, Math.min(gameState.worldSize.h - player2.size, player2.y));
            
            // Shooting
            if (gameState.keys[controls.shoot] && canShoot(player2)) {
                shoot(player2, 1);
            }
            
            // Dash
            if (gameState.keys[controls.dash] && player2.dashCooldown <= 0) {
                dash(player2);
            }
            
            // Shield
            if (gameState.keys[controls.shield]) {
                player2.shield = true;
            } else {
                player2.shield = false;
            }
            
            // Ult usage
            if (gameState.keys[controls.ult] && player2.ult >= player2.maxUlt) {
                useUlt(player2);
            }
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

function updateAIControlledPlayers(dt) {
    // Update all AI-controlled players
    gameState.players.forEach((player, index) => {
        if (player && player.isAIControlled) {
            updateAIPlayer(player, dt);
        }
    });
}

function updateAIPlayer(player, dt) {
    // RL Agent controls this player
    // Actions are set by the RL agent via WebSocket messages
    
    // Handle AI-requested actions first
    if (player.aiActions) {
        // Movement - update velocity from AI actions
        if (player.aiActions.vx !== undefined) {
            player.vx = player.aiActions.vx * 200; // Scale to game speed (vx is -1 to 1, scale to -200 to 200)
        }
        if (player.aiActions.vy !== undefined) {
            player.vy = player.aiActions.vy * 200; // Scale to game speed
        }
        
        // Shooting
        if (player.aiActions.shoot && canShoot(player)) {
            // Find player index for shooting
            const playerIndex = gameState.players.indexOf(player);
            shoot(player, playerIndex);
        }
        
        // Dash
        if (player.aiActions.dash && player.dashCooldown <= 0) {
            dash(player);
        }
        
        // Shield
        if (player.aiActions.shield !== undefined) {
            player.shield = player.aiActions.shield;
        }
        
        // Ult usage
        if (player.aiActions.ult && player.ult >= player.maxUlt) {
            useUlt(player);
        }
        
        // Reloading
        if (player.aiActions.reload && !player.reloading) {
            player.reloading = true;
            setTimeout(() => {
                player.ammo = player.maxAmmo;
                player.reloading = false;
            }, 1000);
        }
        
        // Clear actions after processing (velocity persists)
        player.aiActions = null;
    }
    // Note: Velocity persists even after aiActions is cleared, so player continues moving
    
    // Update position based on velocity set by AI (or previous velocity if no new action)
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    
    // World bounds
    player.x = Math.max(player.size, Math.min(gameState.worldSize.w - player.size, player.x));
    player.y = Math.max(player.size, Math.min(gameState.worldSize.h - player.size, player.y));
    
    // Update cooldowns and timers
    if (player.dashCooldown > 0) {
        player.dashCooldown -= dt;
    }
    
    // Ult charge
    if (player.ult < player.maxUlt) {
        player.ult += 10 * dt;
    }
    
    // Simple AI behavior when no RL agent is connected
    //if (!player.aiActions && !player.lastAIAction) {
    //    simpleAIBehavior(player);
    //}
}

/*
function simpleAIBehavior(player) {
    // Basic AI behavior when RL agent is not connected
    // This provides a fallback so the game is still playable
    
    // Find nearest enemy
    let nearestEnemy = null;
    let minDistance = Infinity;
    
    for (const enemy of gameState.enemies) {
        const distance = Math.sqrt((enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2);
        if (distance < minDistance) {
            minDistance = distance;
            nearestEnemy = enemy;
        }
    }
    
    if (nearestEnemy) {
        // Move towards nearest enemy
        const dx = nearestEnemy.x - player.x;
        const dy = nearestEnemy.y - player.y;
        const distance = Math.sqrt(dx ** 2 + dy ** 2);
        
        if (distance > 0) {
            player.vx = (dx / distance) * 150;
            player.vy = (dy / distance) * 150;
        }
        
        // Shoot if close enough
        if (distance < 200 && canShoot(player)) {
            shoot(player, 1);
        }
        
        // Use ult if charged and enemy is close
        if (player.ult >= player.maxUlt && distance < 150) {
            useUlt(player);
        }
    }
    
    player.lastAIAction = Date.now();
}
*/


function updateLocalPlayer(dt) {
    // Only update the local player's input
    if (!multiplayer.connected) {
        // Single player mode - update both players
        updatePlayers(dt);
        return;
    }
    
    // Multiplayer mode - only update the local player
    const localPlayerIndex = multiplayer.playerIndex;
    
    // Debug: Log player index issue
    if (Math.random() < 0.05) {
        console.log(`🔍 updateLocalPlayer check: localPlayerIndex=${localPlayerIndex}, connected=${multiplayer.connected}, players.length=${gameState.players.length}`);
    }
    
    if (localPlayerIndex === undefined || localPlayerIndex === null || localPlayerIndex >= gameState.players.length) {
        // Log only occasionally to avoid spam
        if (Math.random() < 0.05) {
            console.log(`❌ updateLocalPlayer: Invalid playerIndex=${localPlayerIndex}, players.length=${gameState.players.length}, connected=${multiplayer.connected}`);
        }
        return;
    }
    
    const localPlayer = gameState.players[localPlayerIndex];
    if (!localPlayer) {
        if (Math.random() < 0.01) {
            console.log(`❌ updateLocalPlayer: Player at index ${localPlayerIndex} doesn't exist`);
        }
        return;
    }
    
    // Skip if this player is AI-controlled (AI actions are handled in updateAIControlledPlayers)
    if (localPlayer.isAIControlled) {
        if (Math.random() < 0.01 && localPlayerIndex === 0) {
            console.log(`⚠️ updateLocalPlayer: Player ${localPlayerIndex + 1} (index 0) is marked as AI-controlled but should be human`);
        }
        return;
    }
    
    // Define controls based on player index
    // Index 0 is human player (WASD controls)
    // Index 1 is RL agent (AI-controlled, no keyboard controls)
    let controls;
    if (localPlayerIndex === 0) {
        // Index 0: WASD controls (human player)
        controls = { up: 'w', down: 's', left: 'a', right: 'd', shoot: 'f', dash: 'shift', shield: 'e', ult: 'q', reload: 'r' };
    } else {
        // Index 1+: Other controls (unused since index 1 is AI-controlled)
        controls = { up: 'i', down: 'k', left: 'j', right: 'l', shoot: 'h', dash: 'o', shield: 'u', ult: 'p', reload: 'semicolon' };
    }
    
    // Debug logging - make it more visible
    if (Math.random() < 0.05) { // Log 5% of the time
        console.log(`🎮 updateLocalPlayer: playerIndex=${localPlayerIndex}, isAIControlled=${localPlayer.isAIControlled}, controls=${controls.up}/${controls.down}/${controls.left}/${controls.right}`);
        console.log(`   Keys: w=${gameState.keys['w']}, s=${gameState.keys['s']}, a=${gameState.keys['a']}, d=${gameState.keys['d']}`);
        console.log(`   Player pos: (${localPlayer.x.toFixed(1)}, ${localPlayer.y.toFixed(1)}), vel: (${localPlayer.vx.toFixed(1)}, ${localPlayer.vy.toFixed(1)})`);
    }
    
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
    
    // Log when WASD keys are pressed and movement happens
    if ((vx !== 0 || vy !== 0) && localPlayerIndex >= 1) {
        const oldX = localPlayer.x;
        const oldY = localPlayer.y;
        
        // Update position
        localPlayer.x += localPlayer.vx * dt;
        localPlayer.y += localPlayer.vy * dt;
        
        // Log movement (only occasionally to avoid spam)
        if (Math.random() < 0.1) {
            console.log(`🎮 WASD Movement: Player ${localPlayerIndex + 1} moved from (${oldX.toFixed(1)}, ${oldY.toFixed(1)}) to (${localPlayer.x.toFixed(1)}, ${localPlayer.y.toFixed(1)}), vx=${vx.toFixed(1)}, vy=${vy.toFixed(1)}`);
        }
    } else {
        // Update position even when not moving (for consistency)
        localPlayer.x += localPlayer.vx * dt;
        localPlayer.y += localPlayer.vy * dt;
    }
    
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
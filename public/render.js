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
    
    // Debug info - show player positions and state
    if (gameState.running && Math.random() < 0.01) {
        console.log('Camera:', gameState.camera);
        console.log('Players:', gameState.players.length);
        if (gameState.players.length > 0) {
            gameState.players.forEach((p, i) => {
                console.log(`Player ${i}: pos=(${p.x.toFixed(1)}, ${p.y.toFixed(1)}), vx=${p.vx.toFixed(1)}, vy=${p.vy.toFixed(1)}, isAI=${p.isAIControlled}, myPlayerIndex=${multiplayer.playerIndex}, connected=${multiplayer.connected}`);
            });
        }
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
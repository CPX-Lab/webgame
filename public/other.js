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

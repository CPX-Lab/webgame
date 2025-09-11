#!/usr/bin/env python3
# might scrap this file 
'''
"""
Custom Gym Environment for the Browser Hero Game
This environment simulates the game states for training the PPO agent.
"""

import gymnasium as gym
import numpy as np
from gymnasium import spaces
import random
import math

class BrowserHeroEnv(gym.Env):
    """
    Custom environment that simulates the Browser Hero game mechanics.
    The agent learns to navigate, shoot enemies, and survive.
    """
    
    def __init__(self):
        super().__init__()
        
        # Game world dimensions
        self.world_width = 2600
        self.world_height = 1500
        
        # Player properties
        self.player_size = 20
        self.player_speed = 200
        self.player_max_hp = 300
        self.player_max_ult = 100
        self.player_max_ammo = 50
        
        # Enemy properties
        self.enemy_size = 12  # Matches your game's enemy size
        self.enemy_speed = 100
        self.max_enemies = 10
        
        # Bullet properties
        self.bullet_speed = 400
        self.bullet_damage = 25
        
        # Action space: [vx, vy, shoot, dash, shield, ult, reload]
        # vx, vy: continuous movement (-1 to 1)
        # shoot, dash, shield, ult, reload: binary (0 or 1)
        self.action_space = spaces.Box(
            low=np.array([-1, -1, 0, 0, 0, 0, 0]),
            high=np.array([1, 1, 1, 1, 1, 1, 1]),
            dtype=np.float32
        )
        
        # Observation space: matches RL agent expectations (11 dimensions)
        # [player_x, player_y, player_hp, player_ult, player_ammo, reloading,
        #  enemy1_rel_x, enemy1_rel_y, enemy1_hp,
        #  bullet1_rel_x, bullet1_rel_y]
        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1]),
            high=np.array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            dtype=np.float32
        )
        
        # Game state
        self.reset()
    
    def reset(self, seed=None):
        """Reset the environment to initial state"""
        super().reset(seed=seed)
        
        # Initialize player
        self.player = {
            'x': self.world_width / 2,
            'y': self.world_height / 2,
            'hp': self.player_max_hp,
            'ult': 0,
            'ammo': self.player_max_ammo,
            'shield': False,
            'dash_cooldown': 0,
            'last_shot': 0,
    
        }
        
        # Initialize game state
        self.score = 0
        self.time = 0
        self.enemy_spawn_timer = 0
        self.wave = 1  # Initialize wave counter
        
        # Initialize enemies
        self.enemies = []
        self.spawn_enemies(5)  # Start with 5 enemies
        
        # Initialize bullets
        self.bullets = []
        
        return self._get_observation(), {}
    
    def spawn_enemies(self, count):
        """Spawn new enemies"""
        for _ in range(count):
            if len(self.enemies) >= self.max_enemies:
                break
                
            # Spawn enemies at edges
            side = random.choice(['top', 'bottom', 'left', 'right'])
            if side == 'top':
                x = random.uniform(0, self.world_width)
                y = -self.enemy_size
            elif side == 'bottom':
                x = random.uniform(0, self.world_width)
                y = self.world_height + self.enemy_size
            elif side == 'left':
                x = -self.enemy_size
                y = random.uniform(0, self.world_height)
            else:  # right
                x = self.world_width + self.enemy_size
                y = random.uniform(0, self.world_height)
            
            self.enemies.append({
                'x': x,
                'y': y,
                'hp': 30 + self.wave * 10,  # Matches your game's HP calculation
                'vx': 0,
                'vy': 0
            })
        
        # Increase wave every few spawns to match game difficulty
        if self.enemy_spawn_timer % 600 == 0:  # Every 10 seconds
            self.wave += 1
    
    def _get_observation(self):
        """Convert game state to observation vector"""
        obs = [
            self.player['x'] / self.world_width,  # Normalized x
            self.player['y'] / self.world_height,  # Normalized y
            self.player['hp'] / self.player_max_hp,  # Normalized hp
            self.player['ult'] / self.player_max_ult,  # Normalized ult
            self.player['ammo'] / self.player_max_ammo,  # Normalized ammo
        ]
        
        # Add nearest enemy information
        if self.enemies:
            nearest_enemy = min(self.enemies, key=lambda e: 
                math.sqrt((e['x'] - self.player['x'])**2 + (e['y'] - self.player['y'])**2))
            
            obs.extend([
                (nearest_enemy['x'] - self.player['x']) / self.world_width,  # Relative x
                (nearest_enemy['y'] - self.player['y']) / self.world_height,  # Relative y
                nearest_enemy['hp'] / (30 + self.wave * 10),  # Normalized hp based on current wave
            ])
        else:
            obs.extend([0, 0, 0])
        
        # Add second nearest enemy if available
        if len(self.enemies) > 1:
            sorted_enemies = sorted(self.enemies, key=lambda e: 
                math.sqrt((e['x'] - self.player['x'])**2 + (e['y'] - self.player['y'])**2))
            second_enemy = sorted_enemies[1]
            
            obs.extend([
                (second_enemy['x'] - self.player['x']) / self.world_width,
                (second_enemy['y'] - self.player['y']) / self.world_height,
                second_enemy['hp'] / 100,
            ])
        else:
            obs.extend([0, 0, 0])
        
        # Add nearest bullet information
        if self.bullets:
            nearest_bullet = min(self.bullets, key=lambda b: 
                math.sqrt((b['x'] - self.player['x'])**2 + (b['y'] - self.player['y'])**2))
            
            obs.extend([
                (nearest_bullet['x'] - self.player['x']) / self.world_width,
                (nearest_bullet['y'] - self.player['y']) / self.world_height,
            ])
        else:
            obs.extend([0, 0])
        
        return np.array(obs, dtype=np.float32)
    
    def step(self, action):
        """Execute one step in the environment"""
        # Parse action
        vx, vy, shoot, dash, shield, ult, reload = action
        
        # Update player state
        self._update_player(vx, vy, shoot, dash, shield, ult, reload)
        
        # Update enemies
        self._update_enemies()
        
        # Update bullets
        self._update_bullets()
        
        # Check collisions
        self._check_collisions()
        
        # Spawn new enemies
        self._spawn_enemies()
        
        # Update time
        self.time += 1
        
        # Get observation
        observation = self._get_observation()
        
        # Calculate reward
        reward = self._calculate_reward()
        
        # Check if episode is done
        done = self.player['hp'] <= 0
        
        # Additional info
        info = {
            'score': self.score,
            'player_hp': self.player['hp'],
            'enemies_remaining': len(self.enemies)
        }
        
        return observation, reward, done, False, info
    
    def _update_player(self, vx, vy, shoot, dash, shield, ult, reload):
        """Update player state based on actions"""
        # Movement
        self.player['x'] += vx * self.player_speed * 0.016  # 60 FPS
        self.player['y'] += vy * self.player_speed * 0.016
        
        # World bounds
        self.player['x'] = max(self.player_size, min(self.world_width - self.player_size, self.player['x']))
        self.player['y'] = max(self.player_size, min(self.world_height - self.player_size, self.player['y']))
        
        # Shooting
        if shoot > 0.5 and self.player['ammo'] > 0 and self.time - self.player['last_shot'] > 10:
            self._shoot()
        
        # Dash
        if dash > 0.5 and self.player['dash_cooldown'] <= 0:
            self._dash()
        
        # Shield
        self.player['shield'] = shield > 0.5
        
        # Ult
        if ult > 0.5 and self.player['ult'] >= self.player_max_ult:
            self._use_ult()
        
        # Reload
        if reload > 0.5:
            self._reload()
        
        # Regenerate ult
        if self.player['ult'] < self.player_max_ult:
            self.player['ult'] += 0.5
        
        # Regenerate ammo (slower when not reloading)
        # if self.player['ammo'] < self.player_max_ammo:
        #    self.player['ammo'] += 0.05
        
        # Update cooldowns
        if self.player['dash_cooldown'] > 0:
            self.player['dash_cooldown'] -= 1

    
    def _shoot(self):
        """Player shoots a bullet"""
        if self.player['ammo'] <= 0:
            return
        
        self.player['ammo'] -= 1
        self.player['last_shot'] = self.time
        
        # Find nearest enemy to shoot at
        if self.enemies:
            nearest_enemy = min(self.enemies, key=lambda e: 
                math.sqrt((e['x'] - self.player['x'])**2 + (e['y'] - self.player['y'])**2))
            
            # Calculate direction to enemy
            dx = nearest_enemy['x'] - self.player['x']
            dy = nearest_enemy['y'] - self.player['y']
            distance = math.sqrt(dx**2 + dy**2)
            
            if distance > 0:
                vx = (dx / distance) * self.bullet_speed
                vy = (dy / distance) * self.bullet_speed
                
                self.bullets.append({
                    'x': self.player['x'],
                    'y': self.player['y'],
                    'vx': vx,
                    'vy': vy,
                    'damage': self.bullet_damage,
                    'is_player': True
                })
    
    def _dash(self):
        """Player dashes to avoid damage"""
        self.player['dash_cooldown'] = 60  # 1 second cooldown
        
        # Dash in current movement direction
        dash_distance = 100
        self.player['x'] += self.player['vx'] * dash_distance * 0.016
        self.player['y'] += self.player['vy'] * dash_distance * 0.016
        
        # World bounds
        self.player['x'] = max(self.player_size, min(self.world_width - self.player_size, self.player['x']))
        self.player['y'] = max(self.player_size, min(self.world_height - self.player_size, self.player['y']))
    
    def _reload(self):
        """Player reloads weapon"""
        self.player['ammo'] = self.player_max_ammo
    
    def _use_ult(self):
        """Player uses ultimate ability"""
        if self.player['ult'] < self.player_max_ult:
            return
        
        self.player['ult'] = 0
        
        # Kill all enemies in range
        ult_range = 200
        enemies_to_remove = []
        
        for enemy in self.enemies:
            distance = math.sqrt((enemy['x'] - self.player['x'])**2 + (enemy['y'] - self.player['y'])**2)
            if distance <= ult_range:
                enemies_to_remove.append(enemy)
                self.score += 100
        
        for enemy in enemies_to_remove:
            self.enemies.remove(enemy)
    
    def _update_enemies(self):
        """Update enemy positions and behavior"""
        for enemy in self.enemies:
            # Move towards player
            dx = self.player['x'] - enemy['x']
            dy = self.player['y'] - enemy['y']
            distance = math.sqrt(dx**2 + dy**2)
            
            if distance > 0:
                enemy['vx'] = (dx / distance) * self.enemy_speed
                enemy['vy'] = (dy / distance) * self.enemy_speed
            
            # Update position
            enemy['x'] += enemy['vx'] * 0.016
            enemy['y'] += enemy['vy'] * 0.016
            
            # Remove enemies that go off-screen
            if (enemy['x'] < -100 or enemy['x'] > self.world_width + 100 or
                enemy['y'] < -100 or enemy['y'] > self.world_height + 100):
                self.enemies.remove(enemy)
    
    def _update_bullets(self):
        """Update bullet positions"""
        bullets_to_remove = []
        
        for bullet in self.bullets:
            # Update position
            bullet['x'] += bullet['vx'] * 0.016
            bullet['y'] += bullet['vy'] * 0.016
            
            # Remove bullets that go off-screen
            if (bullet['x'] < -50 or bullet['x'] > self.world_width + 50 or
                bullet['y'] < -50 or bullet['y'] > self.world_height + 50):
                bullets_to_remove.append(bullet)
        
        for bullet in bullets_to_remove:
            self.bullets.remove(bullet)
    
    def _check_collisions(self):
        """Check for collisions between game objects"""
        # Player-enemy collisions
        for enemy in self.enemies[:]:
            distance = math.sqrt((enemy['x'] - self.player['x'])**2 + (enemy['y'] - self.player['y'])**2)
            if distance < self.player_size + self.enemy_size:
                if not self.player['shield']:
                    self.player['hp'] -= 20
                self.enemies.remove(enemy)
                self.score += 50
        
        # Bullet-enemy collisions
        for bullet in self.bullets[:]:
            if bullet['is_player']:
                for enemy in self.enemies[:]:
                    distance = math.sqrt((bullet['x'] - enemy['x'])**2 + (bullet['y'] - enemy['y'])**2)
                    if distance < self.enemy_size:
                        enemy['hp'] -= bullet['damage']
                        self.bullets.remove(bullet)
                        if enemy['hp'] <= 0:
                            self.enemies.remove(enemy)
                            self.score += 100
                        break
        
        # Enemy bullet collisions with player
        for bullet in self.bullets[:]:
            if not bullet['is_player']:
                distance = math.sqrt((bullet['x'] - self.player['x'])**2 + (bullet['y'] - self.player['y'])**2)
                if distance < self.player_size:
                    if not self.player['shield']:
                        self.player['hp'] -= 25
                    self.bullets.remove(bullet)
    
    def _spawn_enemies(self):
        """Spawn new enemies periodically"""
        self.enemy_spawn_timer += 1
        
        if self.enemy_spawn_timer >= 120:  # Spawn every 2 seconds
            self.spawn_enemies(random.randint(1, 3))
            self.enemy_spawn_timer = 0
    
    def _calculate_reward(self):
        """Calculate reward for the current state"""
        reward = 0
        
        # Survival reward
        reward += 1
        
        # Health reward
        reward += (self.player['hp'] / self.player_max_hp) * 2
        
        # Score reward
        reward += self.score * 0.01
        
        # Ammo management reward
        ammo_ratio = self.player['ammo'] / self.player_max_ammo
        reward += ammo_ratio * 0.5
        
        # Penalty for low health
        if self.player['hp'] < 50:
            reward -= 5
        
        # Penalty for being surrounded
        nearby_enemies = sum(1 for enemy in self.enemies 
                           if math.sqrt((enemy['x'] - self.player['x'])**2 + 
                                      (enemy['y'] - self.player['y'])**2) < 100)
        if nearby_enemies > 3:
            reward -= 2
        
        # Penalty for being out of ammo when enemies are nearby
        if self.player['ammo'] <= 0 and nearby_enemies > 0:
            reward -= 3
        
        return reward
    
    def render(self):
        """Render the environment (for debugging)"""
        print(f"Player: ({self.player['x']:.1f}, {self.player['y']:.1f}) HP: {self.player['hp']:.1f}")
        print(f"Enemies: {len(self.enemies)}, Bullets: {len(self.bullets)}, Score: {self.score}")
        print(f"Time: {self.time}")

# Test the environment
if __name__ == "__main__":
    env = BrowserHeroEnv()
    
    print("Testing Browser Hero Environment...")
    print(f"Action space: {env.action_space}")
    print(f"Observation space: {env.observation_space}")
    
    obs, info = env.reset()
    print(f"Initial observation: {obs}")
    
    # Test a few steps
    for step in range(10):
        action = env.action_space.sample()  # Random action
        obs, reward, done, truncated, info = env.step(action)
        print(f"Step {step + 1}: Reward = {reward:.2f}, Done = {done}")
        
        if done:
            break
    
    print("Environment test completed!")
'''
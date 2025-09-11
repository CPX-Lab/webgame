#!/usr/bin/env python3
"""
Online Training Agent for Browser Hero
Trains the RL agent directly on the real browser game
"""

import asyncio
import websockets
import json
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.buffers import ReplayBuffer
import torch
import os
import time
from collections import deque

class OnlineTrainingAgent:
    def __init__(self, server_url="ws://localhost:8787"):
        self.server_url = server_url
        self.websocket = None
        self.connected = False
        self.player_id = None
        
        # Training parameters
        self.learning_rate = 3e-4
        self.batch_size = 64
        self.buffer_size = 10000
        self.update_frequency = 100  # Update model every N steps
        
        # Experience buffer
        self.experience_buffer = deque(maxlen=self.buffer_size)
        self.current_episode = []
        
        # Initialize untrained model
        self.model = self.create_model()
        self.training_step = 0
        
        print("🤖 Online Training Agent initialized")
        print(f"�� Buffer size: {self.buffer_size}")
        print(f"🔄 Update frequency: {self.update_frequency} steps")
    
    def create_model(self):
        """Create a new PPO model for online training"""
        # Define action and observation spaces
        from gymnasium import spaces
        
        # Action space: [vx, vy, shoot, dash, shield, ult, reload]
        action_space = spaces.Box(
            low=np.array([-1, -1, 0, 0, 0, 0, 0]),
            high=np.array([1, 1, 1, 1, 1, 1, 1]),
            dtype=np.float32
        )
        
        # Observation space: 11 dimensions
        # [player_x, player_y, player_hp, player_ult, player_ammo, reloading,
        #  enemy1_rel_x, enemy1_rel_y, enemy1_hp,
        #  bullet1_rel_x, bullet1_rel_y]
        observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1]),
            high=np.array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
            dtype=np.float32
        )
        
        # Create PPO model
        model = PPO(
            "MlpPolicy",
            observation_space,
            action_space,
            learning_rate=self.learning_rate,
            verbose=1
        )
        
        print("✅ Created new PPO model for online training")
        return model
    
    def create_state_vector(self, player, enemies, bullets):
        """Convert game state to observation vector (11 dimensions)"""
        # Player state (6D)
        player_x = player['x'] / 2600  # Normalize to 0-1
        player_y = player['y'] / 1500
        player_hp = player['hp'] / player['maxHp']
        player_ult = player['ult'] / player['maxUlt']
        player_ammo = player['ammo'] / player['maxAmmo']
        reloading = 1.0 if player.get('reloading', False) else 0.0
        
        # Find nearest enemy (3D)
        nearest_enemy = self.find_nearest_enemy(player, enemies)
        if nearest_enemy:
            enemy_rel_x = (nearest_enemy['x'] - player['x']) / 2600
            enemy_rel_y = (nearest_enemy['y'] - player['y']) / 1500
            enemy_hp = nearest_enemy['hp'] / nearest_enemy['maxHp']
        else:
            enemy_rel_x, enemy_rel_y, enemy_hp = 0, 0, 0
        
        # Find nearest bullet (2D)
        nearest_bullet = self.find_nearest_bullet(player, bullets)
        if nearest_bullet:
            bullet_rel_x = (nearest_bullet['x'] - player['x']) / 2600
            bullet_rel_y = (nearest_bullet['y'] - player['y']) / 1500
        else:
            bullet_rel_x, bullet_rel_y = 0, 0
        
        return np.array([
            player_x, player_y, player_hp, player_ult, player_ammo, reloading,
            enemy_rel_x, enemy_rel_y, enemy_hp,
            bullet_rel_x, bullet_rel_y
        ], dtype=np.float32)
    
    def find_nearest_enemy(self, player, enemies):
        """Find the nearest enemy to the player"""
        if not enemies:
            return None
        
        nearest = None
        min_distance = float('inf')
        
        for enemy in enemies:
            distance = np.sqrt((enemy['x'] - player['x'])**2 + (enemy['y'] - player['y'])**2)
            if distance < min_distance:
                min_distance = distance
                nearest = enemy
        
        return nearest
    
    def find_nearest_bullet(self, player, bullets):
        """Find the nearest enemy bullet to the player"""
        enemy_bullets = [b for b in bullets if not b.get('isPlayer', True)]
        
        if not enemy_bullets:
            return None
        
        nearest = None
        min_distance = float('inf')
        
        for bullet in enemy_bullets:
            distance = np.sqrt((bullet['x'] - player['x'])**2 + (bullet['y'] - player['y'])**2)
            if distance < min_distance:
                min_distance = distance
                nearest = bullet
        
        return nearest
    
    def get_action(self, state_vector):
        """Get action from the model"""
        # Add noise for exploration during training
        action, _ = self.model.predict(state_vector, deterministic=False)
        
        # Add some exploration noise
        noise = np.random.normal(0, 0.1, action.shape)
        action = np.clip(action + noise, -1, 1)
        
        return action
    
    def store_experience(self, state, action, reward, next_state, done):
        """Store experience for training"""
        experience = (state, action, reward, next_state, done)
        self.experience_buffer.append(experience)
        self.current_episode.append(experience)
    
    def train_model(self):
        """Train the model on collected experience"""
        if len(self.experience_buffer) < self.batch_size:
            return
        
        # Sample batch from experience buffer
        batch_indices = np.random.choice(len(self.experience_buffer), self.batch_size, replace=False)
        batch = [self.experience_buffer[i] for i in batch_indices]
        
        # Prepare training data
        states = np.array([exp[0] for exp in batch])
        actions = np.array([exp[1] for exp in batch])
        rewards = np.array([exp[2] for exp in batch])
        next_states = np.array([exp[3] for exp in batch])
        dones = np.array([exp[4] for exp in batch])
        
        # Train the model (simplified - in practice you'd use proper RL training)
        # This is a placeholder - you'd need to implement proper PPO training
        print(f"🔄 Training step {self.training_step}")
        self.training_step += 1
    
    async def connect(self):
        """Connect to the game server"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            self.connected = True
            print(f"✅ Connected to game server at {self.server_url}")
            
            # Wait for player ID
            await self.wait_for_player_id()
            
        except Exception as e:
            print(f"❌ Failed to connect: {e}")
            self.connected = False
    
    async def wait_for_player_id(self):
        """Wait for player ID assignment"""
        async for message in self.websocket:
            try:
                data = json.loads(message)
                if data.get('type') == 'playerId':
                    self.player_id = data.get('playerId')
                    print(f"🎮 Got player ID: {self.player_id}")
                    await self.join_game()
                    break
            except json.JSONDecodeError:
                continue
    
    async def join_game(self):
        """Join the game"""
        join_message = {
            "type": "joinRoom",
            "roomId": "training-room"
        }
        await self.websocket.send(json.dumps(join_message))
        print("🎯 Joined training room")
    
    async def run_training(self):
        """Main training loop"""
        print("🚀 Starting online training...")
        
        last_state = None
        last_action = None
        step_count = 0
        
        async for message in self.websocket:
            try:
                data = json.loads(message)
                
                if data.get('type') == 'gameState':
                    game_state = data.get('state', {})
                    
                    # Extract our player
                    players = game_state.get('players', [])
                    our_player = None
                    for player in players:
                        if player.get('id') == self.player_id:
                            our_player = player
                            break
                    
                    if not our_player:
                        continue
                    
                    # Create state vector
                    current_state = self.create_state_vector(
                        our_player, 
                        game_state.get('enemies', []), 
                        game_state.get('bullets', [])
                    )
                    
                    # Calculate reward
                    reward = self.calculate_reward(our_player, game_state)
                    
                    # Store experience if we have previous state
                    if last_state is not None and last_action is not None:
                        done = our_player['hp'] <= 0
                        self.store_experience(last_state, last_action, reward, current_state, done)
                        
                        # Train model periodically
                        if step_count % self.update_frequency == 0:
                            self.train_model()
                        
                        # Save model periodically
                        if step_count % 1000 == 0:
                            self.save_model()
                    
                    # Get action for current state
                    action = self.get_action(current_state)
                    
                    # Send action to game
                    action_message = {
                        "type": "aiAction",
                        "vx": float(action[0]),
                        "vy": float(action[1]),
                        "shoot": bool(action[2] > 0.5),
                        "dash": bool(action[3] > 0.5),
                        "shield": bool(action[4] > 0.5),
                        "ult": bool(action[5] > 0.5),
                        "reload": bool(action[6] > 0.5)
                    }
                    
                    await self.websocket.send(json.dumps(action_message))
                    
                    # Update for next iteration
                    last_state = current_state
                    last_action = action
                    step_count += 1
                    
                    # Print progress
                    if step_count % 100 == 0:
                        print(f"�� Step {step_count}, Score: {our_player.get('score', 0)}, HP: {our_player['hp']}")
                
            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"❌ Error in training loop: {e}")
    
    def calculate_reward(self, player, game_state):
        """Calculate reward for current state"""
        reward = 0
        
        # Survival reward
        reward += 1
        
        # Health reward
        reward += (player['hp'] / player['maxHp']) * 2
        
        # Score reward
        reward += player.get('score', 0) * 0.01
        
        # Ammo management
        ammo_ratio = player['ammo'] / player['maxAmmo']
        reward += ammo_ratio * 0.5
        
        # Penalty for low health
        if player['hp'] < 50:
            reward -= 5
        
        # Penalty for being surrounded
        enemies = game_state.get('enemies', [])
        nearby_enemies = sum(1 for enemy in enemies 
                           if np.sqrt((enemy['x'] - player['x'])**2 + 
                                    (enemy['y'] - player['y'])**2) < 100)
        if nearby_enemies > 3:
            reward -= 2
        
        return reward
    
    def save_model(self):
        """Save the trained model"""
        if not os.path.exists('models'):
            os.makedirs('models')
        
        model_path = f"models/online_trained_model_{self.training_step}.zip"
        self.model.save(model_path)
        print(f"💾 Saved model to {model_path}")

async def main():
    """Main function"""
    agent = OnlineTrainingAgent()
    await agent.connect()
    
    if agent.connected:
        await agent.run_training()
    else:
        print("❌ Failed to connect to game server")

if __name__ == "__main__":
    asyncio.run(main())
    
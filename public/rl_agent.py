import asyncio
import websockets
import json
import numpy as np
from stable_baselines3 import PPO
import torch

class RLGameAgent:
    def __init__(self, server_url="ws://localhost:8787"):  # Connect to your Node.js server
        self.server_url = server_url
        self.websocket = None
        self.connected = False
        self.game_state = None
        self.player_id = None
        self.room_id = None
        
        # RL model
        self.model = None
        
    async def connect(self):
        """Connect to your Node.js game server"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            self.connected = True
            print(f"Connected to Node.js game server at {self.server_url}")
            
            # Wait for playerId message
            await self.wait_for_player_id()
            
        except Exception as e:
            print(f"Failed to connect: {e}")
            self.connected = False
    
    async def wait_for_player_id(self):
        """Wait for the server to assign us a player ID"""
        async for message in self.websocket:
            try:
                data = json.loads(message)
                if data.get('type') == 'playerId':
                    self.player_id = data.get('playerId')
                    print(f"Got player ID: {self.player_id}")
                    
                    # Now join a room
                    await self.join_game()
                    break
                    
            except json.JSONDecodeError:
                print(f"Invalid JSON: {message}")
    
    async def join_game(self):
        """Join a game room"""
        join_message = {
            "type": "joinRoom",
            "roomId": "rl-agent-room"  # Or join existing room
        }
        await self.websocket.send(json.dumps(join_message))
        print("Sent join room request")
    
    async def handle_game_state(self, game_data):
        """Process incoming game state and decide actions"""
        try:
            # Extract game information
            state = game_data.get('state', {})
            players = state.get('players', [])
            enemies = state.get('enemies', [])
            bullets = state.get('bullets', [])
            
            # Find our player
            our_player = None
            for player in players:
                if player.get('id') == self.player_id:
                    our_player = player
                    break
            
            if not our_player:
                return
            
            # Create state vector for RL model
            state_vector = self.create_state_vector(our_player, enemies, bullets)
            
            # Get action from RL model or heuristics
            action = self.get_action(state_vector)
            
            # Send action to game
            await self.send_action(action)
            
        except Exception as e:
            print(f"Error processing game state: {e}")
    
    def create_state_vector(self, player, enemies, bullets):
        """Convert game state to numerical vector for RL model"""
        # Player position and health
        state = [
            player.get('x', 0) / 2600,  # Normalized x position
            player.get('y', 0) / 1500,  # Normalized y position
            player.get('health', 100) / 100,  # Normalized health
            player.get('ult', 0) / 100,  # Normalized ult charge
        ]
        
        # Nearest enemy information
        if enemies:
            nearest_enemy = min(enemies, key=lambda e: 
                ((e.get('x', 0) - player.get('x', 0))**2 + 
                 (e.get('y', 0) - player.get('y', 0))**2)**0.5)
            
            state.extend([
                (nearest_enemy.get('x', 0) - player.get('x', 0)) / 2600,
                (nearest_enemy.get('y', 0) - player.get('y', 0)) / 1500,
                nearest_enemy.get('health', 100) / 100,
            ])
        else:
            state.extend([0, 0, 0])
        
        # Bullet information
        if bullets:
            nearest_bullet = min(bullets, key=lambda e: 
                ((e.get('x', 0) - player.get('x', 0))**2 + 
                 (e.get('y', 0) - player.get('y', 0))**2)**0.5)
            
            state.extend([
                (nearest_bullet.get('x', 0) - player.get('x', 0)) / 2600,
                (nearest_bullet.get('y', 0) - player.get('y', 0)) / 1500,
            ])
        else:
            state.extend([0, 0])
        
        return np.array(state, dtype=np.float32)
    
    def get_action(self, state):
        """Get action from RL model or use simple heuristics"""
        if self.model:
            # Use trained RL model
            action, _ = self.model.predict(state)
            return self.decode_action(action)
        else:
            # Simple heuristic behavior
            return self.simple_heuristic(state)
    
    def simple_heuristic(self, state):
        """Simple rule-based behavior"""
        player_x, player_y, health, ult = state[0:4]
        enemy_rel_x, enemy_rel_y, enemy_health = state[4:7]
        bullet_rel_x, bullet_rel_y = state[7:9]
        
        actions = {
            'vx': 0,
            'vy': 0,
            'shoot': False,
            'dash': False,
            'ult': False,
            'shield': False
        }
        
        # Move towards nearest enemy
        if abs(enemy_rel_x) > 0.1:
            actions['vx'] = 1 if enemy_rel_x > 0 else -1
        
        if abs(enemy_rel_y) > 0.1:
            actions['vy'] = 1 if enemy_rel_y > 0 else -1
        
        # Shoot if enemy is close
        if abs(enemy_rel_x) < 0.3 and abs(enemy_rel_y) < 0.3:
            actions['shoot'] = True
        
        # Use ult if charged and enemy is close
        if ult > 0.8 and abs(enemy_rel_x) < 0.2 and abs(enemy_rel_y) < 0.2:
            actions['ult'] = True
        
        # Dash to avoid bullets
        if abs(bullet_rel_x) < 0.1 and abs(bullet_rel_y) < 0.1:
            actions['dash'] = True
        
        return actions
    
    async def send_action(self, action):
        """Send player input to the game"""
        if not self.connected or not self.websocket:
            return
        
        # Format matches what your Node.js server expects
        action_message = {
            "type": "playerInput",
            "input": {  # Note: wrapped in 'input' object
                "vx": action.get('vx', 0),
                "vy": action.get('vy', 0),
                "shoot": action.get('shoot', False),
                "dash": action.get('dash', False),
                "ult": action.get('ult', False),
                "shield": action.get('shield', False),
                "timestamp": int(asyncio.get_event_loop().time() * 1000)
            }
        }
        
        try:
            await self.websocket.send(json.dumps(action_message))
        except Exception as e:
            print(f"Failed to send action: {e}")
    
    async def listen_for_messages(self):
        """Listen for incoming WebSocket messages"""
        if not self.websocket:
            return
        
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    message_type = data.get('type')
                    
                    if message_type == 'gameState':
                        await self.handle_game_state(data)
                    elif message_type == 'playerJoined':
                        print(f"Player joined room: {data.get('playerId')}")
                    elif message_type == 'playerInput':
                        # Handle other players' inputs if needed
                        pass
                    
                except json.JSONDecodeError:
                    print(f"Invalid JSON message: {message}")
                    
        except websockets.exceptions.ConnectionClosed:
            print("WebSocket connection closed")
            self.connected = False
        except Exception as e:
            print(f"WebSocket error: {e}")
            self.connected = False
    
    async def run(self):
        """Main loop for the RL agent"""
        await self.connect()
        
        if not self.connected:
            print("Failed to connect to game server")
            return
        
        # Start listening for messages
        await self.listen_for_messages()
    
    def close(self):
        """Clean up the agent"""
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        self.connected = False

# Main execution
async def main():
    agent = RLGameAgent()
    try:
        await agent.run()
    except KeyboardInterrupt:
        print("Shutting down RL agent...")
    finally:
        agent.close()

if __name__ == "__main__":
    asyncio.run(main())

    
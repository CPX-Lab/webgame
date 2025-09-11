#!/usr/bin/env python3
"""
Simple test script to debug websocket connection issues
"""

import asyncio
import json
import websockets
import time

async def test_websocket_connection():
    """Test basic websocket connection to the game server"""
    server_url = "ws://localhost:8787"
    
    print(f"Attempting to connect to {server_url}...")
    
    try:
        async with websockets.connect(server_url) as ws:
            print("✓ Successfully connected to websocket server")
            
            # Wait for playerId
            print("Waiting for playerId...")
            deadline = time.time() + 5.0
            player_id = None
            
            while time.time() < deadline:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=0.2)
                    data = json.loads(msg)
                    print(f"Received message: {data}")
                    
                    if data.get("type") == "playerId":
                        player_id = data.get("playerId")
                        print(f"✓ Received playerId: {player_id}")
                        break
                        
                except (asyncio.TimeoutError, json.JSONDecodeError) as e:
                    print(f"Timeout or JSON error: {e}")
                    continue
            
            if not player_id:
                print("✗ Failed to receive playerId within timeout")
                return False
            
            # Join room
            room_id = "training-room"
            join_msg = {"type": "joinRoom", "roomId": room_id}
            await ws.send(json.dumps(join_msg))
            print(f"✓ Sent joinRoom message for room: {room_id}")
            
            # Wait for game states
            print("Waiting for game states...")
            state_count = 0
            deadline = time.time() + 10.0
            
            while time.time() < deadline and state_count < 5:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=0.2)
                    data = json.loads(msg)
                    
                    if data.get("type") == "gameState":
                        state = data.get("state", {})
                        players = state.get("players", [])
                        enemies = state.get("enemies", [])
                        print(f"✓ Received gameState: {len(players)} players, {len(enemies)} enemies")
                        state_count += 1
                    else:
                        print(f"Received other message: {data.get('type')}")
                        
                except (asyncio.TimeoutError, json.JSONDecodeError):
                    continue
            
            if state_count > 0:
                print(f"✓ Successfully received {state_count} game states")
                return True
            else:
                print("✗ No game states received")
                return False
                
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_websocket_connection())
    if success:
        print("\n🎉 Connection test passed! Your game server is working correctly.")
    else:
        print("\n❌ Connection test failed! Check that:")
        print("1. Your game server is running on localhost:8787")
        print("2. The server is sending playerId and gameState messages")
        print("3. There are no firewall or network issues")

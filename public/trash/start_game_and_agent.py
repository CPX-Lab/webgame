#!/usr/bin/env python3
"""
Script to start the game server, open browser, and run RL agent
"""

import subprocess
import time
import webbrowser
import os
import sys
from pathlib import Path

def start_server():
    """Start the Node.js server"""
    print("Starting Node.js server...")
    server_process = subprocess.Popen(
        ["node", "server.js"],
        cwd=Path(__file__).parent.parent,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait a moment for server to start
    time.sleep(2)
    
    # Check if server started successfully
    if server_process.poll() is not None:
        stdout, stderr = server_process.communicate()
        print(f"Server failed to start: {stderr.decode()}")
        return None
    
    print("✓ Server started successfully")
    return server_process

def open_browser():
    """Open the browser game"""
    print("Opening browser game...")
    url = "http://localhost:8787/index_multiplayer.html"
    webbrowser.open(url)
    print("✓ Browser opened")
    
    # Give user time to start the game manually
    print("\n" + "="*50)
    print("IMPORTANT: Please manually start the game in the browser!")
    print("1. Click the 'Start/Restart' button in the game")
    print("2. Wait for the game to begin")
    print("3. Then press Enter here to continue...")
    print("="*50)
    input()

def run_agent():
    """Run the RL agent"""
    print("Starting RL agent...")
    
    # Import and run the environment
    try:
        from browser_hero_env import BrowserHeroEnv
        
        env = BrowserHeroEnv()
        print("✓ Environment created successfully")
        
        # Test the environment
        obs, info = env.reset()
        print(f"✓ Initial observation received: {obs.shape}")
        
        # Run a few test steps
        for i in range(5):
            action = env.action_space.sample()
            obs, reward, done, truncated, info = env.step(action)
            print(f"Step {i+1}: reward={reward:.2f}, done={done}")
            if done:
                break
        
        env.close()
        print("✓ Agent test completed successfully")
        
    except Exception as e:
        print(f"✗ Error running agent: {e}")
        return False
    
    return True

def main():
    print("Browser Hero RL Agent Setup")
    print("="*30)
    
    # Check if we're in the right directory
    if not Path("server.js").exists():
        print("Error: server.js not found. Please run this script from the research directory.")
        return
    
    # Start server
    server_process = start_server()
    if not server_process:
        return
    
    try:
        # Open browser
        open_browser()
        
        # Run agent
        success = run_agent()
        
        if success:
            print("\n🎉 Everything is working! You can now:")
            print("1. Keep the browser game running")
            print("2. Run your training scripts")
            print("3. The agent will connect to the running game")
            
    finally:
        # Clean up
        if server_process:
            print("\nShutting down server...")
            server_process.terminate()
            server_process.wait()
            print("✓ Server stopped")

if __name__ == "__main__":
    main()

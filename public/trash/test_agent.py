#!/usr/bin/env python3
"""
Simple test script for the BrowserHeroEnv
Run this AFTER starting the game in the browser
"""

import time
from browser_hero_env import BrowserHeroEnv

def test_agent():
    print("Testing BrowserHeroEnv...")
    print("Make sure the game is running in the browser first!")
    print("="*50)
    
    try:
        # Create environment
        print("Creating environment...")
        env = BrowserHeroEnv()
        print("✓ Environment created")
        
        # Reset and get initial observation
        print("Getting initial observation...")
        obs, info = env.reset()
        print(f"✓ Initial observation: {obs.shape} = {obs}")
        
        # Run a few steps
        print("\nRunning test steps...")
        total_reward = 0
        
        for i in range(10):
            # Take random action
            action = env.action_space.sample()
            obs, reward, done, truncated, info = env.step(action)
            
            print(f"Step {i+1}: reward={reward:.2f}, done={done}")
            total_reward += reward
            
            if done:
                print("Episode finished!")
                break
        
        print(f"\nTotal reward: {total_reward:.2f}")
        
        # Close environment
        env.close()
        print("✓ Test completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

if __name__ == "__main__":
    success = test_agent()
    if success:
        print("\n🎉 Agent is working correctly!")
        print("You can now run your training scripts.")
    else:
        print("\n❌ Agent test failed.")
        print("Make sure:")
        print("1. The game server is running (node server.js)")
        print("2. The browser game is open and started")
        print("3. You clicked 'Start/Restart' in the browser")

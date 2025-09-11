#!/usr/bin/env python3
"""
Train RL agent on the real browser game using BrowserHeroEnv
"""

import os
import sys
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
from stable_baselines3.common.callbacks import CheckpointCallback
import time

# Import our custom environment
from game_env import BrowserHeroEnv


def create_env():
    """Create the browser game environment"""
    return BrowserHeroEnv(
        server_url="ws://localhost:8787",
        room_id="training-room",
        step_timeout_sec=0.5,
        connect_timeout_sec=5.0,
        max_episode_steps=2000
    )


def main():
    print("🎮 Starting Browser Hero RL Training")
    print("Make sure the game server is running on http://localhost:8787")
    print("And the game is accessible in your browser")
    
    # Create environment
    print("🔌 Connecting to browser game...")
    env = create_env()
    
    # Create PPO model directly with the environment
    print("🤖 Creating PPO model...")
    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        verbose=1
    )
    
    # Setup checkpointing
    if not os.path.exists('models'):
        os.makedirs('models')
    
    checkpoint_callback = CheckpointCallback(
        save_freq=10000,
        save_path="./models/",
        name_prefix="browser_hero_ppo"
    )
    
    # Train the model
    print("🚀 Starting training...")
    print("The agent will now play the game and learn!")
    print("You can watch it in your browser at http://localhost:8787")
    
    try:
        model.learn(
            total_timesteps=100000,
            callback=checkpoint_callback
        )
            
            # Save final model
        final_model_path = "models/browser_hero_ppo_final.zip"
        model.save(final_model_path)
        print(f"✅ Training complete! Model saved to {final_model_path}")
            
    except KeyboardInterrupt:
        print("\n⏹️ Training interrupted by user")
        # Save model anyway
        final_model_path = "models/browser_hero_ppo_interrupted.zip"
        model.save(final_model_path)
        print(f"💾 Model saved to {final_model_path}")
    
    finally:
        env.close()
        print("🔌 Environment closed")


if __name__ == "__main__":
    main()

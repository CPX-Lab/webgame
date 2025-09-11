#!/usr/bin/env python3
# scrap this file 
'''
"""
Script to download a pre-trained PPO model for the RL agent.
This will download a model that can be used with stable-baselines3.
"""

import os
from pathlib import Path
from huggingface_sb3 import load_from_hub

def download_lunarlander_model():
    """Download the LunarLander PPO model from Hugging Face"""
    
    # Create models directory if it doesn't exist
    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    
    model_path = models_dir / "ppo_model.zip"
    
    print("Downloading LunarLander PPO model from Hugging Face...")
    print(f"Model will be saved to: {model_path}")
    
    try:
        # Download the specific LunarLander model
        checkpoint = load_from_hub(
            repo_id="sb3/ppo-LunarLander-v2",
            filename="ppo-LunarLander-v2.zip",
        )
        
        print(f"✅ Model downloaded successfully!")
        print(f"Checkpoint path: {checkpoint}")
        
        # Copy to our models directory with the expected name
        import shutil
        shutil.copy2(checkpoint, model_path)
        
        print(f"✅ Model copied to {model_path}")
        
        # Verify the file
        if model_path.exists():
            file_size = model_path.stat().st_size
            print(f"File size: {file_size / 1024 / 1024:.2f} MB")
            
            # Test loading the model
            try:
                from stable_baselines3 import PPO
                model = PPO.load(str(model_path))
                print("✅ Model loaded successfully!")
                print(f"Model type: {type(model)}")
                return True
            except Exception as e:
                print(f"❌ Error loading model: {e}")
                return False
        else:
            print("❌ Download failed - file not found")
            return False
            
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return False

def create_simple_model():
    """Create a simple PPO model as fallback"""
    try:
        from stable_baselines3 import PPO
        from stable_baselines3.common.vec_env import DummyVecEnv
        import gymnasium as gym
        
        print("Creating a simple PPO model as fallback...")
        
        # Create a simple environment (CartPole for demonstration)
        env = DummyVecEnv([lambda: gym.make('CartPole-v1')])
        
        # Create and train a simple PPO model
        model = PPO("MlpPolicy", env, verbose=1)
        model.learn(total_timesteps=1000)  # Quick training
        
        # Save the model
        models_dir = Path("models")
        models_dir.mkdir(exist_ok=True)
        model_path = models_dir / "ppo_model.zip"
        model.save(str(model_path))
        
        print(f"✅ Simple model created and saved to {model_path}")
        return True
        
    except Exception as e:
        print(f"❌ Error creating simple model: {e}")
        return False

if __name__ == "__main__":
    print("=== RL Agent Model Downloader ===\n")
    
    # Try to download LunarLander model first
    if download_lunarlander_model():
        print("\n🎉 Success! You now have the LunarLander PPO model.")
        print("The RL agent will use this pre-trained model for intelligent gameplay.")
    else:
        print("\n⚠️  Download failed. Creating a simple model instead...")
        if create_simple_model():
            print("\n✅ Simple model created successfully!")
        else:
            print("\n❌ Failed to create model. The RL agent will use heuristic AI only.")
    
    print("\n=== Setup Complete ===")
'''
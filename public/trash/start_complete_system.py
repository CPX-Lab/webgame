#!/usr/bin/env python3
"""
Complete system startup script
Starts server, opens browser, then runs auto-start trainer
"""

import subprocess
import time
import webbrowser
import os
import sys
from pathlib import Path

def start_server():
    """Start the Node.js server"""
    print("🚀 Starting Node.js server...")
    
    # Check if server is already running
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('localhost', 8787))
        sock.close()
        
        if result == 0:
            print("✅ Server already running on port 8787")
            return True
    except:
        pass
    
    # Start server
    server_process = subprocess.Popen(
        ["node", "server.js"],
        cwd=Path(__file__).parent.parent,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for server to start
    time.sleep(3)
    
    # Check if server started successfully
    if server_process.poll() is not None:
        stdout, stderr = server_process.communicate()
        print(f"❌ Server failed to start: {stderr.decode()}")
        return False
    
    print("✅ Server started successfully")
    return True

def open_browser():
    """Open the browser game"""
    print("🌐 Opening browser game...")
    url = "http://localhost:8787/index_multiplayer.html"
    webbrowser.open(url)
    print("✅ Browser opened")
    print("\n" + "="*60)
    print("🎮 GAME SETUP INSTRUCTIONS:")
    print("="*60)
    print("1. Wait for the game page to load")
    print("2. Click the 'Start/Restart' button")
    print("3. Wait for the game to begin (you'll see players/enemies)")
    print("4. The RL agent will automatically start training!")
    print("="*60)

def run_auto_trainer():
    """Run the auto-start trainer"""
    print("🤖 Starting auto-start trainer...")
    
    # Import and run the auto trainer
    try:
        from auto_train_agent import AutoStartTrainer
        
        trainer = AutoStartTrainer()
        trainer.run()
        
    except Exception as e:
        print(f"❌ Error running trainer: {e}")
        return False
    
    return True

def main():
    print("🎯 Browser Hero Complete System Startup")
    print("="*40)
    
    # Check if we're in the right directory
    if not Path("server.js").exists():
        print("❌ Error: server.js not found. Please run this script from the research directory.")
        return
    
    # Step 1: Start server
    if not start_server():
        print("❌ Failed to start server")
        return
    
    # Step 2: Open browser
    open_browser()
    
    # Step 3: Run auto trainer
    print("\n⏳ Waiting 5 seconds for browser to load...")
    time.sleep(5)
    
    success = run_auto_trainer()
    
    if success:
        print("\n🎉 System running successfully!")
    else:
        print("\n❌ System startup failed")

if __name__ == "__main__":
    main()

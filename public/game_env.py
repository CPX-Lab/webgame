# browser_hero_env.py
import asyncio, json, threading, time, queue
from typing import Optional, Tuple

import numpy as np
import gymnasium as gym
from gymnasium import spaces
import websockets


def _nearest(player, objs):
    if not objs:
        return None
    px, py = player["x"], player["y"]
    best, best_d2 = None, float("inf")
    for o in objs:
        d2 = (o["x"] - px) ** 2 + (o["y"] - py) ** 2
        if d2 < best_d2:
            best_d2, best = d2, o
    return best


class BrowserHeroEnv(gym.Env):
    """
    Gymnasium Env that talks to your browser game over websockets.
    NOTE: SB3 does NOT support Dict action spaces; keep actions as a single Box.
    """
    metadata = {"render_modes": []}

    def __init__(
        self,
        server_url: str = "ws://localhost:8787",
        room_id: str = "training-room",
        step_timeout_sec: float = 0.5,
        connect_timeout_sec: float = 5.0,
        max_episode_steps: int = 2000,
    ):
        super().__init__()
        self.server_url = server_url
        self.room_id = room_id
        self.step_timeout_sec = step_timeout_sec
        self.connect_timeout_sec = connect_timeout_sec
        self.max_episode_steps = max_episode_steps

        # Observation: your 11-D vector
        self.observation_space = spaces.Box(
            low=np.array([0, 0, 0, 0, 0, 0, -1, -1, 0, -1, -1], dtype=np.float32),
            high=np.array([1, 1, 1, 1, 1, 1,  1,  1, 1,  1,  1], dtype=np.float32),
            dtype=np.float32,
        )

        # Action: 7-D Box (vx, vy, shoot, dash, shield, ult, reload)
        # We will threshold the last 5 to booleans in step()
        self.action_space = spaces.Box(
            low=np.array([-1, -1, 0, 0, 0, 0, 0], dtype=np.float32),
            high=np.array([ 1,  1, 1, 1, 1, 1, 1], dtype=np.float32),
            dtype=np.float32,
        )

        # Async bridge
        self._state_q: queue.Queue = queue.Queue(maxsize=1)
        self._action_q: queue.Queue = queue.Queue(maxsize=1)
        self._stop = threading.Event()
        self._ws_thread: Optional[threading.Thread] = None

        self._player_id: Optional[str] = None
        self._last_raw_state = None
        self._step_count = 0

        # Start websocket thread and wait for first state
        self._start_ws_thread()
        # Give the websocket thread a moment to establish connection
        time.sleep(0.5)
        self._await_player_and_first_state()

    # ---------- Websocket layer ----------
    def _start_ws_thread(self):
        self._ws_thread = threading.Thread(target=self._ws_thread_main, daemon=True)
        self._ws_thread.start()

    def _ws_thread_main(self):
        asyncio.run(self._ws_main())

    async def _ws_main(self):
        try:
            async with websockets.connect(self.server_url) as ws:
                # Wait for playerId
                self._player_id = await self._await_player_id(ws)
                # Join room
                await ws.send(json.dumps({"type": "joinRoom", "roomId": self.room_id}))

                async def reader():
                    async for msg in ws:
                        try:
                            data = json.loads(msg)
                        except json.JSONDecodeError:
                            continue
                        if data.get("type") == "gameState":
                            st = data.get("state", {})
                            print(f"Received gameState with {len(st.get('players', []))} players")
                            try:
                                self._state_q.put_nowait(st)
                            except queue.Full:
                                try:
                                    _ = self._state_q.get_nowait()
                                except queue.Empty:
                                    pass
                                self._state_q.put_nowait(st)
                        elif data.get("type") == "playerId":
                            self._player_id = data.get("playerId", self._player_id)

                async def writer():
                    loop = asyncio.get_event_loop()
                    while not self._stop.is_set():
                        try:
                            action = await loop.run_in_executor(None, self._action_q.get)
                            await ws.send(json.dumps(action))
                        except Exception:
                            await asyncio.sleep(0.01)

                await asyncio.gather(reader(), writer())
        except Exception as e:
            # If connection dies, env.step/reset will time out (handled below)
            print(f"Websocket connection error: {e}")
            pass

    async def _await_player_id(self, ws) -> str:
        deadline = time.time() + self.connect_timeout_sec
        while time.time() < deadline:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=0.2)
                data = json.loads(msg)
            except (asyncio.TimeoutError, json.JSONDecodeError):
                continue
            if data.get("type") == "playerId":
                print(f"Received playerId: {data.get('playerId')}")
                return data.get("playerId")
        raise TimeoutError("Timed out waiting for playerId from server")

    def _await_player_and_first_state(self):
        deadline = time.time() + self.connect_timeout_sec
        while time.time() < deadline:
            try:
                st = self._state_q.get(timeout=0.2)
                self._last_raw_state = st
                return
            except queue.Empty:
                # Check if websocket thread is still alive
                if self._ws_thread and not self._ws_thread.is_alive():
                    raise RuntimeError("Websocket thread died before receiving first gameState")
                pass
        
        # If we timeout, provide a helpful error message
        print("\n" + "="*60)
        print("❌ TIMEOUT: No game state received!")
        print("="*60)
        print("This usually means:")
        print("1. The game server is not running")
        print("2. The game is not started in the browser")
        print("3. No players are sending game states")
        print("\nTo fix this:")
        print("1. Start the server: node server.js")
        print("2. Open: http://localhost:8787/index_multiplayer.html")
        print("3. Click 'Start/Restart' in the browser game")
        print("4. Then run your agent again")
        print("="*60)
        raise RuntimeError("Timed out waiting for first gameState. Make sure the game server is running and the game is started in the browser.")

    # ---------- Observation / Reward ----------
    def _extract_me(self, st: dict) -> Optional[dict]:
        ps = st.get("players", [])
        if not ps:
            return None
        if self._player_id is None:
            return ps[0]
        for p in ps:
            if p.get("id") == self._player_id:
                return p
        return ps[0]

    def _to_obs(self, st: dict) -> np.ndarray:
        me = self._extract_me(st)
        if me is None:
            return np.zeros((11,), dtype=np.float32)

        player_x = me["x"] / 2600
        player_y = me["y"] / 1500
        player_hp = me["hp"] / max(1, me["maxHp"])
        player_ult = me["ult"] / max(1, me["maxUlt"])
        player_ammo = me["ammo"] / max(1, me["maxAmmo"])
        reloading = 1.0 if me.get("reloading", False) else 0.0

        enemy = _nearest(me, st.get("enemies", []))
        if enemy:
            enemy_rel_x = (enemy["x"] - me["x"]) / 2600
            enemy_rel_y = (enemy["y"] - me["y"]) / 1500
            enemy_hp = enemy["hp"] / max(1, enemy["maxHp"])
        else:
            enemy_rel_x = enemy_rel_y = enemy_hp = 0.0

        bullets = [b for b in st.get("bullets", []) if not b.get("isPlayer", True)]
        bullet = _nearest(me, bullets)
        if bullet:
            bullet_rel_x = (bullet["x"] - me["x"]) / 2600
            bullet_rel_y = (bullet["y"] - me["y"]) / 1500
        else:
            bullet_rel_x = bullet_rel_y = 0.0

        return np.array(
            [player_x, player_y, player_hp, player_ult, player_ammo, reloading,
             enemy_rel_x, enemy_rel_y, enemy_hp, bullet_rel_x, bullet_rel_y],
            dtype=np.float32,
        )

    def _reward(self, st: dict) -> float:
        me = self._extract_me(st)
        if me is None:
            return 0.0
        r = 0.0
        r += 1.0
        r += (me["hp"] / max(1, me["maxHp"])) * 2.0
        r += me.get("score", 0) * 0.01
        r += (me["ammo"] / max(1, me["maxAmmo"])) * 0.5
        if me["hp"] < 50: r -= 5.0
        px, py = me["x"], me["y"]
        n_close = sum(1 for e in st.get("enemies", [])
                      if (e["x"]-px)**2 + (e["y"]-py)**2 < 100**2)
        if n_close > 3: r -= 2.0
        return float(r)

    # ---------- Gymnasium API ----------
    def reset(self, seed: Optional[int] = None, options: Optional[dict] = None) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        self._step_count = 0
        # Optional: tell server to reset if supported
        # self._put_action({"type": "reset"})
        raw = self._get_next_state_or_timeout(self.step_timeout_sec, raise_on_timeout=True)
        self._last_raw_state = raw
        obs = self._to_obs(raw)
        return obs, {}

    def step(self, action):
        self._step_count += 1
        a = np.asarray(action, dtype=np.float32).ravel()
        msg = {
            "type": "aiAction",
            "vx": float(a[0]),
            "vy": float(a[1]),
            "shoot":  bool(a[2] > 0.5),
            "dash":   bool(a[3] > 0.5),
            "shield": bool(a[4] > 0.5),
            "ult":    bool(a[5] > 0.5),
            "reload": bool(a[6] > 0.5),
        }
        self._put_action(msg)
        raw = self._get_next_state_or_timeout(self.step_timeout_sec, raise_on_timeout=False)
        if raw is None:
            obs = self._to_obs(self._last_raw_state) if self._last_raw_state else self.observation_space.sample()
            return obs, -0.01, False, True, {"timeout": True}

        self._last_raw_state = raw
        obs = self._to_obs(raw)
        rew = self._reward(raw)
        done = self._step_count >= self.max_episode_steps
        return obs, rew, done, False, {}

    def _put_action(self, action):
        try:
            self._action_q.put_nowait(action)
        except queue.Full:
            try:
                _ = self._action_q.get_nowait()
            except queue.Empty:
                pass
            self._action_q.put_nowait(action)

    def _get_next_state_or_timeout(self, timeout_sec: float, raise_on_timeout: bool = False):
        try:
            return self._state_q.get(timeout=timeout_sec)
        except queue.Empty:
            if raise_on_timeout:
                raise TimeoutError(f"Timed out waiting {timeout_sec}s for game state")
            return None

    def close(self):
        self._stop.set()
        if self._ws_thread:
            self._ws_thread.join(timeout=1.0)


# Test the environment
if __name__ == "__main__":
    env = BrowserHeroEnv()
    obs, info = env.reset()
    print(f"Initial observation: {obs}")
    
    for i in range(10):
        action = env.action_space.sample()
        obs, reward, done, truncated, info = env.step(action)
        print(f"Step {i}: reward={reward:.2f}, done={done}")
        if done:
            break
    
    env.close()

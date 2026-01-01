# Minecraft Bot - Protocol 773 (Java Edition 1.21.10)

A custom Minecraft bot with intelligent A* pathfinding and advanced navigation for Minecraft Java Edition 1.21.10.

## Features

- ✅ **Advanced Pathfinding**: A* algorithm with long-distance hierarchical planning
- ✅ **4-Stage Obstacle Avoidance**: Jump → Strafe → Backup → Reroute
- ✅ **Hazard Awareness**: Avoids lava, high-cost water pathing
- ✅ **Movement Smoothing**: Human-like angular interpolation
- ✅ **Chunk-Aware Navigation**: Handles unloaded chunks gracefully
- ✅ **Physics Simulation**: Gravity, jumping, collision detection
- ✅ **Chat Commands**: Control bot via in-game chat
- ✅ **Multi-Bot Support**: Run multiple bots simultaneously

---

## Quick Start

### 1. Install Node.js (v16+)
Download from [nodejs.org](https://nodejs.org/)

### 2. Configure
Edit `config.js`:
```javascript
module.exports = {
    host: 'your-server.com',  // Server address
    port: 25565,              // Server port
    username: 'Bot',          // Bot's username
    protocolVersion: 773,     // Don't change
    version: '1.21.10'        // Don't change
};
```

### 3. Run
```bash
node bot.js           # Single bot
node multi-bot.js     # Multiple bots
```

---

## Chat Commands

| Command | Description | Example |
|---------|-------------|---------|
| `come Bot <x> <y> <z>` | Navigate to coordinates | `come Bot 100 64 200` |
| `stop Bot` | Stop movement | `stop Bot` |
| `pos Bot` | Show position | `pos Bot` |

---

## Project Structure

```
minecraftbot_1.21.10/
├── bot.js                  # Single bot launcher
├── multi-bot.js            # Multi-bot launcher
├── config.js               # Bot configuration
├── bots.config.js          # Multi-bot profiles
└── src/
    ├── client.js           # Bot client
    ├── movement-advanced.js # Navigation & physics
    ├── pathfinder-advanced.js # A* pathfinding
    ├── world-advanced.js   # World state & collision
    ├── chunk-parser.js     # Chunk data parsing
    ├── commands.js         # Chat command handler
    └── protocol/           # Network protocol
```

---

## Advanced Navigation

### Pathfinding Modes
- **Short-range (<100 blocks)**: Direct A* pathfinding
- **Long-range (>100 blocks)**: Hierarchical waypoint system

### Obstacle Avoidance Stages
| Stage | Ticks | Action |
|-------|-------|--------|
| 1 | 5-15 | Jump attempt |
| 2 | 16-30 | Lateral strafe |
| 3 | 31-45 | Backup |
| 4 | 46+ | Path recalculation |

### Movement Costs
| Terrain | Cost |
|---------|------|
| Normal | 1.0 |
| Unloaded chunk | +5.0 |
| Water | +8.0 |
| Lava | ∞ (blocked) |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| ECONNREFUSED | Check server is running and address is correct |
| ECONNRESET | Server may not support Protocol 773 (1.21.10) |
| Bot stuck | 4-stage avoidance will kick in automatically |
| No path found | Target may be in unloaded chunk - bot will wait |

---

## Requirements

- Node.js v16+
- Minecraft Java 1.21.10 server (offline mode recommended)
- ~100 MB RAM

---

## License

Educational purposes only.

**Happy botting! 🤖⛏️**

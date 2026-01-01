# Minecraft Bot - Protocol 773 (Java Edition 1.21.10)

A custom Minecraft bot implementation with intelligent pathfinding and world-aware navigation for Minecraft Java Edition 1.21.10.

## Features

- ✅ **Smart Pathfinding**: A* algorithm with obstacle avoidance
- ✅ **World Collision Detection**: Navigates around walls and terrain
- ✅ **Physics Simulation**: Realistic gravity, jumping, and ground detection
- ✅ **Chat Commands**: Control bot via in-game chat
- ✅ **Chunk Tracking**: Loads and tracks terrain data
- ✅ **Auto-reconnect**: Handles server disconnections

---

## Prerequisites

### Required Software

1. **Node.js** (v16 or higher)
   - **Windows**: Download from [nodejs.org](https://nodejs.org/)
     - Choose "LTS" version (recommended)
     - Run the installer (`.msi` file)
     - During installation, check "Add to PATH"
   - **macOS**: Download from [nodejs.org](https://nodejs.org/) or use Homebrew:
     ```bash
     brew install node
     ```
   - **Linux**: 
     ```bash
     # Ubuntu/Debian
     sudo apt update
     sudo apt install nodejs npm
     
     # Fedora
     sudo dnf install nodejs
     ```

2. **Minecraft Java Edition 1.21.10 Server**
   - The server must be running Protocol 773
   - Offline mode servers work best (no authentication required)

---

## Installation

### Step 1: Download/Clone the Project

**Option A - If you have the folder:**
- Simply copy the entire project folder to your PC

**Option B - If using Git:**
```bash
git clone <repository-url>
cd <project-folder>
```

### Step 2: Install Dependencies

Open a terminal/command prompt in the project folder and run:

```bash
npm install
```

> **Note**: Currently, this bot has **zero dependencies**! It's built entirely from scratch using only Node.js built-in modules.

---

## Configuration

### Edit `config.js`

Open [`config.js`](file:///d:/others/New%20folder%20%285%29/config.js) and update the settings:

```javascript
module.exports = {
    host: 'commercial-tft.gl.joinmc.link',  // ← Server address
    port: 25565,                             // ← Server port
    username: 'Bot',                         // ← Bot's username
    protocolVersion: 773,                    // ← Don't change (for 1.21.10)
    version: '1.21.10'                       // ← Minecraft version
};
```

**What to change:**
- `host` - Your Minecraft server address (IP or domain)
- `port` - Server port (default: 25565)
- `username` - What you want the bot to be called
- `protocolVersion` & `version` - **DO NOT CHANGE** (required for 1.21.10)

---

## Running the Bot

### Single Bot Mode

**Start One Bot:**
```bash
npm start
```
or
```bash
node bot.js
```

### Multi-Bot Mode 🆕

**Start Multiple Bots Simultaneously:**

1. **Edit `bots.config.js`** to configure your bot profiles:
   ```javascript
   bots: [
       { username: 'BotAlpha', enabled: true },
       { username: 'BotBeta', enabled: true },
       { username: 'BotGamma', enabled: true }
   ]
   ```

2. **Launch all enabled bots:**
   ```bash
   node multi-bot.js
   ```

3. **Or limit the number of bots:**
   ```bash
   node multi-bot.js --count 2    # Start only first 2 bots
   ```

4. **View help:**
   ```bash
   node multi-bot.js --help
   ```

### What You Should See

```
========================================
 Minecraft Bot - Protocol 773 (1.21.10)
========================================
Server: commercial-tft.gl.joinmc.link:25565
Username: Bot

[Client] Connecting to commercial-tft.gl.joinmc.link:25565 as Bot...
[Connection] Connected to commercial-tft.gl.joinmc.link:25565
[Handshake] Sent handshake
[Login] Login success: Bot (UUID: ...)
[Play] Joined game! Entity ID: 123
[Play] Position sync: x=0.00, y=64.00, z=0.00
[World] Stored chunk (0, 0) - Total chunks: 1
```

### Stop the Bot

Press `Ctrl+C` in the terminal

---

## Usage

### Chat Commands

Once the bot is in the game, control it using in-game chat:

| Command | Description | Example |
|---------|-------------|---------|
| `come Bot <x> <y> <z>` | Move to coordinates | `come Bot 100 64 200` |
| `stop Bot` | Stop movement | `stop Bot` |
| `pos Bot` | Show bot position | `pos Bot` |

**Notes:**
- Commands are **case-insensitive**
- Bot name must match the `username` in `config.js`
- Replace `Bot` with your configured username

### Example Session

```
Player: come Bot 100 65 50
Bot: Moving to (100, 65, 50) - 150 blocks away
[Bot navigates to location]
Bot: Arrived at destination!

Player: pos Bot
[Console shows: Position: X: 100.00, Y: 65.00, Z: 50.00]

Player: stop Bot
Bot: Movement stopped.
```

---

## Project Structure

```
minecraft-bot/
├── bot.js              # Single bot launcher
├── multi-bot.js        # Multi-bot launcher 🆕
├── config.js           # Single bot configuration
├── bots.config.js      # Multi-bot configuration 🆕
├── package.json        # Project metadata
├── README.md           # This file
└── src/
    ├── client.js       # Bot client class
    ├── bot-manager.js  # Multi-bot orchestrator 🆕
    ├── commands.js     # Chat command handler
    ├── movement.js     # Pathfinding & physics
    ├── world.js        # World state tracking
    ├── protocol/       # Low-level protocol handling
    │   ├── connection.js
    │   └── packet.js
    └── states/         # Protocol state handlers
        ├── handshake.js
        ├── login.js
        ├── config.js
        └── play.js
```

---

## Troubleshooting

### "Cannot find module 'X'"
**Solution**: Run `npm install` in the project folder

### "ECONNREFUSED" or "Connection refused"
**Causes**:
- Server is offline
- Wrong server address in `config.js`
- Server firewall blocking connection

**Solution**: 
1. Check server is running
2. Verify `host` and `port` in `config.js`
3. Try connecting with vanilla Minecraft client first

### "ECONNRESET" - Connection reset
**Causes**:
- Server doesn't support Protocol 773 (not 1.21.10)
- Server has anti-bot protection
- Server requires authentication

**Solution**:
1. Verify server is running Minecraft 1.21.10
2. Use offline-mode servers (authentication disabled)
3. Check server console for rejection messages

### Bot falls through ground
**Fixed!** This was a bug that has been resolved. If you still see this:
1. Ensure you have the latest code
2. Check that chunks are loading: look for `[World] Stored chunk` messages

### Bot walks through walls
**Fixed!** Make sure:
1. Chunks are loading properly
2. You see `[World] Stored chunk` messages in console
3. You have the updated `world.js` with collision detection

### "Unknown packet ID"
This means the server sent a packet the bot doesn't recognize. This is usually harmless - the bot will ignore it and continue. If it crashes, the packet might be critical.

---

## Advanced Configuration

### Changing Bot Behavior

Edit [`src/movement.js`](file:///d:/others/New%20folder%20%285%29/src/movement.js) to adjust:

```javascript
// Line ~23
this.speed = 4.3;           // Movement speed (blocks/sec)
this.tickRate = 100;        // Update frequency (ms)
this.maxStuckTicks = 20;    // Stuck detection threshold

// Line ~32-33
this.gravity = -0.08;       // Gravity strength
this.jumpVelocity = 0.42;   // Jump height
```

### Debug Output

The bot logs extensively to help debugging:
- `[Connection]` - Network events
- `[Play]` - Game state updates
- `[Movement]` - Pathfinding decisions
- `[World]` - Chunk loading
- `[Chat]` - Chat messages

---

## System Requirements

- **Operating System**: Windows, macOS, or Linux
- **Node.js**: v16.0.0 or higher
- **RAM**: 100 MB minimum
- **Network**: Internet connection to Minecraft server
- **Disk Space**: ~10 MB

---

## Known Limitations

1. **No full chunk parsing** - Bot uses simplified collision detection
2. **Simple block types** - All non-air blocks treated as solid
3. **No combat** - Bot doesn't fight mobs or players
4. **No item interaction** - Can't pick up items or use tools
5. **Pathfinding timeout** - Very long paths (>100 blocks) may timeout

---

## FAQ

**Q: Does this work on Minecraft Bedrock Edition?**  
A: No, this is **Java Edition only** (Protocol 773 = Java 1.21.10)

**Q: Can I use this on a server with authentication?**  
A: Currently only offline-mode servers are supported

**Q: Will this get me banned?**  
A: Depends on server rules. Many servers prohibit bots. Use responsibly!

**Q: Can I run multiple bots?**  
A: Yes! Use `node multi-bot.js` to run multiple bots simultaneously. Edit `bots.config.js` to configure bot profiles.

**Q: How do I change the bot's name?**  
A: Edit `username` in `config.js`

**Q: Can the bot place/break blocks?**  
A: Not yet - this is a pathfinding-focused bot

---

## License

This project is for educational purposes.

---

## Credits

Built from scratch using:
- Node.js built-in modules (`net`, `events`, `buffer`)
- Minecraft Protocol 773 specification
- A* pathfinding algorithm

---

## Support

If you encounter issues:
1. Check [Troubleshooting](#troubleshooting) section
2. Verify server compatibility (1.21.10, offline mode)
3. Check console output for error messages
4. Ensure `config.js` is correctly configured

---

**Happy botting! 🤖⛏️**

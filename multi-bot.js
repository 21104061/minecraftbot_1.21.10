/**
 * Multi-Bot Launcher
 * Runs multiple Minecraft bots simultaneously
 */

const { BotManager } = require('./src/bot-manager');
const botsConfig = require('./bots.config');

// Parse command line arguments
const args = process.argv.slice(2);
let botCount = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' || args[i] === '-c') {
        botCount = parseInt(args[i + 1]);
        if (isNaN(botCount) || botCount < 1) {
            console.error('Invalid bot count. Must be a positive integer.');
            process.exit(1);
        }
        i++; // Skip next arg
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log('Multi-Bot Launcher');
        console.log('');
        console.log('Usage: node multi-bot.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  -c, --count <number>  Number of bots to start (default: all enabled in config)');
        console.log('  -h, --help           Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  node multi-bot.js                Start all enabled bots');
        console.log('  node multi-bot.js --count 2      Start only the first 2 bots');
        process.exit(0);
    }
}

// Limit number of bots if specified
let config = botsConfig;
if (botCount !== null) {
    config = {
        ...botsConfig,
        bots: botsConfig.bots.filter(b => b.enabled !== false).slice(0, botCount)
    };
    console.log(`[Launcher] Limiting to ${botCount} bot(s)`);
}

// Create bot manager
const manager = new BotManager(config);

// Manager event handlers
manager.on('bot_login', ({ botId, username }) => {
    console.log(`[Launcher] ✓ ${botId} logged in as ${username}`);
});

manager.on('bot_spawn', ({ botId, entityId }) => {
    console.log(`[Launcher] ✓ ${botId} spawned (Entity ID: ${entityId})`);
});

manager.on('bot_disconnect', ({ botId, reason }) => {
    console.log(`[Launcher] ✗ ${botId} disconnected: ${reason}`);
});

manager.on('bot_error', ({ botId, error }) => {
    console.error(`[Launcher] ✗ ${botId} error: ${error.message}`);
});

manager.on('all_started', () => {
    console.log('');
    console.log('========================================');
    console.log(' All Bots Active');
    console.log('========================================');
    console.log('Press Ctrl+C to stop all bots');
    console.log('');
});

manager.on('all_stopped', () => {
    console.log('[Launcher] Shutdown complete');
    process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('');
    console.log('[Launcher] Shutting down all bots...');
    manager.stopAll();
});

process.on('SIGTERM', () => {
    console.log('');
    console.log('[Launcher] Shutting down all bots...');
    manager.stopAll();
});

// Global error handler
process.on('uncaughtException', (err) => {
    console.error('[Launcher] Uncaught exception:', err);
    manager.stopAll();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Launcher] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start all bots
manager.startAll().catch((err) => {
    console.error(`[Launcher] Failed to start bots: ${err.message}`);
    process.exit(1);
});

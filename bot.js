/**
 * Minecraft Bot for 1.21.10 (Protocol 773)
 * Custom protocol implementation
 */

const { MinecraftClient } = require('./src/client');
const { CommandHandler } = require('./src/commands');
const { EntityTracker } = require('./src/entities');
const { logger, setLogLevel } = require('./src/logger');
const config = require('./config');

// Set log level from environment variable or default to INFO
// Use DEBUG for verbose output, INFO for important events only
setLogLevel(process.env.LOG_LEVEL || 'INFO');

logger.always('========================================');
logger.always(' Minecraft Bot - Protocol 773 (1.21.10)');
logger.always('========================================');
logger.always(`Server: ${config.host}:${config.port}`);
logger.always(`Username: ${config.username}`);
logger.always('');

// Create client
const client = new MinecraftClient({
    host: config.host,
    port: config.port,
    username: config.username,
    customUUID: config.customUUID,
    protocolVersion: config.protocolVersion
});

// Initialize command handler
const commands = new CommandHandler(client, config.username);
logger.info('[Bot] Command handler initialized');

// Event handlers
client.on('login', ({ uuid, username }) => {
    logger.info('[Bot] Successfully logged in!');
});

client.on('configuration_complete', () => {
    logger.debug('[Bot] Configuration complete, entering play state...');
});

client.on('spawn', () => {
    logger.info('[Bot] Spawned in the world!');
    logger.info(`[Bot] Entity ID: ${client.entityId}`);
});

client.on('position', ({ x, y, z }) => {
    logger.debug(`[Bot] Position updated: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
});

client.on('health', ({ health, food }) => {
    logger.info(`[Bot] Health: ${health}/20, Food: ${food}/20`);
});

client.on('chat', (data) => {
    logger.info(`[Bot] Chat received:`, data);
    // Command processing is handled by client.js internally
    // Don't duplicate it here
});

client.on('disconnect', (reason) => {
    logger.always(`[Bot] Disconnected: ${reason}`);
    process.exit(1);
});

client.on('error', (err) => {
    logger.error(`[Bot] Error: ${err.message}`);
});

// Handle process termination
process.on('SIGINT', () => {
    logger.always('\n[Bot] Shutting down...');
    client.disconnect();
    process.exit(0);
});

// Connect
client.connect().catch((err) => {
    logger.error(`[Bot] Failed to connect: ${err.message}`);
    process.exit(1);
});

// Keep alive logging - reduced frequency and moved to debug
setInterval(() => {
    if (client.connection && client.connection.connected) {
        logger.debug(`[Bot] Still connected. Position: ${client.position.x.toFixed(1)}, ${client.position.y.toFixed(1)}, ${client.position.z.toFixed(1)}`);
    }
}, 120000); // Check every 2 minutes instead of 1

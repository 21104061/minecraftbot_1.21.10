/**
 * Quick test script to verify a single bot can receive and process commands
 */

const { MinecraftClient } = require('./src/client');
const config = require('./config');

console.log(' Testing Single Bot Movement');
console.log('========================================');
console.log(`Server: ${config.host}:${config.port}`);
console.log(`Bot: ${config.username}`);
console.log('');
console.log('Commands to test:');
console.log(`  come ${config.username} 100 64 100`);
console.log(`  stop ${config.username}`);
console.log(`  pos ${config.username}`);
console.log('');

// Create client
const client = new MinecraftClient({
    host: config.host,
    port: config.port,
    username: config.username,
    customUUID: config.customUUID,
    protocolVersion: config.protocolVersion
});

// Event handlers
client.on('login', ({ uuid, username }) => {
    console.log('✓ Logged in!');
});

client.on('spawn', () => {
    console.log('✓ Spawned in world!');
    console.log(`Entity ID: ${client.entityId}`);
    console.log('');
    console.log('Bot is ready! Try sending a chat command in-game:');
    console.log(`  come ${config.username} <x> <y> <z>`);
});

client.on('position', ({ x, y, z }) => {
    // Silent - only log on first position
    if (!client.hasReceivedPosition) {
        console.log(`✓ Initial position: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        client.hasReceivedPosition = true;
    }
});

client.on('chat', (data) => {
    if (data.message && data.message.trim()) {
        console.log(`💬 Chat: ${data.message}`);
    }
});

client.on('disconnect', (reason) => {
    console.log(`✗ Disconnected: ${reason}`);
    process.exit(1);
});

client.on('error', (err) => {
    console.error(`✗ Error: ${err.message}`);
});

// Movement feedback
if (client.movement) {
    client.on('arrived', () => {
        console.log('✓ Arrived at destination!');
    });
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\\n[Test] Shutting down...');
    client.disconnect();
    process.exit(0);
});

// Connect
client.connect().catch((err) => {
    console.error(`✗ Failed to connect: ${err.message}`);
    process.exit(1);
});

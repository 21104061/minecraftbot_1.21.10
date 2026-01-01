/**
 * Multi-Bot Configuration
 * Define multiple bot profiles here
 */

module.exports = {
    // Server settings (shared by all bots)
    server: {
        host: 'compare-complexity.gl.joinmc.link',
        port: 25565,
        protocolVersion: 773,
        version: '1.21.10'
    },

    // Bot profiles
    bots: [
        {
            username: 'BotAlpha',
            customUUID: null, // Let it generate from username
            enabled: true
        },
        {
            username: 'BotBeta',
            customUUID: null,
            enabled: true
        },
        {
            username: 'BotGamma',
            customUUID: null,
            enabled: true
        }
        // Add more bots as needed
    ],

    // Global bot settings
    settings: {
        reconnectDelay: 5000, // ms to wait before reconnecting
        maxReconnectAttempts: 3,
        keepAliveInterval: 60000 // ms between keep-alive logs
    }
};

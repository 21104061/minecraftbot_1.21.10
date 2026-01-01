/**
 * Single Bot Configuration
 * Imports server settings from bots.config.js for consistency
 */

const botsConfig = require('./bots.config');

module.exports = {
    // Import server settings from bots.config.js (single source of truth)
    host: botsConfig.server.host,
    port: botsConfig.server.port,
    protocolVersion: botsConfig.server.protocolVersion,
    version: botsConfig.server.version,

    // Single bot specific settings
    username: 'Bot', // Static username - will always be "Bot"
    customUUID: null // Let it generate UUID from username
};

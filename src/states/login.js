/**
 * Login state handler
 */

const { PacketWriter, offlineUUID } = require('../protocol/packet');
const { logger } = require('../logger');

// Clientbound packet IDs (Server -> Client)
const S2C_DISCONNECT = 0x00;
const S2C_ENCRYPTION_REQUEST = 0x01;
const S2C_LOGIN_SUCCESS = 0x02;
const S2C_SET_COMPRESSION = 0x03;
const S2C_LOGIN_PLUGIN_REQUEST = 0x04;
const S2C_COOKIE_REQUEST = 0x05;

// Serverbound packet IDs (Client -> Server)
const C2S_LOGIN_START = 0x00;
const C2S_ENCRYPTION_RESPONSE = 0x01;
const C2S_LOGIN_PLUGIN_RESPONSE = 0x02;
const C2S_LOGIN_ACKNOWLEDGED = 0x03;
const C2S_COOKIE_RESPONSE = 0x04;

/**
 * Setup login state handlers
 * @param {Connection} connection
 * @param {object} client
 */
function setupLoginHandlers(connection, client) {
    // Disconnect
    connection.onPacket('login', S2C_DISCONNECT, (reader) => {
        const reason = reader.readString();
        logger.info(`[Login] Disconnected: ${reason}`);
        client.emit('disconnect', reason);
    });

    // Encryption Request - not needed for offline mode
    connection.onPacket('login', S2C_ENCRYPTION_REQUEST, (reader) => {
        logger.warn('[Login] Encryption requested - online mode not supported');
        client.emit('error', new Error('Online mode not supported'));
    });

    // Set Compression
    connection.onPacket('login', S2C_SET_COMPRESSION, (reader) => {
        const threshold = reader.readVarInt();
        // Silent compression setup
        connection.setCompression(threshold);
    });

    // Login Success
    connection.onPacket('login', S2C_LOGIN_SUCCESS, (reader) => {
        const uuid = reader.readUUID();
        const username = reader.readString();
        // Silent login success

        client.uuid = uuid;
        client.username = username;

        // Send Login Acknowledged to transition to Configuration state
        const ackPacket = new PacketWriter(C2S_LOGIN_ACKNOWLEDGED);
        connection.send(ackPacket.buildData());

        connection.setState('configuration');
        client.emit('login', { uuid, username });
    });

    // Login Plugin Request
    connection.onPacket('login', S2C_LOGIN_PLUGIN_REQUEST, (reader) => {
        const messageId = reader.readVarInt();
        const channel = reader.readString();
        // Silent plugin response

        // Respond with unsuccessful (we don't understand the plugin)
        const response = new PacketWriter(C2S_LOGIN_PLUGIN_RESPONSE)
            .writeVarInt(messageId)
            .writeBoolean(false); // Not successful
        connection.send(response.buildData());
    });

    // Cookie Request
    connection.onPacket('login', S2C_COOKIE_REQUEST, (reader) => {
        const key = reader.readString();
        // Silent cookie response

        // Respond with no cookie
        const response = new PacketWriter(C2S_COOKIE_RESPONSE)
            .writeString(key)
            .writeBoolean(false); // No payload
        connection.send(response.buildData());
    });
}

/**
 * Send login start packet
 * @param {Connection} connection
 * @param {string} username
 * @param {string} customUUID - Optional custom UUID to use instead of generating one
 */
function sendLoginStart(connection, username, customUUID = null) {
    // Silent login start
    const uuid = customUUID || offlineUUID(username);

    const packet = new PacketWriter(C2S_LOGIN_START)
        .writeString(username)
        .writeUUID(uuid);

    const data = packet.buildData();
    connection.send(data);
}

module.exports = {
    setupLoginHandlers,
    sendLoginStart
};

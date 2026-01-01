/**
 * Configuration state handler for Protocol 773 (1.21.10)
 * Based on official Minecraft wiki protocol documentation
 */

const { PacketWriter } = require('../protocol/packet');
const { logger } = require('../logger');

// Clientbound packet IDs (Server -> Client) - Configuration state
const S2C_COOKIE_REQUEST = 0x00;
const S2C_PLUGIN_MESSAGE = 0x01;
const S2C_DISCONNECT = 0x02;
const S2C_FINISH_CONFIGURATION = 0x03;
const S2C_KEEP_ALIVE = 0x04;
const S2C_PING = 0x05;
const S2C_RESET_CHAT = 0x06;
const S2C_REGISTRY_DATA = 0x07;
const S2C_REMOVE_RESOURCE_PACK = 0x08;
const S2C_ADD_RESOURCE_PACK = 0x09;
const S2C_STORE_COOKIE = 0x0A;
const S2C_TRANSFER = 0x0B;
const S2C_FEATURE_FLAGS = 0x0C;
const S2C_UPDATE_TAGS = 0x0D;
const S2C_KNOWN_PACKS = 0x0E;
const S2C_CUSTOM_REPORT_DETAILS = 0x0F;
const S2C_SERVER_LINKS = 0x10;
const S2C_CLEAR_DIALOG = 0x11;
const S2C_SHOW_DIALOG = 0x12;
const S2C_CODE_OF_CONDUCT = 0x13;

// Serverbound packet IDs (Client -> Server) - Configuration state
const C2S_CLIENT_INFORMATION = 0x00;
const C2S_COOKIE_RESPONSE = 0x01;
const C2S_PLUGIN_MESSAGE = 0x02;
const C2S_ACKNOWLEDGE_FINISH = 0x03;
const C2S_KEEP_ALIVE = 0x04;
const C2S_PONG = 0x05;
const C2S_RESOURCE_PACK_RESPONSE = 0x06;
const C2S_KNOWN_PACKS = 0x07;

/**
 * Setup configuration state handlers
 * @param {Connection} connection
 * @param {object} client
 */
function setupConfigurationHandlers(connection, client) {
    // Plugin Message
    connection.onPacket('configuration', S2C_PLUGIN_MESSAGE, (reader) => {
        const channel = reader.readString();
        logger.debug(`[Config] Plugin message: ${channel}`);
    });

    // Disconnect - reason is a Text Component (NBT format in 1.20.3+)
    connection.onPacket('configuration', S2C_DISCONNECT, (reader) => {
        try {
            const rawData = reader.readRemaining();
            const reason = rawData.toString('utf8');
            logger.debug(`[Config] Disconnected: ${reason}`);
            client.emit('disconnect', reason);
        } catch (e) {
            logger.debug('[Config] Disconnected (could not parse reason)');
            client.emit('disconnect', 'Unknown reason');
        }
    });

    // Keep Alive
    connection.onPacket('configuration', S2C_KEEP_ALIVE, (reader) => {
        const id = reader.readLong();
        logger.debug(`[Config] Keep alive: ${id}`);

        const response = new PacketWriter(C2S_KEEP_ALIVE)
            .writeLong(id);
        connection.send(response.buildData());
    });

    // Ping
    connection.onPacket('configuration', S2C_PING, (reader) => {
        const id = reader.readInt();
        logger.debug(`[Config] Ping: ${id}`);

        const response = new PacketWriter(C2S_PONG)
            .writeInt(id);
        connection.send(response.buildData());
    });

    // Registry Data
    connection.onPacket('configuration', S2C_REGISTRY_DATA, (reader) => {
        const registryId = reader.readString();
        logger.debug(`[Config] Registry data: ${registryId}`);
        // Just acknowledge, don't process
    });

    // Feature Flags
    connection.onPacket('configuration', S2C_FEATURE_FLAGS, (reader) => {
        const count = reader.readVarInt();
        logger.debug(`[Config] Feature flags: ${count} flags`);
    });

    // Update Tags
    connection.onPacket('configuration', S2C_UPDATE_TAGS, (reader) => {
        logger.debug('[Config] Update tags received');
    });

    // Known Packs (Clientbound) - Server asks which packs we know
    connection.onPacket('configuration', S2C_KNOWN_PACKS, (reader) => {
        const count = reader.readVarInt();
        logger.debug(`[Config] Known packs request: ${count} packs`);

        // Respond with empty known packs (we don't know any)
        const response = new PacketWriter(C2S_KNOWN_PACKS)
            .writeVarInt(0);
        connection.send(response.buildData());
    });

    // Cookie Request
    connection.onPacket('configuration', S2C_COOKIE_REQUEST, (reader) => {
        const key = reader.readString();
        logger.debug(`[Config] Cookie request: ${key}`);

        // Respond with empty cookie
        const response = new PacketWriter(C2S_COOKIE_RESPONSE)
            .writeString(key)
            .writeBoolean(false); // No payload
        connection.send(response.buildData());
    });

    // Add Resource Pack
    connection.onPacket('configuration', S2C_ADD_RESOURCE_PACK, (reader) => {
        const uuid = reader.readUUID();
        logger.debug(`[Config] Resource pack: ${uuid}`);

        // Accept the resource pack
        const response = new PacketWriter(C2S_RESOURCE_PACK_RESPONSE)
            .writeUUID(uuid)
            .writeVarInt(3); // Successfully downloaded
        connection.send(response.buildData());
    });

    // Custom Report Details
    connection.onPacket('configuration', S2C_CUSTOM_REPORT_DETAILS, (reader) => {
        logger.debug('[Config] Custom report details received');
    });

    // Server Links
    connection.onPacket('configuration', S2C_SERVER_LINKS, (reader) => {
        logger.debug('[Config] Server links received');
    });

    // Reset Chat
    connection.onPacket('configuration', S2C_RESET_CHAT, (reader) => {
        logger.debug('[Config] Reset chat received');
    });

    // Clear Dialog
    connection.onPacket('configuration', S2C_CLEAR_DIALOG, (reader) => {
        logger.debug('[Config] Clear dialog received');
    });

    // Show Dialog
    connection.onPacket('configuration', S2C_SHOW_DIALOG, (reader) => {
        logger.debug('[Config] Show dialog received');
    });

    // Code of Conduct
    connection.onPacket('configuration', S2C_CODE_OF_CONDUCT, (reader) => {
        logger.debug('[Config] Code of conduct received');
    });

    // Store Cookie
    connection.onPacket('configuration', S2C_STORE_COOKIE, (reader) => {
        logger.debug('[Config] Store cookie received');
    });

    // Transfer
    connection.onPacket('configuration', S2C_TRANSFER, (reader) => {
        logger.debug('[Config] Transfer received');
    });

    // Remove Resource Pack
    connection.onPacket('configuration', S2C_REMOVE_RESOURCE_PACK, (reader) => {
        logger.debug('[Config] Remove resource pack received');
    });

    // Finish Configuration
    connection.onPacket('configuration', S2C_FINISH_CONFIGURATION, (reader) => {
        logger.debug('[Config] Finish configuration received');

        // Send client information first
        sendClientInformation(connection);

        // Send acknowledgement
        const ack = new PacketWriter(C2S_ACKNOWLEDGE_FINISH);
        connection.send(ack.buildData());

        // Transition to play state
        connection.setState('play');
        logger.debug('[Config] Transitioned to play state');
    });
}

/**
 * Send client information packet
 * @param {Connection} connection
 */
function sendClientInformation(connection) {
    const packet = new PacketWriter(C2S_CLIENT_INFORMATION)
        .writeString('en_US')       // Locale
        .writeByte(8)               // View distance
        .writeVarInt(0)             // Chat mode (enabled)
        .writeBoolean(true)         // Chat colors
        .writeUByte(0x7F)           // Displayed skin parts (all)
        .writeVarInt(1)             // Main hand (right)
        .writeBoolean(false)        // Enable text filtering
        .writeBoolean(true)         // Allow server listings
        .writeVarInt(0);            // Particle status (all)

    connection.send(packet.buildData());
    logger.debug('[Config] Sent client information');
}

module.exports = {
    setupConfigurationHandlers,
    sendClientInformation
};

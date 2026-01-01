/**
 * Play state handler for Protocol 773 (1.21.10)
 * Based on official Minecraft wiki protocol documentation
 */

const { PacketWriter } = require('../protocol/packet');
const { logger } = require('../logger');

// Clientbound packet IDs (Server -> Client) - Play state
// Reference: https://minecraft.wiki/w/Java_Edition_protocol/Packets
const S2C_BUNDLE_DELIMITER = 0x00;
const S2C_SPAWN_ENTITY = 0x01;
const S2C_ENTITY_ANIMATION = 0x02;
const S2C_AWARD_STATISTICS = 0x03;
const S2C_ACKNOWLEDGE_BLOCK_CHANGE = 0x04;
const S2C_SET_BLOCK_DESTROY_STAGE = 0x05;
const S2C_BLOCK_ENTITY_DATA = 0x06;
const S2C_BLOCK_ACTION = 0x07;
const S2C_BLOCK_UPDATE = 0x08;
const S2C_BOSS_BAR = 0x09;
const S2C_CHANGE_DIFFICULTY = 0x0A;
const S2C_CHUNK_BATCH_FINISHED = 0x0B;
const S2C_CHUNK_BATCH_START = 0x0C;
const S2C_CHUNK_BIOMES = 0x0D;
const S2C_CLEAR_TITLES = 0x0E;
const S2C_COMMAND_SUGGESTIONS = 0x0F;
const S2C_COMMANDS = 0x10;
const S2C_CLOSE_CONTAINER = 0x11;
const S2C_SET_CONTAINER_CONTENT = 0x12;
const S2C_SET_CONTAINER_PROPERTY = 0x13;
const S2C_SET_CONTAINER_SLOT = 0x14;
const S2C_COOKIE_REQUEST = 0x15;
const S2C_SET_COOLDOWN = 0x16;
const S2C_CHAT_SUGGESTIONS = 0x17;
const S2C_PLUGIN_MESSAGE = 0x18;
const S2C_DAMAGE_EVENT = 0x19;
const S2C_DEBUG_BLOCK_VALUE = 0x1A;
const S2C_DEBUG_CHUNK_VALUE = 0x1B;
const S2C_DEBUG_ENTITY_VALUE = 0x1C;
const S2C_DEBUG_EVENT = 0x1D;
const S2C_DEBUG_SAMPLE = 0x1E;
const S2C_DELETE_MESSAGE = 0x1F;
const S2C_DISCONNECT = 0x20;
const S2C_DISGUISED_CHAT = 0x21;
const S2C_ENTITY_EVENT = 0x22;
const S2C_TELEPORT_ENTITY = 0x23;
const S2C_EXPLOSION = 0x24;
const S2C_UNLOAD_CHUNK = 0x25;
const S2C_GAME_EVENT = 0x26;
const S2C_GAME_TEST_HIGHLIGHT = 0x27;
const S2C_OPEN_HORSE_SCREEN = 0x28;
const S2C_HURT_ANIMATION = 0x29;
const S2C_INITIALIZE_WORLD_BORDER = 0x2A;
const S2C_KEEP_ALIVE = 0x2B;
const S2C_CHUNK_DATA = 0x2C;
const S2C_WORLD_EVENT = 0x2D;
const S2C_PARTICLE = 0x2E;
const S2C_UPDATE_LIGHT = 0x2F;
const S2C_LOGIN = 0x30;
const S2C_MAP_DATA = 0x31;
const S2C_MERCHANT_OFFERS = 0x32;
const S2C_UPDATE_ENTITY_POSITION = 0x33;
const S2C_UPDATE_ENTITY_POSITION_AND_ROTATION = 0x34;
const S2C_MOVE_MINECART = 0x35;
const S2C_UPDATE_ENTITY_ROTATION = 0x36;
const S2C_MOVE_VEHICLE = 0x37;
const S2C_OPEN_BOOK = 0x38;
const S2C_OPEN_SCREEN = 0x39;
const S2C_OPEN_SIGN_EDITOR = 0x3A;
const S2C_PING = 0x3B;
const S2C_PING_RESPONSE = 0x3C;
const S2C_PLACE_GHOST_RECIPE = 0x3D;
const S2C_PLAYER_ABILITIES = 0x3E;
const S2C_PLAYER_CHAT = 0x3F;
const S2C_END_COMBAT = 0x40;
const S2C_ENTER_COMBAT = 0x41;
const S2C_COMBAT_DEATH = 0x42;
const S2C_PLAYER_INFO_REMOVE = 0x43;
const S2C_PLAYER_INFO_UPDATE = 0x44;
const S2C_LOOK_AT = 0x45;
const S2C_SYNCHRONIZE_PLAYER_POSITION = 0x46;
const S2C_PLAYER_ROTATION = 0x47;
const S2C_RECIPE_BOOK_ADD = 0x48;
const S2C_RECIPE_BOOK_REMOVE = 0x49;
const S2C_RECIPE_BOOK_SETTINGS = 0x4A;
const S2C_REMOVE_ENTITIES = 0x4B;
const S2C_REMOVE_ENTITY_EFFECT = 0x4C;
const S2C_RESET_SCORE = 0x4D;
const S2C_REMOVE_RESOURCE_PACK = 0x4E;
const S2C_ADD_RESOURCE_PACK = 0x4F;
const S2C_RESPAWN = 0x50;
const S2C_SET_HEAD_ROTATION = 0x51;
const S2C_UPDATE_SECTION_BLOCKS = 0x52;
const S2C_SELECT_ADVANCEMENTS_TAB = 0x53;
const S2C_SERVER_DATA = 0x54;
const S2C_SET_ACTION_BAR_TEXT = 0x55;
const S2C_SET_BORDER_CENTER = 0x56;
const S2C_SET_BORDER_LERP_SIZE = 0x57;
const S2C_SET_BORDER_SIZE = 0x58;
const S2C_SET_BORDER_WARNING_DELAY = 0x59;
const S2C_SET_BORDER_WARNING_DISTANCE = 0x5A;
const S2C_SET_CAMERA = 0x5B;
const S2C_SET_CENTER_CHUNK = 0x5C;
const S2C_SET_RENDER_DISTANCE = 0x5D;
const S2C_SET_CURSOR_ITEM = 0x5E;
const S2C_SET_DEFAULT_SPAWN_POSITION = 0x5F;
const S2C_DISPLAY_OBJECTIVE = 0x60;
const S2C_SET_ENTITY_METADATA = 0x61;
const S2C_LINK_ENTITIES = 0x62;
const S2C_SET_ENTITY_VELOCITY = 0x63;
const S2C_SET_EQUIPMENT = 0x64;
const S2C_SET_EXPERIENCE = 0x65;
const S2C_SET_HEALTH = 0x66;
const S2C_SET_HELD_ITEM = 0x67;
const S2C_UPDATE_OBJECTIVES = 0x68;
const S2C_SET_PASSENGERS = 0x69;
const S2C_SET_PLAYER_INVENTORY_SLOT = 0x6A;
const S2C_UPDATE_TEAMS = 0x6B;
const S2C_UPDATE_SCORE = 0x6C;
const S2C_SET_SIMULATION_DISTANCE = 0x6D;
const S2C_SET_SUBTITLE_TEXT = 0x6E;
const S2C_UPDATE_TIME = 0x6F;
const S2C_SET_TITLE_TEXT = 0x70;
const S2C_SET_TITLE_ANIMATION_TIMES = 0x71;
const S2C_ENTITY_SOUND_EFFECT = 0x72;
const S2C_SOUND_EFFECT = 0x73;
const S2C_START_CONFIGURATION = 0x74;
const S2C_STOP_SOUND = 0x75;
const S2C_STORE_COOKIE = 0x76;
const S2C_SYSTEM_CHAT = 0x77;
const S2C_TAB_LIST = 0x78;
const S2C_TAG_QUERY = 0x79;
const S2C_PICKUP_ITEM = 0x7A;
const S2C_SYNCHRONIZE_VEHICLE_POSITION = 0x7B;
const S2C_TEST_INSTANCE_BLOCK_STATUS = 0x7C;
const S2C_SET_TICKING_STATE = 0x7D;
const S2C_STEP_TICK = 0x7E;
const S2C_TRANSFER = 0x7F;
const S2C_UPDATE_ADVANCEMENTS = 0x80;
const S2C_UPDATE_ATTRIBUTES = 0x81;
const S2C_ENTITY_EFFECT = 0x82;
const S2C_UPDATE_RECIPES = 0x83;
const S2C_UPDATE_TAGS = 0x84;

// Serverbound packet IDs (Client -> Server) - Play state
const C2S_CONFIRM_TELEPORTATION = 0x00;
const C2S_QUERY_BLOCK_ENTITY_TAG = 0x01;
const C2S_BUNDLE_ITEM_SELECTED = 0x02;
const C2S_CHANGE_DIFFICULTY = 0x03;
const C2S_ACKNOWLEDGE_MESSAGE = 0x05;
const C2S_CHAT_COMMAND = 0x06;
const C2S_CHAT = 0x08;
const C2S_CHUNK_BATCH_RECEIVED = 0x0A;
const C2S_CLIENT_STATUS = 0x0B;
const C2S_CLIENT_TICK_END = 0x0C;
const C2S_CLIENT_INFORMATION = 0x0D;
const C2S_ACKNOWLEDGE_CONFIGURATION = 0x0F;
const C2S_COOKIE_RESPONSE = 0x14;
const C2S_PLUGIN_MESSAGE = 0x15;
const C2S_KEEP_ALIVE = 0x1B;
const C2S_SET_PLAYER_POSITION = 0x1D;
const C2S_SET_PLAYER_POSITION_AND_ROTATION = 0x1E;
const C2S_SET_PLAYER_ROTATION = 0x1F;
const C2S_PONG = 0x2C;
const C2S_RESOURCE_PACK_RESPONSE = 0x30;

/**
 * Setup play state handlers
 * @param {Connection} connection
 * @param {object} client
 */
function setupPlayHandlers(connection, client) {
    // Keep Alive - CRITICAL: Must respond immediately to stay connected
    connection.onPacket('play', S2C_KEEP_ALIVE, (reader) => {
        const id = reader.readLong();
        logger.debug(`[Keep-Alive] Received: ${id}, responding...`);
        const response = new PacketWriter(C2S_KEEP_ALIVE)
            .writeLong(id);
        connection.send(response.buildData());
        logger.debug(`[Keep-Alive] Response sent!`);
    });

    // Login (Join Game)
    connection.onPacket('play', S2C_LOGIN, (reader) => {
        const entityId = reader.readInt();
        const isHardcore = reader.readBoolean();

        logger.always(`✓ Joined game! Entity ID: ${entityId}`);
        client.entityId = entityId;
        client.emit('spawn');
    });

    // Synchronize Player Position
    connection.onPacket('play', S2C_SYNCHRONIZE_PLAYER_POSITION, (reader) => {
        // CRITICAL: Block movement while waiting for teleport confirm cycle
        // Set flag IMMEDIATELY when receiving teleport packet
        client.awaitingTeleport = true;

        const teleportId = reader.readVarInt();
        const x = reader.readDouble();
        const y = reader.readDouble();
        const z = reader.readDouble();
        // Read velocity
        reader.readDouble();
        reader.readDouble();
        reader.readDouble();
        const yaw = reader.readFloat();
        const pitch = reader.readFloat();

        // Check if we're actively moving and being reset by server
        if (client.movement && client.movement.isMoving) {
            const ourPos = client.position;
            const dist = Math.sqrt(
                Math.pow(x - ourPos.x, 2) +
                Math.pow(y - ourPos.y, 2) +
                Math.pow(z - ourPos.z, 2)
            );

            if (dist > 0.5) {
                logger.warn(`[Position] ⚠ Server reset: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) - moved ${dist.toFixed(1)} blocks`);
            }
        } else {
            logger.info(`[Position] Server sync: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
        }

        // Always accept server position - they have authority
        client.position = { x, y, z };
        client.rotation = { yaw, pitch };

        // Send teleport confirmation
        logger.debug(`[Position] Confirming teleport ID: ${teleportId}`);
        const confirm = new PacketWriter(C2S_CONFIRM_TELEPORTATION)
            .writeVarInt(teleportId);
        connection.send(confirm.buildData());

        // Notify movement controller about the reset
        // This sets cooldown and keeps awaitingTeleport true until cooldown expires
        if (client.movement && typeof client.movement.serverPositionReset === 'function') {
            client.movement.serverPositionReset();
        } else {
            // No movement controller - clear flag after a short delay
            client.awaitingTeleport = false;
        }

        client.emit('position', { x, y, z, yaw, pitch });
    });

    // Disconnect
    connection.onPacket('play', S2C_DISCONNECT, (reader) => {
        try {
            const rawData = reader.readRemaining();
            const reason = rawData.toString('utf8');
            logger.info(`[Play] Disconnected: ${reason}`);
            client.emit('disconnect', reason);
        } catch (e) {
            logger.info('[Play] Disconnected (could not parse reason)');
            client.emit('disconnect', 'Unknown reason');
        }
    });

    // System Chat
    connection.onPacket('play', S2C_SYSTEM_CHAT, (reader) => {
        try {
            const message = reader.readString();
            // Silent - only emit event
            client.emit('chat', { message, system: true });
        } catch (e) {
            // Silent error
        }
    });

    // Disguised Chat Message (System messages, player chat)
    connection.onPacket('play', S2C_DISGUISED_CHAT, (reader) => {
        try {
            const message = reader.readString();

            // Try to parse as JSON
            try {
                const parsed = JSON.parse(message);
                let text = '';

                // Extract text from JSON
                if (parsed.text) text += parsed.text;
                if (parsed.extra) {
                    for (const part of parsed.extra) {
                        if (typeof part === 'string') text += part;
                        else if (part.text) text += part.text;
                    }
                }

                // Emit chat event silently
                if (text) {
                    client.emit('chat', { message: text, system: true });
                }
            } catch (e) {
                // Not JSON, use raw message
                client.emit('chat', { message, system: true });
            }
        } catch (e) {
            // Silent error
        }
    });

    // Player Chat - Parse and emit for command handling
    connection.onPacket('play', S2C_PLAYER_CHAT, (reader) => {
        try {
            // Read sender UUID (skip header VarInt first)
            const headerIndex = reader.readVarInt();
            const senderUUID = reader.readUUID();
            const messageIndex = reader.readVarInt();

            // Check if signature present
            const hasSignature = reader.readBoolean();
            if (hasSignature) {
                reader.skip(256); // Skip signature
            }

            // Read the actual message
            const message = reader.readString();
            logger.always(`💬 ${message}`);

            // Emit chat event
            client.emit('chat', { message, system: false });
        } catch (e) {
            // Silent error
        }
    });

    // Packet 0x22 - Chat Message (this server's actual chat packet!)
    connection.onPacket('play', 0x22, (reader) => {
        try {
            // Read the message string
            const message = reader.readString();

            // DEBUG: Log raw message
            logger.debug(`[Chat] Raw message: ${message.substring(0, 200)}`);

            // Try to parse as JSON and extract text
            try {
                const parsed = JSON.parse(message);
                let text = '';

                // Extract text from JSON structure
                function extractText(obj) {
                    if (typeof obj === 'string') {
                        text += obj;
                        return;
                    }
                    if (!obj) return;

                    // Check common message fields
                    if (obj.text) text += obj.text;
                    if (obj.content) text += obj.content;
                    if (obj.value) text += obj.value;

                    // Recurse into nested structures
                    if (obj.extra && Array.isArray(obj.extra)) {
                        for (const part of obj.extra) {
                            extractText(part);
                        }
                    }
                    if (obj.with && Array.isArray(obj.with)) {
                        for (const part of obj.with) {
                            extractText(part);
                        }
                    }
                    if (obj.contents && Array.isArray(obj.contents)) {
                        for (const part of obj.contents) {
                            extractText(part);
                        }
                    }
                }

                extractText(parsed);

                if (text) {
                    logger.always(`💬 ${text}`);
                    client.emit('chat', { message: text, system: false });
                } else {
                    // No text extracted, log structure and use raw
                    logger.debug(`[Chat] Could not extract text from JSON:`, JSON.stringify(parsed).substring(0, 200));
                    client.emit('chat', { message, system: false });
                }
            } catch (e) {
                // Not JSON, use raw message
                logger.always(`💬 ${message}`);
                client.emit('chat', { message, system: false });
            }
        } catch (e) {
            console.error(`[Chat] Error processing 0x22 packet:`, e.message);
        }
    });

    // Ping
    connection.onPacket('play', S2C_PING, (reader) => {
        const id = reader.readInt();
        logger.debug(`[Ping] Received: ${id}, sending pong...`);
        const response = new PacketWriter(C2S_PONG)
            .writeInt(id);
        connection.send(response.buildData());
        logger.debug(`[Ping] Pong sent!`);
    });

    // Set Health
    connection.onPacket('play', S2C_SET_HEALTH, (reader) => {
        const health = reader.readFloat();
        const food = reader.readVarInt();
        const saturation = reader.readFloat();

        // Silent health update
        client.health = health;
        client.food = food;

        // Respawn if dead
        if (health <= 0) {
            logger.always('💀 Died! Respawning...');
            const respawn = new PacketWriter(C2S_CLIENT_STATUS)
                .writeVarInt(0); // Perform respawn
            connection.send(respawn.buildData());
        }

        client.emit('health', { health, food, saturation });
    });

    // Game Event
    connection.onPacket('play', S2C_GAME_EVENT, (reader) => {
        const event = reader.readUByte();
        const value = reader.readFloat();
        // Silent game event
    });

    // Chunk Data and Update Light (0x2C - level_chunk_with_light)
    connection.onPacket('play', S2C_CHUNK_DATA, (reader) => {
        const chunkX = reader.readInt();
        const chunkZ = reader.readInt();

        // Read remaining chunk data (heightmaps, sections, block entities, light data)
        // For now, we'll store the raw data without full palette parsing
        const remainingData = reader.readRemaining();

        // Silent chunk loading
        // Store chunk in world
        if (client.world) {
            client.world.storeChunk(chunkX, chunkZ, remainingData);
        }
    });

    // Chunk Batch Finished
    connection.onPacket('play', S2C_CHUNK_BATCH_FINISHED, (reader) => {
        const batchSize = reader.readVarInt();
        // Silent chunk batch finish

        // Respond with chunks per tick
        const response = new PacketWriter(C2S_CHUNK_BATCH_RECEIVED)
            .writeFloat(20.0); // Chunks per tick
        connection.send(response.buildData());
    });

    // Chunk Batch Start
    connection.onPacket('play', S2C_CHUNK_BATCH_START, (reader) => {
        // Silent chunk batch start
    });

    // Start Configuration (server wants to reconfigure)
    connection.onPacket('play', S2C_START_CONFIGURATION, (reader) => {
        logger.debug('[Play] Server requesting reconfiguration');

        const response = new PacketWriter(C2S_ACKNOWLEDGE_CONFIGURATION);
        connection.send(response.buildData());

        connection.setState('configuration');
    });

    // Resource Pack
    connection.onPacket('play', S2C_ADD_RESOURCE_PACK, (reader) => {
        const uuid = reader.readUUID();
        // Silent resource pack response
        const response = new PacketWriter(C2S_RESOURCE_PACK_RESPONSE)
            .writeUUID(uuid)
            .writeVarInt(3); // Successfully downloaded
        connection.send(response.buildData());
    });

    // Set Center Chunk
    connection.onPacket('play', S2C_SET_CENTER_CHUNK, (reader) => {
        const chunkX = reader.readVarInt();
        const chunkZ = reader.readVarInt();
        // Silent
    });

    // Player Abilities
    connection.onPacket('play', S2C_PLAYER_ABILITIES, (reader) => {
        const flags = reader.readByte();
        // Silent
    });

    // Set Held Item
    connection.onPacket('play', S2C_SET_HELD_ITEM, (reader) => {
        const slot = reader.readVarInt();
        // Silent
    });

    // Update Time
    connection.onPacket('play', S2C_UPDATE_TIME, (reader) => {
        // Silent
    });

    // Change Difficulty
    connection.onPacket('play', S2C_CHANGE_DIFFICULTY, (reader) => {
        const difficulty = reader.readUByte();
        // Silent
    });

    // Player Info Update
    connection.onPacket('play', S2C_PLAYER_INFO_UPDATE, (reader) => {
        // Silent
    });

    // Set Simulation Distance
    connection.onPacket('play', S2C_SET_SIMULATION_DISTANCE, (reader) => {
        const distance = reader.readVarInt();
        // Silent
    });

    // Set Render Distance
    connection.onPacket('play', S2C_SET_RENDER_DISTANCE, (reader) => {
        const distance = reader.readVarInt();
        // Silent
    });

    // === ENVIRONMENTAL AWARENESS: Entity Tracking ===

    // Spawn Entity (players, mobs, etc.)
    connection.onPacket('play', S2C_SPAWN_ENTITY, (reader) => {
        try {
            const entityId = reader.readVarInt();
            const uuid = reader.readUUID();
            const type = reader.readVarInt();
            const x = reader.readDouble();
            const y = reader.readDouble();
            const z = reader.readDouble();

            if (client.entityTracker) {
                client.entityTracker.addEntity(entityId, type, x, y, z);
            }
        } catch (e) {
            // Silent error
        }
    });

    // Update Entity Position
    connection.onPacket('play', S2C_UPDATE_ENTITY_POSITION, (reader) => {
        try {
            const entityId = reader.readVarInt();
            const deltaX = reader.readShort() / 4096.0;
            const deltaY = reader.readShort() / 4096.0;
            const deltaZ = reader.readShort() / 4096.0;

            if (client.entityTracker) {
                const entity = client.entityTracker.entities.get(entityId);
                if (entity) {
                    client.entityTracker.updatePosition(
                        entityId,
                        entity.position.x + deltaX,
                        entity.position.y + deltaY,
                        entity.position.z + deltaZ
                    );
                }
            }
        } catch (e) {
            // Silent error
        }
    });

    // Update Entity Position and Rotation
    connection.onPacket('play', S2C_UPDATE_ENTITY_POSITION_AND_ROTATION, (reader) => {
        try {
            const entityId = reader.readVarInt();
            const deltaX = reader.readShort() / 4096.0;
            const deltaY = reader.readShort() / 4096.0;
            const deltaZ = reader.readShort() / 4096.0;
            reader.readByte(); // yaw
            reader.readByte(); // pitch

            if (client.entityTracker) {
                const entity = client.entityTracker.entities.get(entityId);
                if (entity) {
                    client.entityTracker.updatePosition(
                        entityId,
                        entity.position.x + deltaX,
                        entity.position.y + deltaY,
                        entity.position.z + deltaZ
                    );
                }
            }
        } catch (e) {
            // Silent error
        }
    });

    // Teleport Entity (absolute position update)
    connection.onPacket('play', S2C_TELEPORT_ENTITY, (reader) => {
        try {
            const entityId = reader.readVarInt();
            const x = reader.readDouble();
            const y = reader.readDouble();
            const z = reader.readDouble();

            if (client.entityTracker) {
                client.entityTracker.updatePosition(entityId, x, y, z);
            }
        } catch (e) {
            // Silent error
        }
    });

    // Remove Entities
    connection.onPacket('play', S2C_REMOVE_ENTITIES, (reader) => {
        try {
            const count = reader.readVarInt();
            for (let i = 0; i < count; i++) {
                const entityId = reader.readVarInt();
                if (client.entityTracker) {
                    client.entityTracker.removeEntity(entityId);
                }
            }
        } catch (e) {
            // Silent error
        }
    });
}

/**
 * Send chat message
 * @param {Connection} connection
 * @param {string} message
 */
function sendChat(connection, message) {
    logger.info(`[Chat] Sending: ${message}`);

    try {
        const packet = new PacketWriter(C2S_CHAT)
            .writeString(message)                     // Message
            .writeLong(Date.now())                    // Timestamp (milliseconds)
            .writeLong(0n)                            // Salt (0 for no encryption)
            .writeBoolean(false)                      // Has signature (false)
            .writeVarInt(0)                           // Previous messages count (0)
            .writeVarInt(0);                          // Last seen messages BitSet length (0 = empty)

        connection.send(packet.buildData());
    } catch (e) {
        console.error(`[Chat] Failed to send message: ${e.message}`);
    }
}

module.exports = {
    setupPlayHandlers,
    sendChat
};

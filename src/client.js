/**
 * Minecraft Client - Main client class
 */

const { EventEmitter } = require('events');
const { Connection } = require('./protocol/connection');
const { sendHandshake } = require('./states/handshake');
const { setupLoginHandlers, sendLoginStart } = require('./states/login');
const { setupConfigurationHandlers } = require('./states/config');
const { setupPlayHandlers, sendChat } = require('./states/play');
const { MovementAdvanced } = require('./movement-advanced');
const { CommandHandler } = require('./commands');
const { WorldAdvanced } = require('./world-advanced');
const { EntityTracker } = require('./entities');

class MinecraftClient extends EventEmitter {
    constructor(options) {
        super();

        this.host = options.host || 'localhost';
        this.port = options.port || 25565;
        this.username = options.username || 'Bot';
        this.customUUID = options.customUUID || null; // Optional custom UUID
        this.protocolVersion = options.protocolVersion || 773;

        this.connection = null;
        this.uuid = null;
        this.entityId = null;
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { yaw: 0, pitch: 0 };
        this.health = 20;
        this.food = 20;
        this.spawnY = null; // Track initial spawn Y to prevent void falling

        // World state tracker
        this.world = new WorldAdvanced();

        // Entity tracker for environmental awareness
        this.entityTracker = new EntityTracker();

        // Movement controller
        this.movement = null;

        // Command handler
        this.commandHandler = null;
    }

    /**
     * Connect to the server
     */
    async connect() {
        console.log(`[Client] Connecting to ${this.host}:${this.port} as ${this.username}...`);

        this.connection = new Connection(this.host, this.port);

        // Initialize movement and commands
        this.movement = new MovementAdvanced(this, this.connection, this.world);
        this.commandHandler = new CommandHandler(this, this.username);

        // Setup all state handlers
        setupLoginHandlers(this.connection, this);
        setupConfigurationHandlers(this.connection, this);
        setupPlayHandlers(this.connection, this);

        // Listen for chat events to process commands
        this.on('chat', (data) => {
            if (this.commandHandler) {
                this.commandHandler.processMessage(data.message, data.sender || 'unknown');
            }
        });

        // Connect
        await this.connection.connect();

        // Start handshake
        sendHandshake(this.connection, this.host, this.port, this.protocolVersion, 2);

        // Wait a tick for handshake to be processed before sending login start
        // This prevents ECONNRESET by giving server time to transition states
        setImmediate(() => {
            sendLoginStart(this.connection, this.username, this.customUUID);
        });

        return this;
    }

    /**
     * Move to coordinates
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    goto(x, y, z) {
        if (this.movement) {
            this.movement.goto(x, y, z);
        }
    }

    /**
     * Stop movement
     */
    stop() {
        if (this.movement) {
            this.movement.stop();
        }
    }

    /**
     * Send chat message (DISABLED - causes server disconnection)
     */
    chat(message) {
        console.log(`[Chat] Would send: ${message} (DISABLED to prevent disconnection)`);
        // TEMPORARILY DISABLED: This server rejects our chat packet format
        // return sendChat(this.connection, message);
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        if (this.movement) {
            this.movement.stop();
        }
        if (this.connection) {
            this.connection.close();
        }
    }
}

module.exports = { MinecraftClient };

/**
 * Bot Manager - Orchestrates multiple bot instances
 */

const { MinecraftClient } = require('./client');
const { EventEmitter } = require('events');

class BotManager extends EventEmitter {
    constructor(config) {
        super();

        this.config = config;
        this.bots = new Map(); // Map of botId -> bot instance
        this.botConfigs = new Map(); // Map of botId -> bot config
        this.reconnectTimers = new Map(); // Map of botId -> reconnect timer
    }

    /**
     * Initialize and connect all enabled bots
     */
    async startAll() {
        console.log('========================================');
        console.log(' Multi-Bot Manager Starting');
        console.log('========================================');
        console.log(`Server: ${this.config.server.host}:${this.config.server.port}`);
        console.log(`Protocol: ${this.config.server.protocolVersion} (${this.config.server.version})`);
        console.log('');

        const enabledBots = this.config.bots.filter(bot => bot.enabled !== false);
        console.log(`[Manager] Starting ${enabledBots.length} bot(s)...`);
        console.log('');

        for (const botConfig of enabledBots) {
            await this.startBot(botConfig);
            // Small delay between bot connections to avoid rate limiting
            await this.delay(1000);
        }

        console.log('[Manager] All bots started');
        this.emit('all_started');
    }

    /**
     * Start a single bot instance
     */
    async startBot(botConfig) {
        const botId = botConfig.username;

        if (this.bots.has(botId)) {
            console.log(`[Manager] Bot ${botId} is already running`);
            return;
        }

        console.log(`[Manager] Starting bot: ${botId}`);

        // Store bot configuration
        this.botConfigs.set(botId, botConfig);

        // Create client with namespaced logging
        const client = new MinecraftClient({
            host: this.config.server.host,
            port: this.config.server.port,
            username: botConfig.username,
            customUUID: botConfig.customUUID,
            protocolVersion: this.config.server.protocolVersion
        });

        // Store the bot instance
        this.bots.set(botId, client);

        // Setup event handlers with bot-specific logging
        this.setupBotHandlers(client, botId);

        // Connect
        try {
            await client.connect();
            console.log(`[${botId}] Connection initiated`);
        } catch (err) {
            console.error(`[${botId}] Failed to connect: ${err.message}`);
            this.bots.delete(botId);
            this.emit('bot_error', { botId, error: err });
        }
    }

    /**
     * Setup event handlers for a bot
     */
    setupBotHandlers(client, botId) {
        client.on('login', ({ uuid, username }) => {
            console.log(`[${botId}] ✓ Connected`);
            this.emit('bot_login', { botId, uuid, username });
        });

        client.on('configuration_complete', () => {
            // Silent
        });

        client.on('spawn', () => {
            console.log(`[${botId}] ✓ Spawned in world`);
            this.emit('bot_spawn', { botId, entityId: client.entityId });
        });

        client.on('position', ({ x, y, z }) => {
            // Silent position updates
        });

        client.on('health', ({ health, food }) => {
            // Silent health updates
        });

        client.on('chat', (data) => {
            if (data.message && data.message.trim()) {
                console.log(`[${botId}] 💬 Chat: ${data.message}`);
            }
        });

        client.on('disconnect', (reason) => {
            console.log(`[${botId}] ✗ Disconnected: ${reason}`);
            this.bots.delete(botId);
            this.emit('bot_disconnect', { botId, reason });

            // Optionally reconnect
            if (this.config.settings.maxReconnectAttempts > 0) {
                this.scheduleReconnect(botId);
            }
        });

        client.on('error', (err) => {
            console.error(`[${botId}] ✗ Error: ${err.message}`);
            this.emit('bot_error', { botId, error: err });
        });

        // Keep-alive logging - only once per minute
        setInterval(() => {
            if (client.connection && client.connection.connected) {
                // Silent keep-alive (bot is still connected)
            }
        }, this.config.settings.keepAliveInterval);
    }

    /**
     * Schedule bot reconnection
     */
    scheduleReconnect(botId) {
        const botConfig = this.botConfigs.get(botId);
        if (!botConfig) return;

        console.log(`[Manager] Scheduling reconnect for ${botId} in ${this.config.settings.reconnectDelay}ms`);

        const timer = setTimeout(() => {
            console.log(`[Manager] Reconnecting ${botId}...`);
            this.startBot(botConfig);
            this.reconnectTimers.delete(botId);
        }, this.config.settings.reconnectDelay);

        this.reconnectTimers.set(botId, timer);
    }

    /**
     * Stop a specific bot
     */
    stopBot(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            console.log(`[Manager] Stopping bot: ${botId}`);
            bot.disconnect();
            this.bots.delete(botId);
        }

        // Clear reconnect timer if exists
        const timer = this.reconnectTimers.get(botId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(botId);
        }
    }

    /**
     * Stop all bots
     */
    stopAll() {
        console.log('[Manager] Stopping all bots...');

        // Clear all reconnect timers
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();

        // Disconnect all bots
        for (const [botId, bot] of this.bots.entries()) {
            console.log(`[Manager] Disconnecting ${botId}...`);
            bot.disconnect();
        }

        this.bots.clear();
        console.log('[Manager] All bots stopped');
        this.emit('all_stopped');
    }

    /**
     * Get a bot instance by ID
     */
    getBot(botId) {
        return this.bots.get(botId);
    }

    /**
     * Get all active bots
     */
    getAllBots() {
        return Array.from(this.bots.values());
    }

    /**
     * Get status of all bots
     */
    getStatus() {
        const status = {
            total: this.bots.size,
            bots: []
        };

        for (const [botId, bot] of this.bots.entries()) {
            status.bots.push({
                id: botId,
                connected: bot.connection && bot.connection.connected,
                entityId: bot.entityId,
                position: bot.position,
                health: bot.health
            });
        }

        return status;
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { BotManager };

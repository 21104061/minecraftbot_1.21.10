/**
 * Chat command handler
 * Parses chat messages and triggers bot actions
 */

class CommandHandler {
    constructor(client, botName) {
        this.client = client;
        this.botName = botName.toLowerCase();
        this.commands = new Map();

        // Register default commands
        this.registerDefaults();
    }

    /**
     * Register default commands
     */
    registerDefaults() {
        // "come Bot x y z" - move to coordinates
        this.commands.set('come', (args, sender) => {
            if (args.length < 3) {
                console.log('[Command] Invalid come command: need x y z coordinates');
                return;
            }

            const x = parseFloat(args[0]);
            const y = parseFloat(args[1]);
            const z = parseFloat(args[2]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                console.log('[Command] Invalid coordinates');
                return;
            }

            console.log(`[Command] ${sender} commanded: come to ${x}, ${y}, ${z}`);

            if (this.client.movement) {
                this.client.movement.goto(x, y, z);
            } else {
                console.log('[Command] Movement not initialized');
            }
        });

        // "stop Bot" - stop movement
        this.commands.set('stop', (args, sender) => {
            console.log(`[Command] ${sender} commanded: stop`);

            if (this.client.movement) {
                this.client.movement.stop();
            }
        });

        // "pos Bot" - report position
        this.commands.set('pos', (args, sender) => {
            console.log(`[Command] ${sender} requested position`);

            if (this.client.position) {
                const pos = this.client.position;
                console.log(`[Position] X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`);
            }
        });
    }

    /**
     * Process a chat message
     * @param {string} message - The raw chat message
     * @param {string} sender - The sender's name (if known)
     */
    processMessage(message, sender = 'unknown') {
        // Try to extract text from JSON if it's a JSON message
        let text = message;
        try {
            const parsed = JSON.parse(message);
            text = this.extractText(parsed);
        } catch (e) {
            // Not JSON, use as-is
        }

        // Clean up the message
        text = text.toLowerCase().trim();

        // DEBUG: Log what we're processing
        if (text.startsWith('come') || text.startsWith('stop') || text.startsWith('pos')) {
            console.log(`[Command] Processing: "${text}"`);
            console.log(`[Command] Bot name: "${this.botName}"`);
        }

        // Check for commands targeting this bot
        // Format: "command botname args..." or "command botname"
        const parts = text.split(/\s+/);

        if (parts.length < 2) return;

        const command = parts[0];
        const target = parts[1];

        // DEBUG: Show parsing
        if (command === 'come' || command === 'stop' || command === 'pos') {
            console.log(`[Command] Command: "${command}", Target: "${target}", BotName: "${this.botName}"`);
            console.log(`[Command] Match: ${target === this.botName}`);
        }

        // Check if the command is for this bot
        if (target !== this.botName) {
            return;
        }

        const args = parts.slice(2);

        // Execute the command
        const handler = this.commands.get(command);
        if (handler) {
            console.log(`[Command] Executing ${command} with args:`, args);
            handler(args, sender);
        } else {
            console.log(`[Command] Unknown command: ${command}`);
        }
    }

    /**
     * Extract text from a JSON chat component
     */
    extractText(component) {
        if (typeof component === 'string') {
            return component;
        }

        let text = '';

        if (component.text) {
            text += component.text;
        }

        if (component.extra && Array.isArray(component.extra)) {
            for (const part of component.extra) {
                text += this.extractText(part);
            }
        }

        if (component.translate) {
            // Handle translated messages (like chat.type.text)
            if (component.with && Array.isArray(component.with)) {
                for (const part of component.with) {
                    text += this.extractText(part);
                }
            }
        }

        return text;
    }
}

module.exports = { CommandHandler };

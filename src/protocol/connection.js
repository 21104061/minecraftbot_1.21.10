/**
 * TCP Connection handler for Minecraft protocol
 * Handles packet framing, compression, and state management
 */

const net = require('net');
const zlib = require('zlib');
const { readVarInt, writeVarInt, varIntLength } = require('./varint');
const { PacketReader } = require('./packet');
const { logger } = require('../logger');

class Connection {
    constructor(host, port) {
        this.host = host;
        this.port = port;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this.compressionThreshold = -1;
        this.state = 'handshaking'; // handshaking, login, configuration, play
        this.packetHandlers = new Map();
        this.connected = false;
    }

    /**
     * Connect to the server
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.socket = net.createConnection(this.port, this.host, () => {
                logger.debug(`[Connection] Connected to ${this.host}:${this.port}`);
                this.connected = true;
                resolve();
            });

            this.socket.on('data', (data) => this.handleData(data));

            this.socket.on('error', (err) => {
                console.error(`[Connection] Socket error: ${err.message}`);
                this.connected = false;
                reject(err);
            });

            this.socket.on('close', () => {
                logger.debug('[Connection] Socket closed');
                this.connected = false;
            });

            this.socket.on('timeout', () => {
                logger.debug('[Connection] Socket timeout');
                this.socket.destroy();
            });

            // Disable timeout - let server handle keep-alive
            this.socket.setTimeout(0);  // 0 = no timeout
        });
    }

    /**
     * Handle incoming data
     * @param {Buffer} data
     */
    handleData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length > 0) {
            try {
                const packet = this.readPacket();
                if (!packet) break; // Not enough data yet

                this.handlePacket(packet);
            } catch (err) {
                console.error(`[Connection] Error reading packet: ${err.message}`);
                break;
            }
        }
    }

    /**
     * Read a single packet from the buffer
     * @returns {{packetId: number, data: Buffer} | null}
     */
    readPacket() {
        if (this.buffer.length < 1) return null;

        try {
            // Read packet length
            const lengthResult = readVarInt(this.buffer, 0);
            const packetLength = lengthResult.value;
            const lengthSize = lengthResult.bytesRead;

            // Check if we have the full packet
            if (this.buffer.length < lengthSize + packetLength) {
                return null;
            }

            // Extract packet data
            let packetData = this.buffer.slice(lengthSize, lengthSize + packetLength);

            // Remove packet from buffer
            this.buffer = this.buffer.slice(lengthSize + packetLength);

            // Handle compression
            if (this.compressionThreshold >= 0) {
                const dataLengthResult = readVarInt(packetData, 0);
                const dataLength = dataLengthResult.value;
                packetData = packetData.slice(dataLengthResult.bytesRead);

                if (dataLength > 0) {
                    // Compressed packet
                    packetData = zlib.inflateSync(packetData);
                }
            }

            // Read packet ID
            const packetIdResult = readVarInt(packetData, 0);
            const packetId = packetIdResult.value;
            const data = packetData.slice(packetIdResult.bytesRead);

            return { packetId, data };
        } catch (err) {
            // Not enough data or invalid packet
            return null;
        }
    }

    /**
     * Handle a received packet
     * @param {{packetId: number, data: Buffer}} packet
     */
    handlePacket(packet) {
        const key = `${this.state}:${packet.packetId}`;
        const handler = this.packetHandlers.get(key);

        // Debug all unhandled packets to find Keep-Alive
        if (!handler) {
            logger.debug(`[DEBUG] Unhandled ${this.state} packet 0x${packet.packetId.toString(16).padStart(2, '0')} (${packet.data.length} bytes)`);
        }

        if (handler) {
            try {
                const reader = new PacketReader(packet.data);
                handler(reader, packet.packetId);
            } catch (err) {
                console.error(`[Connection] Error handling packet 0x${packet.packetId.toString(16)}: ${err.message}`);
            }
        }
    }

    /**
     * Send a packet to the server
     * @param {Buffer} packetData - Complete packet with ID and data (from PacketWriter.buildData())
     */
    send(packetData) {
        if (!this.connected) {
            console.error('[Connection] Cannot send: not connected');
            return;
        }

        let finalPacket;

        if (this.compressionThreshold >= 0) {
            // Compression enabled
            if (packetData.length >= this.compressionThreshold) {
                // Compress the data
                const compressed = zlib.deflateSync(packetData);
                const dataLength = writeVarInt(packetData.length);
                const packet = Buffer.concat([dataLength, compressed]);
                const length = writeVarInt(packet.length);
                finalPacket = Buffer.concat([length, packet]);
            } else {
                // Don't compress, but still use compression format
                const dataLength = writeVarInt(0);
                const packet = Buffer.concat([dataLength, packetData]);
                const length = writeVarInt(packet.length);
                finalPacket = Buffer.concat([length, packet]);
            }
        } else {
            // No compression
            const length = writeVarInt(packetData.length);
            finalPacket = Buffer.concat([length, packetData]);
        }

        this.socket.write(finalPacket);
    }

    /**
     * Register a packet handler
     * @param {string} state
     * @param {number} packetId
     * @param {function} handler
     */
    onPacket(state, packetId, handler) {
        const key = `${state}:${packetId}`;
        this.packetHandlers.set(key, handler);
    }

    /**
     * Set the protocol state
     * @param {string} state
     */
    setState(state) {
        logger.debug(`[Connection] State changed: ${this.state} -> ${state}`);
        this.state = state;
    }

    /**
     * Enable compression
     * @param {number} threshold
     */
    setCompression(threshold) {
        logger.debug(`[Connection] Compression enabled: threshold=${threshold}`);
        this.compressionThreshold = threshold;
    }

    /**
     * Close the connection
     */
    close() {
        if (this.socket) {
            this.socket.destroy();
            this.connected = false;
        }
    }
}

module.exports = { Connection };

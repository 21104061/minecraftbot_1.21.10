/**
 * Handshake state handler
 */

const { PacketWriter } = require('../protocol/packet');
const { logger } = require('../logger');

// Packet IDs
const HANDSHAKE = 0x00;

/**
 * Send handshake packet
 * @param {Connection} connection
 * @param {string} host
 * @param {number} port
 * @param {number} protocolVersion
 * @param {number} nextState - 1 for Status, 2 for Login
 */
function sendHandshake(connection, host, port, protocolVersion, nextState = 2) {
    logger.debug(`[Handshake] Sending handshake (protocol=${protocolVersion}, nextState=${nextState})`);

    const packet = new PacketWriter(HANDSHAKE)
        .writeVarInt(protocolVersion)  // Protocol Version
        .writeString(host)              // Server Address
        .writeUShort(port)              // Server Port
        .writeVarInt(nextState);        // Next State (2 = Login)

    // Change state BEFORE sending packet so handlers are ready
    connection.setState('login');
    connection.send(packet.buildData());
}

module.exports = {
    sendHandshake
};

/**
 * Packet Reader and Writer for Minecraft protocol
 */

const { writeVarInt, readVarInt, writeVarLong, readVarLong, varIntLength } = require('./varint');
const crypto = require('crypto');

/**
 * PacketWriter - builds packets for sending to server
 */
class PacketWriter {
    constructor(packetId) {
        this.packetId = packetId;
        this.buffers = [];
    }

    writeVarInt(value) {
        this.buffers.push(writeVarInt(value));
        return this;
    }

    writeVarLong(value) {
        this.buffers.push(writeVarLong(value));
        return this;
    }

    writeByte(value) {
        const buf = Buffer.alloc(1);
        buf.writeInt8(value);
        this.buffers.push(buf);
        return this;
    }

    writeUByte(value) {
        const buf = Buffer.alloc(1);
        buf.writeUInt8(value);
        this.buffers.push(buf);
        return this;
    }

    writeShort(value) {
        const buf = Buffer.alloc(2);
        buf.writeInt16BE(value);
        this.buffers.push(buf);
        return this;
    }

    writeUShort(value) {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(value);
        this.buffers.push(buf);
        return this;
    }

    writeInt(value) {
        const buf = Buffer.alloc(4);
        buf.writeInt32BE(value);
        this.buffers.push(buf);
        return this;
    }

    writeLong(value) {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64BE(BigInt(value));
        this.buffers.push(buf);
        return this;
    }

    writeFloat(value) {
        const buf = Buffer.alloc(4);
        buf.writeFloatBE(value);
        this.buffers.push(buf);
        return this;
    }

    writeDouble(value) {
        const buf = Buffer.alloc(8);
        buf.writeDoubleBE(value);
        this.buffers.push(buf);
        return this;
    }

    writeString(value) {
        const strBuf = Buffer.from(value, 'utf8');
        this.writeVarInt(strBuf.length);
        this.buffers.push(strBuf);
        return this;
    }

    writeBoolean(value) {
        this.writeUByte(value ? 1 : 0);
        return this;
    }

    writeUUID(uuid) {
        // UUID is 16 bytes (128 bits)
        // Can be string like "550e8400-e29b-41d4-a716-446655440000" or buffer
        if (typeof uuid === 'string') {
            const hex = uuid.replace(/-/g, '');
            const buf = Buffer.from(hex, 'hex');
            this.buffers.push(buf);
        } else {
            this.buffers.push(uuid);
        }
        return this;
    }

    writeBuffer(buf) {
        this.buffers.push(buf);
        return this;
    }

    /**
     * Build the final packet with length prefix
     * @returns {Buffer}
     */
    build() {
        // Combine packet ID + data
        const packetIdBuf = writeVarInt(this.packetId);
        const dataBuf = Buffer.concat(this.buffers);
        const packetData = Buffer.concat([packetIdBuf, dataBuf]);

        // Add length prefix
        const lengthBuf = writeVarInt(packetData.length);
        return Buffer.concat([lengthBuf, packetData]);
    }

    /**
     * Build packet data without length prefix (for compression)
     * @returns {Buffer}
     */
    buildData() {
        const packetIdBuf = writeVarInt(this.packetId);
        const dataBuf = Buffer.concat(this.buffers);
        return Buffer.concat([packetIdBuf, dataBuf]);
    }
}

/**
 * PacketReader - reads packets received from server
 */
class PacketReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    get remaining() {
        return this.buffer.length - this.offset;
    }

    readVarInt() {
        const result = readVarInt(this.buffer, this.offset);
        this.offset += result.bytesRead;
        return result.value;
    }

    readVarLong() {
        const result = readVarLong(this.buffer, this.offset);
        this.offset += result.bytesRead;
        return result.value;
    }

    readByte() {
        const value = this.buffer.readInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readUByte() {
        const value = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return value;
    }

    readShort() {
        const value = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readUShort() {
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readInt() {
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readLong() {
        const value = this.buffer.readBigInt64BE(this.offset);
        this.offset += 8;
        return value;
    }

    readFloat() {
        const value = this.buffer.readFloatBE(this.offset);
        this.offset += 4;
        return value;
    }

    readDouble() {
        const value = this.buffer.readDoubleBE(this.offset);
        this.offset += 8;
        return value;
    }

    readString() {
        const length = this.readVarInt();
        const str = this.buffer.toString('utf8', this.offset, this.offset + length);
        this.offset += length;
        return str;
    }

    readBoolean() {
        return this.readUByte() !== 0;
    }

    readUUID() {
        const buf = this.buffer.slice(this.offset, this.offset + 16);
        this.offset += 16;
        // Format as string
        const hex = buf.toString('hex');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    readBuffer(length) {
        const buf = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return buf;
    }

    readRemaining() {
        const buf = this.buffer.slice(this.offset);
        this.offset = this.buffer.length;
        return buf;
    }

    skip(bytes) {
        this.offset += bytes;
        return this;
    }
}

/**
 * Generate offline player UUID from username
 * @param {string} username 
 * @returns {string}
 */
function offlineUUID(username) {
    const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();
    // Set version to 3 (MD5 hash)
    hash[6] = (hash[6] & 0x0f) | 0x30;
    // Set variant to RFC 4122
    hash[8] = (hash[8] & 0x3f) | 0x80;

    const hex = hash.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = {
    PacketWriter,
    PacketReader,
    offlineUUID
};

/**
 * VarInt and VarLong encoding/decoding utilities
 * Minecraft uses variable-length encoded integers for efficiency
 */

const SEGMENT_BITS = 0x7F;
const CONTINUE_BIT = 0x80;

/**
 * Write a VarInt to a buffer
 * @param {number} value - The integer to encode
 * @returns {Buffer} - Encoded bytes
 */
function writeVarInt(value) {
    const bytes = [];

    // Handle negative numbers (convert to unsigned 32-bit)
    if (value < 0) {
        value = value >>> 0;
    }

    while (true) {
        if ((value & ~SEGMENT_BITS) === 0) {
            bytes.push(value);
            break;
        }
        bytes.push((value & SEGMENT_BITS) | CONTINUE_BIT);
        value >>>= 7;
    }

    return Buffer.from(bytes);
}

/**
 * Read a VarInt from a buffer
 * @param {Buffer} buffer - Buffer to read from
 * @param {number} offset - Starting offset
 * @returns {{value: number, bytesRead: number}}
 */
function readVarInt(buffer, offset = 0) {
    let value = 0;
    let position = 0;
    let currentByte;

    while (true) {
        if (offset >= buffer.length) {
            throw new Error('VarInt is too short');
        }

        currentByte = buffer[offset++];
        value |= (currentByte & SEGMENT_BITS) << position;

        if ((currentByte & CONTINUE_BIT) === 0) {
            break;
        }

        position += 7;

        if (position >= 32) {
            throw new Error('VarInt is too big');
        }
    }

    // Convert to signed 32-bit integer
    if (value > 0x7FFFFFFF) {
        value -= 0x100000000;
    }

    return { value, bytesRead: position / 7 + 1 };
}

/**
 * Write a VarLong to a buffer
 * @param {bigint} value - The 64-bit integer to encode
 * @returns {Buffer}
 */
function writeVarLong(value) {
    const bytes = [];
    value = BigInt(value);

    // Handle negative numbers
    if (value < 0n) {
        value = value & 0xFFFFFFFFFFFFFFFFn;
    }

    while (true) {
        if ((value & ~BigInt(SEGMENT_BITS)) === 0n) {
            bytes.push(Number(value));
            break;
        }
        bytes.push(Number((value & BigInt(SEGMENT_BITS)) | BigInt(CONTINUE_BIT)));
        value >>= 7n;
    }

    return Buffer.from(bytes);
}

/**
 * Read a VarLong from a buffer
 * @param {Buffer} buffer
 * @param {number} offset
 * @returns {{value: bigint, bytesRead: number}}
 */
function readVarLong(buffer, offset = 0) {
    let value = 0n;
    let position = 0n;
    let currentByte;

    while (true) {
        if (offset >= buffer.length) {
            throw new Error('VarLong is too short');
        }

        currentByte = buffer[offset++];
        value |= BigInt(currentByte & SEGMENT_BITS) << position;

        if ((currentByte & CONTINUE_BIT) === 0) {
            break;
        }

        position += 7n;

        if (position >= 64n) {
            throw new Error('VarLong is too big');
        }
    }

    return { value, bytesRead: Number(position / 7n) + 1 };
}

/**
 * Get the byte length of a VarInt
 * @param {number} value
 * @returns {number}
 */
function varIntLength(value) {
    if (value < 0) value = value >>> 0;
    if (value < 0x80) return 1;
    if (value < 0x4000) return 2;
    if (value < 0x200000) return 3;
    if (value < 0x10000000) return 4;
    return 5;
}

module.exports = {
    writeVarInt,
    readVarInt,
    writeVarLong,
    readVarLong,
    varIntLength
};

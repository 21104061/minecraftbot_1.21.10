/**
 * Advanced Chunk Parser for Minecraft Protocol 773 (1.21.10)
 * Robust parsing with multiple format detection strategies
 */

const { readVarInt } = require('./protocol/varint');

class ChunkParser {
    constructor() {
        this.blockProperties = new Map();
        this.initializeBlockProperties();
        this.debugMode = true; // Enable debug logging
        this.successfulParses = 0;
        this.failedParses = 0;
    }

    initializeBlockProperties() {
        // Air and passable blocks (non-solid)
        const nonSolid = [0]; // Air - we'll treat unknown blocks as solid for safety

        for (let id = 0; id < 1000; id++) {
            this.blockProperties.set(id, {
                solid: !nonSolid.includes(id),
                transparent: false,
                climbable: false,
                fluid: false
            });
        }
    }

    /**
     * Parse chunk data - tries multiple strategies
     */
    parseChunkData(data) {
        if (!data || data.length < 10) {
            return null;
        }

        // Try Strategy 1: Standard NBT compound with name
        let result = this.tryParseWithNamedNBT(data);
        if (result) {
            this.successfulParses++;
            return result;
        }

        // Try Strategy 2: Nameless NBT compound (network NBT)
        result = this.tryParseWithNamelessNBT(data);
        if (result) {
            this.successfulParses++;
            return result;
        }

        // Try Strategy 3: Direct VarInt length prefix
        result = this.tryParseWithLengthPrefix(data);
        if (result) {
            this.successfulParses++;
            return result;
        }

        this.failedParses++;
        if (this.debugMode && this.failedParses <= 5) {
            console.log(`[ChunkParser] All strategies failed. First 32 bytes: ${data.slice(0, Math.min(32, data.length)).toString('hex')}`);
        }
        return null;
    }

    /**
     * Strategy 1: Standard named NBT compound at start
     */
    tryParseWithNamedNBT(data) {
        try {
            let offset = 0;
            const firstByte = data.readUInt8(0);

            // Named NBT compound starts with 0x0A (TAG_Compound)
            if (firstByte !== 0x0A) {
                return null;
            }

            // Skip root tag type
            offset = 1;

            // Read and skip name length + name
            if (offset + 2 > data.length) return null;
            const nameLen = data.readUInt16BE(offset);
            offset += 2 + nameLen;

            // Parse compound contents
            offset = this.skipNBTCompoundContents(data, offset);
            if (offset === -1) return null;

            return this.parseAfterHeightmaps(data, offset);
        } catch (e) {
            return null;
        }
    }

    /**
     * Strategy 2: Nameless NBT compound (some servers use this)
     */
    tryParseWithNamelessNBT(data) {
        try {
            let offset = 0;
            const firstByte = data.readUInt8(0);

            // Nameless compound: just starts with 0x0A then directly into contents
            if (firstByte !== 0x0A) {
                return null;
            }

            offset = 1;
            // Directly into compound contents (no name)
            offset = this.skipNBTCompoundContents(data, offset);
            if (offset === -1) return null;

            return this.parseAfterHeightmaps(data, offset);
        } catch (e) {
            return null;
        }
    }

    /**
     * Strategy 3: VarInt length prefix before NBT
     */
    tryParseWithLengthPrefix(data) {
        try {
            let offset = 0;

            // Try reading VarInt length
            const lenResult = readVarInt(data, offset);
            if (lenResult.value <= 0 || lenResult.value > data.length) {
                return null;
            }
            offset += lenResult.bytesRead;

            // Skip the NBT bytes
            offset += lenResult.value;

            if (offset >= data.length) return null;

            return this.parseAfterHeightmaps(data, offset);
        } catch (e) {
            return null;
        }
    }

    /**
     * Parse chunk data after heightmaps have been skipped
     */
    parseAfterHeightmaps(data, offset) {
        try {
            // Read Data array size
            const sizeResult = readVarInt(data, offset);
            if (sizeResult.value <= 0) return null;
            offset += sizeResult.bytesRead;

            const dataSize = sizeResult.value;
            if (offset + dataSize > data.length) {
                return null;
            }

            const chunkData = data.slice(offset, offset + dataSize);

            // Parse sections
            const sections = this.parseSections(chunkData);

            if (this.debugMode && this.successfulParses < 3) {
                console.log(`[ChunkParser] SUCCESS: Parsed ${sections.length} sections from ${dataSize} bytes`);
            }

            return {
                sections: sections,
                heightmaps: null,
                blockEntities: []
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Skip NBT compound contents until TAG_End
     */
    skipNBTCompoundContents(data, offset) {
        try {
            let depth = 0;
            const maxIterations = 10000;
            let iterations = 0;

            while (offset < data.length && iterations < maxIterations) {
                iterations++;
                const tagType = data.readUInt8(offset);
                offset++;

                // TAG_End
                if (tagType === 0) {
                    return offset;
                }

                // Read tag name
                if (offset + 2 > data.length) return -1;
                const nameLen = data.readUInt16BE(offset);
                offset += 2;
                if (offset + nameLen > data.length) return -1;
                offset += nameLen;

                // Skip payload based on tag type
                offset = this.skipNBTPayload(data, offset, tagType);
                if (offset === -1) return -1;
            }
            return -1;
        } catch (e) {
            return -1;
        }
    }

    /**
     * Skip NBT tag payload
     */
    skipNBTPayload(data, offset, tagType) {
        try {
            switch (tagType) {
                case 1: return offset + 1;  // Byte
                case 2: return offset + 2;  // Short
                case 3: return offset + 4;  // Int
                case 4: return offset + 8;  // Long
                case 5: return offset + 4;  // Float
                case 6: return offset + 8;  // Double
                case 7: // Byte Array
                    if (offset + 4 > data.length) return -1;
                    const baLen = data.readInt32BE(offset);
                    return offset + 4 + baLen;
                case 8: // String
                    if (offset + 2 > data.length) return -1;
                    const sLen = data.readUInt16BE(offset);
                    return offset + 2 + sLen;
                case 9: // List
                    if (offset + 5 > data.length) return -1;
                    const listType = data.readUInt8(offset);
                    const listLen = data.readInt32BE(offset + 1);
                    offset += 5;
                    for (let i = 0; i < listLen; i++) {
                        offset = this.skipNBTPayload(data, offset, listType);
                        if (offset === -1) return -1;
                    }
                    return offset;
                case 10: // Compound
                    return this.skipNBTCompoundContents(data, offset);
                case 11: // Int Array
                    if (offset + 4 > data.length) return -1;
                    const iaLen = data.readInt32BE(offset);
                    return offset + 4 + iaLen * 4;
                case 12: // Long Array
                    if (offset + 4 > data.length) return -1;
                    const laLen = data.readInt32BE(offset);
                    return offset + 4 + laLen * 8;
                default:
                    return -1;
            }
        } catch (e) {
            return -1;
        }
    }

    /**
     * Parse chunk sections
     */
    parseSections(data) {
        const sections = [];
        let offset = 0;

        if (this.debugMode && this.successfulParses <= 3) {
            console.log(`[ChunkParser] Parsing sections from ${data.length} bytes of data`);
        }

        while (offset < data.length && sections.length < 24) {
            try {
                const section = this.parseSection(data, offset);
                if (!section) {
                    if (this.debugMode && this.successfulParses <= 3) {
                        console.log(`[ChunkParser] Section parse failed at offset ${offset}, data remaining: ${data.length - offset}`);
                    }
                    break;
                }
                sections.push(section);
                offset = section.nextOffset;
            } catch (e) {
                if (this.debugMode && this.successfulParses <= 3) {
                    console.log(`[ChunkParser] Section exception at offset ${offset}: ${e.message}`);
                }
                break;
            }
        }

        return sections;
    }


    /**
     * Parse a single section
     */
    parseSection(data, offset) {
        if (offset + 3 > data.length) return null;

        try {
            // Block count (short)
            const blockCount = data.readInt16BE(offset);
            offset += 2;

            // Block states paletted container
            const blockStates = this.readPalettedContainer(data, offset, 4096);
            if (!blockStates) return null;
            offset = blockStates.nextOffset;

            // Biomes paletted container (smaller: 64 entries for 4x4x4 biome sections)
            const biomes = this.readPalettedContainer(data, offset, 64);
            if (!biomes) return null;
            offset = biomes.nextOffset;

            return {
                blockCount: blockCount,
                blockStates: blockStates.data,
                palette: blockStates.palette,
                nextOffset: offset
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Read paletted container
     */
    readPalettedContainer(data, offset, expectedEntries) {
        if (offset >= data.length) return null;

        try {
            const bitsPerEntry = data.readUInt8(offset);
            offset++;

            let palette = [];
            let blockData = [];

            if (bitsPerEntry === 0) {
                // Single value palette
                const valueResult = readVarInt(data, offset);
                offset += valueResult.bytesRead;
                palette = [valueResult.value];

                // Data array length (should be 0)
                const dataLenResult = readVarInt(data, offset);
                offset += dataLenResult.bytesRead;
                offset += dataLenResult.value * 8;

                blockData = new Array(expectedEntries).fill(valueResult.value);
            } else if (bitsPerEntry <= 8) {
                // Indirect palette
                const palLenResult = readVarInt(data, offset);
                offset += palLenResult.bytesRead;

                for (let i = 0; i < palLenResult.value; i++) {
                    const entryResult = readVarInt(data, offset);
                    offset += entryResult.bytesRead;
                    palette.push(entryResult.value);
                }

                // Data array
                const dataLenResult = readVarInt(data, offset);
                offset += dataLenResult.bytesRead;

                if (offset + dataLenResult.value * 8 > data.length) return null;

                blockData = this.unpackPalettedData(data, offset, dataLenResult.value, bitsPerEntry, palette, expectedEntries);
                offset += dataLenResult.value * 8;
            } else {
                // Direct palette (no palette array, just data)
                const dataLenResult = readVarInt(data, offset);
                offset += dataLenResult.bytesRead;

                if (offset + dataLenResult.value * 8 > data.length) return null;

                blockData = this.unpackDirectData(data, offset, dataLenResult.value, bitsPerEntry, expectedEntries);
                offset += dataLenResult.value * 8;
            }

            return {
                palette: palette,
                data: blockData,
                nextOffset: offset
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Unpack paletted data from longs
     */
    unpackPalettedData(data, offset, longCount, bitsPerEntry, palette, expectedEntries) {
        const result = new Array(expectedEntries).fill(0);
        const mask = (1n << BigInt(bitsPerEntry)) - 1n;
        const entriesPerLong = Math.floor(64 / bitsPerEntry);
        let entryIndex = 0;

        for (let i = 0; i < longCount && entryIndex < expectedEntries; i++) {
            const long = data.readBigUInt64BE(offset + i * 8);

            for (let j = 0; j < entriesPerLong && entryIndex < expectedEntries; j++) {
                const shift = BigInt(j * bitsPerEntry);
                const paletteIndex = Number((long >> shift) & mask);
                result[entryIndex] = palette[paletteIndex] || 0;
                entryIndex++;
            }
        }

        return result;
    }

    /**
     * Unpack direct data from longs
     */
    unpackDirectData(data, offset, longCount, bitsPerEntry, expectedEntries) {
        const result = new Array(expectedEntries).fill(0);
        const mask = (1n << BigInt(bitsPerEntry)) - 1n;
        const entriesPerLong = Math.floor(64 / bitsPerEntry);
        let entryIndex = 0;

        for (let i = 0; i < longCount && entryIndex < expectedEntries; i++) {
            const long = data.readBigUInt64BE(offset + i * 8);

            for (let j = 0; j < entriesPerLong && entryIndex < expectedEntries; j++) {
                const shift = BigInt(j * bitsPerEntry);
                result[entryIndex] = Number((long >> shift) & mask);
                entryIndex++;
            }
        }

        return result;
    }

    /**
     * Coordinate conversion
     */
    coordsToIndex(x, y, z) {
        return y * 256 + z * 16 + x;
    }

    indexToCoords(index) {
        const y = Math.floor(index / 256);
        const z = Math.floor((index % 256) / 16);
        const x = index % 16;
        return { x, y, z };
    }

    /**
     * Get block properties
     */
    getBlockProperties(blockStateId) {
        if (blockStateId === 0) {
            return { solid: false, transparent: true, climbable: false, fluid: false };
        }
        return this.blockProperties.get(blockStateId) || { solid: true, transparent: false, climbable: false, fluid: false };
    }

    /**
     * Get parsing stats
     */
    getStats() {
        return {
            successful: this.successfulParses,
            failed: this.failedParses,
            successRate: this.successfulParses / (this.successfulParses + this.failedParses) || 0
        };
    }
}

module.exports = { ChunkParser };

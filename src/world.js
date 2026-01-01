/**
 * World state tracker
 * Tracks loaded chunks and block data for pathfinding
 */

const { logger } = require('./logger');

class World {
    constructor() {
        this.chunks = new Map(); // Map of "chunkX,chunkZ" -> chunk data
        this.blocks = new Map(); // Map of "x,y,z" -> block state ID
        this.chunkCount = 0;
    }

    /**
     * Store chunk data (called when chunk packet received)
     * @param {number} chunkX - Chunk X coordinate
     * @param {number} chunkZ - Chunk Z coordinate
     * @param {Buffer} data - Raw chunk data (we'll skip palette parsing for now)
     */
    storeChunk(chunkX, chunkZ, data) {
        const key = `${chunkX},${chunkZ}`;
        this.chunks.set(key, {
            x: chunkX,
            z: chunkZ,
            data: data,
            loaded: true
        });
        this.chunkCount++;

        // For now, mark all blocks in this chunk as "unknown but loaded"
        // This prevents pathfinding through unloaded chunks
        // In a full implementation, we'd parse the palette and block states
        logger.debug(`[World] Stored chunk (${chunkX}, ${chunkZ}) - Total chunks: ${this.chunkCount}`);
    }

    /**
     * Check if chunk is loaded
     * @param {number} chunkX
     * @param {number} chunkZ
     * @returns {boolean}
     */
    isChunkLoaded(chunkX, chunkZ) {
        return this.chunks.has(`${chunkX},${chunkZ}`);
    }

    /**
     * Get block at position
     * @param {number} x - Block X coordinate
     * @param {number} y - Block Y coordinate
     * @param {number} z - Block Z coordinate
     * @returns {number} Block state ID (0 = air, -1 = unknown/unloaded)
     */
    getBlock(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);

        // Check if chunk is loaded
        const chunkX = Math.floor(bx / 16);
        const chunkZ = Math.floor(bz / 16);

        if (!this.isChunkLoaded(chunkX, chunkZ)) {
            return -1; // Unknown - chunk not loaded
        }

        const key = `${bx},${by},${bz}`;
        const block = this.blocks.get(key);

        // If we have explicit block data, use it
        if (block !== undefined) {
            return block;
        }

        // Chunk is loaded but no explicit data
        // Since we don't parse full chunk data yet, we must assume blocks are AIR
        // unless we have explicit block data. This allows movement to work.
        // The server will correct us if we move into a real block.
        //
        // NOTE: This is a temporary workaround. For proper collision detection,
        // chunk palette parsing should be implemented.

        if (by < -64) return 0;  // Void = air
        if (by > 320) return 0;  // Above build limit = air

        // Assume everything is air - let the server physics be the authority
        // This fixes the issue where bot couldn't move because Y<100 was assumed solid
        return 0;
    }

    /**
     * Set block at position (for explicit block updates)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} blockStateId
     */
    setBlock(x, y, z, blockStateId) {
        const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
        this.blocks.set(key, blockStateId);
    }

    /**
     * Check if block is solid (not passable)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isSolid(x, y, z) {
        const blockId = this.getBlock(x, y, z);

        // -1 = unloaded chunk, treat as solid to prevent pathfinding through it
        if (blockId === -1) return true;

        // 0 = air, not solid
        if (blockId === 0) return false;

        // Everything else is solid
        // TODO: Add list of non-solid blocks (water, flowers, etc.)
        return true;
    }

    /**
     * Check if position is safe to stand on
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isSafeStanding(x, y, z) {
        // Need floor below (Y-1)
        const hasFloor = this.isSolid(x, y - 1, z);

        // Need air at feet (Y) and head (Y+1)  
        const feetClear = !this.isSolid(x, y, z);
        const headClear = !this.isSolid(x, y + 1, z);

        return hasFloor && feetClear && headClear;
    }

    /**
     * Check if bot has head clearance to jump
     * @param {number} x
     * @param {number} y - Current feet position
     * @param {number} z
     * @returns {boolean}
     */
    hasJumpClearance(x, y, z) {
        // When jumping, bot reaches ~1.25 blocks high
        // Check Y+1 (head when standing) and Y+2 (head when jumping)
        return !this.isSolid(x, y + 1, z) && !this.isSolid(x, y + 2, z);
    }

    /**
     * Check if can move from one position to another
     * @param {Object} from {x, y, z}
     * @param {Object} to {x, y, z}
     * @returns {boolean}
     */
    canMove(from, to) {
        const dx = Math.abs(to.x - from.x);
        const dy = to.y - from.y;
        const dz = Math.abs(to.z - from.z);

        // Check height difference
        if (dy > 1) return false; // Can't climb more than 1 block
        if (dy < -3) return false; // Can't fall more than 3 blocks safely

        // Check if destination is safe
        if (!this.isSafeStanding(to.x, to.y, to.z)) return false;

        // If climbing up, check jump clearance
        if (dy > 0 && !this.hasJumpClearance(from.x, from.y, from.z)) {
            return false;
        }

        // Check horizontal distance (should be adjacent)
        if (dx > 1 || dz > 1) return false;

        return true;
    }

    /**
     * Clear all world data
     */
    clear() {
        this.chunks.clear();
        this.blocks.clear();
        this.chunkCount = 0;
    }
}

module.exports = { World };

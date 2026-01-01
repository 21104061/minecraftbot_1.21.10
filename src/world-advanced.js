/**
 * Advanced World System with 3D Block Parsing
 * Maintains a complete 3D map of the Minecraft world
 */

const { ChunkParser } = require('./chunk-parser');
const { logger } = require('./logger');

class WorldAdvanced {
    constructor() {
        this.parser = new ChunkParser();

        // Storage: Map<chunkKey, ChunkData>
        this.chunks = new Map();

        // Fast block lookup: Map<blockKey, blockStateId>
        this.blockCache = new Map();

        // Per-chunk block keys for efficient unloading
        this.chunkBlocks = new Map(); // chunkKey -> Set<blockKey>

        // Chunk loading statistics
        this.stats = {
            chunksLoaded: 0,
            blocksIndexed: 0,
            lastUpdate: Date.now()
        };
    }

    /**
     * Store and parse chunk data
     * @param {number} chunkX
     * @param {number} chunkZ
     * @param {Buffer} data - Raw chunk packet data
     */
    storeChunk(chunkX, chunkZ, data) {
        const key = this.chunkKey(chunkX, chunkZ);

        // Parse chunk data
        const parsed = this.parser.parseChunkData(data);
        if (!parsed) {
            // Log parsing stats periodically
            const stats = this.parser.getStats();
            if (stats.failed <= 5 || stats.failed % 50 === 0) {
                console.log(`[World] Parse failed (${chunkX}, ${chunkZ}) - Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
            }
            return;
        }

        // Store chunk
        this.chunks.set(key, {
            x: chunkX,
            z: chunkZ,
            sections: parsed.sections,
            lastUpdate: Date.now()
        });

        // Index blocks for fast lookup
        this.indexChunkBlocks(chunkX, chunkZ, parsed.sections);

        this.stats.chunksLoaded++;

        // Log success periodically
        if (this.stats.chunksLoaded <= 3 || this.stats.chunksLoaded % 20 === 0) {
            console.log(`[World] ✓ Chunk (${chunkX}, ${chunkZ}) - ${parsed.sections.length} sections, ${this.stats.chunksLoaded} total loaded`);
        }
    }


    /**
     * Index all blocks in a chunk for fast lookup
     * @param {number} chunkX
     * @param {number} chunkZ
     * @param {Array} sections
     */
    indexChunkBlocks(chunkX, chunkZ, sections) {
        let indexed = 0;
        const chunkKey = this.chunkKey(chunkX, chunkZ);

        // Initialize chunk block set for efficient unloading
        if (!this.chunkBlocks.has(chunkKey)) {
            this.chunkBlocks.set(chunkKey, new Set());
        }
        const blockKeys = this.chunkBlocks.get(chunkKey);

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const section = sections[sectionIndex];
            if (!section || !section.blockStates) continue;

            // Section Y level (each section is 16 blocks tall)
            // Minecraft 1.21: sections start at Y=-64
            const sectionY = -4 + sectionIndex; // -4 * 16 = -64
            const baseY = sectionY * 16;

            // Index all 4096 blocks in this section
            for (let i = 0; i < section.blockStates.length; i++) {
                const blockStateId = section.blockStates[i];

                // Skip air blocks to save memory
                if (blockStateId === 0) continue;

                // Convert index to local coordinates
                const local = this.parser.indexToCoords(i);

                // Convert to world coordinates
                const worldX = chunkX * 16 + local.x;
                const worldY = baseY + local.y;
                const worldZ = chunkZ * 16 + local.z;

                // Store in cache
                const blockKey = this.blockKey(worldX, worldY, worldZ);
                this.blockCache.set(blockKey, blockStateId);
                blockKeys.add(blockKey);
                indexed++;
            }
        }

        this.stats.blocksIndexed += indexed;
        logger.debug(`[World] Indexed ${indexed} blocks in chunk (${chunkX}, ${chunkZ})`);
    }

    /**
     * Get block at world coordinates
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number} Block state ID (0 = air, -1 = unloaded)
     */
    getBlock(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);

        // Check if chunk is loaded
        const chunkX = Math.floor(bx / 16);
        const chunkZ = Math.floor(bz / 16);

        if (!this.isChunkLoaded(chunkX, chunkZ)) {
            return -1; // Unloaded
        }

        // Fast lookup from cache
        const key = this.blockKey(bx, by, bz);
        const blockStateId = this.blockCache.get(key);

        // If not in cache, it's air (we only cache non-air blocks)
        return blockStateId !== undefined ? blockStateId : 0;
    }

    /**
     * Check if block is solid (impassable)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isSolid(x, y, z) {
        const blockId = this.getBlock(x, y, z);

        if (blockId === -1) return true;  // Unloaded = treat as solid
        if (blockId === 0) return false;  // Air = not solid

        const props = this.parser.getBlockProperties(blockId);
        return props.solid;
    }

    /**
     * Check if block is climbable (ladder, vine)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isClimbable(x, y, z) {
        const blockId = this.getBlock(x, y, z);
        if (blockId <= 0) return false;

        const props = this.parser.getBlockProperties(blockId);
        return props.climbable;
    }

    /**
     * Check if block is fluid (water, lava)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    isFluid(x, y, z) {
        const blockId = this.getBlock(x, y, z);
        if (blockId <= 0) return false;

        const props = this.parser.getBlockProperties(blockId);
        return props.fluid;
    }

    /**
     * Check if position is walkable (air at feet, solid below)
     * @param {number} x
     * @param {number} y - Feet position
     * @param {number} z
     * @returns {boolean}
     */
    isWalkable(x, y, z) {
        // Must have solid ground below
        const hasFloor = this.isSolid(x, y - 1, z);

        // Must have air at feet and head
        const feetClear = !this.isSolid(x, y, z);
        const headClear = !this.isSolid(x, y + 1, z);

        return hasFloor && feetClear && headClear;
    }

    /**
     * Check if can jump from position (2 blocks clearance above)
     * @param {number} x
     * @param {number} y - Feet position
     * @param {number} z
     * @returns {boolean}
     */
    canJump(x, y, z) {
        return !this.isSolid(x, y + 2, z);
    }

    /**
     * Find floor level below position (for falling)
     * @param {number} x
     * @param {number} y - Starting Y
     * @param {number} z
     * @param {number} maxFall - Maximum blocks to search down
     * @returns {number} Floor Y level, or -1 if not found
     */
    findFloorBelow(x, y, z, maxFall = 10) {
        for (let dy = 0; dy <= maxFall; dy++) {
            const checkY = Math.floor(y) - dy;
            if (this.isSolid(x, checkY, z)) {
                return checkY + 1; // Return position above solid block
            }
        }
        return -1; // No floor found
    }

    /**
     * Get movement cost for a position (used in pathfinding)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number} Cost multiplier (1.0 = normal, higher = avoid)
     */
    getMovementCost(x, y, z) {
        let cost = 1.0;

        // Check for hazards
        if (this.isFluid(x, y, z)) cost += 2.0;      // Water/lava penalty
        if (this.isFluid(x, y - 1, z)) cost += 1.5;  // Standing in fluid

        // Prefer paths with nearby walls (safer)
        let wallCount = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dz === 0) continue;
                if (this.isSolid(x + dx, y, z + dz)) wallCount++;
            }
        }
        if (wallCount === 0) cost += 0.5; // Open space penalty (risk of falling)

        return cost;
    }

    /**
     * Check if chunk is loaded
     * @param {number} chunkX
     * @param {number} chunkZ
     * @returns {boolean}
     */
    isChunkLoaded(chunkX, chunkZ) {
        return this.chunks.has(this.chunkKey(chunkX, chunkZ));
    }

    /**
     * Get all loaded chunks in range
     * @param {number} centerX - World X coordinate
     * @param {number} centerZ - World Z coordinate
     * @param {number} range - Chunk radius
     * @returns {Array} Array of chunk coordinates
     */
    getLoadedChunksInRange(centerX, centerZ, range) {
        const centerChunkX = Math.floor(centerX / 16);
        const centerChunkZ = Math.floor(centerZ / 16);
        const loaded = [];

        for (let dx = -range; dx <= range; dx++) {
            for (let dz = -range; dz <= range; dz++) {
                const chunkX = centerChunkX + dx;
                const chunkZ = centerChunkZ + dz;

                if (this.isChunkLoaded(chunkX, chunkZ)) {
                    loaded.push({ x: chunkX, z: chunkZ });
                }
            }
        }

        return loaded;
    }

    /**
     * Get world statistics
     * @returns {Object} Stats
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.blockCache.size,
            memoryEstimate: this.estimateMemoryUsage()
        };
    }

    /**
     * Estimate memory usage (rough)
     * @returns {string} Memory usage
     */
    estimateMemoryUsage() {
        const bytes = this.blockCache.size * 50; // ~50 bytes per entry
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * Clear old chunks to save memory
     * @param {number} centerX
     * @param {number} centerZ
     * @param {number} keepRange - Chunks to keep around center
     */
    clearDistantChunks(centerX, centerZ, keepRange = 8) {
        const centerChunkX = Math.floor(centerX / 16);
        const centerChunkZ = Math.floor(centerZ / 16);
        let cleared = 0;

        for (const [key, chunk] of this.chunks) {
            const dx = Math.abs(chunk.x - centerChunkX);
            const dz = Math.abs(chunk.z - centerChunkZ);
            const dist = Math.max(dx, dz);

            if (dist > keepRange) {
                this.unloadChunk(chunk.x, chunk.z);
                cleared++;
            }
        }

        if (cleared > 0) {
            logger.info(`[World] Cleared ${cleared} distant chunks`);
        }
    }

    /**
     * Unload a chunk and its blocks from cache (optimized version)
     * @param {number} chunkX
     * @param {number} chunkZ
     */
    unloadChunk(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        this.chunks.delete(key);

        // Efficiently remove blocks using pre-tracked block keys
        const blockKeys = this.chunkBlocks.get(key);
        if (blockKeys) {
            for (const blockKey of blockKeys) {
                this.blockCache.delete(blockKey);
            }
            this.chunkBlocks.delete(key);
        }
    }

    /**
     * Generate chunk key
     * @param {number} x
     * @param {number} z
     * @returns {string}
     */
    chunkKey(x, z) {
        return `${x},${z}`;
    }

    /**
     * Generate block key
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {string}
     */
    blockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    /**
     * Clear all world data
     */
    clear() {
        this.chunks.clear();
        this.blockCache.clear();
        this.chunkBlocks.clear();
        this.stats = {
            chunksLoaded: 0,
            blocksIndexed: 0,
            lastUpdate: Date.now()
        };
    }
}

module.exports = { WorldAdvanced };

/**
 * Entity Tracking System
 * Tracks players, mobs, and other entities for environmental awareness
 */

class EntityTracker {
    constructor() {
        this.entities = new Map(); // entityId -> entity data
    }

    /**
     * Add a new entity
     */
    addEntity(entityId, type, x, y, z) {
        this.entities.set(entityId, {
            id: entityId,
            type: type,
            position: { x, y, z },
            lastUpdate: Date.now()
        });
    }

    /**
     * Update entity position
     */
    updatePosition(entityId, x, y, z) {
        if (this.entities.has(entityId)) {
            const entity = this.entities.get(entityId);
            entity.position = { x, y, z };
            entity.lastUpdate = Date.now();
        }
    }

    /**
     * Remove entity
     */
    removeEntity(entityId) {
        this.entities.delete(entityId);
    }

    /**
     * Get entities near a position
     * @param {Object} position {x, y, z}
     * @param {number} radius - Search radius in blocks
     * @returns {Array} Array of nearby entities
     */
    getNearbyEntities(position, radius) {
        const nearby = [];
        for (const [id, entity] of this.entities) {
            const dx = entity.position.x - position.x;
            const dz = entity.position.z - position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance <= radius) {
                nearby.push({ ...entity, distance });
            }
        }
        return nearby;
    }

    /**
     * Get entities blocking a path
     * @param {Object} from {x, y, z}
     * @param {Object} to {x, y, z}
     * @param {number} radius - Detection radius
     * @returns {Array} Entities in the path
     */
    getBlockingEntities(from, to, radius = 1.0) {
        const blocking = [];
        for (const [id, entity] of this.entities) {
            // Check if entity is near the line from->to
            const dist = this.pointToLineDistance(entity.position, from, to);
            if (dist < radius) {
                blocking.push(entity);
            }
        }
        return blocking;
    }

    /**
     * Calculate perpendicular distance from point to line segment
     */
    pointToLineDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dz = lineEnd.z - lineStart.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length === 0) return this.distance2D(point, lineStart);

        const t = Math.max(0, Math.min(1,
            ((point.x - lineStart.x) * dx + (point.z - lineStart.z) * dz) / (length * length)
        ));

        const nearestX = lineStart.x + t * dx;
        const nearestZ = lineStart.z + t * dz;

        return this.distance2D(point, { x: nearestX, z: nearestZ });
    }

    /**
     * 2D distance (XZ plane)
     */
    distance2D(a, b) {
        const dx = a.x - b.x;
        const dz = (a.z || 0) - (b.z || 0);
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Get total entity count
     */
    getEntityCount() {
        return this.entities.size;
    }

    /**
     * Clear all entities
     */
    clear() {
        this.entities.clear();
    }
}

module.exports = { EntityTracker };

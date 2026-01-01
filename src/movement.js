/**
 * Physics-based movement controller with anti-cheat compliance
 * Handles gravity, jumping, and realistic movement speeds
 */

const { PacketWriter } = require('./protocol/packet');
const { logger } = require('./logger');

// Serverbound movement packet IDs (Protocol 773)
const C2S_SET_PLAYER_POSITION_AND_ROTATION = 0x1E;

class Movement {
    constructor(client, connection, world) {
        this.client = client;
        this.connection = connection;
        this.world = world;
        this.isMoving = false;
        this.targetPosition = null;
        this.path = [];
        this.currentPathIndex = 0;
        this.moveInterval = null;

        // Movement parameters - VANILLA COMPLIANT
        // Walk speed: 4.317 blocks/sec = 0.216 blocks/tick @ 20 ticks/sec
        this.speed = 4.317;          // Vanilla walking speed in blocks/sec
        this.tickRate = 50;          // 50ms = 20 ticks/sec (VANILLA)
        this.stuckCounter = 0;
        this.maxStuckTicks = 40;     // 2 seconds before declaring stuck

        // Physics constants - VANILLA EXACT
        this.velocity = { x: 0, y: 0, z: 0 };
        this.onGround = true;        // Start on ground
        this.gravity = 0.08;         // Vanilla: subtract 0.08 per tick when falling
        this.drag = 0.98;            // Vanilla: multiply velocity by 0.98 per tick
        this.maxFallSpeed = 3.92;    // Vanilla: max fall speed (clamped)
        this.jumpVelocity = 0.42;    // Vanilla: initial jump velocity

        // Rotation tracking - MUST SEND ACCURATE VALUES
        this.yaw = 0;
        this.pitch = 0;

        // Position update throttling (vanilla sends every tick)
        this.positionUpdateCounter = 0;
        this.updateFrequency = 1;    // Send EVERY tick (vanilla behavior)
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.tickCount = 0;          // Track total ticks for debugging

        // SMART PATHFINDING: Failed route tracking
        this.failedRoutes = new Set();
        this.attemptedPaths = [];
        this.maxPathAttempts = 3;
        this.lastMoveTime = Date.now();
        this.movementHistory = [];
        this.maxHistorySize = 20;

        // Cooldown after server position reset - CRITICAL for anti-cheat
        this.movementCooldown = 0;   // Ticks to wait before moving
        this.cooldownAfterReset = 10; // Wait 10 ticks (0.5 sec) after server resets us
        this.awaitingTeleportConfirm = false; // True while waiting for teleport response

        // Teleport recovery state
        this.justTeleported = false;  // True after server teleport, until recovered
        this.teleportAnchor = null;   // Server's authoritative position after teleport

        // ENVIRONMENTAL AWARENESS: Dynamic path recalculation
        this.pathRecalcInterval = null;
        this.recalcFrequency = 2000; // Recalculate every 2 seconds
    }

    /**
     * Validate if a single waypoint is reachable from current position
     * This checks TERRAIN constraints for the next step
     */
    validateWaypoint(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);

        // XZ-FIRST STRATEGY: Only validate horizontal distance
        // Y differences are handled separately by gravity system

        // Check if waypoint is too far horizontally
        if (horizontalDist > 10) {
            return { valid: false, reason: 'Step too large horizontally' };
        }

        // That's it! Y validation removed since we're doing XZ-first
        return { valid: true, reason: 'Waypoint reachable' };
    }

    /**
     * Validate entire path and remove impossible waypoints
     */
    validatePath(path) {
        if (path.length === 0) return path;

        const validPath = [path[0]]; // Start is always valid
        let removedCount = 0;

        for (let i = 1; i < path.length; i++) {
            const from = validPath[validPath.length - 1];
            const to = path[i];

            const validation = this.validateWaypoint(from, to);
            if (validation.valid) {
                validPath.push(to);
            } else {
                // Skip this waypoint, try next one
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`[Movement] Filtered ${removedCount} impossible waypoints`);
        }

        return validPath;
    }

    /**
     * Validate if target coordinates are reasonable (final destination check)
     */
    validateTarget(x, y, z) {
        const current = this.client.position;
        if (!current) return { valid: false, reason: 'Unknown position' };

        // Check if target is buried (too low)
        if (y < -60) {
            return { valid: false, reason: `Target too low (Y=${y}) - may be underground/void` };
        }

        // Check if target is too high (above build limit)
        if (y > 320) {
            return { valid: false, reason: `Target too high (Y=${y}) - above build limit` };
        }

        // Check if target is impossibly far
        const totalDist = Math.sqrt(
            Math.pow(x - current.x, 2) +
            Math.pow(y - current.y, 2) +
            Math.pow(z - current.z, 2)
        );
        if (totalDist > 500) {
            return { valid: false, reason: `Target too far away (${totalDist.toFixed(0)} blocks)` };
        }

        return { valid: true, reason: 'Target appears reachable' };
    }

    /**
     * Generate hash for a route to track failed attempts
     */
    getRouteHash(start, end) {
        return `${Math.floor(start.x)},${Math.floor(start.y)},${Math.floor(start.z)}->${Math.floor(end.x)},${Math.floor(end.y)},${Math.floor(end.z)}`;
    }

    /**
     * Check if we're stuck in a loop (visiting same positions)
     */
    detectLoop() {
        if (this.movementHistory.length < 5) return false;

        const current = this.client.position;
        const recent = this.movementHistory.slice(-10);

        // Count how many times we've been near this position
        let nearbyCount = 0;
        for (const pos of recent) {
            const dist = Math.sqrt(
                Math.pow(pos.x - current.x, 2) +
                Math.pow(pos.z - current.z, 2)
            );
            if (dist < 2.0) nearbyCount++;
        }

        // If we've been near this spot 3+ times in recent history, we're looping
        return nearbyCount >= 3;
    }

    /**
     * Move to a target position using pathfinding
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    goto(x, y, z) {
        if (!this.client.position) {
            console.log('[Movement] Cannot move: position unknown');
            return;
        }

        // Validate target coordinates
        const validation = this.validateTarget(x, y, z);
        if (!validation.valid) {
            console.log(`[Movement] ✗ Invalid target: ${validation.reason}`);
            return;
        }

        this.targetPosition = { x, y, z };
        this.isMoving = true;
        this.stuckCounter = 0;
        this.lastMoveTime = Date.now();
        this.movementHistory = []; // Reset history for new goal

        const distance = this.distanceXZ(this.client.position, { x, y, z });
        console.log(`[Movement] 🚶 Moving to X/Z: (${x.toFixed(0)}, ${z.toFixed(0)}) - ${distance.toFixed(0)} blocks away`);
        console.log(`[Movement] Target Y: ${y.toFixed(0)} (will adjust after reaching X/Z)`);
        console.log(`[Movement] Target validation: ${validation.reason}`);

        // Calculate initial path
        this.calculatePath(true);

        // Start movement loop (clear any existing interval to prevent double execution)
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
        }

        this.moveInterval = setInterval(() => this.tick(), this.tickRate);
        console.log(`[Movement] ✓ Tick loop started (${this.tickRate}ms interval, ${this.path.length} waypoints)`);

        // Start dynamic path recalculation for environment awareness
        if (this.pathRecalcInterval) {
            clearInterval(this.pathRecalcInterval);
        }

        this.pathRecalcInterval = setInterval(() => {
            if (!this.isMoving) return;

            // Check for entities blocking the path
            if (this.client.entityTracker && this.path.length > 0 && this.currentPathIndex < this.path.length) {
                const nextWaypoint = this.path[this.currentPathIndex];
                const blocking = this.client.entityTracker.getBlockingEntities(
                    this.client.position,
                    nextWaypoint,
                    2.0  // 2 block radius
                );

                if (blocking.length > 0) {
                    console.log(`[Movement] 🚧 Detected ${blocking.length} entities in path - recalculating...`);
                    this.calculatePath();
                }
            }

            // Periodic recalc to handle environment changes
            const distToTarget = this.getDistanceToTarget();
            if (distToTarget && distToTarget > 10) {  // Only for longer journeys
                console.log('[Movement] 🔄 Periodic path update...');
                this.calculatePath();
            }
        }, this.recalcFrequency);
    }

    /**
     * Calculate path to target (horizontal only, physics handles Y)
     * @param {boolean} isInitial - If true, this is the first calculation (send chat)
     */
    /**
     * Calculate path to target with route avoidance
     * @param {boolean} isInitial - If true, this is the first calculation
     */
    calculatePath(isInitial = false) {
        const start = {
            x: Math.floor(this.client.position.x),
            y: Math.floor(this.client.position.y),
            z: Math.floor(this.client.position.z)
        };

        // XZ-FIRST STRATEGY: Ignore Y coordinate in pathfinding
        // Navigate to X/Z first, then adjust Y afterward
        const target = {
            x: Math.floor(this.targetPosition.x),
            y: Math.floor(this.client.position.y),  // Use current Y for pathfinding
            z: Math.floor(this.targetPosition.z)
        };

        // Limit pathfinding iterations to prevent spam
        const maxIterations = 100;

        // Check if we've failed this route before
        const routeHash = this.getRouteHash(start, target);
        if (this.failedRoutes.has(routeHash)) {
            console.log('[Movement] ⚠ This route failed before - trying offset target...');
            // Try a slightly different target (offset by 2 blocks)
            target.x += (Math.random() - 0.5) * 4;
            target.z += (Math.random() - 0.5) * 4;
        }

        // Try pathfinding
        let rawPath = this.findPath(start, target);

        // VALIDATE PATH - filter out impossible waypoints
        if (rawPath.length > 0) {
            const originalLength = rawPath.length;
            this.path = this.validatePath(rawPath);
            if (this.path.length < originalLength) {
                console.log(`[Movement] Validated: ${this.path.length}/${originalLength} waypoints reachable`);
            }
        } else {
            this.path = rawPath;
        }

        this.currentPathIndex = 0;
        this.stuckCounter = 0;

        // Track this attempt
        this.attemptedPaths.push({
            hash: routeHash,
            time: Date.now(),
            success: this.path.length > 0
        });

        // Clean old attempts (keep last 10)
        if (this.attemptedPaths.length > 10) {
            this.attemptedPaths = this.attemptedPaths.slice(-10);
        }

        if (this.path.length === 0) {
            console.log('[Movement] ✗ No path found!');

            // Mark this route as failed
            this.failedRoutes.add(routeHash);

            // If we've tried too many times, give up
            const recentFailures = this.attemptedPaths.filter(
                a => !a.success && Date.now() - a.time < 30000
            ).length;

            if (recentFailures >= this.maxPathAttempts) {
                console.log(`[Movement] ✗ Failed ${recentFailures} times - target may be unreachable`);
            }

            this.stop();
        } else {
            console.log(`[Movement] Path calculated: ${this.path.length} waypoints`);
        }
    }

    /**
     * Optimized A* pathfinding with timeout and progress tracking
     * @param {Object} start {x, y, z}
     * @param {Object} goal {x, y, z}
     * @returns {Array} Path as array of {x, y, z} positions
     */
    findPath(start, goal) {
        const openSet = [start];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const key = (pos) => `${pos.x},${pos.y},${pos.z}`;

        gScore.set(key(start), 0);
        fScore.set(key(start), this.heuristic(start, goal));

        let iterations = 0;
        const maxIterations = 2000; // Reduced from 5000 for performance
        const startTime = Date.now();
        const maxTime = 3000; // 3 second timeout

        while (openSet.length > 0 && iterations < maxIterations) {
            iterations++;

            // Timeout check every 100 iterations
            if (iterations % 100 === 0 && Date.now() - startTime > maxTime) {
                console.log(`[Movement] Pathfinding timeout after ${iterations} iterations`);
                if (this.client.chat) {
                    this.client.chat(`Pathfinding taking too long, using direct route...`);
                }
                return this.createDirectPath(start, goal);
            }

            // Progress logging
            if (iterations % 500 === 0) {
                console.log(`[Movement] Pathfinding progress: ${iterations} iterations...`);
            }

            // Find node with lowest fScore
            let current = openSet[0];
            let currentIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (fScore.get(key(openSet[i])) < fScore.get(key(current))) {
                    current = openSet[i];
                    currentIndex = i;
                }
            }

            // Reached goal (relaxed threshold)
            if (this.distanceXZ(current, goal) < 2.0) {
                console.log(`[Movement] Path found in ${iterations} iterations`);
                return this.reconstructPath(cameFrom, current);
            }

            // Move current from open to closed
            openSet.splice(currentIndex, 1);
            closedSet.add(key(current));

            // Check neighbors (3D with terrain support)
            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                const neighborKey = key(neighbor);

                if (closedSet.has(neighborKey)) continue;

                const tentativeGScore = gScore.get(key(current)) + this.distance(current, neighbor);

                if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));

                    if (!openSet.some(n => key(n) === neighborKey)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        console.log(`[Movement] Pathfinding failed after ${iterations} iterations`);

        // Fallback: try simple direct path anyway
        console.log('[Movement] Attempting fallback direct path');
        if (this.client.chat) {
            this.client.chat(`Complex path, attempting direct route...`);
        }
        return this.createDirectPath(start, goal);
    }

    /**
     * Create a simple direct path (fallback when A* fails)
     */
    createDirectPath(start, goal) {
        const path = [];
        const distance = this.distanceXZ(start, goal);
        const steps = Math.ceil(distance);

        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            path.push({
                x: Math.floor(start.x + (goal.x - start.x) * progress),
                y: start.y,
                z: Math.floor(start.z + (goal.z - start.z) * progress)
            });
        }

        return path;
    }

    /**
     * Get valid neighboring positions with 3D terrain awareness
     * @param {Object} pos {x, y, z}
     * @returns {Array} Array of neighbor positions
     */
    getNeighbors(pos) {
        const neighbors = [];
        const cardinalDirs = [
            { x: 1, z: 0 },   // East
            { x: -1, z: 0 },  // West
            { x: 0, z: 1 },   // South
            { x: 0, z: -1 },  // North
        ];
        const diagonalDirs = [
            { x: 1, z: 1, checkX: 1, checkZ: 1 },     // Southeast
            { x: 1, z: -1, checkX: 1, checkZ: -1 },   // Northeast
            { x: -1, z: 1, checkX: -1, checkZ: 1 },   // Southwest
            { x: -1, z: -1, checkX: -1, checkZ: -1 }, // Northwest
        ];

        // Helper to check if a position is walkable (not blocked by solid block)
        const isWalkable = (x, y, z) => {
            const block = this.world.getBlock(x, y, z);
            // Air (0 or null) is walkable
            return !block || block === 0;
        };

        // Process cardinal directions
        for (const dir of cardinalDirs) {
            const newX = pos.x + dir.x;
            const newZ = pos.z + dir.z;

            // Check for entities
            if (this.client.entityTracker) {
                const nearbyEntities = this.client.entityTracker.getNearbyEntities(
                    { x: newX, y: pos.y, z: newZ },
                    1.5
                );
                if (nearbyEntities.length > 0) continue;
            }

            // Add Y variants with validation
            // Same level - always valid
            neighbors.push({ x: newX, y: pos.y, z: newZ });

            // +1 (jump up) - only valid if there's head space (2 blocks clear above)
            if (isWalkable(newX, pos.y + 1, newZ) && isWalkable(newX, pos.y + 2, newZ)) {
                neighbors.push({ x: newX, y: pos.y + 1, z: newZ });
            }

            // -1 to -3 (safe falls) - always allowed in pathfinding
            neighbors.push({ x: newX, y: pos.y - 1, z: newZ });
            neighbors.push({ x: newX, y: pos.y - 2, z: newZ });
            neighbors.push({ x: newX, y: pos.y - 3, z: newZ });
        }

        // Process diagonal directions - require both adjacent cardinals to be walkable
        for (const dir of diagonalDirs) {
            const newX = pos.x + dir.x;
            const newZ = pos.z + dir.z;

            // Block diagonal if corner-cutting through walls
            // Check that both adjacent straight tiles are walkable
            const adjX = pos.x + dir.checkX;
            const adjZ = pos.z + dir.checkZ;

            // Both adjacent cardinals must be walkable (at feet + head level)
            if (!isWalkable(adjX, pos.y, pos.z) || !isWalkable(adjX, pos.y + 1, pos.z) ||
                !isWalkable(pos.x, pos.y, adjZ) || !isWalkable(pos.x, pos.y + 1, adjZ)) {
                continue;  // Can't cut this corner
            }

            // Check for entities
            if (this.client.entityTracker) {
                const nearbyEntities = this.client.entityTracker.getNearbyEntities(
                    { x: newX, y: pos.y, z: newZ },
                    1.5
                );
                if (nearbyEntities.length > 0) continue;
            }

            // Add Y variants with validation
            // Same level - always valid
            neighbors.push({ x: newX, y: pos.y, z: newZ });

            // +1 (jump up) - only valid if there's head space (2 blocks clear above)
            if (isWalkable(newX, pos.y + 1, newZ) && isWalkable(newX, pos.y + 2, newZ)) {
                neighbors.push({ x: newX, y: pos.y + 1, z: newZ });
            }

            // -1 to -3 (safe falls) - always allowed in pathfinding
            neighbors.push({ x: newX, y: pos.y - 1, z: newZ });
            neighbors.push({ x: newX, y: pos.y - 2, z: newZ });
            neighbors.push({ x: newX, y: pos.y - 3, z: newZ });
        }

        return neighbors;
    }

    /**
     * Reconstruct path from A* result
     */
    reconstructPath(cameFrom, current) {
        const path = [current];
        const key = (pos) => `${pos.x},${pos.y},${pos.z}`;

        while (cameFrom.has(key(current))) {
            current = cameFrom.get(key(current));
            path.unshift(current);
        }

        return path;
    }

    /**
     * Heuristic for A* (XZ-first: ignore Y for now)
     */
    heuristic(a, b) {
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        // XZ-FIRST: Only use horizontal distance
        return dx + dz;
    }

    /**
     * 3D distance
     */
    distance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Horizontal distance (XZ plane)
     */
    distanceXZ(a, b) {
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /**
     * Check if bot is on ground (simplified - since we don't parse chunk palettes yet)
     */
    checkGround(x, y, z) {
        // TEMPORARY FIX: Since we don't parse chunk data yet, use velocity-based detection
        // When Y velocity is very small and we're not actively falling, assume on ground
        const isStable = Math.abs(this.velocity.y) < 0.01;

        // Also check if Y hasn't changed much recently
        if (this.lastPosition) {
            const yChange = Math.abs(y - this.lastPosition.y);
            if (yChange < 0.05 && isStable) {
                return true;
            }
        }

        return isStable;
    }

    // ========== AABB COLLISION DETECTION (VANILLA-ACCURATE) ==========

    /**
     * Get player's axis-aligned bounding box from feet position
     * Player: width=0.6 (half=0.3), height=1.8
     * @param {Object} pos - {x, y, z} feet position
     * @returns {Object} AABB {minX, maxX, minY, maxY, minZ, maxZ}
     */
    getPlayerAABB(pos) {
        const half = 0.3;  // Half player width
        return {
            minX: pos.x - half,
            maxX: pos.x + half,
            minY: pos.y,
            maxY: pos.y + 1.8,
            minZ: pos.z - half,
            maxZ: pos.z + half
        };
    }

    /**
     * Get collision boxes for blocks near the player AABB
     * Since we don't parse chunk palettes, we use a heuristic:
     * - Always assume there's ground beneath the player's feet
     * - The server position is authoritative for the floor level
     * @param {Object} aabb - Player AABB
     * @returns {Array} Array of block AABBs
     */
    getCollisionBoxes(aabb) {
        const boxes = [];

        const minX = Math.floor(aabb.minX) - 1;
        const maxX = Math.floor(aabb.maxX) + 1;
        const minY = Math.floor(aabb.minY) - 1;
        const maxY = Math.floor(aabb.maxY) + 1;
        const minZ = Math.floor(aabb.minZ) - 1;
        const maxZ = Math.floor(aabb.maxZ) + 1;

        // Track if we found any floor blocks at Y-1
        let hasFloor = false;
        const floorY = Math.floor(aabb.minY) - 1;

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const block = this.world.getBlock(x, y, z);

                    // Treat non-air as solid full cube
                    if (block && block !== 0) {
                        boxes.push({
                            minX: x,
                            maxX: x + 1,
                            minY: y,
                            maxY: y + 1,
                            minZ: z,
                            maxZ: z + 1
                        });

                        // Check if this is a floor block
                        if (y === floorY) {
                            hasFloor = true;
                        }
                    }
                }
            }
        }

        // CRITICAL HEURISTIC: If we didn't find any floor, assume one exists
        // at the server-reported position. This prevents falling through terrain
        // while we don't have proper chunk parsing.
        // The server's position authority tells us the Y level is valid.
        if (!hasFloor && this.client.position) {
            const playerX = Math.floor(this.client.position.x);
            const playerZ = Math.floor(this.client.position.z);
            const serverFloorY = Math.floor(this.client.position.y) - 1;

            // Add a 3x3 floor patch beneath the player
            for (let fx = playerX - 1; fx <= playerX + 1; fx++) {
                for (let fz = playerZ - 1; fz <= playerZ + 1; fz++) {
                    boxes.push({
                        minX: fx,
                        maxX: fx + 1,
                        minY: serverFloorY,
                        maxY: serverFloorY + 1,
                        minZ: fz,
                        maxZ: fz + 1
                    });
                }
            }
        }

        return boxes;
    }

    /**
     * Sweep AABB along X axis
     * Returns adjusted dx that doesn't collide with blocks
     */
    sweepAxisX(aabb, boxes, dx) {
        if (dx === 0) return dx;

        for (const box of boxes) {
            // Check if Y and Z overlap
            if (aabb.maxY > box.minY && aabb.minY < box.maxY &&
                aabb.maxZ > box.minZ && aabb.minZ < box.maxZ) {

                if (dx > 0 && aabb.maxX <= box.minX) {
                    // Moving right, check left face of block
                    dx = Math.min(dx, box.minX - aabb.maxX);
                } else if (dx < 0 && aabb.minX >= box.maxX) {
                    // Moving left, check right face of block
                    dx = Math.max(dx, box.maxX - aabb.minX);
                }
            }
        }
        return dx;
    }

    /**
     * Sweep AABB along Z axis
     * Returns adjusted dz that doesn't collide with blocks
     */
    sweepAxisZ(aabb, boxes, dz) {
        if (dz === 0) return dz;

        for (const box of boxes) {
            // Check if X and Y overlap
            if (aabb.maxY > box.minY && aabb.minY < box.maxY &&
                aabb.maxX > box.minX && aabb.minX < box.maxX) {

                if (dz > 0 && aabb.maxZ <= box.minZ) {
                    // Moving forward, check back face of block
                    dz = Math.min(dz, box.minZ - aabb.maxZ);
                } else if (dz < 0 && aabb.minZ >= box.maxZ) {
                    // Moving backward, check front face of block
                    dz = Math.max(dz, box.maxZ - aabb.minZ);
                }
            }
        }
        return dz;
    }

    /**
     * Sweep AABB along Y axis
     * Returns adjusted dy that doesn't collide with blocks
     */
    sweepAxisY(aabb, boxes, dy) {
        if (dy === 0) return dy;

        for (const box of boxes) {
            // Check if X and Z overlap
            if (aabb.maxX > box.minX && aabb.minX < box.maxX &&
                aabb.maxZ > box.minZ && aabb.minZ < box.maxZ) {

                if (dy > 0 && aabb.maxY <= box.minY) {
                    // Moving up, check bottom face of block
                    dy = Math.min(dy, box.minY - aabb.maxY);
                } else if (dy < 0 && aabb.minY >= box.maxY) {
                    // Moving down, check top face of block
                    dy = Math.max(dy, box.maxY - aabb.minY);
                }
            }
        }
        return dy;
    }

    /**
     * Stop movement
     */
    stop() {
        this.isMoving = false;
        this.targetPosition = null;
        this.path = [];
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
            this.moveInterval = null;
        }
        if (this.pathRecalcInterval) {
            clearInterval(this.pathRecalcInterval);
            this.pathRecalcInterval = null;
        }
        console.log('[Movement] Stopped');
    }

    /**
     * Called when server sends position reset (from play.js)
     */
    serverPositionReset() {
        // Pause movement for cooldown duration
        this.movementCooldown = this.cooldownAfterReset;

        // Freeze movement system
        if (this.client) {
            this.client.awaitingTeleport = true;
        }

        // HARD RESET physics
        this.velocity = { x: 0, y: 0, z: 0 };
        this.stuckCounter = 0;

        // Anchor to server-reported position once
        this.justTeleported = true;
        this.teleportAnchor = this.client.position
            ? { ...this.client.position }
            : null;

        console.log('[Movement] Server reset detected — pausing movement for', this.movementCooldown, 'ticks');
    }

    /**
     * Movement tick with simplified horizontal navigation
     */
    tick() {
        this.tickCount++;

        // Only log first tick to verify tick loop started
        if (this.tickCount === 1) {
            console.log(`[Movement] Tick loop running - isMoving:${this.isMoving}, pathLen:${this.path.length}`);
        }

        // Movement cooldown after server reset
        // Process cooldown first, before checking awaitingTeleport
        if (this.movementCooldown > 0) {
            this.movementCooldown--;
            if (this.movementCooldown === 0) {
                // Cooldown expired - clear the awaiting teleport flag and resume
                this.client.awaitingTeleport = false;
                console.log('[Movement] Cooldown expired - resuming movement');
            }
            return;  // Don't move yet
        }

        // CRITICAL: Block movement while waiting for teleport confirm cycle
        if (this.client.awaitingTeleport) {
            return;  // Don't move until teleport cycle completes
        }

        // ======= TELEPORT RECOVERY =======
        // After server teleport, sync physics to server anchor and recalculate path
        if (this.justTeleported && this.teleportAnchor) {
            // Force-sync physics to server anchor
            this.client.position = { ...this.teleportAnchor };
            this.lastPosition = { ...this.teleportAnchor };
            this.velocity = { x: 0, y: 0, z: 0 };
            this.onGround = true;

            // Rebuild path from new position
            this.calculatePath();

            console.log('[Movement] Teleport recovery complete — path recalculated');

            this.justTeleported = false;
        }

        if (!this.isMoving || !this.targetPosition || !this.client.position) {
            // Only log if we were moving before
            if (this.tickCount > 1) {
                console.log('[Movement] Tick stopped: isMoving=' + this.isMoving);
            }
            this.stop();
            return;
        }

        // Log tick activity every 100 ticks (5 seconds)
        if (this.tickCount % 100 === 1) {
            console.log(`[Movement] Tick #${this.tickCount}: waypoint ${this.currentPathIndex + 1}/${this.path.length}`);
        }

        const current = this.client.position;

        // XZ-FIRST STRATEGY: Check horizontal distance first
        const dxToTarget = current.x - this.targetPosition.x;
        const dzToTarget = current.z - this.targetPosition.z;
        const horizontalDistToTarget = Math.sqrt(dxToTarget * dxToTarget + dzToTarget * dzToTarget);

        // Check if we've reached X/Z coordinates
        if (horizontalDistToTarget < 1.5) {
            // Reached X/Z! Now check Y
            const dyToTarget = current.y - this.targetPosition.y;

            if (Math.abs(dyToTarget) < 2.0) {
                // Close enough to Y too - arrived!
                console.log('[Movement] ✓ Arrived at destination!');
                this.stop();
                this.client.emit('arrived', this.targetPosition);
                return;
            } else {
                // At X/Z but wrong Y - that's okay, we tried
                console.log(`[Movement] ✓ Reached X/Z coordinates (Y off by ${Math.abs(dyToTarget).toFixed(1)} blocks)`);
                this.stop();
                return;
            }
        }

        // If no path, recalculate
        if (this.path.length === 0 || this.currentPathIndex >= this.path.length) {
            this.calculatePath();
            return;
        }

        // Get next waypoint
        const waypoint = this.path[this.currentPathIndex];

        // Validate next waypoint before attempting
        const waypointValidation = this.validateWaypoint(current, waypoint);
        if (!waypointValidation.valid) {
            // Skip unreachable waypoints
            this.currentPathIndex++;

            // If we've skipped too many, stop movement
            if (this.currentPathIndex >= this.path.length) {
                console.log(`[Movement] ✗ All waypoints unreachable - stopping`);
                this.stop();
            }
            return;
        }

        // Calculate distance to waypoint (XZ only - we do XZ-first navigation)
        const wpDx = waypoint.x - current.x;
        const wpDz = waypoint.z - current.z;
        const horizontalDist = Math.sqrt(wpDx * wpDx + wpDz * wpDz);

        // If close to waypoint horizontally, move to next (XZ-only navigation)
        // Y is resolved by collision, NOT waypoints - so only check XZ
        if (horizontalDist < 0.7) {
            this.currentPathIndex++;
            this.stuckCounter = 0;
            return;
        }

        // === JUMP DETECTION ===
        // If waypoint is ~1 block above us and we're grounded, initiate jump
        const dyNeeded = waypoint.y - current.y;
        const needsJump = this.onGround && dyNeeded > 0.75 && dyNeeded < 1.3;

        if (needsJump) {
            this.velocity.y = this.jumpVelocity;  // 0.42 - vanilla jump velocity
            this.onGround = false;
            console.log(`[Movement] Jumping to reach waypoint (dy=${dyNeeded.toFixed(2)})`);
        }

        // Stuck detection (XZ only - ignore Y changes from stepping/jumping)
        // Skip stuck detection while airborne - XZ movement may pause during jumps
        if (this.onGround) {
            const distanceMoved = this.distanceXZ(current, this.lastPosition);
            if (distanceMoved < 0.01) {
                this.stuckCounter++;
                if (this.stuckCounter >= 15) {
                    console.log('[Movement] Stuck! Recalculating path...');
                    this.stuckCounter = 0;
                    if (this.currentPathIndex < this.path.length - 1) {
                        this.currentPathIndex++;
                    } else {
                        this.calculatePath();
                    }
                    return;
                }
            } else {
                this.stuckCounter = 0;
            }
        }

        // === AABB SWEEP COLLISION MOVEMENT (VANILLA-ACCURATE) ===
        // Compute desired motion, sweep AABB against blocks, stop at collisions
        // This matches server physics exactly -> no more position resets

        // 1. Build starting AABB from current feet position
        let aabb = this.getPlayerAABB(current);

        // 2. Collect nearby block collision boxes
        const boxes = this.getCollisionBoxes(aabb);

        // DEBUG: Log collision box count on first few ticks
        if (this.tickCount <= 5) {
            console.log(`[Movement] DEBUG: ${boxes.length} collision boxes nearby`);
        }

        // 3. Compute desired motion this tick
        const deltaX = waypoint.x - current.x;
        const deltaZ = waypoint.z - current.z;
        const horizontalDistance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
        const movePerTick = (this.speed * this.tickRate) / 1000;  // ~0.216 blocks/tick

        // Safeguard: avoid division-by-zero when standing exactly on waypoint
        let dx, dz;
        if (horizontalDistance < 1e-6) {
            dx = 0;
            dz = 0;
        } else {
            const horizontalRatio = Math.min(movePerTick / horizontalDistance, 1.0);
            dx = deltaX * horizontalRatio;
            dz = deltaZ * horizontalRatio;
        }

        // Apply gravity physics (VANILLA EXACT)
        if (!this.onGround) {
            this.velocity.y -= this.gravity;  // Subtract 0.08 per tick
            this.velocity.y *= this.drag;      // Apply air drag (0.98)
            if (this.velocity.y < -this.maxFallSpeed) {
                this.velocity.y = -this.maxFallSpeed;  // Clamp to max fall speed
            }
        } else {
            if (this.velocity.y < 0) {
                this.velocity.y = 0;
            }
        }
        let dy = this.velocity.y;

        // Step height constant (vanilla = 0.6)
        const STEP_HEIGHT = 0.6;

        // --- SWEEP X AXIS ---
        const dxOriginal = dx;
        dx = this.sweepAxisX(aabb, boxes, dx);
        const xBlocked = (dx !== dxOriginal);
        aabb.minX += dx;
        aabb.maxX += dx;

        // --- SWEEP Z AXIS ---
        const dzOriginal = dz;
        dz = this.sweepAxisZ(aabb, boxes, dz);
        const zBlocked = (dz !== dzOriginal);
        aabb.minZ += dz;
        aabb.maxZ += dz;

        // DEBUG: Log movement blocking every 100 ticks
        if (this.tickCount % 100 === 1) {
            console.log(`[Movement] DEBUG: desired dx=${dxOriginal.toFixed(3)} dz=${dzOriginal.toFixed(3)}, actual dx=${dx.toFixed(3)} dz=${dz.toFixed(3)}, xBlocked=${xBlocked} zBlocked=${zBlocked}`);
        }

        // --- STEP HEIGHT LOGIC (try stepping up when blocked on X or Z) ---
        if (this.onGround && (xBlocked || zBlocked)) {
            // Save current AABB state
            const savedAABB = {
                minX: aabb.minX, maxX: aabb.maxX,
                minY: aabb.minY, maxY: aabb.maxY,
                minZ: aabb.minZ, maxZ: aabb.maxZ
            };

            // Try lifting the AABB by step height
            aabb.minY += STEP_HEIGHT;
            aabb.maxY += STEP_HEIGHT;

            // CRITICAL: Recompute collision boxes at new height!
            // The set of colliding blocks changes when we move up
            const steppedBoxes = this.getCollisionBoxes(aabb);

            // Re-sweep X if it was blocked (using NEW collision boxes)
            let stepDx = dxOriginal;
            if (xBlocked) {
                stepDx = this.sweepAxisX(aabb, steppedBoxes, dxOriginal);
                aabb.minX = savedAABB.minX + stepDx;
                aabb.maxX = savedAABB.maxX + stepDx;
            }

            // Re-sweep Z if it was blocked (using NEW collision boxes)
            let stepDz = dzOriginal;
            if (zBlocked) {
                stepDz = this.sweepAxisZ(aabb, steppedBoxes, dzOriginal);
                aabb.minZ = savedAABB.minZ + stepDz;
                aabb.maxZ = savedAABB.maxZ + stepDz;
            }

            // Check if stepping helped (more movement than before)
            const steppedMore = (Math.abs(stepDx) > Math.abs(dx)) || (Math.abs(stepDz) > Math.abs(dz));

            if (steppedMore) {
                // Stepping worked - recompute boxes again before sweeping Y down
                const landingBoxes = this.getCollisionBoxes(aabb);

                // Sweep Y down to land on the step
                let stepDy = -STEP_HEIGHT;
                stepDy = this.sweepAxisY(aabb, landingBoxes, stepDy);
                aabb.minY += stepDy;
                aabb.maxY += stepDy;
                dx = stepDx;
                dz = stepDz;
                // We stepped up, so we're still on ground
            } else {
                // Stepping didn't help - restore original AABB
                aabb.minX = savedAABB.minX;
                aabb.maxX = savedAABB.maxX;
                aabb.minY = savedAABB.minY;
                aabb.maxY = savedAABB.maxY;
                aabb.minZ = savedAABB.minZ;
                aabb.maxZ = savedAABB.maxZ;
            }
        }

        // --- SWEEP Y AXIS ---
        // Recompute collision boxes for consistency after X/Z movement
        const finalBoxes = this.getCollisionBoxes(aabb);
        const dyBefore = dy;
        dy = this.sweepAxisY(aabb, finalBoxes, dy);
        aabb.minY += dy;
        aabb.maxY += dy;

        // Clear vertical velocity if collided with floor or ceiling
        if (dy !== dyBefore) {
            this.velocity.y = 0;
        }

        // 4. Extract position from AABB (AABB is the truth!)
        // Position = center of AABB on X/Z, bottom (feet) on Y
        let newX = (aabb.minX + aabb.maxX) / 2;
        let newY = aabb.minY;
        let newZ = (aabb.minZ + aabb.maxZ) / 2;

        // === GROUND DETECTION (VELOCITY-BASED) ===
        // Since we don't have real chunk palettes, use velocity-based ground detection
        // This works: true while standing/walking, false after jumping, true on landing
        this.onGround = this.checkGround(newX, newY, newZ);

        // === ACCURATE ROTATION CALCULATION ===
        // Use actual moved vector (dx, dz) for anti-cheat compliance
        // This ensures yaw matches the actual movement direction
        const movedHorizontal = Math.sqrt(dx * dx + dz * dz);
        if (movedHorizontal >= 1e-6) {
            this.yaw = -Math.atan2(dx, dz) * (180 / Math.PI);
        }
        this.pitch = 0;  // Keep looking straight ahead

        // Update client position
        this.client.position = { x: newX, y: newY, z: newZ };
        this.client.rotation = { yaw: this.yaw, pitch: this.pitch };

        // === SEND POSITION PACKET ===
        this.positionUpdateCounter++;

        // Debug: Log first few movements with full details
        if (this.tickCount <= 5) {
            const moveDist = Math.sqrt(dx * dx + dz * dz);
            console.log(`[Movement] Tick ${this.tickCount}: pos=(${newX.toFixed(2)}, ${newY.toFixed(2)}, ${newZ.toFixed(2)}) yaw=${this.yaw.toFixed(1)} onGround=${this.onGround} dy=${dy.toFixed(3)}`);
        }

        // Send position + rotation packet EVERY tick (vanilla behavior)
        this.sendPosition(newX, newY, newZ, this.yaw, this.pitch, this.onGround);
        this.lastPosition = { x: newX, y: newY, z: newZ };

        // Debug: Log progress periodically
        if (this.positionUpdateCounter % 100 === 0) {
            const distToTarget = this.distanceXZ(current, this.targetPosition);
            console.log(`[Movement] Progress: pos=(${newX.toFixed(1)}, ${newY.toFixed(1)}, ${newZ.toFixed(1)}) dist=${distToTarget.toFixed(1)} onGround=${this.onGround}`);
        }
    }

    /**
     * Send position and rotation to server
     */
    sendPosition(x, y, z, yaw, pitch, onGround) {
        // Safety: don't send while teleporting or in cooldown
        if (this.client.awaitingTeleport || this.movementCooldown > 0) {
            return; // Block all position packets during server correction phase
        }

        // Protocol 773: The last field MUST be a Boolean (onGround), NOT a byte bitfield!
        // Structure: double x, double y, double z, float yaw, float pitch, boolean onGround
        const packet = new PacketWriter(C2S_SET_PLAYER_POSITION_AND_ROTATION)
            .writeDouble(x)
            .writeDouble(y)
            .writeDouble(z)
            .writeFloat(yaw)
            .writeFloat(pitch)
            .writeBoolean(onGround);

        this.connection.send(packet.buildData());
    }

    /**
     * Get distance to target
     */
    getDistanceToTarget() {
        if (!this.targetPosition || !this.client.position) return null;
        return this.distance(this.client.position, this.targetPosition);
    }
}

module.exports = { Movement };


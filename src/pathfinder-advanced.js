/**
 * Advanced A* Pathfinder with Unlimited Range
 */

const { logger } = require('./logger');

class AdvancedPathfinder {
    constructor(world) {
        this.world = world;
        this.jumpHeight = 1.25;
        this.maxFallDistance = 3;
        this.nodeExpansionLimit = 20000;
        this.waypointDistance = 50;
    }

    findPath(start, goal, options = {}) {
        const distance = this.distance3D(start, goal);
        if (distance < 100) {
            return this.astar(start, goal, options);
        }
        logger.info(`[Pathfinder] Long distance (${distance.toFixed(0)}m) - using hierarchical pathfinding`);
        return this.hierarchicalPath(start, goal, options);
    }

    hierarchicalPath(start, goal, options = {}) {
        const waypoints = this.generateWaypoints(start, goal, this.waypointDistance);
        logger.debug(`[Pathfinder] Generated ${waypoints.length} waypoints`);

        const fullPath = [];
        let current = start;

        for (let i = 0; i < waypoints.length; i++) {
            const target = waypoints[i];
            logger.debug(`[Pathfinder] Segment ${i + 1}/${waypoints.length}`);

            const segment = this.astar(current, target, { ...options, maxNodes: 10000 });

            if (!segment || segment.length === 0) {
                logger.warn(`[Pathfinder] Failed to reach waypoint ${i + 1}`);
                if (i < waypoints.length - 1) {
                    const bypass = this.astar(current, waypoints[i + 1], { ...options, maxNodes: 15000 });
                    if (bypass && bypass.length > 0) {
                        fullPath.push(...bypass);
                        current = waypoints[i + 1];
                        i++;
                        continue;
                    }
                }
                return fullPath.length > 0 ? fullPath : null;
            }

            fullPath.push(...segment);
            current = target;
        }

        logger.info(`[Pathfinder] Hierarchical path complete: ${fullPath.length} nodes`);
        return fullPath;
    }

    generateWaypoints(start, goal, spacing) {
        const waypoints = [];
        const distance = this.distance3D(start, goal);
        const steps = Math.ceil(distance / spacing);

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const waypoint = {
                x: Math.floor(start.x + (goal.x - start.x) * t),
                y: Math.floor(start.y + (goal.y - start.y) * t),
                z: Math.floor(start.z + (goal.z - start.z) * t)
            };

            // Fix 6: Dynamic waypoint snapping - check if chunk is loaded first
            const chunkX = Math.floor(waypoint.x / 16);
            const chunkZ = Math.floor(waypoint.z / 16);

            if (this.world.isChunkLoaded(chunkX, chunkZ)) {
                const groundY = this.world.findFloorBelow(waypoint.x, waypoint.y + 5, waypoint.z, 20);
                if (groundY !== -1) waypoint.y = groundY;
            }
            // If chunk not loaded, keep interpolated Y (waypoint.y stays as linear interpolation)

            waypoints.push(waypoint);
        }
        return waypoints;
    }

    astar(start, goal, options = {}) {
        const maxNodes = options.maxNodes || this.nodeExpansionLimit;
        const timeout = options.timeout || 10000;
        const startTime = Date.now();

        start = this.roundPos(start);
        goal = this.roundPos(goal);

        // Fix 2: Soft-start node search - find walkable position if start isn't walkable
        if (!this.world.isWalkable(start.x, start.y, start.z)) {
            const adjusted = this.findNearbyWalkable(start);
            if (adjusted) {
                logger.info(`[Pathfinder] Adjusted start from (${start.x},${start.y},${start.z}) to (${adjusted.x},${adjusted.y},${adjusted.z})`);
                start = adjusted;
            } else {
                logger.warn(`[Pathfinder] Could not find walkable start position`);
            }
        }

        // Debug: Check if start position is walkable
        const startWalkable = this.world.isWalkable(start.x, start.y, start.z);
        // Use pathfindingMode=true for goal check (may be in unloaded chunk)
        const goalWalkable = this.world.isWalkable(goal.x, goal.y, goal.z, true);
        logger.info(`[Pathfinder] Start (${start.x}, ${start.y}, ${start.z}) walkable: ${startWalkable}`);
        logger.info(`[Pathfinder] Goal (${goal.x}, ${goal.y}, ${goal.z}) walkable: ${goalWalkable}`);

        // Debug: check blocks at start position
        const startFeet = this.world.isSolid(start.x, start.y, start.z);
        const startHead = this.world.isSolid(start.x, start.y + 1, start.z);
        const startFloor = this.world.isSolid(start.x, start.y - 1, start.z);
        logger.info(`[Pathfinder] Start blocks - feet:${startFeet}, head:${startHead}, floor:${startFloor}`);

        const openSet = new MinHeap((a, b) => a.f < b.f);
        const closedSet = new Set();
        const inOpenSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();

        const startKey = this.posKey(start);
        const goalKey = this.posKey(goal);

        gScore.set(startKey, 0);
        openSet.insert({ pos: start, g: 0, h: this.heuristic(start, goal), f: this.heuristic(start, goal) });
        inOpenSet.add(startKey);

        let nodesExpanded = 0;

        while (!openSet.isEmpty()) {
            if (Date.now() - startTime > timeout) {
                logger.warn('[Pathfinder] Timeout reached');
                break;
            }

            const current = openSet.extract();
            const currentKey = this.posKey(current.pos);
            inOpenSet.delete(currentKey);

            if (currentKey === goalKey || this.distance3D(current.pos, goal) < 2) {
                logger.info(`[Pathfinder] Path found! Nodes: ${nodesExpanded}`);
                return this.reconstructPath(cameFrom, current.pos);
            }

            closedSet.add(currentKey);
            nodesExpanded++;

            if (nodesExpanded >= maxNodes) {
                logger.warn(`[Pathfinder] Node limit reached (${nodesExpanded})`);
                break;
            }

            const neighbors = this.getNeighbors(current.pos);

            // Debug: Log first few expansions
            if (nodesExpanded <= 3) {
                logger.debug(`[Pathfinder] Node ${nodesExpanded}: (${current.pos.x}, ${current.pos.y}, ${current.pos.z}) has ${neighbors.length} neighbors`);
            }

            for (const neighbor of neighbors) {
                const neighborKey = this.posKey(neighbor.pos);
                if (closedSet.has(neighborKey)) continue;

                const tentativeG = current.g + neighbor.cost;
                const existingG = gScore.get(neighborKey);

                if (existingG === undefined || tentativeG < existingG) {
                    cameFrom.set(neighborKey, current.pos);
                    gScore.set(neighborKey, tentativeG);
                    const h = this.heuristic(neighbor.pos, goal);

                    if (!inOpenSet.has(neighborKey)) {
                        openSet.insert({ pos: neighbor.pos, g: tentativeG, h, f: tentativeG + h });
                        inOpenSet.add(neighborKey);
                    }
                }
            }
        }

        logger.warn(`[Pathfinder] No path found after ${nodesExpanded} nodes`);
        return null;
    }


    getNeighbors(pos) {
        const neighbors = [];
        const directions = [
            { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
            { dx: 1, dz: 1 }, { dx: 1, dz: -1 }, { dx: -1, dz: 1 }, { dx: -1, dz: -1 }
        ];

        for (const dir of directions) {
            if (Math.abs(dir.dx) === 1 && Math.abs(dir.dz) === 1) {
                if (this.world.isSolid(pos.x + dir.dx, pos.y, pos.z) ||
                    this.world.isSolid(pos.x, pos.y, pos.z + dir.dz)) continue;
            }
            this.tryMove(pos, pos.x + dir.dx, pos.z + dir.dz, neighbors);
        }

        if (this.world.isClimbable(pos.x, pos.y, pos.z)) {
            const up = { x: pos.x, y: pos.y + 1, z: pos.z };
            if (this.world.isWalkable(up.x, up.y, up.z) || this.world.isClimbable(up.x, up.y, up.z)) {
                neighbors.push({ pos: up, cost: 1.5, action: 'climb_up' });
            }
            const down = { x: pos.x, y: pos.y - 1, z: pos.z };
            if (this.world.isClimbable(down.x, down.y, down.z)) {
                neighbors.push({ pos: down, cost: 1.2, action: 'climb_down' });
            }
        }
        return neighbors;
    }

    tryMove(from, targetX, targetZ, neighbors) {
        const sameLevel = { x: targetX, y: from.y, z: targetZ };

        // Feature 4: Hazard avoidance - skip lava entirely
        if (this.world.isLava && this.world.isLava(sameLevel.x, sameLevel.y, sameLevel.z)) {
            return; // Lava = infinite cost (don't even consider)
        }

        // Use pathfindingMode=true to allow routing through unloaded chunks
        if (this.world.isWalkable(sameLevel.x, sameLevel.y, sameLevel.z, true)) {
            let cost = this.world.getMovementCost(sameLevel.x, sameLevel.y, sameLevel.z);

            // High cost for water (but allow if needed)
            if (this.world.isFluid(sameLevel.x, sameLevel.y, sameLevel.z)) {
                cost += 8.0; // Prefer dry land
            }

            neighbors.push({ pos: sameLevel, cost, action: 'walk' });
        }

        if (this.world.canJump(from.x, from.y, from.z)) {
            const jumpUp = { x: targetX, y: from.y + 1, z: targetZ };

            // Skip lava for jumps too
            if (this.world.isLava && this.world.isLava(jumpUp.x, jumpUp.y, jumpUp.z)) {
                // Don't add this neighbor
            } else if (this.world.isWalkable(jumpUp.x, jumpUp.y, jumpUp.z, true)) {
                let cost = 1.3 * this.world.getMovementCost(jumpUp.x, jumpUp.y, jumpUp.z);
                if (this.world.isFluid(jumpUp.x, jumpUp.y, jumpUp.z)) cost += 8.0;
                neighbors.push({ pos: jumpUp, cost, action: 'jump' });
            }
        }

        for (let fall = 1; fall <= this.maxFallDistance; fall++) {
            const fallDown = { x: targetX, y: from.y - fall, z: targetZ };

            // Skip lava for falls
            if (this.world.isLava && this.world.isLava(fallDown.x, fallDown.y, fallDown.z)) {
                break; // Don't fall into lava
            }

            if (!this.world.isSolid(fallDown.x, fallDown.y - 1, fallDown.z, true)) continue;
            if (this.world.isWalkable(fallDown.x, fallDown.y, fallDown.z, true)) {
                let cost = (1.0 + fall * 0.2) * this.world.getMovementCost(fallDown.x, fallDown.y, fallDown.z);
                if (this.world.isFluid(fallDown.x, fallDown.y, fallDown.z)) cost += 8.0;
                neighbors.push({ pos: fallDown, cost, action: `fall_${fall}` });
                break;
            }
            break;
        }
    }

    /**
     * Fix 2: Find nearby walkable position (3x3x3 radial search)
     */
    findNearbyWalkable(pos) {
        // Search in expanding rings: same level first, then up, then down
        for (let dy = 0; dy <= 2; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    const check = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
                    if (this.world.isWalkable(check.x, check.y, check.z)) {
                        return check;
                    }
                }
            }
        }
        // Check below as well
        for (let dy = -1; dy >= -2; dy--) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const check = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
                    if (this.world.isWalkable(check.x, check.y, check.z)) {
                        return check;
                    }
                }
            }
        }
        return null;
    }

    heuristic(a, b) { return this.distance3D(a, b); }

    distance3D(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        while (cameFrom.has(this.posKey(current))) {
            current = cameFrom.get(this.posKey(current));
            path.unshift(current);
        }
        return path;
    }

    roundPos(pos) { return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }; }
    posKey(pos) { return `${pos.x},${pos.y},${pos.z}`; }
}

class MinHeap {
    constructor(compareFn) { this.heap = []; this.compare = compareFn; }

    insert(node) {
        this.heap.push(node);
        this.bubbleUp(this.heap.length - 1);
    }

    extract() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();
        const root = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return root;
    }

    bubbleUp(i) {
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (this.compare(this.heap[i], this.heap[p])) {
                [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
                i = p;
            } else break;
        }
    }

    bubbleDown(i) {
        while (true) {
            const l = 2 * i + 1, r = 2 * i + 2;
            let s = i;
            if (l < this.heap.length && this.compare(this.heap[l], this.heap[s])) s = l;
            if (r < this.heap.length && this.compare(this.heap[r], this.heap[s])) s = r;
            if (s !== i) { [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]]; i = s; }
            else break;
        }
    }

    isEmpty() { return this.heap.length === 0; }
}

module.exports = { AdvancedPathfinder };

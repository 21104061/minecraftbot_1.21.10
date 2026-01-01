/**
 * Advanced Movement Controller with Intelligent Navigation
 */

const { PacketWriter } = require('./protocol/packet');
const { AdvancedPathfinder } = require('./pathfinder-advanced');
const { logger } = require('./logger');

const C2S_SET_PLAYER_POSITION_AND_ROTATION = 0x1E;

class MovementAdvanced {
    constructor(client, connection, world) {
        this.client = client;
        this.connection = connection;
        this.world = world;
        this.pathfinder = new AdvancedPathfinder(world);

        this.isMoving = false;
        this.targetPosition = null;
        this.path = [];
        this.currentPathIndex = 0;
        this.moveInterval = null;

        // Physics parameters
        this.speed = 4.317;
        this.tickRate = 50;
        this.gravity = 0.08;
        this.drag = 0.98;
        this.maxFallSpeed = 3.92;
        this.jumpVelocity = 0.42;

        this.velocity = { x: 0, y: 0, z: 0 };
        this.onGround = true;
        this.yaw = 0;
        this.pitch = 0;
        this.lastPosition = { x: 0, y: 0, z: 0 };

        this.movementCooldown = 0;
        this.cooldownAfterReset = 10;
        this.pathRecalcTimer = null;
        this.recalcInterval = 5000;
        this.stuckCounter = 0;
        this.maxStuckTicks = 60;
        this.jumpQueued = false;
        this.jumpCooldown = 0;

        // Feature 3: 4-Stage obstacle avoidance
        this.obstacleStage = 0;
        this.lateralDirection = 1; // 1 = right, -1 = left
        this.backupTicks = 0;

        // Feature 5: Movement smoothing
        this.maxTurnSpeed = 18; // degrees per tick
    }

    async goto(x, y, z) {
        if (!this.client.position) {
            logger.error('[Movement] Cannot navigate: position unknown');
            return;
        }

        this.targetPosition = { x, y, z };
        this.isMoving = true;
        this.stuckCounter = 0;

        const distance = this.distance3D(this.client.position, this.targetPosition);
        logger.info(`[Movement] 🎯 Navigating to (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}) - ${distance.toFixed(0)}m`);

        await this.calculatePath();

        if (this.moveInterval) clearInterval(this.moveInterval);
        this.moveInterval = setInterval(() => this.tick(), this.tickRate);

        if (this.pathRecalcTimer) clearInterval(this.pathRecalcTimer);
        this.pathRecalcTimer = setInterval(() => {
            if (this.isMoving && this.path.length > 0) this.calculatePath();
        }, this.recalcInterval);

        logger.info(`[Movement] ✓ Navigation started`);
    }

    async calculatePath() {
        if (!this.targetPosition) return;

        const start = {
            x: Math.floor(this.client.position.x),
            y: Math.floor(this.client.position.y),
            z: Math.floor(this.client.position.z)
        };
        const goal = {
            x: Math.floor(this.targetPosition.x),
            y: Math.floor(this.targetPosition.y),
            z: Math.floor(this.targetPosition.z)
        };

        const path = this.pathfinder.findPath(start, goal);
        if (!path || path.length === 0) {
            logger.error('[Movement] ✗ No path found!');
            this.stop();
            return;
        }

        this.path = path;
        this.currentPathIndex = 0;
        this.stuckCounter = 0;
        logger.info(`[Movement] ✓ Path: ${path.length} waypoints`);
    }

    tick() {
        if (this.movementCooldown > 0) {
            this.movementCooldown--;
            if (this.movementCooldown === 0) this.client.awaitingTeleport = false;
            return;
        }

        if (this.client.awaitingTeleport) return;
        if (!this.isMoving || !this.targetPosition || !this.client.position) {
            this.stop();
            return;
        }

        const distToTarget = this.distance3D(this.client.position, this.targetPosition);
        if (distToTarget < 1.5) {
            logger.info('[Movement] ✓ Arrived!');
            this.stop();
            this.client.emit('arrived', this.targetPosition);
            return;
        }

        if (this.currentPathIndex >= this.path.length) {
            this.calculatePath();
            return;
        }

        const waypoint = this.path[this.currentPathIndex];
        const distToWaypoint = this.distance3D(this.client.position, waypoint);

        if (distToWaypoint < 0.7) {
            this.currentPathIndex++;
            this.stuckCounter = 0;
            return;
        }

        const moveDist = this.distance3D(this.client.position, this.lastPosition);
        if (moveDist < 0.05) {
            this.stuckCounter++;
            // Feature 3: 4-stage obstacle avoidance
            this.handleObstacle();
        } else {
            this.stuckCounter = 0;
            this.obstacleStage = 0;
        }

        if (this.currentPathIndex + 1 < this.path.length) {
            const next = this.path[this.currentPathIndex + 1];
            if (next.y - this.client.position.y > 0.5 && this.onGround) {
                this.jumpQueued = true;
            }
        }

        this.performMovement(waypoint);
    }

    /**
     * Feature 3: 4-Stage obstacle avoidance system
     */
    handleObstacle() {
        if (this.stuckCounter >= 5 && this.stuckCounter < 16) {
            // Stage 1: Jump (ticks 5-15)
            if (this.obstacleStage < 1) {
                this.obstacleStage = 1;
                logger.debug('[Movement] Obstacle Stage 1: Attempting jump');
            }
            if (this.onGround) {
                this.jumpQueued = true;
            }
        } else if (this.stuckCounter >= 16 && this.stuckCounter < 31) {
            // Stage 2: Lateral strafe (ticks 16-30)
            if (this.obstacleStage < 2) {
                this.obstacleStage = 2;
                logger.info('[Movement] Obstacle Stage 2: Lateral strafe');
            }
            this.performLateralMove();
        } else if (this.stuckCounter >= 31 && this.stuckCounter < 46) {
            // Stage 3: Backup (ticks 31-45)
            if (this.obstacleStage < 3) {
                this.obstacleStage = 3;
                this.backupTicks = 15;
                logger.info('[Movement] Obstacle Stage 3: Backing up');
            }
            this.performBackup();
        } else if (this.stuckCounter >= 46) {
            // Stage 4: Reroute (tick 46+)
            if (this.obstacleStage < 4) {
                this.obstacleStage = 4;
                logger.warn('[Movement] Obstacle Stage 4: Recalculating path');
            }
            this.stuckCounter = 0;
            this.obstacleStage = 0;
            // Try skipping to next waypoint first
            if (this.currentPathIndex + 1 < this.path.length) {
                logger.info('[Movement] Skipping to next waypoint');
                this.currentPathIndex++;
            } else {
                this.calculatePath();
            }
        }
    }

    /**
     * Stage 2: Move perpendicular to current heading
     */
    performLateralMove() {
        if (!this.client.position) return;

        const current = this.client.position;
        const yawRad = (this.yaw * Math.PI) / 180;

        // Perpendicular direction
        const strafeX = Math.cos(yawRad) * this.lateralDirection * 0.3;
        const strafeZ = Math.sin(yawRad) * this.lateralDirection * 0.3;

        const newX = current.x + strafeX;
        const newZ = current.z + strafeZ;

        // Alternate direction for next attempt
        if (this.stuckCounter % 5 === 0) {
            this.lateralDirection *= -1;
        }

        // Apply strafe movement
        this.client.position = { x: newX, y: current.y, z: newZ };
        this.sendPosition(newX, current.y, newZ, this.yaw, 0, this.onGround);
    }

    /**
     * Stage 3: Move backward to clear collision
     */
    performBackup() {
        if (!this.client.position || this.backupTicks <= 0) return;

        const current = this.client.position;
        const yawRad = (this.yaw * Math.PI) / 180;

        // Move backward (opposite of facing direction)
        const backX = current.x + Math.sin(yawRad) * 0.2;
        const backZ = current.z - Math.cos(yawRad) * 0.2;

        this.client.position = { x: backX, y: current.y, z: backZ };
        this.sendPosition(backX, current.y, backZ, this.yaw, 0, this.onGround);

        this.backupTicks--;
    }

    performMovement(waypoint) {
        const current = this.client.position;

        // Gravity
        if (!this.onGround) {
            this.velocity.y -= this.gravity;
            this.velocity.y *= this.drag;
            if (this.velocity.y < -this.maxFallSpeed) this.velocity.y = -this.maxFallSpeed;
        } else if (this.velocity.y < 0) {
            this.velocity.y = 0;
        }

        // Jump
        if (this.jumpQueued && this.onGround && this.jumpCooldown === 0) {
            this.velocity.y = this.jumpVelocity;
            this.onGround = false;
            this.jumpQueued = false;
            this.jumpCooldown = 10;
        }
        if (this.jumpCooldown > 0) this.jumpCooldown--;

        // Horizontal movement
        const dx = waypoint.x - current.x;
        const dz = waypoint.z - current.z;
        const hDist = Math.sqrt(dx * dx + dz * dz);
        let moveX = 0, moveZ = 0;

        if (hDist > 0.01) {
            const movePerTick = (this.speed * this.tickRate) / 1000;
            const ratio = Math.min(movePerTick / hDist, 1.0);
            moveX = dx * ratio;
            moveZ = dz * ratio;
        }

        // Collision
        const aabb = this.getPlayerAABB(current);
        const boxes = this.getCollisionBoxes(aabb);

        let finalMoveX = this.sweepAxisX(aabb, boxes, moveX);
        aabb.minX += finalMoveX; aabb.maxX += finalMoveX;

        let finalMoveZ = this.sweepAxisZ(aabb, boxes, moveZ);
        aabb.minZ += finalMoveZ; aabb.maxZ += finalMoveZ;

        // Step-up
        if ((Math.abs(finalMoveX) < Math.abs(moveX) * 0.5 || Math.abs(finalMoveZ) < Math.abs(moveZ) * 0.5) && this.onGround) {
            const saved = { ...aabb };
            aabb.minY += 0.6; aabb.maxY += 0.6;
            const steppedBoxes = this.getCollisionBoxes(aabb);

            const stepX = this.sweepAxisX(aabb, steppedBoxes, moveX);
            const stepZ = this.sweepAxisZ(aabb, steppedBoxes, moveZ);

            if (Math.abs(stepX) > Math.abs(finalMoveX) || Math.abs(stepZ) > Math.abs(finalMoveZ)) {
                aabb.minX = saved.minX + stepX; aabb.maxX = saved.maxX + stepX;
                aabb.minZ = saved.minZ + stepZ; aabb.maxZ = saved.maxZ + stepZ;
                const landBoxes = this.getCollisionBoxes(aabb);
                const stepDown = this.sweepAxisY(aabb, landBoxes, -0.6);
                aabb.minY += stepDown; aabb.maxY += stepDown;
                finalMoveX = stepX; finalMoveZ = stepZ;
            } else {
                Object.assign(aabb, saved);
            }
        }

        // Y sweep
        const finalBoxes = this.getCollisionBoxes(aabb);
        const yBefore = this.velocity.y;
        let finalMoveY = this.sweepAxisY(aabb, finalBoxes, this.velocity.y);
        if (finalMoveY !== yBefore) this.velocity.y = 0;

        const newX = (aabb.minX + aabb.maxX) / 2;
        const newY = aabb.minY + finalMoveY;
        const newZ = (aabb.minZ + aabb.maxZ) / 2;

        this.onGround = finalMoveY > yBefore && yBefore < 0;

        // Feature 5: Angular interpolation for yaw (smooth turning)
        if (hDist > 0.01) {
            const targetYaw = -Math.atan2(dx, dz) * (180 / Math.PI);
            let yawDiff = targetYaw - this.yaw;

            // Normalize to -180 to 180
            while (yawDiff > 180) yawDiff -= 360;
            while (yawDiff < -180) yawDiff += 360;

            // Limit turn speed for smooth rotation
            if (Math.abs(yawDiff) > this.maxTurnSpeed) {
                yawDiff = Math.sign(yawDiff) * this.maxTurnSpeed;
            }
            this.yaw += yawDiff;
        }

        this.client.position = { x: newX, y: newY, z: newZ };
        this.client.rotation = { yaw: this.yaw, pitch: 0 };
        this.sendPosition(newX, newY, newZ, this.yaw, 0, this.onGround);
        this.lastPosition = { x: newX, y: newY, z: newZ };
    }

    getPlayerAABB(pos) {
        return { minX: pos.x - 0.3, maxX: pos.x + 0.3, minY: pos.y, maxY: pos.y + 1.8, minZ: pos.z - 0.3, maxZ: pos.z + 0.3 };
    }

    getCollisionBoxes(aabb) {
        const boxes = [];
        for (let x = Math.floor(aabb.minX) - 1; x <= Math.floor(aabb.maxX) + 1; x++) {
            for (let y = Math.floor(aabb.minY) - 1; y <= Math.floor(aabb.maxY) + 1; y++) {
                for (let z = Math.floor(aabb.minZ) - 1; z <= Math.floor(aabb.maxZ) + 1; z++) {
                    if (this.world.isSolid(x, y, z)) {
                        boxes.push({ minX: x, maxX: x + 1, minY: y, maxY: y + 1, minZ: z, maxZ: z + 1 });
                    }
                }
            }
        }
        return boxes;
    }

    sweepAxisX(aabb, boxes, dx) {
        if (dx === 0) return dx;
        for (const box of boxes) {
            if (aabb.maxY > box.minY && aabb.minY < box.maxY && aabb.maxZ > box.minZ && aabb.minZ < box.maxZ) {
                if (dx > 0 && aabb.maxX <= box.minX) dx = Math.min(dx, box.minX - aabb.maxX);
                else if (dx < 0 && aabb.minX >= box.maxX) dx = Math.max(dx, box.maxX - aabb.minX);
            }
        }
        return dx;
    }

    sweepAxisZ(aabb, boxes, dz) {
        if (dz === 0) return dz;
        for (const box of boxes) {
            if (aabb.maxY > box.minY && aabb.minY < box.maxY && aabb.maxX > box.minX && aabb.minX < box.maxX) {
                if (dz > 0 && aabb.maxZ <= box.minZ) dz = Math.min(dz, box.minZ - aabb.maxZ);
                else if (dz < 0 && aabb.minZ >= box.maxZ) dz = Math.max(dz, box.maxZ - aabb.minZ);
            }
        }
        return dz;
    }

    sweepAxisY(aabb, boxes, dy) {
        if (dy === 0) return dy;
        for (const box of boxes) {
            if (aabb.maxX > box.minX && aabb.minX < box.maxX && aabb.maxZ > box.minZ && aabb.minZ < box.maxZ) {
                if (dy > 0 && aabb.maxY <= box.minY) dy = Math.min(dy, box.minY - aabb.maxY);
                else if (dy < 0 && aabb.minY >= box.maxY) dy = Math.max(dy, box.maxY - aabb.minY);
            }
        }
        return dy;
    }

    sendPosition(x, y, z, yaw, pitch, onGround) {
        if (this.client.awaitingTeleport || this.movementCooldown > 0) return;
        const packet = new PacketWriter(C2S_SET_PLAYER_POSITION_AND_ROTATION)
            .writeDouble(x).writeDouble(y).writeDouble(z)
            .writeFloat(yaw).writeFloat(pitch).writeBoolean(onGround);
        this.connection.send(packet.buildData());
    }

    serverPositionReset() {
        this.movementCooldown = this.cooldownAfterReset;
        this.client.awaitingTeleport = true;
        this.velocity = { x: 0, y: 0, z: 0 };
        logger.debug('[Movement] Server reset');
    }

    distance3D(a, b) {
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    stop() {
        this.isMoving = false;
        this.targetPosition = null;
        this.path = [];
        this.jumpQueued = false;
        if (this.moveInterval) { clearInterval(this.moveInterval); this.moveInterval = null; }
        if (this.pathRecalcTimer) { clearInterval(this.pathRecalcTimer); this.pathRecalcTimer = null; }
        logger.info('[Movement] Stopped');
    }
}

module.exports = { MovementAdvanced };

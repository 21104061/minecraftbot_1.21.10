/**
 * Simple logger with log levels
 * Levels: 0=OFF, 1=ERROR, 2=WARN, 3=INFO, 4=DEBUG
 */

const LOG_LEVELS = {
    OFF: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4
};

// Default log level - can be changed via setLogLevel()
let currentLevel = LOG_LEVELS.INFO;

// Categories to always show regardless of level
const IMPORTANT_CATEGORIES = [
    'Chat',      // Chat messages
    'Command',   // Commands received/executed
    'Movement',  // Movement status
    'Path',      // Pathfinding results
    'Error',     // Errors
    'Bot'        // Bot status messages
];

// Categories to hide at INFO level (only show at DEBUG)
const DEBUG_ONLY_CATEGORIES = [
    'Config',      // Configuration handshake details
    'World',       // Chunk loading
    'Keep-Alive',  // Keep-alive packets
    'Ping',        // Ping/pong
    'Connection',  // Connection state changes
    'Handshake',   // Handshake details
    'DEBUG'        // Debug messages
];

function setLogLevel(level) {
    if (typeof level === 'string') {
        currentLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else {
        currentLevel = level;
    }
    console.log(`[Logger] Log level set to: ${Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === currentLevel)}`);
}

function getCategory(message) {
    const match = message.match(/^\[([^\]]+)\]/);
    return match ? match[1] : null;
}

function shouldLog(message, level) {
    if (currentLevel < level) return false;

    const category = getCategory(message);

    // Always show important categories
    if (category && IMPORTANT_CATEGORIES.includes(category)) {
        return true;
    }

    // Hide debug-only categories unless at DEBUG level
    if (category && DEBUG_ONLY_CATEGORIES.includes(category)) {
        return currentLevel >= LOG_LEVELS.DEBUG;
    }

    // Show emoji messages (chat, death, etc.)
    if (message.startsWith('💬') || message.startsWith('💀') || message.startsWith('✓')) {
        return true;
    }

    return level <= currentLevel;
}

const logger = {
    debug: (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (shouldLog(msg, LOG_LEVELS.DEBUG)) {
            console.log(...args);
        }
    },

    info: (...args) => {
        const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        if (shouldLog(msg, LOG_LEVELS.INFO)) {
            console.log(...args);
        }
    },

    warn: (...args) => {
        if (currentLevel >= LOG_LEVELS.WARN) {
            console.warn(...args);
        }
    },

    error: (...args) => {
        if (currentLevel >= LOG_LEVELS.ERROR) {
            console.error(...args);
        }
    },

    // Always log - for critical messages
    always: (...args) => {
        console.log(...args);
    },

    setLevel: setLogLevel,

    LEVELS: LOG_LEVELS
};

module.exports = { logger, LOG_LEVELS, setLogLevel };

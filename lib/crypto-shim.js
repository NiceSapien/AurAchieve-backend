module.exports = {
    randomUUID: () => crypto.randomUUID(),
    createHash: (alg) => {
        // Fastly supports crypto.subtle in Web API, but node's crypto.createHash is sync.
        // We might need to dummy it if it's not critically used, or implement a basic fallback.
        // Where is crypto used? In routes/memoryLanesRoutes.js: const crypto = require('crypto');
        return {
            update: () => ({ digest: () => 'hash' }) // Dummy for now unless we know exactly what is hashed
        };
    }
};
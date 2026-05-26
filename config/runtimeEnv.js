let getEnv;

const createNodeEnvReader = () => {
    let fileEnv;
    let loaded = false;

    const loadEnvJson = () => {
        if (loaded) return;
        loaded = true;
        try {
            const fs = require('fs');
            const path = require('path');
            const envPath = path.resolve(__dirname, '..', 'env.json');
            const raw = fs.readFileSync(envPath, 'utf8');
            fileEnv = JSON.parse(raw);
        } catch {
            fileEnv = undefined;
        }
    };

    return (key) => {
        try {
            const processValue = globalThis.process?.env?.[key];
            if (processValue !== undefined) return processValue;
        } catch {
            // Ignore and continue to env.json fallback.
        }

        loadEnvJson();
        return fileEnv?.[key];
    };
};

try {
    const { env } = require('fastly:env');
    const { ConfigStore } = require('fastly:config-store');
    let config;

    const getConfigValue = (key) => {
        try {
            if (!config) config = new ConfigStore('aurachieve_config');
            return env(key) || config.get(key) || undefined;
        } catch {
            return env(key);
        }
    };

    getEnv = getConfigValue;
} catch (e) {
    getEnv = createNodeEnvReader();
}

const configValue = (key) => {
    return getEnv(key);
};

const envValue = (key) => {
    return configValue(key);
};

const secretValue = async (key) => {
    try {
        const { SecretStore } = require('fastly:secret-store');
        const store = new SecretStore('aurachieve');
        const secret = await store.get(key);
        return secret ? secret.plaintext() : globalThis.process?.env?.[key];
    } catch {
        return globalThis.process?.env?.[key];
    }
};

module.exports = { configValue, envValue, secretValue };
let getEnv;
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
    getEnv = (key) => {
        try {
            return globalThis.process?.env?.[key];
        } catch {
            return undefined;
        }
    };
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
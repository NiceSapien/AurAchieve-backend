const { Client, Users, ID, Query, TablesDB } = require('../lib/node-appwrite-shim');
const https = require('../lib/https-shim');
require('../lib/dotenv-shim').config();
const { configValue } = require('../config/runtimeEnv');

if (configValue('NODE_ENV') === 'production') {
    const agent = new https.Agent({ keepAlive: true });
    https.globalAgent = agent;
}

const client = new Client();

const tablesDB = new TablesDB(client);
const users = new Users(client); 

module.exports = {
    client,
    tablesDB,
    users,
    ID,
    Query
};
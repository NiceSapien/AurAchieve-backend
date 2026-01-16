const { Client, Users, ID, Query, TablesDB } = require('node-appwrite');
const https = require('https');
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
    const agent = new https.Agent({ keepAlive: true });
    https.globalAgent = agent;
}

const client = new Client();

client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY); 

const tablesDB = new TablesDB(client);
const users = new Users(client); 

module.exports = {
    client,
    tablesDB,
    users,
    ID,
    Query,
    dbId: process.env.APPWRITE_DATABASE_ID,
    profilesCollectionId: process.env.PROFILES_COLLECTION_ID,
    tasksCollectionId: process.env.TASKS_COLLECTION_ID,
    studyPlansCollectionId: process.env.STUDY_PLAN_COLLECTION_ID,
    habitCollectionId: process.env.HABIT_COLLECTION_ID,
};
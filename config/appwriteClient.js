const { Client, Databases, Users, ID, Query, TablesDB } = require('node-appwrite');
require('dotenv').config();

const client = new Client();

client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY); 

const databases = new Databases(client);
const tablesDB = new TablesDB(client);
const users = new Users(client); 

module.exports = {
    client,
    databases,
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
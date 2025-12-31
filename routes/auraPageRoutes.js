const express = require('express');
const router = express.Router();
const { Client, Databases } = require('node-appwrite');
require('dotenv').config();

// Appwrite client setup
const client = new Client();
client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);


const database = new Databases(client);
const AURAPAGE_COLLECTION_ID = process.env.AURAPAGE_COLLECTION_ID;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;


const authMiddleware = require('../middleware/authMiddleware');

// POST /aura-page
router.post('/', authMiddleware, async (req, res) => {
    const { username, enable, theme } = req.body;
    const user = req.user;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    if (typeof username !== 'string' || username.length > 40 || /\s/.test(username) || !/^[a-zA-Z0-9._-]+$/.test(username)) {
        return res.status(400).json({ error: 'Invalid username. Max 40 chars, no spaces, only letters, numbers, dot, underscore, hyphen.' });
    }
    try {
        const { Query } = require('node-appwrite');
        const existing = await database.listDocuments(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            [Query.equal('username', username)]
        );
        if (existing.documents.some(doc => doc.$id !== user.$id)) {
            return res.status(409).json({ error: 'Username already in use' });
        }
        let validTheme = null;
        if (typeof theme === 'string') {
            const allowedThemes = ['hacker', 'peace', 'midnight', 'gold'];
            if (allowedThemes.includes(theme)) {
                validTheme = theme;
            }
        }
        if (typeof enable !== 'boolean') {
            return res.status(400).json({ error: 'Enable must be true or false' });
        }
        // ...existing code...
        // Try to update the user's AuraPage and Profile documents
        let auraPageDoc, profileDoc;
        try {
            auraPageDoc = await database.updateDocument(
                APPWRITE_DATABASE_ID,
                AURAPAGE_COLLECTION_ID,
                user.$id,
                { username, theme: validTheme, enable }
            );
        } catch (error) {
            if (error.code === 404) {
                try {
                    auraPageDoc = await database.createDocument(
                        APPWRITE_DATABASE_ID,
                        AURAPAGE_COLLECTION_ID,
                        user.$id,
                        { username, theme: validTheme, enable }
                    );
                } catch (createError) {
                    return res.status(500).json({ error: createError.message || 'Failed to create AuraPage' });
                }
            } else {
                return res.status(500).json({ error: error.message || 'Failed to update AuraPage' });
            }
        }
        try {
            profileDoc = await database.updateDocument(
                APPWRITE_DATABASE_ID,
                process.env.PROFILES_COLLECTION_ID,
                user.$id,
                { username }
            );
        } catch (error) {
            if (error.code === 404) {
                try {
                    profileDoc = await database.createDocument(
                        APPWRITE_DATABASE_ID,
                        process.env.PROFILES_COLLECTION_ID,
                        user.$id,
                        { username }
                    );
                } catch (createError) {
                    return res.status(500).json({ error: createError.message || 'Failed to create profile' });
                }
            } else {
                return res.status(500).json({ error: error.message || 'Failed to update profile' });
            }
        }
        return res.status(200).json({ message: 'AuraPage and profile updated', auraPage: auraPageDoc, profile: profileDoc });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to check username' });
    }
});
router.patch('/enable', authMiddleware, async (req, res) => {
    const user = req.user;
    const { enable } = req.body;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    if (typeof enable !== 'boolean') {
        return res.status(400).json({ error: 'Enable must be true or false' });
    }
    try {
        const response = await database.updateDocument(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            user.$id,
            { enable }
        );
        return res.status(200).json({ message: 'Enable updated', document: response });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to update enable' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    try {
        const doc = await database.getDocument(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            user.$id
        );
        return res.status(200).json({
            username: doc.username,
            enable: doc.enable,
            theme: doc.theme
        });
    } catch (error) {
        return res.status(404).json({ error: 'AuraPage not found' });
    }
});
module.exports = router;

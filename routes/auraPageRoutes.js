const express = require('express');
const router = express.Router();
const { Client, Databases } = require('node-appwrite');
require('dotenv').config();

const client = new Client();
client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);


const database = new Databases(client);
const AURAPAGE_COLLECTION_ID = process.env.AURAPAGE_COLLECTION_ID;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;


const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, async (req, res) => {
    const { username, enable, theme, bio } = req.body;
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
    if (bio && (typeof bio !== 'string' || bio.length > 180)) {
        return res.status(400).json({ error: 'Bio must be max 180 characters' });
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
                        { username, theme: validTheme, enable, purchasedThemes: ['default'], bio }
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

router.patch('/theme', authMiddleware, async (req, res) => {
    const user = req.user;
    const { theme } = req.body;
    
    const THEME_PRICES = {
        'peace': 250,
        'midnight': 500,
        'hacker': 750,
        'gold': 750,
        'default': 0
    };

    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const allowedThemes = ['hacker', 'peace', 'midnight', 'gold', 'default'];
    if (!theme || !allowedThemes.includes(theme)) {
        return res.status(400).json({ error: 'Invalid theme' });
    }

    try {
        const auraPageDoc = await database.getDocument(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            user.$id
        );

        const purchasedThemes = auraPageDoc.purchasedThemes || [];

        if (purchasedThemes.includes(theme)) {
            const updatedDoc = await database.updateDocument(
                APPWRITE_DATABASE_ID,
                AURAPAGE_COLLECTION_ID,
                user.$id,
                { theme }
            );
            return res.status(200).json({ message: 'Theme updated', theme: updatedDoc.theme, purchasedThemes: updatedDoc.purchasedThemes });
        }

        const profileDoc = await database.getDocument(
            APPWRITE_DATABASE_ID,
            process.env.PROFILES_COLLECTION_ID,
            user.$id
        );

        const cost = THEME_PRICES[theme];

        if ((profileDoc.aura || 0) < cost) {
            return res.status(402).json({ error: 'Insufficient Aura' });
        }

        await database.updateDocument(
            APPWRITE_DATABASE_ID,
            process.env.PROFILES_COLLECTION_ID,
            user.$id,
            { aura: (profileDoc.aura || 0) - cost }
        );

        const newPurchasedThemes = [...purchasedThemes, theme];
        const updatedDoc = await database.updateDocument(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            user.$id,
            {
                theme,
                purchasedThemes: newPurchasedThemes
            }
        );

        return res.status(200).json({ message: 'Theme purchased and updated', theme: updatedDoc.theme, purchasedThemes: updatedDoc.purchasedThemes });

    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to update theme' });
    }
});

router.patch('/bio', authMiddleware, async (req, res) => {
    const user = req.user;
    const { bio } = req.body;

    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    if (typeof bio !== 'string' || bio.length > 180) {
        return res.status(400).json({ error: 'Bio must be a string and max 160 characters' });
    }

    try {
        const response = await database.updateDocument(
            APPWRITE_DATABASE_ID,
            AURAPAGE_COLLECTION_ID,
            user.$id,
            { bio }
        );
        return res.status(200).json({ message: 'Bio updated', bio: response.bio });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to update bio' });
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
            theme: doc.theme,
            purchasedThemes: doc.purchasedThemes || [],
            bio: doc.bio || ''
        });
    } catch (error) {
        return res.status(404).json({ error: 'AuraPage not found' });
    }
});
module.exports = router;

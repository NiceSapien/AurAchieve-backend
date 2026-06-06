const express = require('express');
const { Client, Databases, Query } = require('node-appwrite');
const crypto = require('crypto');
require('dotenv').config();

const router = express.Router();

const client = new Client();
client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const database = new Databases(client);
const MEMORYLANES_DATABASE_ID = process.env.MEMORYLANES_DATABASE_ID;
const MEMORYLANES_ENCRYPTION_KEY = process.env.MEMORYLANES_ENCRYPTION_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.PROFILES_COLLECTION_ID;

const ensureMemoryLanesConfigured = (res) => {
    if (!MEMORYLANES_DATABASE_ID) {
        res.status(500).json({ error: 'MEMORYLANES_DATABASE_ID is not configured' });
        return false;
    }
    return true;
};

const deriveAesKey = () => {
    return crypto.createHash('sha256').update(String(MEMORYLANES_ENCRYPTION_KEY)).digest();
};

const decryptText = (packed) => {
    if (packed === undefined || packed === null) return packed;
    if (!MEMORYLANES_ENCRYPTION_KEY) return packed;

    const text = String(packed);
    const parts = text.split('.');
    if (parts.length !== 3) return packed;

    try {
        const [ivB64, tagB64, ctB64] = parts;
        const iv = Buffer.from(ivB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const ciphertext = Buffer.from(ctB64, 'base64');
        const key = deriveAesKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
    } catch (error) {
        return packed;
    }
};

const normalizePublicMemory = (memoryDoc) => {
    const cloned = { ...memoryDoc };
    cloned.name = decryptText(cloned.name);
    cloned.description = decryptText(cloned.description);
    cloned.tag = decryptText(cloned.tag);
    cloned.tagColor = decryptText(cloned.tagColor);
    cloned.mood = decryptText(cloned.mood);

    if (Array.isArray(cloned.files)) {
        cloned.files = cloned.files.map((fileId) => decryptText(fileId));
    }

    return cloned;
};

const getAuthorName = async (userId) => {
    if (!APPWRITE_DATABASE_ID || !PROFILES_COLLECTION_ID) {
        return null;
    }

    try {
        const profileDoc = await database.getDocument(
            APPWRITE_DATABASE_ID,
            PROFILES_COLLECTION_ID,
            userId
        );
        return profileDoc.name || null;
    } catch (error) {
        if (error && error.code === 404) {
            return null;
        }
        throw error;
    }
};

const listAllCollections = async () => {
    const collections = [];
    let offset = 0;
    const limit = 100;

    while (true) {
        const response = await database.listCollections(MEMORYLANES_DATABASE_ID, [
            Query.limit(limit),
            Query.offset(offset),
        ]);
        const chunk = response.collections || [];
        collections.push(...chunk);
        if (chunk.length < limit) break;
        offset += limit;
    }

    return collections;
};

router.get('/memories/:memoryId', async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;

    const { memoryId } = req.params;
    if (!memoryId) {
        return res.status(404).json({ error: 'Memory not found' });
    }

    try {
        const collections = await listAllCollections();

        for (const collection of collections) {
            try {
                const memoryDoc = await database.getDocument(
                    MEMORYLANES_DATABASE_ID,
                    collection.$id,
                    memoryId
                );

                if (memoryDoc.public === true) {
                    const publicMemory = normalizePublicMemory(memoryDoc);
                    publicMemory.author = await getAuthorName(collection.$id);
                    return res.status(200).json(publicMemory);
                }
            } catch (error) {
                if (error && error.code === 404) {
                    continue;
                }
                throw error;
            }
        }

        return res.status(404).json({ error: 'Memory not found' });
    } catch (error) {
        console.error('Load public memory error:', error);
        return res.status(500).json({ error: error.message || 'Failed to load memory' });
    }
});

module.exports = router;
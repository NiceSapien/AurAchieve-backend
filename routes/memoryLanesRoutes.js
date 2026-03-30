const express = require('express');
const router = express.Router();
const { Client, Databases, Query, ID } = require('node-appwrite');
const authMiddleware = require('../middleware/authMiddleware');
const crypto = require('crypto');
require('dotenv').config();
const client = new Client();
client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const database = new Databases(client);
const MEMORYLANES_DATABASE_ID = process.env.MEMORYLANES_DATABASE_ID;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.PROFILES_COLLECTION_ID;
const MEMORYLANES_ENCRYPTION_KEY = process.env.MEMORYLANES_ENCRYPTION_KEY;
const MEMORYLANES_STORAGE_BUCKET_ID = process.env.MEMORYLANES_STORAGE_BUCKET_ID;
const { Storage } = require('node-appwrite');
const storage = new Storage(client);
const ensureMemoryLanesConfigured = (res) => {
    if (!MEMORYLANES_DATABASE_ID) {
        res.status(500).json({ error: 'MEMORYLANES_DATABASE_ID is not configured' });
        return false;
    }
    return true;
};
const ensureEncryptionConfigured = (res) => {
    if (!MEMORYLANES_ENCRYPTION_KEY) {
        res.status(500).json({ error: 'MEMORYLANES_ENCRYPTION_KEY is not configured' });
        return false;
    }
    return true;
};
const deriveAesKey = () => {
    return crypto.createHash('sha256').update(String(MEMORYLANES_ENCRYPTION_KEY)).digest();
};
const encryptText = (plaintext) => {
    if (plaintext === undefined || plaintext === null) return plaintext;
    const text = String(plaintext);
    const iv = crypto.randomBytes(12);
    const key = deriveAesKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
};
const decryptText = (packed) => {
    if (packed === undefined || packed === null) return packed;
    const text = String(packed);
    const parts = text.split('.');
    if (parts.length !== 3) return packed;
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const key = deriveAesKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
};
const getUserE2ePreference = async (userId) => {
    if (!APPWRITE_DATABASE_ID || !PROFILES_COLLECTION_ID) {
        return false;
    }
    try {
        const profile = await database.getDocument(APPWRITE_DATABASE_ID, PROFILES_COLLECTION_ID, userId);
        return profile && profile.e2e === true;
    } catch (error) {
        return false;
    }
};
const setUserE2ePreference = async (userId, e2e) => {
    if (!APPWRITE_DATABASE_ID || !PROFILES_COLLECTION_ID) {
        return;
    }
    try {
        await database.updateDocument(APPWRITE_DATABASE_ID, PROFILES_COLLECTION_ID, userId, { e2e });
    } catch (error) {
        if (error.code === 404) {
            await database.createDocument(APPWRITE_DATABASE_ID, PROFILES_COLLECTION_ID, userId, { e2e });
            return;
        }
        throw error;
    }
};
const getMonthRangeUtc = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return {
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    };
};
router.post('/setup', authMiddleware, async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = user.$id;
    const { e2e } = req.body;
    if (typeof e2e !== 'boolean') {
        return res.status(400).json({ error: 'e2e must be a boolean' });
    }
    try {
        await setUserE2ePreference(userId, e2e);
        try {
            await database.getCollection(MEMORYLANES_DATABASE_ID, userId);
            return res.status(200).json({ message: 'Memory Lane already exists for this user.' });
        } catch (error) {
            if (error.code !== 404) throw error;
        }
        await database.createCollection(
            MEMORYLANES_DATABASE_ID,
            userId,
            userId
        );
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'name', 255, true);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'description', 3000, false);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'createdAt', 100, true);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'tag', 100, false);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'tagColor', 100, false);
        await database.createBooleanAttribute(MEMORYLANES_DATABASE_ID, userId, 'public', true);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'mood', 255, false);
        await database.createStringAttribute(MEMORYLANES_DATABASE_ID, userId, 'files', 255, false, undefined, true);
        res.status(201).json({ message: 'Memory Lane setup successfully. Attributes are being created.' });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ error: error.message || 'Failed to setup Memory Lane' });
    }
});
router.post('/', authMiddleware, async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = user.$id;
    const { name, description, createdAt, tag, tagColor, public: isPublic, mood, files } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!createdAt) return res.status(400).json({ error: 'createdAt is required' });
    if (isPublic === undefined) return res.status(400).json({ error: 'Public status is required' });
    if (typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'Public must be a boolean' });
    }
    if (description && typeof description === 'string' && description.length > 30000) {
        return res.status(400).json({ error: 'Description must be at most 30000 characters' });
    }
    if (tag && !tagColor) {
        return res.status(400).json({ error: 'tagColor is required when tag is provided' });
    }
    if (mood !== undefined) {
        if (typeof mood !== 'string' || mood.trim() === '') {
            return res.status(400).json({ error: 'Mood must be a non-empty string' });
        }
    }
    if (files !== undefined) {
        if (!Array.isArray(files)) {
            return res.status(400).json({ error: 'files must be an array of filenames' });
        }
        if (!files.every(f => typeof f === 'string' && f.length > 0 && f.length <= 255)) {
            return res.status(400).json({ error: 'files must be an array of non-empty strings (max 255 chars each)' });
        }
    }
    try {
        const e2e = await getUserE2ePreference(userId);
        if (!e2e && !ensureEncryptionConfigured(res)) return;
        const encryptedFiles = !e2e && Array.isArray(files)
            ? files.map((f) => encryptText(f))
            : files;
        const documentData = {
            name: e2e ? name : encryptText(name),
            description: e2e ? description : encryptText(description),
            createdAt,
            tag: e2e ? tag : encryptText(tag),
            tagColor: e2e ? tagColor : encryptText(tagColor),
            public: isPublic,
            mood: e2e ? mood : encryptText(mood),
            files: encryptedFiles
        };
        const response = await database.createDocument(
            MEMORYLANES_DATABASE_ID,
            userId, 
            ID.unique(),
            documentData
        );
        res.status(201).json({ message: 'Memory created', document: response });
    } catch (error) {
        console.error('Create memory error:', error);
        res.status(500).json({ error: error.message || 'Failed to create memory' });
    }
});
router.put('/:memoryId', authMiddleware, async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = user.$id;
    const { memoryId } = req.params;
    if (!memoryId) {
        return res.status(400).json({ error: 'memoryId is required' });
    }
    const hasName = Object.prototype.hasOwnProperty.call(req.body, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(req.body, 'description');
    const hasCreatedAt = Object.prototype.hasOwnProperty.call(req.body, 'createdAt');
    const hasTag = Object.prototype.hasOwnProperty.call(req.body, 'tag');
    const hasTagColor = Object.prototype.hasOwnProperty.call(req.body, 'tagColor');
    const hasPublic = Object.prototype.hasOwnProperty.call(req.body, 'public');
    const hasMood = Object.prototype.hasOwnProperty.call(req.body, 'mood');
    const hasFiles = Object.prototype.hasOwnProperty.call(req.body, 'files');
    const hasUpdatableField = hasName || hasDescription || hasCreatedAt || hasTag || hasTagColor || hasPublic || hasMood || hasFiles;
    if (!hasUpdatableField) {
        return res.status(400).json({ error: 'At least one updatable field is required' });
    }
    const { name, description, createdAt, tag, tagColor, public: isPublic, mood, files } = req.body;
    if (hasName && (typeof name !== 'string' || name.trim() === '')) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
    }
    if (hasDescription) {
        if (description !== null && typeof description !== 'string') {
            return res.status(400).json({ error: 'Description must be a string or null' });
        }
        if (typeof description === 'string' && description.length > 30000) {
            return res.status(400).json({ error: 'Description must be at most 30000 characters' });
        }
    }
    if (hasCreatedAt && (typeof createdAt !== 'string' || createdAt.trim() === '')) {
        return res.status(400).json({ error: 'createdAt must be a non-empty string' });
    }
    if (hasTag && tag && !hasTagColor) {
        return res.status(400).json({ error: 'tagColor is required when tag is provided' });
    }
    if (hasPublic && typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'Public must be a boolean' });
    }
    if (hasMood && mood !== null) {
        if (typeof mood !== 'string' || mood.trim() === '') {
            return res.status(400).json({ error: 'Mood must be a non-empty string or null' });
        }
    }
    if (hasFiles) {
        if (!Array.isArray(files)) {
            return res.status(400).json({ error: 'files must be an array of filenames' });
        }
        if (!files.every(f => typeof f === 'string' && f.length > 0 && f.length <= 255)) {
            return res.status(400).json({ error: 'files must be an array of non-empty strings (max 255 chars each)' });
        }
    }
    try {
        const e2e = await getUserE2ePreference(userId);
        if (!e2e && !ensureEncryptionConfigured(res)) return;
        const updateData = {};
        if (hasName) updateData.name = e2e ? name : encryptText(name);
        if (hasDescription) updateData.description = e2e ? description : encryptText(description);
        if (hasCreatedAt) updateData.createdAt = createdAt;
        if (hasTag) updateData.tag = e2e ? tag : encryptText(tag);
        if (hasTagColor) updateData.tagColor = e2e ? tagColor : encryptText(tagColor);
        if (hasPublic) updateData.public = isPublic;
        if (hasMood) updateData.mood = e2e ? mood : encryptText(mood);
        if (hasFiles) {
            updateData.files = e2e ? files : files.map((f) => encryptText(f));
        }
        const response = await database.updateDocument(
            MEMORYLANES_DATABASE_ID,
            userId,
            memoryId,
            updateData
        );
        return res.status(200).json({ message: 'Memory updated', document: response });
    } catch (error) {
        if (error.code === 404) {
            return res.status(404).json({ error: 'Memory not found' });
        }
        console.error('Update memory error:', error);
        return res.status(500).json({ error: error.message || 'Failed to update memory' });
    }
});
router.delete('/:memoryId', authMiddleware, async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = user.$id;
    const { memoryId } = req.params;
    if (!memoryId) {
        return res.status(400).json({ error: 'memoryId is required' });
    }
    try {
        let memoryDoc;
        try {
            memoryDoc = await database.getDocument(MEMORYLANES_DATABASE_ID, userId, memoryId);
        } catch (error) {
            if (error.code === 404) {
                return res.status(404).json({ error: 'Memory not found' });
            }
            throw error;
        }
        const e2e = await getUserE2ePreference(userId);
        let filesToDelete = Array.isArray(memoryDoc.files) ? memoryDoc.files : [];
        if (!e2e && filesToDelete.length > 0) {
            filesToDelete = filesToDelete.map(f => decryptText(f));
        }
        const bucketId = MEMORYLANES_STORAGE_BUCKET_ID;
        const deletedFiles = [];
        const failedFiles = [];
        if (bucketId && filesToDelete.length > 0) {
            for (const fileId of filesToDelete) {
                try {
                    await storage.deleteFile(bucketId, fileId);
                    deletedFiles.push(fileId);
                } catch (err) {
                    failedFiles.push(fileId);
                }
            }
        }
        await database.deleteDocument(MEMORYLANES_DATABASE_ID, userId, memoryId);
        return res.status(200).json({ message: 'Memory deleted', deletedFiles, failedFiles });
    } catch (error) {
        if (error.code === 404) {
            return res.status(404).json({ error: 'Memory not found' });
        }
        console.error('Delete memory error:', error);
        return res.status(500).json({ error: error.message || 'Failed to delete memory' });
    }
});
router.get('/', authMiddleware, async (req, res) => {
    if (!ensureMemoryLanesConfigured(res)) return;
    const user = req.user;
    if (!user || !user.$id) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    const userId = user.$id;
    const lengthRaw = req.query.length;
    const offsetRaw = req.query.offset;
    const hasLength = lengthRaw !== undefined;
    const length = hasLength ? Math.min(Math.max(parseInt(lengthRaw, 10) || 20, 1), 100) : null;
    const offset = Math.max(parseInt(offsetRaw, 10) || 0, 0);
    try {
        const e2e = await getUserE2ePreference(userId);
        if (!e2e && !ensureEncryptionConfigured(res)) return;
        if (hasLength) {
            const now = new Date();
            const currentMonth = now.getUTCMonth() + 1;
            const currentYear = now.getUTCFullYear();
            const previousMonthStart = new Date(Date.UTC(currentYear, currentMonth - 2, 1, 0, 0, 0, 0));
            const cutoffIso = previousMonthStart.toISOString();
            const response = await database.listDocuments(
                MEMORYLANES_DATABASE_ID,
                userId,
                [
                    Query.lessThan('$createdAt', cutoffIso),
                    Query.limit(length),
                    Query.offset(offset),
                    Query.orderDesc('$createdAt'),
                ]
            );
            if (e2e) {
                return res.status(200).json(response);
            }
            const decryptedDocuments = (response.documents || []).map((doc) => {
                const cloned = { ...doc };
                try {
                    cloned.name = decryptText(cloned.name);
                    cloned.description = decryptText(cloned.description);
                    cloned.tag = decryptText(cloned.tag);
                    cloned.tagColor = decryptText(cloned.tagColor);
                    cloned.mood = decryptText(cloned.mood);
                    if (Array.isArray(cloned.files)) {
                        cloned.files = cloned.files.map((f) => decryptText(f));
                    }
                } catch (_) {
                }
                return cloned;
            });
            return res.status(200).json({
                ...response,
                documents: decryptedDocuments,
            });
        }
        const now = new Date();
        const currentMonth = now.getUTCMonth() + 1;
        const currentYear = now.getUTCFullYear();
        const prev = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
        const prevMonth = prev.getUTCMonth() + 1;
        const prevYear = prev.getUTCFullYear();
        const rangesToFetch = [
            getMonthRangeUtc(currentYear, currentMonth),
            getMonthRangeUtc(prevYear, prevMonth),
        ];
        const listOneRange = async ({ startIso, endIso }) => {
            return database.listDocuments(
                MEMORYLANES_DATABASE_ID,
                userId,
                [
                    Query.between('$createdAt', startIso, endIso),
                    Query.orderDesc('$createdAt'),
                    Query.limit(200),
                ]
            );
        };
        const responses = [];
        for (const range of rangesToFetch) {
            responses.push(await listOneRange(range));
        }
        const mergedDocuments = responses
            .flatMap(r => r.documents || [])
            .sort((a, b) => String(b.$createdAt).localeCompare(String(a.$createdAt)));
        const response = { total: mergedDocuments.length, documents: mergedDocuments };
        if (e2e) {
            return res.status(200).json(response);
        }
        const decryptedDocuments = (response.documents || []).map((doc) => {
            const cloned = { ...doc };
            try {
                cloned.name = decryptText(cloned.name);
                cloned.description = decryptText(cloned.description);
                cloned.tag = decryptText(cloned.tag);
                cloned.tagColor = decryptText(cloned.tagColor);
                cloned.mood = decryptText(cloned.mood);
                if (Array.isArray(cloned.files)) {
                    cloned.files = cloned.files.map((f) => decryptText(f));
                }
            } catch (_) {
            }
            return cloned;
        });
        return res.status(200).json({
            ...response,
            documents: decryptedDocuments,
        });
    } catch (error) {
        console.error('Load memories error:', error);
        if (error.code === 404) {
            return res.status(404).json({ error: 'Memory Lane not found. Please run setup first.' });
        }
        res.status(500).json({ error: error.message || 'Failed to load memories' });
    }
});
module.exports = router;

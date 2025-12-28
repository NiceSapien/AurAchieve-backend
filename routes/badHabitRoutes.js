const express = require('express');
const router = express.Router();
const appwriteService = require('../services/appwriteService');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;

    try {
        const badHabit = await appwriteService.createBadHabit(userId, req.body);
        res.status(201).json(badHabit);
    } catch (error) {
        if (error?.code === 400) {
            return res.status(400).json({
                error: error?.message === 'completedDays is required'
                    ? 'completedDays is required'
                    : 'Invalid severity. Expected one of: average, high, vhigh, extreme',
            });
        }
        console.error('Error creating bad habit:', error);
        res.status(500).json({ error: 'Failed to create bad habit' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;

    try {
        const badHabits = await appwriteService.getBadHabits(userId);
        res.status(200).json(badHabits);
    } catch (error) {
        console.error('Error fetching bad habits:', error);
        res.status(500).json({ error: 'Failed to fetch bad habits' });
    }
});

router.put('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;

    try {
        const { habitId, incrementBy, completedDays } = req.body || {};
        if (!habitId) {
            return res.status(400).json({ error: 'habitId is required' });
        }
        if (completedDays == null) {
            return res.status(400).json({ error: 'completedDays is required' });
        }

        const updated = await appwriteService.completeBadHabit(userId, habitId, completedDays, incrementBy);
        res.status(200).json(updated);
        console.log(updated);
    } catch (error) {
        console.error('Error completing bad habit:', error);
        res.status(500).json({ error: 'Failed to complete bad habit' });
    }
});

router.patch('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;

    try {
        const { habitId, ...updates } = req.body || {};
        if (!habitId) {
            return res.status(400).json({ error: 'habitId is required' });
        }

        const updated = await appwriteService.updateBadHabit(userId, habitId, updates);
        res.status(200).json(updated);
    } catch (error) {
        if (error?.code === 400) {
            return res.status(400).json({
                error: error?.message === 'Invalid severity'
                    ? 'Invalid severity. Expected one of: average, high, vhigh, extreme'
                    : error.message,
            });
        }
        if (error?.code === 403) return res.status(403).json({ error: 'Unauthorized' });
        if (error?.code === 404) return res.status(404).json({ error: 'Bad habit not found' });
        console.error('Error editing bad habit:', error);
        res.status(500).json({ error: 'Failed to edit bad habit' });
    }
});

router.delete('/', authMiddleware, async (req, res) => {
    try {
        const { habitId } = req.body || {};
        if (!habitId) {
            return res.status(400).json({ error: 'habitId is required' });
        }

        await appwriteService.deleteBadHabit(habitId);
        res.status(204).send('');
    } catch (error) {
        console.error('Error deleting bad habit:', error);
        res.status(500).json({ error: 'Failed to delete bad habit' });
    }
});

module.exports = router;

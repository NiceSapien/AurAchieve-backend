const express = require('express');
const router = express.Router();
const appwriteService = require('../services/appwriteService'); 
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    try {
        const habit = await appwriteService.createHabit(userId, req.body);
        console.log(req.body);
        res.status(201).json(habit);
    } catch (error) {
        console.error('Error creating habit:', error);
        console.log(req.body)
        res.status(500).json({ error: 'Failed to create habit' });
    }
});
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    try {
        const habits = await appwriteService.getHabits(userId);
        console.log(habits);
        res.status(200).json(habits);
    } catch (error) {
        console.error('Error fetching habits:', error);
        res.status(500).json({ error: 'Failed to fetch habits' });
    }
});

router.put('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    try {
        console.error(req.body);
        const habits = await appwriteService.completeHabit(userId, req.body.habitId, req.body.completedDays);
        res.status(201).send(habits);
        console.log(habits);
    } catch (error) {
        console.error('Error Completing habit:', error);
        res.status(500).json({ error: 'Failed to complete habit' });
    }
});

router.patch('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    try {
        const { habitId, ...updates } = req.body || {};
        if (!habitId) {
            return res.status(400).json({ error: 'habitId is required' });
        }
        const updatedHabit = await appwriteService.updateHabit(userId, habitId, updates);
        res.status(200).json(updatedHabit);
    } catch (error) {
        if (error?.code === 400) return res.status(400).json({ error: error.message });
        if (error?.code === 403) return res.status(403).json({ error: 'Unauthorized' });
        if (error?.code === 404) return res.status(404).json({ error: 'Habit not found' });
        console.error('Error editing habit:', error);
        res.status(500).json({ error: 'Failed to edit habit' });
    }
});

router.delete('/', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    const habitId = req.body.habitId;
    try {
        await appwriteService.deleteHabit(habitId);
        res.status(204).send('');
    } catch (error) {
        console.error('Error deleting habit:', error);
        res.status(500).json({ error: 'Failed to delete habit' });
    }
});

module.exports = router;
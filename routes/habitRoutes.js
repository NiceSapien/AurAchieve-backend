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
        const habits = await appwriteService.completeHabit(userId, req.body.habitId);
        res.status(201).send('');
    } catch (error) {
        console.error('Error Completing habit:', error);
        res.status(500).json({ error: 'Failed to complete habit' });
    }
});

module.exports = router;
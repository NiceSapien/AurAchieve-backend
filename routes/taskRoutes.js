const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { verifyTaskWithGemini, classifyTaskWithGemini } = require('../services/geminiService');
const appwriteService = require('../services/appwriteService');

const DAILY_VALIDATION_LIMIT = 200;

router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const tasksResult = await appwriteService.getUserTasks(userId);
        res.json(tasksResult.documents);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).json({ message: 'Failed to fetch tasks' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const { name } = req.body; 

        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Task name is required.' });
        }

        const classification = await classifyTaskWithGemini(name);

        let taskType, taskIntensity;

        if (classification) {
            taskType = classification.type;
            taskIntensity = classification.intensity;
        } else {

            console.warn(`Classification failed for task: "${name}". Using defaults.`);
            taskType = 'good'; 
            taskIntensity = 'easy'; 

        }

        const newTask = await appwriteService.createTask(userId, {
            name: name.trim(),
            intensity: taskIntensity,
            type: taskType,
        });
        res.status(201).json(newTask);
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: 'Failed to create task' });
    }
});

router.post('/:taskId/complete', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    const { taskId } = req.params;
    const { imageBase64 } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ message: 'Image data is required for verification for this task type.' });
    }

    try {
        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
        const today = new Date().toISOString().split('T')[0];

        if (userProfile.lastValidationResetDate !== today) {
            userProfile.validationCount = 0;
            userProfile.lastValidationResetDate = today;

            appwriteService.updateUserValidationStats(userId, 0, today);
        }

        if (userProfile.validationCount >= DAILY_VALIDATION_LIMIT) {
            return res.status(429).json({ message: 'Daily image validation limit reached.' });
        }

        const taskToComplete = await appwriteService.getTaskById(taskId);
        if (!taskToComplete || taskToComplete.userId !== userId) {
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.type === 'bad') {
            return res.status(400).json({ message: 'This endpoint is for verifiable tasks. Use /complete-bad for this task.' });
        }

        const isVerified = await verifyTaskWithGemini(imageBase64, taskToComplete.name);

        await appwriteService.updateUserValidationStats(userId, userProfile.validationCount + 1, today);

        if (isVerified) {
            let auraChange = 0;
            const intensity = taskToComplete.intensity;

            if (intensity === 'easy') auraChange = 5;
            else if (intensity === 'medium') auraChange = 10;
            else if (intensity === 'hard') auraChange = 15;
            else auraChange = 5;

            const newAura = userProfile.aura + auraChange;
            await appwriteService.updateUserAura(userId, newAura);
            await appwriteService.updateTaskStatus(taskId, 'completed', new Date().toISOString());

            res.json({
                message: 'Task verified and completed successfully!',
                newAura: newAura,
                auraChange: auraChange,
                task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
            });
        } else {
            res.status(400).json({ message: 'Task verification failed by Gemini.' });
        }
    } catch (error) {
        console.error("Error completing task:", error);
        res.status(500).json({ message: 'Failed to complete task' });
    }
});

router.post('/:taskId/complete-bad', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    const { taskId } = req.params;

    try {
        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
        const taskToComplete = await appwriteService.getTaskById(taskId);

        if (!taskToComplete || taskToComplete.userId !== userId) {
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.type !== 'bad') {
            return res.status(400).json({ message: 'This endpoint is for "bad" tasks only.' });
        }

        let auraChange = 0;
        const intensity = taskToComplete.intensity;
        if (intensity === 'easy') auraChange = -5;
        else if (intensity === 'medium') auraChange = -10;
        else if (intensity === 'hard') auraChange = -15;
        else auraChange = -5; 

        const newAura = Math.max(0, userProfile.aura + auraChange); 
        await appwriteService.updateUserAura(userId, newAura);
        await appwriteService.updateTaskStatus(taskId, 'completed', new Date().toISOString());

        res.json({
            message: 'Bad task marked as "completed".',
            newAura: newAura,
            auraChange: auraChange,
            task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
        });
    } catch (error) {
        console.error("Error completing bad task:", error);
        res.status(500).json({ message: 'Failed to complete bad task' });
    }
});

router.put('/:taskId/mark-bad', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    const { taskId } = req.params;
    try {
        const task = await appwriteService.getTaskById(taskId);
        if (!task || task.userId !== userId) {
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }

        if (task.status === 'completed') {
            return res.status(400).json({ message: 'Cannot change type of a completed task.' });
        }
        const updatedTask = await appwriteService.updateTaskType(taskId, 'bad');
        res.json(updatedTask);
    } catch (error) {
        console.error("Error marking task as bad:", error);
        res.status(500).json({ message: 'Failed to mark task as bad' });
    }
});

router.delete('/:taskId', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    const { taskId } = req.params;
    try {
        const task = await appwriteService.getTaskById(taskId);
        if (!task || task.userId !== userId) {
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        await appwriteService.deleteTask(taskId);
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ message: 'Failed to delete task' });
    }
});

module.exports = router;
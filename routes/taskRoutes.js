const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); 
const { verifyTaskWithGemini, classifyTaskWithGemini } = require('../services/geminiService'); 
const appwriteService = require('../services/appwriteService'); 
const quotes = require('../quotes');
const { profilesCollectionId } = require('../config/appwriteClient');


const DAILY_VALIDATION_LIMIT = 200;

router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

router.get('/', authMiddleware, async (req, res) => {
    console.log("GET /api/tasks: Received request");
    try {
        const userId = req.user.$id; 
        const userName = req.user.name;
        const userEmail = req.user.email;
        const { clientDate } = req.query;
        console.log(`GET /api/tasks: Fetching tasks for userId: ${userId}`);
        const tasksResult = await appwriteService.getUserTasks(userId);
        const habitsResult = await appwriteService.getHabits(userId);
        const badHabitsResult = await appwriteService.getBadHabits(userId);
        let plan = await appwriteService.getStudyPlan(userId, clientDate);
        const profile = await appwriteService.getOrCreateUserProfile(userId, userName, userEmail);
        console.log(profile);
        res.json({
            tasks: tasksResult.documents,
            habits: habitsResult.documents,
            badHabits: badHabitsResult.documents,
            studyPlan: plan,
            userId: profile.userId || userId, 
            name: userName,
            username: profile.username || "",
            email: userEmail,
            aura: profile.aura,
            validationCount: profile.validationCount,
            lastValidationResetDate: profile.lastValidationResetDate,
            aura: profile.aura,
            validationCount: profile.validationCount,
            lastValidationResetDate: profile.lastValidationResetDate,
            quote: {quote: quotes, author: "Anonymous"}
        });
    } catch (error) {
        console.error("GET /api/tasks: Error fetching tasks:", error);
        res.status(500).json({ message: 'Failed to fetch tasks' });
    }
});

router.post('/', authMiddleware, async (req, res) => { 
    console.log("POST /api/tasks: Received request");
    try {
        const userId = req.user.$id; 
        const { name, taskCategory, durationMinutes } = req.body;
        console.log("POST /api/tasks: Request body:", req.body, "userId:", userId);

        if (!name || name.trim() === '') {
            console.error("POST /api/tasks: Validation failed - Task name is required.");
            return res.status(400).json({ message: 'Task name is required.' });
        }
        if (!taskCategory || !['normal', 'timed'].includes(taskCategory)) {
            console.error("POST /api/tasks: Validation failed - Invalid task category:", taskCategory);
            return res.status(400).json({ message: 'Valid task category (normal/timed) is required.' });
        }
        if (taskCategory === 'timed' && (typeof durationMinutes !== 'number' || durationMinutes <= 0)) {
            console.error("POST /api/tasks: Validation failed - Invalid duration for timed task:", durationMinutes);
            return res.status(400).json({ message: 'Valid positive duration (in minutes) is required for timed tasks.' });
        }

        console.log(`POST /api/tasks: Attempting to classify task: "${name}", Category: "${taskCategory}"`);
        const classification = await classifyTaskWithGemini(name, taskCategory);
        console.log("POST /api/tasks: Classification result:", classification);

        if (!classification) {
            console.error(`POST /api/tasks: Classification failed for task: "${name}". Gemini service returned null or invalid.`);
            return res.status(500).json({ message: 'Failed to classify task. Please try again.' });
        }

        const taskData = {
            name: name.trim(),
            intensity: classification.intensity,
            type: classification.type,
            taskCategory: taskCategory,
            durationMinutes: taskCategory === 'timed' ? durationMinutes : null,
            isImageVerifiable: taskCategory === 'normal' ? classification.isImageVerifiable : false,
        };
        console.log("POST /api/tasks: Task data prepared for Appwrite:", taskData);

        const newTask = await appwriteService.createTask(userId, taskData);
        console.log("POST /api/tasks: Task created successfully in Appwrite:", newTask);
        res.status(201).json(newTask);

    } catch (error) {
        console.error("POST /api/tasks: Critical error in create task route:", error.name, error.message);
        console.error("Error Stack:", error.stack);
        if (error.response && error.response.data) {
            console.error("Error response data (from upstream service like Gemini/Appwrite):", error.response.data);
        }
        res.status(500).json({ message: 'Failed to create task due to an internal server error.' });
    }
});

router.post('/:taskId/complete', authMiddleware, async (req, res) => {
    console.log(`POST /api/tasks/${req.params.taskId}/complete: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;
    const { imageBase64 } = req.body;

    try {
        console.log(`POST /api/tasks/${taskId}/complete: Fetching task for userId: ${userId}`);
        const taskToComplete = await appwriteService.getTaskById(taskId);

        if (!taskToComplete || taskToComplete.userId !== userId) {
            console.warn(`POST /api/tasks/${taskId}/complete: Task not found or unauthorized for userId: ${userId}`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            console.warn(`POST /api/tasks/${taskId}/complete: Task already completed.`);
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.taskCategory !== 'normal' || !taskToComplete.isImageVerifiable) {
            console.warn(`POST /api/tasks/${taskId}/complete: Incorrect task category or not image verifiable.`);
            return res.status(400).json({ message: 'This endpoint is for image-verifiable normal tasks.' });
        }
        if (taskToComplete.type === 'bad') {
            console.warn(`POST /api/tasks/${taskId}/complete: Attempt to complete a 'bad' task via image verification endpoint.`);
            return res.status(400).json({ message: 'Bad tasks cannot be completed via this image verification endpoint. Use complete-bad.' });
        }
        if (!imageBase64) {
            console.warn(`POST /api/tasks/${taskId}/complete: Image data is required.`);
            return res.status(400).json({ message: 'Image data is required for verification.' });
        }

        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
        const today = new Date().toISOString().split('T')[0];

        if (userProfile.lastValidationResetDate !== today) {
            userProfile.validationCount = 0;
            userProfile.lastValidationResetDate = today;
            await appwriteService.updateUserValidationStats(userId, 0, today);
            console.log(`POST /api/tasks/${taskId}/complete: User validation count reset for userId: ${userId}`);
        }

        if (userProfile.validationCount >= DAILY_VALIDATION_LIMIT) {
            console.warn(`POST /api/tasks/${taskId}/complete: Daily image validation limit reached for userId: ${userId}`);
            return res.status(429).json({ message: 'Daily image validation limit reached.' });
        }

        console.log(`POST /api/tasks/${taskId}/complete: Verifying task with Gemini.`);
        const isVerified = await verifyTaskWithGemini(imageBase64, taskToComplete.name);
        await appwriteService.updateUserValidationStats(userId, userProfile.validationCount + 1, today);
        console.log(`POST /api/tasks/${taskId}/complete: Gemini verification result: ${isVerified}`);

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
            console.log(`POST /api/tasks/${taskId}/complete: Task verified and completed. Aura change: ${auraChange}, New Aura: ${newAura}`);
            res.json({
                message: 'Task verified and completed successfully!',
                newAura: newAura,
                auraChange: auraChange,
                task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
            });
        } else {
            console.warn(`POST /api/tasks/${taskId}/complete: Task verification failed by Gemini.`);
            res.status(400).json({ message: 'Task verification failed by Gemini.' });
        }
    } catch (error) {
        console.error(`POST /api/tasks/${taskId}/complete: Error completing image-verifiable task:`, error);
        res.status(500).json({ message: 'Failed to complete task' });
    }
});

router.post('/:taskId/complete-normal-non-verifiable', authMiddleware, async (req, res) => {
    console.log(`POST /api/tasks/${req.params.taskId}/complete-normal-non-verifiable: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;

    try {
        console.log(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Fetching task for userId: ${userId}`);
        const taskToComplete = await appwriteService.getTaskById(taskId);

        if (!taskToComplete || taskToComplete.userId !== userId) {
            console.warn(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Task not found or unauthorized.`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            console.warn(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Task already completed.`);
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.taskCategory !== 'normal' || taskToComplete.isImageVerifiable) {
            console.warn(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Incorrect task category or it is image verifiable.`);
            return res.status(400).json({ message: 'This endpoint is for non-image-verifiable normal tasks.' });
        }
        if (taskToComplete.type === 'bad') {
            console.warn(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Attempt to complete 'bad' task.`);
            return res.status(400).json({ message: 'Bad tasks should use the /complete-bad endpoint.' });
        }

        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
        let auraChange = 0;
        const intensity = taskToComplete.intensity;

        if (intensity === 'easy') auraChange = 5;
        else if (intensity === 'medium') auraChange = 10;
        else if (intensity === 'hard') auraChange = 15;
        else auraChange = 5;

        const newAura = userProfile.aura + auraChange;
        await appwriteService.updateUserAura(userId, newAura);
        await appwriteService.updateTaskStatus(taskId, 'completed', new Date().toISOString());
        console.log(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Task completed. Aura change: ${auraChange}, New Aura: ${newAura}`);
        res.json({
            message: 'Task completed successfully!',
            newAura: newAura,
            auraChange: auraChange,
            task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
        });
    } catch (error) {
        console.error(`POST /api/tasks/${taskId}/complete-normal-non-verifiable: Error completing task:`, error);
        res.status(500).json({ message: 'Failed to complete task' });
    }
});

router.post('/:taskId/complete-timed', authMiddleware, async (req, res) => {
    console.log(`POST /api/tasks/${req.params.taskId}/complete-timed: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;
    const { actualDurationSpentMinutes } = req.body; 

    try {
        console.log(`POST /api/tasks/${taskId}/complete-timed: Fetching task for userId: ${userId}`);
        const taskToComplete = await appwriteService.getTaskById(taskId);

        if (!taskToComplete || taskToComplete.userId !== userId) {
            console.warn(`POST /api/tasks/${taskId}/complete-timed: Task not found or unauthorized.`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            console.warn(`POST /api/tasks/${taskId}/complete-timed: Task already completed.`);
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.taskCategory !== 'timed') {
            console.warn(`POST /api/tasks/${taskId}/complete-timed: Incorrect task category.`);
            return res.status(400).json({ message: 'This endpoint is for timed tasks.' });
        }

        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
        let auraChange = 0;
        const intensity = taskToComplete.intensity;

        let durationToUseForAura = taskToComplete.durationMinutes; 
        if (actualDurationSpentMinutes !== undefined && actualDurationSpentMinutes !== null && actualDurationSpentMinutes >= 0) {
            durationToUseForAura = actualDurationSpentMinutes;
            console.log(`POST /api/tasks/${taskId}/complete-timed: Using actualDurationSpentMinutes for aura calculation: ${durationToUseForAura}`);
        } else {
            console.log(`POST /api/tasks/${taskId}/complete-timed: Using original task durationMinutes for aura calculation: ${durationToUseForAura}`);
        }

        if (durationToUseForAura === null || durationToUseForAura < 0) { 
            console.warn(`POST /api/tasks/${taskId}/complete-timed: Timed task has invalid duration to use for aura: ${durationToUseForAura}. Setting to 0.`);
            durationToUseForAura = 0; 
        }

        let baseAuraPer10Min = 0;
        if (intensity === 'easy') baseAuraPer10Min = 5;
        else if (intensity === 'medium') baseAuraPer10Min = 7;
        else if (intensity === 'hard') baseAuraPer10Min = 10;
        else baseAuraPer10Min = 1; 

        auraChange = Math.floor(durationToUseForAura / 10) * baseAuraPer10Min;

        if (taskToComplete.type === 'bad') {
            auraChange = -Math.abs(auraChange); 
        }

        if (durationToUseForAura > 0 && durationToUseForAura < 10 && auraChange === 0) {
            if (taskToComplete.type === 'good') {
                auraChange = (intensity === 'hard' || intensity === 'medium') ? 2 : 1;
            } else { 
                auraChange = (intensity === 'hard' || intensity === 'medium') ? -2 : -1;
            }
        }

        const newAura = Math.max(0, userProfile.aura + auraChange); 
        await appwriteService.updateUserAura(userId, newAura);

        await appwriteService.updateTaskStatus(taskId, 'completed', new Date().toISOString());

        console.log(`POST /api/tasks/${taskId}/complete-timed: Task completed. Aura change: ${auraChange}, New Aura: ${newAura}`);
        res.json({
            message: 'Timed task completed!',
            newAura: newAura,
            auraChange: auraChange,
            task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
        });
    } catch (error) {
        console.error(`POST /api/tasks/${taskId}/complete-timed: Error completing timed task:`, error);
        res.status(500).json({ message: 'Failed to complete timed task' });
    }
});

router.post('/:taskId/complete-bad', authMiddleware, async (req, res) => {
    console.log(`POST /api/tasks/${req.params.taskId}/complete-bad: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;

    try {
        console.log(`POST /api/tasks/${taskId}/complete-bad: Fetching task for userId: ${userId}`);
        const taskToComplete = await appwriteService.getTaskById(taskId);
        let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);

        if (!taskToComplete || taskToComplete.userId !== userId) {
            console.warn(`POST /api/tasks/${taskId}/complete-bad: Task not found or unauthorized.`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (taskToComplete.status === 'completed') {
            console.warn(`POST /api/tasks/${taskId}/complete-bad: Task already completed.`);
            return res.status(400).json({ message: 'Task already completed.' });
        }
        if (taskToComplete.type !== 'bad') {
            console.warn(`POST /api/tasks/${taskId}/complete-bad: Task is not of type 'bad'.`);
            return res.status(400).json({ message: 'This endpoint is for tasks of type "bad".' });
        }
        if (taskToComplete.taskCategory === 'timed') {
            console.warn(`POST /api/tasks/${taskId}/complete-bad: Timed 'bad' task attempted on wrong endpoint.`);
            return res.status(400).json({ message: 'Timed "bad" tasks should use the /complete-timed endpoint.'});
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
        console.log(`POST /api/tasks/${taskId}/complete-bad: Bad task completed. Aura change: ${auraChange}, New Aura: ${newAura}`);
        res.json({
            message: 'Bad task marked as "completed".',
            newAura: newAura,
            auraChange: auraChange,
            task: { ...taskToComplete, status: 'completed', completedAt: new Date().toISOString() }
        });
    } catch (error) {
        console.error(`POST /api/tasks/${taskId}/complete-bad: Error completing bad task:`, error);
        res.status(500).json({ message: 'Failed to complete bad task' });
    }
});

router.put('/:taskId/mark-bad', authMiddleware, async (req, res) => {
    console.log(`PUT /api/tasks/${req.params.taskId}/mark-bad: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;
    try {
        console.log(`PUT /api/tasks/${taskId}/mark-bad: Fetching task for userId: ${userId}`);
        const task = await appwriteService.getTaskById(taskId);
        if (!task || task.userId !== userId) {
            console.warn(`PUT /api/tasks/${taskId}/mark-bad: Task not found or unauthorized.`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        if (task.status === 'completed') {
            console.warn(`PUT /api/tasks/${taskId}/mark-bad: Cannot change type of completed task.`);
            return res.status(400).json({ message: 'Cannot change type of a completed task.' });
        }
        const updatedTask = await appwriteService.updateTaskType(taskId, 'bad');
        console.log(`PUT /api/tasks/${taskId}/mark-bad: Task marked as bad successfully.`);
        res.json(updatedTask);
    } catch (error) {
        console.error(`PUT /api/tasks/${taskId}/mark-bad: Error marking task as bad:`, error);
        res.status(500).json({ message: 'Failed to mark task as bad' });
    }
});

router.delete('/:taskId', authMiddleware, async (req, res) => {
    console.log(`DELETE /api/tasks/${req.params.taskId}: Received request`);
    const userId = req.user.$id;
    const { taskId } = req.params;
    try {
        console.log(`DELETE /api/tasks/${taskId}: Fetching task for userId: ${userId}`);
        const task = await appwriteService.getTaskById(taskId);
        if (!task || task.userId !== userId) {
            console.warn(`DELETE /api/tasks/${taskId}: Task not found or unauthorized.`);
            return res.status(404).json({ message: 'Task not found or unauthorized.' });
        }
        await appwriteService.deleteTask(taskId);
        console.log(`DELETE /api/tasks/${taskId}: Task deleted successfully.`);
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error(`DELETE /api/tasks/${taskId}: Error deleting task:`, error);
        res.status(500).json({ message: 'Failed to delete task' });
    }
});

module.exports = router;
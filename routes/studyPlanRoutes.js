const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const appwriteService = require('../services/appwriteService');
const { requestTimetableGen } = require('../services/geminiService');

router.post('/generate', authMiddleware, async (req, res) => {
    try {
        const { chapters, deadline, clientDate } = req.body;
        if (!chapters || !deadline || !clientDate) {
            return res.status(400).json({ error: 'Missing required fields for timetable generation.' });
        }

        const allChaptersWithSubjects = Object.entries(chapters).flatMap(([subject, chapterList]) => 
            chapterList.map(chapter => ({
                ...chapter,
                subject: subject
            }))
        );

        const timetablePayload = {
            chapters: allChaptersWithSubjects,
            deadline: deadline,
            startDate: clientDate,
        };

        const generatedPlan = await requestTimetableGen(timetablePayload);
        res.json(generatedPlan);
    } catch (error) {
        console.error('Error in timetable generation route:', error);
        res.status(500).json({ error: 'Failed to generate timetable preview.' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const { subjects, chapters, deadline, timetable } = req.body;

        if (!subjects || !chapters || !deadline || !timetable) {
            return res.status(400).json({ error: 'Missing required fields for saving the study plan.' });
        }

        let taskIdCounter = 0;
        const processedPlan = timetable.map(day => ({
            ...day,
            tasks: day.tasks.map(task => ({
                ...task,
                id: `${new Date(day.date).getTime()}-${taskIdCounter++}`,
                completed: false
            }))
        }));

        const studyPlanData = {
            userId,
            subjects: JSON.stringify(subjects),
            chapters: JSON.stringify(chapters),
            deadline,
            timetable: JSON.stringify(processedPlan),
            lastCheckedDate: new Date().toISOString().split('T')[0],
        };

        const savedPlan = await appwriteService.createStudyPlan(userId, studyPlanData);

        const responsePlan = {
            ...savedPlan,
            subjects: JSON.parse(savedPlan.subjects),
            chapters: JSON.parse(savedPlan.chapters),
            timetable: JSON.parse(savedPlan.timetable),
        };

        res.status(201).json(responsePlan);
    } catch (error) {
        console.error('Error saving study plan:', error);
        res.status(500).json({ error: 'Failed to save study plan.' });
    }
});

router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const { clientDate } = req.query;
        let plan = await appwriteService.getStudyPlan(userId, clientDate);
        res.json(plan);
    } catch (error) {
        console.error('Error fetching study plan:', error);
        if (error.code === 404) {
             return res.status(404).json({ message: 'No study plan found for this user.' });
        }
        res.status(500).json({ error: 'Failed to fetch study plan.' });
    }
});

router.post('/tasks/:taskId/complete', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const { taskId } = req.params;
        const { clientDate, dateOfTask } = req.body; 

        if (!clientDate || !dateOfTask) {
            return res.status(400).json({ error: 'Client date and task date are required.' });
        }

        const today = new Date(clientDate);
        today.setHours(0,0,0,0);
        const taskDate = new Date(dateOfTask);
        taskDate.setHours(0,0,0,0);

        if (taskDate > today) {
            return res.status(403).json({ error: "Cannot complete a task for a future date." });
        }

        const plan = await appwriteService.getStudyPlan(userId);
        if (!plan) {
            return res.status(404).json({ error: 'Study plan not found.' });
        }

        plan.timetable = JSON.parse(plan.timetable);

        let taskFound = false;
        let auraToAdd = 0;

        plan.timetable.forEach(day => {
            if (day.date === dateOfTask) {
                day.tasks.forEach(task => {
                    if (task.id === taskId && !task.completed) {
                        task.completed = true;
                        taskFound = true;
                        auraToAdd = task.type === 'revision' ? 15 : 30;
                    }
                });
            }
        });

        if (!taskFound) {
            return res.status(404).json({ error: 'Task not found or already completed.' });
        }

        const timetableString = JSON.stringify(plan.timetable);

        const [updatedPlan, userProfile] = await Promise.all([
            appwriteService.updateStudyPlan(plan.$id, { timetable: timetableString }),
            appwriteService.getOrCreateUserProfile(userId)
        ]);

        const newAura = (userProfile.aura || 0) + auraToAdd;
        await appwriteService.updateUserAura(userId, newAura);

        const responsePlan = {
            ...updatedPlan,
            subjects: JSON.parse(updatedPlan.subjects),
            chapters: JSON.parse(updatedPlan.chapters),
            timetable: JSON.parse(updatedPlan.timetable),
            auraChange: auraToAdd,
        };

        res.json(responsePlan);

    } catch (error) {
        console.error('Error completing task:', error);
        res.status(500).json({ error: 'Failed to complete task.' });
    }
});

router.delete('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const plan = await appwriteService.getStudyPlan(userId);
        if (plan) {
            await appwriteService.deleteStudyPlan(plan.$id);
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting study plan:', error);
        res.status(500).json({ error: 'Failed to delete study plan.' });
    }
});

module.exports = router;
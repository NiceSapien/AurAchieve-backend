const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requestTimetableGen } = require('../services/geminiService'); 
require('dotenv').config();

router.post('/', authMiddleware, async (req, res) => {
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

module.exports = router;
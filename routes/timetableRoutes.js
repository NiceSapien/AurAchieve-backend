const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const appwriteService = require('../services/appwriteService');
const { requestTimetableGen } = require('../services/geminiService'); 
require('dotenv').config();
const GEMINI_PRIMARY_KEY = process.env.GEMINI_API_KEY_PRIMARY;

router.post('/', authMiddleware, async (req, res) => {
     //   const userId = req.user.$id;
        const { timetable } = req.body;
        if (!timetable) {
            return res.status(400).json({ error: 'Missing timetable in request body' });
        }
        let timetablo = await requestTimetableGen(timetable, GEMINI_PRIMARY_KEY);
        res.send(timetablo);
})

module.exports = router;
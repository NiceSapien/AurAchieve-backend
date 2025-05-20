const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const appwriteService = require('../services/appwriteService');

router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const userName = req.user.name;
        const userEmail = req.user.email;
        const profile = await appwriteService.getOrCreateUserProfile(userId, userName, userEmail);
        res.json({
            userId: profile.userId || userId, 
            name: userName,
            email: userEmail,
            aura: profile.aura,
            validationCount: profile.validationCount,
            lastValidationResetDate: profile.lastValidationResetDate
        });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: 'Failed to fetch user profile', "log": error });
    }
});

module.exports = router;
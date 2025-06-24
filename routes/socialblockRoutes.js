const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');
const appwriteService = require('../services/appwriteService');



router.post('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.$id;
        const { socialPassword, socialEnd } = req.body;
        if (!socialPassword || !socialEnd) {
            return res.status(400).json({ error: 'Missing ending or password in request body' });
        }


        try {
            const profile = await appwriteService.getOrSetupSocialBlocker(userId, socialPassword, socialEnd);
            res.json({
                socialPassword: profile.socialPassword,
                socialEnd: profile.socialEnd,
                socialStart: profile.socialStart,
            });
            console.log("nub")
        } catch (error) {
            console.error("Error fetching social blocker:", error);
            res.status(500).json({ message: 'Failed to fetch social blocker^', "log": error });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Failed to fetch social blocker', "log": error });
    }
});
router.get('/get', authMiddleware, async (req, res) => {
    const userId = req.user.$id;
    try {
        const profile = await appwriteService.getOrSetupSocialBlocker(userId);
        res.json({
            socialPassword: profile.socialPassword,
            socialEnd: profile.socialEnd,
            socialStart: profile.socialStart,
        });
    } catch (error) {
        console.log(error);
        res.status(404).json({ message: 'Failed to fetch social blocker', "log": error });
    }
});
router.put('/end', authMiddleware, async (req, res) => {
    function subtractDaysFromDate(dateString, days) {
        const date = new Date(dateString);
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    }
    const userId = req.user.$id;
    try {
        const profile = await appwriteService.getOrSetupSocialBlocker(userId);
        if (req.hasEnded == true) {
            let userProfile = await appwriteService.getOrCreateUserProfile(userId, userName, userEmail);
            const date = new Date(profile.socialEnd);
            const day = date.getDate();
            const auraChange = subtractDaysFromDate(profile.socialEnd, profile.socialDays);
            if (auraChange == profile.socialStart && day >= profile.socialEnd) {
                await appwriteService.updateUserAura(userId, profile.socialDays * 15);
                res.json({
                    socialPassword: profile.socialPassword,
                    socialEnd: profile.socialEnd,
                    socialStart: profile.socialStart,
                });
                const profile = await appwriteService.resetSocialBlocker(userId);
                console.log(profile)
            } else {
                res.status(500).json({ message: 'Failed to update Aura as days not completed yet.' });
            }
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Failed to update Aura.', "log": error });
    }
})

module.exports = router;
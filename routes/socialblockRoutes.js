const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
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
router.post('/end', authMiddleware, async (req, res) => {
    function subtractDaysFromDate(dateString, days) {
        const date = new Date(dateString);
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0]; 
    }
    const userId = req.user.$id;
    try {
        const profile = await appwriteService.getOrSetupSocialBlocker(userId);

            const date = new Date(profile.socialEnd);
            const day = new Date().toISOString().split('T')[0];
            const auraChange = subtractDaysFromDate(profile.socialEnd, profile.socialDays);
            if (auraChange == profile.socialStart && day >= profile.socialEnd) {
                await appwriteService.increaseUserAura(userId, profile.socialDays * 15);
                res.json({
                    socialPassword: profile.socialPassword,
                    socialEnd: profile.socialEnd,
                    socialStart: profile.socialStart,
                    aura: profile.socialDays * 15,
                });
                const resetProfile = await appwriteService.resetSocialBlocker(userId);
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Failed to update Aura.', "log": error });
    }
});

router.delete('/giveup', authMiddleware, async (req, res) => {
    const userId = req.user.$id;

    function daysBetween(startDateString, endDate) {
        const msPerDay = 1000 * 60 * 60 * 24;
        const start = new Date(startDateString);
        start.setHours(0,0,0,0);
        endDate.setHours(0,0,0,0);
        const diff = Math.floor((endDate - start) / msPerDay);
        return diff >= 0 ? diff : 0;
    }

    try {
        const profile = await appwriteService.getOrSetupSocialBlocker(userId);
        if (!profile || !profile.socialStart) {
            return res.status(400).json({ error: 'No active social blocker found for user.' });
        }

        const today = new Date();
        const completedDays = Math.min(
            daysBetween(profile.socialStart, today),
            Number(profile.socialDays || 0)
        );

        const auraToAdd = completedDays * 10;

        if (auraToAdd > 0) {
            await appwriteService.increaseUserAura(userId, auraToAdd);
        }

        // Reset social blocker same as /end behavior
        await appwriteService.resetSocialBlocker(userId);

        res.json({
            socialPassword: profile.socialPassword,
            socialEnd: profile.socialEnd,
            socialStart: profile.socialStart,
            completedDays,
            aura: auraToAdd,
        });
    } catch (error) {
        console.error('Giveup error:', error);
        res.status(500).json({ message: 'Failed to process giveup.', log: error });
    }
});

module.exports = router;
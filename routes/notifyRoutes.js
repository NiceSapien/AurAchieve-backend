const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); 
const appwriteService = require('../services/appwriteService');

router.post('/api/send-push-notification', authMiddleware, async (req, res) => {
  const { fcmToken, userId, loss } = req.body;

  if (!fcmToken || !userId || loss === undefined) {
    return res.status(400).json({ error: 'Missing fcmToken, userId, or loss in request body' });
  }

  const message = {
    notification: {
      title: 'Aura Decreased!',
      body: `You lost ${loss} Aura for social media usage.`
    },
    token: fcmToken
  };

  try {
    console.log(`Attempting to send push notification to token: ${fcmToken}`);
    const response = await admin.messaging().send(message); // Use send() for single device
    console.log('Successfully sent message:', response);
    res.status(200).json({ success: true, messageId: response });
  } catch (error) {
    console.error('Error sending message:', error);
    if (error.code === 'messaging/registration-token-not-registered') {
      console.error('FCM token is no longer valid or unregistered:', fcmToken);
      return res.status(400).json({ success: false, error: 'FCM token not registered.', details: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to send push notification', details: error.message });
  }
});

module.exports = router;
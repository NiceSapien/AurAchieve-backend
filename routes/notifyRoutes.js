/*
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');
const appwriteService = require('../services/appwriteService'); 

router.post('/', authMiddleware, async (req, res) => {
  const { fcmToken, userId } = req.body;
  let userProfile = await appwriteService.getOrCreateUserProfile(userId, req.user.name, req.user.email);
  if (!fcmToken || !userId) {
    return res.status(400).json({ error: 'Missing fcmToken, or userId in request body' });
  }
  const randomNumber = Math.floor(Math.random() * 3);
  const message = [{
    notification: {
      title: 'What are you doing?',
      body: `The entire universe exists so you can watch social media? Aura lost.`
    },
    token: fcmToken
  }, {
    notification: {
      title: 'Take a break.',
      body: `You've lost aura for using social media.`
    },
    token: fcmToken
  }, {
    notification: {
      title: 'tung tung sahur.',
      body: `You've lost aura for using social media.`
    },
    token: fcmToken
  }, {
    notification: {
      title: 'Get a life.',
      body: `You've lost aura for using social media.`
    },
    token: fcmToken
  },
  ]; 

  try {
    await appwriteService.updateUserAura(userId, Math.max(0, userProfile.aura - 10));
    console.log(`Attempting to send push notification to token: ${fcmToken}`);
    const response = await admin.messaging().send(message[randomNumber]); // Use send() for single device
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
*/
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const admin = require('firebase-admin');

router.post('/', authMiddleware, async (req, res) => {
  const { fcmToken, userId } = req.body;

  if (!fcmToken || !userId) {
    return res.status(400).json({ error: 'Missing fcmToken, or userId in request body' });
  }
  const randomNumber = Math.floor(Math.random() * 2);
  const message = [{
    notification: {
      title: 'What are you doing?',
      body: `God built the entire universe, so that you can watch social media?`
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
  },

];

  try {
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
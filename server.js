// Welcome to the main file. Simply run node server.js and you'll be good to go. Also, make sure to edit .env.example before running!

const express = require('express');
const dotenv = require('dotenv');
const taskRoutes = require('./routes/taskRoutes');
const socialBlockerRoutes = require('./routes/socialblockRoutes');
const notificationRoutes = require('./routes/notifyRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const studyPlanRoutes = require('./routes/studyPlanRoutes');
const userRoutes = require('./routes/userRoutes');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const serviceAccount = require(process.env.SERVICEACCOUNT);

// import { initialize } from 'express-openapi';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic Route
app.get('/', (req, res) => {
    res.send('AurAchieve API Running!');
});

// API Routes
app.use('/api/user', userRoutes)
app.use('/api/tasks', taskRoutes);
app.use('/api/social-blocker', socialBlockerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/study-plan', studyPlanRoutes);

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Appwrite Endpoint:', process.env.APPWRITE_ENDPOINT);
    console.log('Appwrite Project ID:', process.env.APPWRITE_PROJECT_ID);
});
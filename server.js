// Welcome to the main file. Simply run node server.js and you'll be good to go. Also, make sure to edit .env.example before running!

const express = require('express');
const dotenv = require('dotenv');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const notifyRoutes = require('./routes/notifyRoutes');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const serviceAccount = require(process.env.SERVICEACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic Route
app.get('/', (req, res) => {
    res.send('AuraAscend API Running!');
});

// API Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/user', userRoutes);


// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.use('/api/send-push-notification', notifyRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Appwrite Endpoint:', process.env.APPWRITE_ENDPOINT);
    console.log('Appwrite Project ID:', process.env.APPWRITE_PROJECT_ID);
});
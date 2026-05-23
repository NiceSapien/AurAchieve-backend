const { Hono } = require('hono');
const { configValue, secretValue } = require('../config/runtimeEnv');

const taskRoutes = require('../routes/taskRoutes');
const socialBlockerRoutes = require('../routes/socialblockRoutes');
const studyPlanRoutes = require('../routes/studyPlanRoutes');
const userRoutes = require('../routes/userRoutes');
const habitRoutes = require('../routes/habitRoutes');
const badHabitRoutes = require('../routes/badHabitRoutes');
const auraPageRoutes = require('../routes/auraPageRoutes');
const memoryLanesRoutes = require('../routes/memoryLanesRoutes');

const app = new Hono();

app.get('/', async (c) => {
    const [appwriteEndpoint, appwriteProjectId, appwriteDatabaseId] = await Promise.all([
        configValue('APPWRITE_ENDPOINT'),
        configValue('APPWRITE_PROJECT_ID'),
        configValue('APPWRITE_DATABASE_ID')
    ]);

    return c.json({
         appwriteEndpoint: appwriteEndpoint || null,
         appwriteProjectId: appwriteProjectId || null,
         appwriteDatabaseId: appwriteDatabaseId || null,
    });
});

app.route('/api/user', userRoutes.app || userRoutes);
app.route('/api/tasks', taskRoutes.app || taskRoutes);
app.route('/api/social-blocker', socialBlockerRoutes.app || socialBlockerRoutes);
app.route('/api/study-plan', studyPlanRoutes.app || studyPlanRoutes);
app.route('/api/habit', habitRoutes.app || habitRoutes);
app.route('/api/bad-habit', badHabitRoutes.app || badHabitRoutes);
app.route('/api/aura-page', auraPageRoutes.app || auraPageRoutes);
app.route('/api/memory-lanes', memoryLanesRoutes.app || memoryLanesRoutes);

app.onError((err, c) => {
    return c.text('Something broke!', 500);
});

if (typeof addEventListener !== 'undefined') {
    app.fire();
}

module.exports = app;
module.exports.default = app;
module.exports.fetch = app.fetch.bind(app);
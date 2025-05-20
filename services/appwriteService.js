const { databases, dbId, profilesCollectionId, tasksCollectionId, ID, Query } = require('../config/appwriteClient');

async function getOrCreateUserProfile(userId, userName, userEmail) {
    try {
        const profile = await databases.getDocument(dbId, profilesCollectionId, userId);
        return profile;
    } catch (error) {
        if (error.code === 404) { 
            try {
                const newProfile = await databases.createDocument(
                    dbId,
                    profilesCollectionId,
                    userId, 
                    {
                        userId: userId, 
                        aura: 50,
                        validationCount: 0,
                        lastValidationResetDate: new Date().toISOString().split('T')[0],

                    }
                );
                return newProfile;
            } catch (createError) {
                console.error("Error creating user profile:", createError);
                throw createError;
            }
        }
        console.error("Error fetching user profile:", error);
        throw error;
    }
}

async function updateUserAura(userId, newAura) {
    return databases.updateDocument(dbId, profilesCollectionId, userId, { aura: newAura });
}

async function updateUserValidationStats(userId, count, date) {
    return databases.updateDocument(dbId, profilesCollectionId, userId, {
        validationCount: count,
        lastValidationResetDate: date,
    });
}

async function getUserTasks(userId) {
    return databases.listDocuments(dbId, tasksCollectionId, [
        Query.equal('userId', userId),
        Query.orderDesc('createdAt') 
    ]);
}

async function createTask(userId, taskData) {
    return databases.createDocument(dbId, tasksCollectionId, ID.unique(), {
        userId,
        ...taskData,
        status: 'pending',
        createdAt: new Date().toISOString(),
    });
}

async function updateTaskStatus(taskId, status, completedAt = null) {
    const dataToUpdate = { status };
    if (completedAt) {
        dataToUpdate.completedAt = completedAt;
    }
    return databases.updateDocument(dbId, tasksCollectionId, taskId, dataToUpdate);
}
async function updateTaskType(taskId, type) {
    return databases.updateDocument(dbId, tasksCollectionId, taskId, { type });
}

async function deleteTask(taskId) {
    return databases.deleteDocument(dbId, tasksCollectionId, taskId);
}

async function getTaskById(taskId) {
    try {
        return await databases.getDocument(dbId, tasksCollectionId, taskId);
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

module.exports = {
    getOrCreateUserProfile,
    updateUserAura,
    updateUserValidationStats,
    getUserTasks,
    createTask,
    updateTaskStatus,
    updateTaskType,
    deleteTask,
    getTaskById
};
const { databases, dbId, profilesCollectionId, tasksCollectionId, ID, Query } = require('../config/appwriteClient');

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

const createTask = async (userId, taskData) => {
    try {
        console.log(`Attempting to create document in DB: ${process.env.APPWRITE_DATABASE_ID}, Collection: ${process.env.APPWRITE_TASKS_COLLECTION_ID}`); 
        console.log("Data being sent to Appwrite:", { 
            userId: userId,
            name: taskData.name, 
            intensity: taskData.intensity,
            type: taskData.type,
            taskCategory: taskData.taskCategory,
            durationMinutes: taskData.durationMinutes || null,
            isImageVerifiable: typeof taskData.isImageVerifiable === 'boolean' ? taskData.isImageVerifiable : false,
            status: 'pending',
            createdAt: new Date().toISOString(),
            completedAt: null,
        });
        const document = await databases.createDocument(
            process.env.APPWRITE_DATABASE_ID,
            tasksCollectionId,
            ID.unique(),
            {
                userId: userId,
                name: taskData.name, 
                intensity: taskData.intensity,
                type: taskData.type,
                taskCategory: taskData.taskCategory,
                durationMinutes: taskData.durationMinutes || null,
                isImageVerifiable: typeof taskData.isImageVerifiable === 'boolean' ? taskData.isImageVerifiable : false,
                status: 'pending',
                createdAt: new Date().toISOString(),
                completedAt: null,
            }
        );
        return document;
    } catch (error) {
        console.error('Appwrite createTask error:', error); 
        console.error('Appwrite createTask error code:', error.code);
        console.error('Appwrite createTask error type:', error.type);
        console.error('Appwrite createTask error response:', error.response);
        throw error;
    }
};

const getOrCreateUserProfile = async (userId, name, email) => {
    try {
        const profile = await databases.getDocument(
            dbId,
            profilesCollectionId,
            userId
        );
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
                        name: name,
                        email: email,
                        aura: 50,
                        validationCount: 0,
                        lastValidationResetDate: new Date().toISOString().split('T')[0],

                    }
                );
                return newProfile;
            } catch (creationError) {
                console.error('Appwrite create new user profile error:', creationError);
                throw creationError;
            }
        }
        console.error('Appwrite getUserProfile error:', error);
        throw error;
    }
};

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
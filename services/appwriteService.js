const { databases, dbId, profilesCollectionId, tasksCollectionId, studyPlansCollectionId, ID, Query } = require('../config/appwriteClient');

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

const createStudyPlan = async (userId, planData) => {
    try {
        const document = await databases.createDocument(
            dbId,
            studyPlansCollectionId,
            userId, 
            {
                ...planData,
                userId: userId,
            }
        );
        return document;
    } catch (error) {
        console.error('Appwrite createStudyPlan error:', error);
        throw error;
    }
};

const getStudyPlan = async (userId) => {
    try {
        const plan = await databases.getDocument(
            dbId,
            studyPlansCollectionId,
            userId
        );
        return plan;
    } catch (error) {
        if (error.code === 404) {
            return null;
        }
        console.error('Appwrite getStudyPlan error:', error);
        throw error;
    }
};

const updateStudyPlan = async (planId, data) => {
    try {
        const updatedPlan = await databases.updateDocument(
            dbId,
            studyPlansCollectionId,
            planId,
            data
        );
        return updatedPlan;
    } catch (error) {
        console.error('Appwrite updateStudyPlan error:', error);
        throw error;
    }
};

const deleteStudyPlan = async (planId) => {
    try {
        await databases.deleteDocument(
            dbId,
            studyPlansCollectionId,
            planId
        );
    } catch (error) {
        console.error('Appwrite deleteStudyPlan error:', error);
        throw error;
    }
};

const getOrSetupSocialBlocker = async (userId, socialPassword, socialEnd) => {
    try {
        const profile = await databases.getDocument(
            dbId,
            profilesCollectionId,
            userId
        );

        if (profile['socialEnd'] == null || profile['socialEnd'] == "") {
            throw new Error("Not found");
        } else {
            return profile;
        }
    } catch (error) {
        try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            const formattedDate = `${year}-${month}-${day}`;
            console.log(formattedDate);
            function addDaysToDate(dateString, days) {
                const date = new Date(dateString);
                date.setDate(date.getDate() + days);
                return date.toISOString().split('T')[0]; 
            }
            const newBlocker = await databases.updateDocument(
                dbId,
                profilesCollectionId,
                userId,
                {
                    socialPassword: socialPassword,
                    socialDays: socialEnd,
                    socialEnd: addDaysToDate(formattedDate, socialEnd),
                    socialStart: formattedDate,
                }
            );
            console.log("boom")
            return newBlocker;
        } catch (creationError) {
            console.error('Appwrite create new user social blocker error:', creationError);
            throw creationError;
        }
    }
}
const resetSocialBlocker = async (userId) => {
                const newBlocker = await databases.updateDocument(
                dbId,
                profilesCollectionId,
                userId,
                {
                    socialPassword: null,
                    socialDays: null,
                    socialEnd: null,
                    socialStart: null,
                }
            );
            return newBlocker;
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
    updateUserAura,
    updateUserValidationStats,
    getUserTasks,
    createTask,
    getOrCreateUserProfile,
    getOrSetupSocialBlocker,
    resetSocialBlocker,
    createStudyPlan,
    getStudyPlan,
    updateStudyPlan,
    deleteStudyPlan,
    updateTaskStatus,
    updateTaskType,
    deleteTask,
    getTaskById,
};
const { profilesCollectionId: _profilesCollectionId, ...restConfig } = require('../config/appwriteClient');
const auraPagesCollectionId = process.env.AURAPAGE_COLLECTION_ID || 'aurapage';
async function getAuraPage(userId) {
    try {
        const row = await tablesDB.getRow({
            databaseId: dbId,
            tableId: auraPagesCollectionId,
            rowId: userId,
        });
        return row;
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}
const { tablesDB, dbId, profilesCollectionId, tasksCollectionId, studyPlansCollectionId, habitCollectionId, ID, Query } = require('../config/appwriteClient');

const badHabitsCollectionId = process.env.BAD_HABITS_COLLECTION_ID || 'badhabits';

function severityToAuraLoss(severity) {
    switch ((severity || '').toLowerCase()) {
        case 'average':
            return 5;
        case 'high':
            return 10;
        case 'vhigh':
            return 15;
        case 'extreme':
            return 20;
        default:
            return null;
    }
}

function normalizeRowListToDocumentList(list) {
    if (!list || typeof list !== 'object') return list;
    if (Array.isArray(list.documents) || Array.isArray(list.rows)) return {
        ...list,
        documents: list.documents ?? list.rows,
        rows: list.rows ?? list.documents,
    };
    return list;
}

async function updateUserAura(userId, newAura) {
    return tablesDB.updateRow({
        databaseId: dbId,
        tableId: profilesCollectionId,
        rowId: userId,
        data: { aura: newAura },
    });
}

async function increaseUserAura(userId, incrementAura) {
    return tablesDB.incrementRowColumn({
        databaseId: dbId,
        tableId: profilesCollectionId,
        rowId: userId,
        column: 'aura',
        value: incrementAura,
    });
}

async function updateUserValidationStats(userId, count, date) {
    return tablesDB.updateRow({
        databaseId: dbId,
        tableId: profilesCollectionId,
        rowId: userId,
        data: {
            validationCount: count,
            lastValidationResetDate: date,
        },
    });
}

async function getUserTasks(userId) {
    const rows = await tablesDB.listRows({
        databaseId: dbId,
        tableId: tasksCollectionId,
        queries: [
            Query.equal('userId', userId),
            Query.orderDesc('createdAt'),
        ],
    });
    return normalizeRowListToDocumentList(rows);
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
        const row = await tablesDB.createRow({
            databaseId: dbId,
            tableId: tasksCollectionId,
            rowId: ID.unique(),
            data: {
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
            },
        });
        return row;
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
        const profile = await tablesDB.getRow({
            databaseId: dbId,
            tableId: profilesCollectionId,
            rowId: userId,
        });
        return profile;
    } catch (error) {
        if (error.code === 404) {
            try {
                const newProfile = await tablesDB.createRow({
                    databaseId: dbId,
                    tableId: profilesCollectionId,
                    rowId: userId,
                    data: {
                        userId: userId,
                        name: name,
                        email: email,
                        aura: 50,
                        validationCount: 0,
                        lastValidationResetDate: new Date().toISOString().split('T')[0],
                    },
                });
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
        const row = await tablesDB.createRow({
            databaseId: dbId,
            tableId: studyPlansCollectionId,
            rowId: userId,
            data: {
                ...planData,
                userId: userId,
            },
        });
        return row;
    } catch (error) {
        console.error('Appwrite createStudyPlan error:', error);
        throw error;
    }
};

const getStudyPlan = async (userId, clientDate) => {
    try {
        let plan = await tablesDB.getRow({
            databaseId: dbId,
            tableId: studyPlansCollectionId,
            rowId: userId,
        });
        if (!plan) {
            return 'No study plan found for this user.';
        }

        if (!clientDate) {
            return plan;
        }

        plan.subjects = JSON.parse(plan.subjects);
        plan.chapters = JSON.parse(plan.chapters);
        plan.timetable = JSON.parse(plan.timetable);

        const today = new Date(clientDate);
        today.setHours(0, 0, 0, 0);
        const lastChecked = new Date(plan.lastCheckedDate);
        lastChecked.setHours(0, 0, 0, 0);

        let auraToDeduct = 0;

        if(lastChecked < today) {
            for (let d = new Date(lastChecked); d < today; d.setDate(d.getDate() + 1)) {
                const dateString = d.toISOString().split('T')[0];
                const dayInTimetable = plan.timetable.find(t => t.date === dateString);
                if (dayInTimetable && dayInTimetable.tasks.some(task => !task.completed)) {
                    auraToDeduct += 35;
                }
            }
        }

        if (auraToDeduct > 0) {
            const userProfile = await getOrCreateUserProfile(userId);
            const newAura = (userProfile.aura || 0) - auraToDeduct;
            await updateUserAura(userId, newAura);
        }

        if (plan.lastCheckedDate !== clientDate) {
            await updateStudyPlan(plan.$id, { lastCheckedDate: clientDate });
            plan.lastCheckedDate = clientDate;
        }
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
        const updatedPlan = await tablesDB.updateRow({
            databaseId: dbId,
            tableId: studyPlansCollectionId,
            rowId: planId,
            data,
        });
        return updatedPlan;
    } catch (error) {
        console.error('Appwrite updateStudyPlan error:', error);
        throw error;
    }
};

const deleteStudyPlan = async (planId) => {
    try {
        await tablesDB.deleteRow({
            databaseId: dbId,
            tableId: studyPlansCollectionId,
            rowId: planId,
        });
    } catch (error) {
        console.error('Appwrite deleteStudyPlan error:', error);
        throw error;
    }
};

const getOrSetupSocialBlocker = async (userId, socialPassword, socialEnd) => {
    try {
        const profile = await tablesDB.getRow({
            databaseId: dbId,
            tableId: profilesCollectionId,
            rowId: userId,
        });

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
            const newBlocker = await tablesDB.updateRow({
                databaseId: dbId,
                tableId: profilesCollectionId,
                rowId: userId,
                data: {
                    socialPassword: socialPassword,
                    socialDays: socialEnd,
                    socialEnd: addDaysToDate(formattedDate, socialEnd),
                    socialStart: formattedDate,
                },
            });
            console.log("boom")
            return newBlocker;
        } catch (creationError) {
            console.error('Appwrite create new user social blocker error:', creationError);
            throw creationError;
        }
    }
}
const resetSocialBlocker = async (userId) => {
    const newBlocker = await tablesDB.updateRow({
        databaseId: dbId,
        tableId: profilesCollectionId,
        rowId: userId,
        data: {
            socialPassword: null,
            socialDays: null,
            socialEnd: null,
            socialStart: null,
        },
    });
    return newBlocker;
}

async function updateTaskStatus(taskId, status, completedAt = null) {
    const dataToUpdate = { status };
    if (completedAt) {
        dataToUpdate.completedAt = completedAt;
    }
    return tablesDB.updateRow({
        databaseId: dbId,
        tableId: tasksCollectionId,
        rowId: taskId,
        data: dataToUpdate,
    });
}
async function updateTaskType(taskId, type) {
    return tablesDB.updateRow({
        databaseId: dbId,
        tableId: tasksCollectionId,
        rowId: taskId,
        data: { type },
    });
}

async function deleteTask(taskId) {
    return tablesDB.deleteRow({
        databaseId: dbId,
        tableId: tasksCollectionId,
        rowId: taskId,
    });
}

async function getTaskById(taskId) {
    try {
        return await tablesDB.getRow({
            databaseId: dbId,
            tableId: tasksCollectionId,
            rowId: taskId,
        });
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

const createHabit = async (userId, data) => {
    try {
        const document = await tablesDB.createRow({
            databaseId: dbId,
            tableId: habitCollectionId,
            rowId: ID.unique(),
            data: {
                habitName: data.habitName,
                habitLocation: data.habitLocation,
                habitGoal: data.habitGoal,
                userId: userId,
                completedTimes: 0,
                completedDays: data.completedDays?.toString?.() ?? String(data.completedDays),
            },
        });
        console.log(data.completedDays)
        return document;
    } catch (error) {
        console.error('Appwrite createHabit error:', error);
        throw error;
    }
};

const createBadHabit = async (userId, data) => {
    try {
        const auraLoss = severityToAuraLoss(data.severity);
        if (auraLoss == null) {
            const err = new Error('Invalid severity');
            err.code = 400;
            throw err;
        }

        if (data.completedDays == null) {
            const err = new Error('completedDays is required');
            err.code = 400;
            throw err;
        }

        return await tablesDB.createRow({
    databaseId: dbId,
    tableId: badHabitsCollectionId,
    rowId: ID.unique(),
    data: {            
                habitName: data.habitName,
                habitGoal: data.habitGoal,
                userId: userId,
                auraLoss,
                completedTimes: typeof data.completedTimes === 'number' ? data.completedTimes : 0,
                completedDays: data.completedDays.toString(),
            }
    });
    } catch (error) {
        console.error('Appwrite createBadHabit error:', error);
        throw error;
    }
};


const getHabits = async (userId) => {
    const rows = await tablesDB.listRows({
        databaseId: dbId,
        tableId: habitCollectionId,
        queries: [Query.equal('userId', userId)],
    });
    return normalizeRowListToDocumentList(rows);
}

const getBadHabits = async (userId) => {
    const rows = await tablesDB.listRows({
        databaseId: dbId,
        tableId: badHabitsCollectionId,
        queries: [Query.equal('userId', userId)],
    });
    return normalizeRowListToDocumentList(rows);
};

async function updateHabit(userId, habitId, updates) {
    const habit = await tablesDB.getRow({
        databaseId: dbId,
        tableId: habitCollectionId,
        rowId: habitId,
    });

    if (!habit) {
        const err = new Error('Habit not found');
        err.code = 404;
        throw err;
    }
    if (habit.userId !== userId) {
        const err = new Error('Unauthorized');
        err.code = 403;
        throw err;
    }

    const data = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'habitName')) data.habitName = updates.habitName;
    if (Object.prototype.hasOwnProperty.call(updates, 'habitLocation')) data.habitLocation = updates.habitLocation;
    if (Object.prototype.hasOwnProperty.call(updates, 'habitGoal')) data.habitGoal = updates.habitGoal;
    if (Object.prototype.hasOwnProperty.call(updates, 'completedDays')) {
        data.completedDays = updates.completedDays?.toString?.() ?? String(updates.completedDays);
    }

    if (Object.keys(data).length === 0) {
        const err = new Error('No valid fields to update');
        err.code = 400;
        throw err;
    }

    await tablesDB.updateRow({
        databaseId: dbId,
        tableId: habitCollectionId,
        rowId: habitId,
        data,
    });

    return tablesDB.getRow({
        databaseId: dbId,
        tableId: habitCollectionId,
        rowId: habitId,
    });
}

async function updateBadHabit(userId, badHabitId, updates) {
    const badHabit = await tablesDB.getRow({
        databaseId: dbId,
        tableId: badHabitsCollectionId,
        rowId: badHabitId,
    });

    if (!badHabit) {
        const err = new Error('Bad habit not found');
        err.code = 404;
        throw err;
    }
    if (badHabit.userId !== userId) {
        const err = new Error('Unauthorized');
        err.code = 403;
        throw err;
    }

    const data = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'habitName')) data.habitName = updates.habitName;
    if (Object.prototype.hasOwnProperty.call(updates, 'habitGoal')) data.habitGoal = updates.habitGoal;
    if (Object.prototype.hasOwnProperty.call(updates, 'completedDays')) {
        data.completedDays = updates.completedDays?.toString?.() ?? String(updates.completedDays);
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'severity')) {
        const auraLoss = severityToAuraLoss(updates.severity);
        if (auraLoss == null) {
            const err = new Error('Invalid severity');
            err.code = 400;
            throw err;
        }
        data.auraLoss = auraLoss;
    }

    if (Object.keys(data).length === 0) {
        const err = new Error('No valid fields to update');
        err.code = 400;
        throw err;
    }

    await tablesDB.updateRow({
        databaseId: dbId,
        tableId: badHabitsCollectionId,
        rowId: badHabitId,
        data,
    });

    return tablesDB.getRow({
        databaseId: dbId,
        tableId: badHabitsCollectionId,
        rowId: badHabitId,
    });
}

async function completeHabit(userId, habitId, completedDays) {
    console.log(completedDays);
    try {
        const habit = await tablesDB.getRow({
            databaseId: dbId,
            tableId: habitCollectionId,
            rowId: habitId,
        });

        if (!habit) {
            const err = new Error('Habit not found');
            err.code = 404;
            throw err;
        }
        if (habit.userId !== userId) {
            const err = new Error('Unauthorized');
            err.code = 403;
            throw err;
        }

        await tablesDB.incrementRowColumn({
            databaseId: dbId,
            tableId: habitCollectionId,
            rowId: habitId,
            column: 'completedTimes',
            value: 1,
        });

        const updatedProfile = await tablesDB.incrementRowColumn({
            databaseId: dbId,
            tableId: profilesCollectionId,
            rowId: userId,
            column: 'aura',
            value: 15,
        });

        await tablesDB.updateRow({
            databaseId: dbId,
            tableId: habitCollectionId,
            rowId: habitId,
            data: { completedDays: completedDays?.toString?.() ?? String(completedDays) },
        });

        const updatedHabit = await tablesDB.getRow({
            databaseId: dbId,
            tableId: habitCollectionId,
            rowId: habitId,
        });

        return {
            ...updatedHabit,
            aura: updatedProfile?.aura,
        };
    } catch (error) {
        console.log("boom")
        console.log(error);
        throw error;
    }
}

async function completeBadHabit(userId, badHabitId, completedDays, incrementBy = 1) {
    const amount = typeof incrementBy === 'number' && Number.isFinite(incrementBy) ? incrementBy : 1;
    try {
        const badHabit = await tablesDB.getRow({
            databaseId: dbId,
            tableId: badHabitsCollectionId,
            rowId: badHabitId,
        });

        if (!badHabit) {
            const err = new Error('Bad habit not found');
            err.code = 404;
            throw err;
        }
        if (badHabit.userId !== userId) {
            const err = new Error('Unauthorized');
            err.code = 403;
            throw err;
        }

        const auraLossPer = typeof badHabit.auraLoss === 'number' && Number.isFinite(badHabit.auraLoss)
            ? badHabit.auraLoss
            : severityToAuraLoss(badHabit.severity);

        if (auraLossPer == null) {
            const err = new Error('Invalid severity');
            err.code = 400;
            throw err;
        }

        await tablesDB.incrementRowColumn({
            databaseId: dbId,
            tableId: badHabitsCollectionId,
            rowId: badHabitId,
            column: 'completedTimes',
            value: amount,
        });

        const updatedProfile = await tablesDB.decrementRowColumn({
            databaseId: dbId,
            tableId: profilesCollectionId,
            rowId: userId,
            column: 'aura',
            value: auraLossPer * amount,
        });

        await tablesDB.updateRow({
            databaseId: dbId,
            tableId: badHabitsCollectionId,
            rowId: badHabitId,
            data: {
                completedDays: completedDays?.toString?.() ?? String(completedDays),
            },
        });
        const updatedBadHabit = await tablesDB.getRow({
            databaseId: dbId,
            tableId: badHabitsCollectionId,
            rowId: badHabitId,
        });
        return {
            ...updatedBadHabit,
            aura: updatedProfile?.aura,
        };
    } catch (error) {
        console.error('Appwrite completeBadHabit error:', error);
        throw error;
    }
}
async function deleteHabit(habitId) {
    return tablesDB.deleteRow({
        databaseId: dbId,
        tableId: habitCollectionId,
        rowId: habitId,
    });
}

async function deleteBadHabit(badHabitId) {
    return tablesDB.deleteRow({
        databaseId: dbId,
        tableId: badHabitsCollectionId,
        rowId: badHabitId,
    });
}

module.exports = {
    updateUserAura,
    increaseUserAura,
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
    createHabit,
    getHabits,
    completeHabit,
    updateHabit,
    deleteHabit,
    createBadHabit,
    getBadHabits,
    completeBadHabit,
    updateBadHabit,
    deleteBadHabit,
    getAuraPage,
};
const { client, tablesDB, ID, Query } = require('../config/appwriteClient');
const { configValue, secretValue } = require('../config/runtimeEnv');

// Updated getContext to include all necessary table IDs dynamically
async function getContext() {
    const [dbId, apiKey, endpoint, project, profilesId, tasksId, studyId, habitId, auraId, badId] = await Promise.all([
        configValue('APPWRITE_DATABASE_ID'),
        secretValue('APPWRITE_API_KEY'),
        configValue('APPWRITE_ENDPOINT'),
        configValue('APPWRITE_PROJECT_ID'),
        configValue('PROFILES_COLLECTION_ID'),
        configValue('TASKS_COLLECTION_ID'),
        configValue('STUDY_PLAN_COLLECTION_ID'),
        configValue('HABIT_COLLECTION_ID'),
        configValue('AURAPAGE_COLLECTION_ID'),
        configValue('BAD_HABITS_COLLECTION_ID')
    ]);
    if (apiKey) client.setKey(apiKey);
    if (endpoint) client.setEndpoint(endpoint);
    if (project) client.setProject(project);
    return { 
        dbId, 
        profilesId, tasksId, studyId, habitId, 
        auraPagesId: auraId || 'aurapage', 
        badHabitsId: badId || 'badhabits' 
    };
}

async function getAuraPage(userId) {
    try {
        const { dbId, auraPagesId } = await getContext();
        const row = await tablesDB.getRow({
            dbId: dbId,
            tableId: auraPagesId,
            rowId: userId,
        });
        return row;
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

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
    const { dbId, profilesId } = await getContext();
    return tablesDB.updateRow({
        dbId: dbId,
        tableId: profilesId,
        rowId: userId,
        data: { aura: newAura },
    });
}

async function increaseUserAura(userId, incrementAura) {
    const { dbId, profilesId } = await getContext();
    return tablesDB.incrementRowColumn({
        dbId: dbId,
        tableId: profilesId,
        rowId: userId,
        column: 'aura',
        value: incrementAura,
    });
}

async function updateUserValidationStats(userId, count, date) {
    const { dbId, profilesId } = await getContext();
    return tablesDB.updateRow({
        dbId: dbId,
        tableId: profilesId,
        rowId: userId,
        data: {
            validationCount: count,
            lastValidationResetDate: date,
        },
    });
}

async function getUserTasks(userId) {
    const { dbId, tasksId } = await getContext();
    const rows = await tablesDB.listRows({
        dbId: dbId,
        tableId: tasksId,
        queries: [
            Query.equal('userId', userId),
            Query.orderDesc('$createdAt'),
        ],
    });
    return normalizeRowListToDocumentList(rows);
}

const createTask = async (userId, taskData) => {
    try {
        const { dbId, tasksId } = await getContext();
        console.log(`Attempting to create document in DB: ${dbId}, Collection: ${tasksId}`);
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
            dbId: dbId,
            tableId: tasksId,
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
    const { dbId, profilesId } = await getContext();
    try {
        const profile = await tablesDB.getRow({
            dbId,
            tableId: profilesId,
            rowId: userId,
        });
        return profile;
    } catch (error) {
        if (error.code === 404) {
            try {
                const newProfile = await tablesDB.createRow({
                    dbId,
                    tableId: profilesId,
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
        const { dbId, studyId } = await getContext();
        const row = await tablesDB.createRow({
            dbId,
            tableId: studyId,
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
        const { dbId, studyId } = await getContext();
        let plan = await tablesDB.getRow({
            dbId,
            tableId: studyId,
            rowId: userId,
        });
        if (!plan) {
            return 'No study plan found for this user.';
        }

        if (!clientDate) {
            return plan;
        }

        const tryParse = (val) => typeof val === 'string' ? JSON.parse(val) : val;

        plan.subjects = tryParse(plan.subjects);
        plan.chapters = tryParse(plan.chapters);
        plan.timetable = tryParse(plan.timetable);

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

        const updates = [];

        if (auraToDeduct > 0) {
            updates.push(getOrCreateUserProfile(userId).then(userProfile => {
                const newAura = (userProfile.aura || 0) - auraToDeduct;
                return updateUserAura(userId, newAura);
            }));
        }

        if (plan.lastCheckedDate !== clientDate) {
            updates.push(updateStudyPlan(plan.$id, { lastCheckedDate: clientDate }));
            plan.lastCheckedDate = clientDate;
        }

        if (updates.length > 0) await Promise.all(updates);
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
        const { dbId, studyId } = await getContext();
        const updatedPlan = await tablesDB.updateRow({
            dbId,
            tableId: studyId,
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
        const { dbId, studyId } = await getContext();
        await tablesDB.deleteRow({
            dbId,
            tableId: studyId,
            rowId: planId,
        });
    } catch (error) {
        console.error('Appwrite deleteStudyPlan error:', error);
        throw error;
    }
};

const getOrSetupSocialBlocker = async (userId, socialPassword, socialEnd) => {
    try {
        const { dbId, profilesId } = await getContext();
        const profile = await tablesDB.getRow({
            dbId,
            tableId: profilesId,
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
            
            function addDaysToDate(dateString, days) {
                const date = new Date(dateString);
                const numDays = parseInt(days, 10);
                if (isNaN(numDays)) return dateString;
                date.setDate(date.getDate() + numDays);
                return date.toISOString().split('T')[0]; 
            }
            
            const { dbId: writeDbId, profilesId: writeProfilesId } = await getContext();
            const newBlocker = await tablesDB.updateRow({
                dbId: writeDbId,
                tableId: writeProfilesId,
                rowId: userId,
                data: {
                    socialPassword: socialPassword,
                    socialDays: socialEnd,
                    socialEnd: addDaysToDate(formattedDate, socialEnd),
                    socialStart: formattedDate,
                },
            });
            return newBlocker;
        } catch (creationError) {
            console.error('Appwrite create new user social blocker error:', creationError);
            throw creationError;
        }
    }
}
const resetSocialBlocker = async (userId) => {
    const { dbId, profilesId } = await getContext();
    const newBlocker = await tablesDB.updateRow({
        dbId,
        tableId: profilesId,
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
    const { dbId, tasksId } = await getContext();
    return tablesDB.updateRow({
        dbId,
        tableId: tasksId,
        rowId: taskId,
        data: dataToUpdate,
    });
}
async function updateTaskType(taskId, type) {
    const { dbId, tasksId } = await getContext();
    return tablesDB.updateRow({
        dbId,
        tableId: tasksId,
        rowId: taskId,
        data: { type },
    });
}

async function deleteTask(taskId) {
    const { dbId, tasksId } = await getContext();
    return tablesDB.deleteRow({
        dbId,
        tableId: tasksId,
        rowId: taskId,
    });
}

async function getTaskById(taskId) {
    try {
        const { dbId, tasksId } = await getContext();
        return await tablesDB.getRow({
            dbId,
            tableId: tasksId,
            rowId: taskId,
        });
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

const createHabit = async (userId, data) => {
    try {
        const { dbId, habitId } = await getContext();
        const document = await tablesDB.createRow({
            dbId,
            tableId: habitId,
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

        const { dbId, badHabitsId } = await getContext();
        return await tablesDB.createRow({
    dbId,
    tableId: badHabitsId,
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
    const { dbId, habitId } = await getContext();
    const rows = await tablesDB.listRows({
        dbId,
        tableId: habitId,
        queries: [Query.equal('userId', userId)],
    });
    return normalizeRowListToDocumentList(rows);
}

const getBadHabits = async (userId) => {
    const { dbId, badHabitsId } = await getContext();
    const rows = await tablesDB.listRows({
        dbId,
        tableId: badHabitsId,
        queries: [Query.equal('userId', userId)],
    });
    return normalizeRowListToDocumentList(rows);
};

async function updateHabit(userId, habitId, updates) {
    const { dbId, habitId: tableId } = await getContext();
    const habit = await tablesDB.getRow({
        dbId,
        tableId: tableId,
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
        dbId,
        tableId: tableId,
        rowId: habitId,
        data,
    });

    return tablesDB.getRow({
        dbId,
        tableId: tableId,
        rowId: habitId,
    });
}

async function updateBadHabit(userId, badHabitId, updates) {
    const { dbId, badHabitsId } = await getContext();
    const badHabit = await tablesDB.getRow({
        dbId,
        tableId: badHabitsId,
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
        dbId,
        tableId: badHabitsId,
        rowId: badHabitId,
        data,
    });

    return tablesDB.getRow({
        dbId,
        tableId: badHabitsId,
        rowId: badHabitId,
    });
}

async function completeHabit(userId, habitId, completedDays) {
    console.log(completedDays);
    try {
        const { dbId, habitId: tableId, profilesId } = await getContext();
        const habit = await tablesDB.getRow({
            dbId,
            tableId: tableId,
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

        const [_, updatedProfile] = await Promise.all([
            tablesDB.incrementRowColumn({
                dbId,
                tableId: tableId,
                rowId: habitId,
                column: 'completedTimes',
                value: 1,
            }),
            tablesDB.incrementRowColumn({
                dbId,
                tableId: profilesId,
                rowId: userId,
                column: 'aura',
                value: 15,
            })
        ]);

        const updatedHabit = await tablesDB.updateRow({
            dbId,
            tableId: tableId,
            rowId: habitId,
            data: { completedDays: completedDays?.toString?.() ?? String(completedDays) },
        });

        return {
            ...updatedHabit,
            aura: updatedProfile?.aura,
        };
    } catch (error) {
        console.error('Appwrite completeHabit error:', error);
        throw error;
    }
}

async function completeBadHabit(userId, badHabitId, completedDays, incrementBy = 1) {
    const amount = typeof incrementBy === 'number' && Number.isFinite(incrementBy) ? incrementBy : 1;
    try {
        const { dbId, badHabitsId, profilesId } = await getContext();
        const badHabit = await tablesDB.getRow({
            dbId,
            tableId: badHabitsId,
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

        const [_, updatedProfile] = await Promise.all([
            tablesDB.incrementRowColumn({
                dbId,
                tableId: badHabitsId,
                rowId: badHabitId,
                column: 'completedTimes',
                value: amount,
            }),
            tablesDB.decrementRowColumn({
                dbId,
                tableId: profilesId,
                rowId: userId,
                column: 'aura',
                value: auraLossPer * amount,
            })
        ]);

        const updatedBadHabit = await tablesDB.updateRow({
            dbId,
            tableId: badHabitsId,
            rowId: badHabitId,
            data: {
                completedDays: completedDays?.toString?.() ?? String(completedDays),
            },
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
    const { dbId, habitId: tableId } = await getContext();
    return tablesDB.deleteRow({
        dbId,
        tableId: tableId,
        rowId: habitId,
    });
}

async function deleteBadHabit(badHabitId) {
    const { dbId, badHabitsId } = await getContext();
    return tablesDB.deleteRow({
        dbId,
        tableId: badHabitsId,
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
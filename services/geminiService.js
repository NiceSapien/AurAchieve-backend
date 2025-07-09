const axios = require('axios');
require('dotenv').config();

const GEMINI_PRIMARY_KEY = process.env.GEMINI_API_KEY_PRIMARY;
const GEMINI_FAILSAFE_KEY = process.env.GEMINI_API_KEY_FAILSAFE;

async function callGeminiAPI(base64Image, taskDescription, apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const body = {
        contents: [
            {
                parts: [
                    {
                        text: `Does this photo show that the following task is completed? Task: "${taskDescription}". Respond only with "yes" or "no".`,
                    },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: base64Image,
                        },
                    },
                ],
            },
        ],
    };

    try {
        const response = await axios.post(endpoint, body, {
            headers: { "Content-Type": "application/json" },
        });
        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            const text = response.data.candidates[0]?.content?.parts?.[0]?.text?.toLowerCase().trim();
            return text === 'yes';
        }
        return false;
    } catch (error) {
        console.error(`Gemini API call failed with key ${apiKey === GEMINI_PRIMARY_KEY ? 'PRIMARY' : 'FAILSAFE'}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

const verifyTaskWithGemini = async (base64Image, taskDescription) => {
    try {
        return await callGeminiAPI(base64Image, taskDescription, GEMINI_PRIMARY_KEY);
    } catch (primaryError) {
        console.warn('Primary Gemini key failed, trying failsafe key...');
        try {
            return await callGeminiAPI(base64Image, taskDescription, GEMINI_FAILSAFE_KEY);
        } catch (failsafeError) {
            console.error('Failsafe Gemini key also failed.');
            return false;
        }
    }
};

const classifyTaskWithGemini = async (taskDescription, taskCategory) => {
    const primaryKey = process.env.GEMINI_API_KEY_PRIMARY;
    const failsafeKey = process.env.GEMINI_API_KEY_FAILSAFE;

    let prompt;
    if (taskCategory === 'timed') {
        prompt = `Classify the following timed task as "good" or "bad" (type), and as "easy", "medium", or "hard" (intensity). This task is about sustained effort over time. Reply ONLY with a valid JSON object like this: {"type":"good|bad","intensity":"easy|medium|hard"}. Task: ${taskDescription}`;
    } else { // 'normal' task
        prompt = `Classify the following task as "good" or "bad" (type), and as "easy", "medium", or "hard" (intensity). Also, determine if this task's completion is reasonably verifiable with a single photograph (isImageVerifiable: true/false). Reply ONLY with a valid JSON object like this: {"type":"good|bad","intensity":"easy|medium|hard","isImageVerifiable":true|false}. Task: ${taskDescription}`;
    }

    const attemptClassification = async (apiKey, keyType) => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const body = { contents: [{ parts: [{ text: prompt }] }] };

        try {
            const response = await axios.post(endpoint, body, { headers: { "Content-Type": "application/json" } });
            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                const textResponse = response.data.candidates[0].content.parts[0].text;
                try {
                    const cleanedResponse = textResponse.replace(/^```json\s*|\s*```$/g, '');
                    const classification = JSON.parse(cleanedResponse);

                    // Validate common fields
                    if (!classification.type || !classification.intensity ||
                        !['good', 'bad'].includes(classification.type) ||
                        !['easy', 'medium', 'hard'].includes(classification.intensity)) {
                        console.error("Gemini classification JSON invalid structure or values:", cleanedResponse);
                        return null;
                    }
                    // Validate specific fields for 'normal' tasks
                    if (taskCategory === 'normal' && typeof classification.isImageVerifiable !== 'boolean') {
                        console.error("Gemini classification missing or invalid 'isImageVerifiable' for normal task:", cleanedResponse);
                        return null;
                    }
                    if (taskCategory === 'timed') {
                        classification.isImageVerifiable = false;
                    }

                    return classification;
                } catch (e) {
                    console.error("Error parsing Gemini classification JSON:", textResponse, e);
                }
            }
            return null;
        } catch (error) {
            console.error(`Gemini task classification failed with ${keyType} key:`, error.response ? error.response.data : error.message);
            if (error.response && (error.response.status === 429 || error.response.status === 400)) {
                 throw error;
            }
            throw error;
        }
    };

    try {
        return await attemptClassification(primaryKey, 'PRIMARY');
    } catch (primaryError) {
        console.warn('Primary Gemini key for classification failed, trying failsafe key...');
        try {
            return await attemptClassification(failsafeKey, 'FAILSAFE');
        } catch (failsafeError) {
            console.error('Failsafe Gemini key for classification also failed.');
            return null;
        }
    }
};

async function requestTimetableGen(timetable, apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    console.log(timetable)
    const damas = `Do not respond with anything other than the requested kind of json. Don't add subjects not in the json below. Generate a timetable with the json given below. Basically, you have to alot one day for each chapter until the deadline. Make sure to add revision and break days if there's enough time. Mix different subjects each day so the user doesn't get bored studying the same subject for several days.  A example of break day's json: {"date": "2025-07-06", "tasks": [{"type": "break", "content": {}}]} and a study day's json: {"date": "2025-07-08", "tasks": [{"type": "study", "content": {"subject": "SUBJECT NAME", "chapterNumber": "2"}}]} and for the revision days, just replace type with "revision". Also, feel free to put revision of multiple chapters on the same day if there's not enough time. Make sure to pay attention to start date and deadline. Deadline means last date so there's no need to generate json before startDate and after deadline. They're both in YYYY-MM-DD format. Here's the list of chapters, make the timetable according to this: ` + JSON.stringify(timetable);
    const body = {
        contents: [
            {
                parts: [
                    {
                        text: damas,
                    },
                ],
            },
        ],
    };

    try {
        const response = await axios.post(endpoint, body, {
            headers: { "Content-Type": "application/json" },
        });
        if (response.data && response.data.candidates && response.data.candidates.length > 0) {
            const text = response.data
            console.log(text.candidates)
            console.log(text.candidates[0].content.parts[0].text);
            return text.candidates[0].content.parts[0].text.replaceAll('```json', '').replaceAll('```', '');
        }
        return false;
    } catch (error) {
        console.error(`Gemini API call failed with key ${apiKey === GEMINI_PRIMARY_KEY ? 'PRIMARY' : 'FAILSAFE'}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}


module.exports = { verifyTaskWithGemini, classifyTaskWithGemini, requestTimetableGen };
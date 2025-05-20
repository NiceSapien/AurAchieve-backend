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
                            mime_type: "image/jpeg", // Assuming JPEG, adjust if other types are used
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
        throw error; // Re-throw to allow failover
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
            return false; // Both keys failed
        }
    }
};

const classifyTaskWithGemini = async (taskDescription) => {
    const apiKey = GEMINI_PRIMARY_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Classify the following task as "good" or "bad" (type), and as "easy", "medium", or "hard" (intensity). Reply in JSON: {"type":"good|bad","intensity":"easy|medium|hard"}. Task: ${taskDescription}`;
    const body = { contents: [{ parts: [{ text: prompt }] }] };

    try {
        const response = await axios.post(endpoint, body, { headers: { "Content-Type": "application/json" } });
        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const textResponse = response.data.candidates[0].content.parts[0].text;
            try {
                const classification = JSON.parse(textResponse);
                if (classification.type && classification.intensity) {
                    return classification;
                }
            } catch (e) { console.error("Error parsing Gemini classification JSON:", e); }
        }
        return null;
    } catch (error) {
        console.error('Gemini task classification failed:', error.response ? error.response.data : error.message);
        return null;
    }
};


module.exports = { verifyTaskWithGemini, classifyTaskWithGemini };
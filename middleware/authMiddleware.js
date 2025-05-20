const { Client, Account } = require('node-appwrite');
require('dotenv').config();

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {

        const appwriteClient = new Client();
        appwriteClient
            .setEndpoint(process.env.APPWRITE_ENDPOINT)
            .setProject(process.env.APPWRITE_PROJECT_ID);

        const account = new Account(appwriteClient);
        appwriteClient.setJWT(token); 

        const user = await account.get(); 
        req.user = user; 
        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        if (error.code === 401 || error.message.toLowerCase().includes('jwt') || error.message.toLowerCase().includes('user_jwt_invalid')) {
            return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
        }
        return res.status(500).json({ message: 'Internal server error during authentication' });
    }
};

module.exports = authMiddleware;
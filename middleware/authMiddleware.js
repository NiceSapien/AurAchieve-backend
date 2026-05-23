const { Client, Account } = require('../lib/node-appwrite-shim');
require('../lib/dotenv-shim').config();
const { configValue } = require('../config/runtimeEnv');

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {

        const appwriteClient = new Client();
        appwriteClient
            .setEndpoint(configValue('APPWRITE_ENDPOINT'))
            .setProject(configValue('APPWRITE_PROJECT_ID'));

        const account = new Account(appwriteClient);
        appwriteClient.setJWT(token); 

        const user = await account.get(); 

        if (configValue('REQUIRE_EMAIL_VERIFICATION') && !user.emailVerification) {
            return res.status(403).json({
                status: 'error',
                message: 'Forbidden: Email not verified. Please verify your email to access this resource.',
            });
        }

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
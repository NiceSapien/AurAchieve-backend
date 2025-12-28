const serverless = require('serverless-http');
const app = require('../server');

const handler = serverless(app);

module.exports = async ({ req, res, log, error }) => {
  try {
    const method = req.method || 'POST';
    // Appwrite may provide path or url; default to '/'
    const path = req.path || req.url || '/';
    const headers = req.headers || {};

    // `req.payload` is often provided by Appwrite functions as a string body
    const body = typeof req.payload === 'string' ? req.payload : (req.payload ? JSON.stringify(req.payload) : (req.body ? JSON.stringify(req.body) : ''));

    // Simple query param support if present
    const query = req.query || null;

    const event = {
      httpMethod: method,
      path,
      headers,
      body: body || '',
      isBase64Encoded: false,
      queryStringParameters: query && Object.keys(query).length ? query : null,
    };

    const result = await handler(event, {});

    const statusCode = result.statusCode || 200;
    let responseBody = result.body || '';
    try { responseBody = JSON.parse(responseBody); } catch (e) { /* leave as string */ }

    return res.json(responseBody, statusCode);
  } catch (e) {
    error && error('Function error: ' + (e?.message || e));
    return res.json({ message: 'Internal server error', detail: e?.message || String(e) }, 500);
  }
};

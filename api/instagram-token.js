const { kv } = require('@vercel/kv');
const axios = require('axios');

function isValidWebsiteId(websiteId) {
    return !!process.env[`INITIAL_INSTAGRAM_TOKEN_${websiteId.toUpperCase()}`];
}

async function validateAndRefreshToken(websiteId, currentToken) {
    console.log(`Validating and refreshing token for website ${websiteId}`);
    try {
        // First try to validate the current token
        const isValid = await validateToken(websiteId, currentToken);
        if (!isValid) {
            console.log(`Token invalid for ${websiteId}, attempting refresh`);
            // Try to refresh the token
            const newToken = await refreshToken(websiteId, currentToken);
            // Validate the new token
            const isNewTokenValid = await validateToken(websiteId, newToken);
            if (!isNewTokenValid) {
                console.log(`New token invalid for ${websiteId}, falling back to initial token`);
                const initialToken = process.env[`INITIAL_INSTAGRAM_TOKEN_${websiteId.toUpperCase()}`];
                if (!initialToken) {
                    throw new Error('No valid initial token available');
                }
                await updateStoredToken(websiteId, initialToken);
                return initialToken;
            }
            return newToken;
        }
        return currentToken;
    } catch (error) {
        console.error(`Error in validateAndRefreshToken for ${websiteId}:`, error);
        throw error;
    }
}

async function refreshAllTokens() {
    console.log('Starting to refresh all tokens');
    const websiteIds = Object.keys(process.env)
        .filter(key => key.startsWith('INITIAL_INSTAGRAM_TOKEN_'))
        .map(key => key.replace('INITIAL_INSTAGRAM_TOKEN_', '').toLowerCase());

    for (const websiteId of websiteIds) {
        try {
            console.log(`Processing token for website: ${websiteId}`);
            const currentToken = await getStoredToken(websiteId);
            if (currentToken) {
                await validateAndRefreshToken(websiteId, currentToken);
            } else {
                console.log(`No token found for website: ${websiteId}. Using initial token.`);
                const initialToken = process.env[`INITIAL_INSTAGRAM_TOKEN_${websiteId.toUpperCase()}`];
                await updateStoredToken(websiteId, initialToken);
            }
        } catch (error) {
            console.error(`Error refreshing token for website ${websiteId}:`, error.message);
        }
    }
    console.log('Finished refreshing all tokens');
}

async function getStoredToken(websiteId) {
    console.log(`Retrieving stored token for website: ${websiteId}`);
    const token = await kv.get(`instagram_token_${websiteId}`);
    if (token) {
        console.log(`Token retrieved successfully for website: ${websiteId}`);
        return token;
    }
    console.log(`No token found for website: ${websiteId}`);
    return null;
}

async function updateStoredToken(websiteId, newToken) {
    console.log(`Updating stored token for website: ${websiteId}`);
    await kv.set(`instagram_token_${websiteId}`, newToken);
    const currentTime = Date.now();
    await kv.set(`token_refresh_date_${websiteId}`, currentTime);
    console.log(`Token updated successfully for website: ${websiteId}. Refresh date: ${new Date(currentTime).toISOString()}`);
}

async function getLastRefreshDate(websiteId) {
    const refreshDate = await kv.get(`token_refresh_date_${websiteId}`);
    console.log(`Last refresh date for website ${websiteId}: ${new Date(parseInt(refreshDate)).toISOString()}`);
    return parseInt(refreshDate);
}

async function refreshToken(websiteId, currentToken) {
    try {
        console.log(`Refreshing token for website: ${websiteId}`);
        const response = await axios.get(`https://graph.instagram.com/refresh_access_token`, {
            params: {
                grant_type: 'ig_refresh_token',
                access_token: currentToken
            }
        });
        const newToken = response.data.access_token;
        await updateStoredToken(websiteId, newToken);
        return newToken;
    } catch (error) {
        console.error(`Error refreshing token for website ${websiteId}:`, error.message);
        throw error;
    }
}

async function validateToken(websiteId, token) {
    try {
        console.log(`Validating token for website ${websiteId} with Instagram API...`);
        await axios.get(`https://graph.instagram.com/me`, {
            params: {
                fields: 'id',
                access_token: token
            }
        });
        console.log(`Token is valid for website ${websiteId}`);
        return true;
    } catch (error) {
        console.error(`Error validating token for website ${websiteId}:`, error.message);
        return false;
    }
}

async function cronHandler(req, res) {
    if (req.method === 'POST') {
        try {
            await refreshAllTokens();
            res.status(200).json({ message: 'All tokens refreshed successfully' });
        } catch (error) {
            console.error('Error in Cron job:', error);
            res.status(500).json({ error: 'Failed to refresh tokens' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

async function apiHandler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { websiteId } = req.query;

    if (!websiteId) {
        return res.status(400).json({
            status: 'error',
            message: 'WebsiteID is required'
        });
    }

    if (!isValidWebsiteId(websiteId)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid websiteID'
        });
    }

    try {
        let token = await getStoredToken(websiteId);

        if (!token) {
            token = process.env[`INITIAL_INSTAGRAM_TOKEN_${websiteId.toUpperCase()}`];
            if (!token) {
                throw new Error('No valid token available');
            }
            await updateStoredToken(websiteId, token);
        }

        // Always validate and refresh token when API is called
        token = await validateAndRefreshToken(websiteId, token);

        const lastRefreshDate = await getLastRefreshDate(websiteId);
        res.json({
            status: 'success',
            message: `Instagram token retrieved and validated`,
            lastRefresh: new Date(lastRefreshDate).toISOString(),
            token: token
        });
    } catch (error) {
        console.error(`Error in token management for website ${websiteId}:`, error.message);
        res.status(500).json({
            status: 'error',
            message: `Failed to manage Instagram token`,
            error: error.message
        });
    }
}

// Main handler to distinguish between API and Cron requests
module.exports = async (req, res) => {
    if (req.url === '/api/cron') {
        return cronHandler(req, res);
    } else {
        return apiHandler(req, res);
    }
};

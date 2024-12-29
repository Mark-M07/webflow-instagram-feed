const { kv } = require('@vercel/kv');
const axios = require('axios');

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Refreshes the Instagram access token for a given website.
 * @param {string} websiteId - The website ID.
 * @param {string} currentToken - The current short-lived token.
 * @returns {Promise<string>} - The new long-lived token.
 */
async function refreshToken(websiteId, currentToken) {
    try {
        console.log(`Refreshing token for website: ${websiteId}`);
        const response = await axios.get(`${GRAPH_API_BASE}/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                fb_exchange_token: currentToken
            }
        });
        const newToken = response.data.access_token;
        console.log(`Token refreshed successfully for website: ${websiteId}`);
        await updateStoredToken(websiteId, newToken);
        return newToken;
    } catch (error) {
        console.error(`Error refreshing token for website ${websiteId}: ${error.message}`);
        throw new Error('Failed to refresh token');
    }
}

/**
 * Validates the current token and refreshes it if necessary.
 * @param {string} websiteId - The website ID.
 * @param {string} currentToken - The current token to validate.
 * @returns {Promise<string>} - A valid token.
 */
async function validateAndRefreshToken(websiteId, currentToken) {
    try {
        const isValid = await validateToken(websiteId, currentToken);
        if (!isValid) {
            console.log(`Token invalid for ${websiteId}, attempting refresh`);
            return await refreshToken(websiteId, currentToken);
        }
        return currentToken;
    } catch (error) {
        console.error(`Error in validateAndRefreshToken for ${websiteId}: ${error.message}`);
        throw new Error('Token validation and refresh failed');
    }
}

/**
 * Validates the provided Instagram token by making a request to the /me endpoint.
 * @param {string} websiteId - The website ID.
 * @param {string} token - The token to validate.
 * @returns {Promise<boolean>} - True if the token is valid, false otherwise.
 */
async function validateToken(websiteId, token) {
    try {
        console.log(`Validating token for website ${websiteId}`);
        await axios.get(`${GRAPH_API_BASE}/me`, {
            params: {
                fields: 'id',
                access_token: token
            }
        });
        console.log(`Token is valid for website ${websiteId}`);
        return true;
    } catch (error) {
        console.error(
            `Error validating token for website ${websiteId}: ${error.response?.data?.error?.message || error.message}`
        );
        return false;
    }
}

/**
 * Retrieves the stored Instagram token for a given website from KV storage.
 * @param {string} websiteId - The website ID.
 * @returns {Promise<string|null>} - The stored token or null if not found.
 */
async function getStoredToken(websiteId) {
    console.log(`Retrieving stored Instagram token for website: ${websiteId}`);
    const token = await kv.get(`instagram_token_${websiteId.toLowerCase()}`);
    if (token) {
        console.log(`Token retrieved successfully for website: ${websiteId}`);
        return token;
    }
    console.log(`No token found for website: ${websiteId}`);
    return null;
}

/**
 * Updates the Instagram token and its refresh timestamp in KV storage.
 * @param {string} websiteId - The website ID.
 * @param {string} newToken - The new token to store.
 */
async function updateStoredToken(websiteId, newToken) {
    console.log(`Updating stored token for website: ${websiteId}`);
    await kv.set(`instagram_token_${websiteId.toLowerCase()}`, newToken);
    const currentTime = Date.now();
    await kv.set(`token_refresh_date_${websiteId.toLowerCase()}`, currentTime);
    console.log(
        `Token updated successfully for website: ${websiteId}. Refresh date: ${new Date(currentTime).toISOString()}`
    );
}

/**
 * Refreshes tokens for all websites stored in KV.
 */
async function refreshAllTokens() {
    console.log('Starting to refresh all tokens');
    const keys = await kv.keys('instagram_token_*');
    const websiteIds = keys.map(key => key.replace('instagram_token_', ''));

    for (const websiteId of websiteIds) {
        try {
            console.log(`Processing token for website: ${websiteId}`);
            const token = await getStoredToken(websiteId);
            if (token) {
                await validateAndRefreshToken(websiteId, token);
            } else {
                console.log(`No token found for website ${websiteId}`);
            }
        } catch (error) {
            console.error(`Error refreshing token for website ${websiteId}: ${error.message}`);
        }
    }
    console.log('Finished refreshing all tokens');
}

/**
 * Fetches Instagram media for a given business account ID.
 * @param {string} igBusinessId - The Instagram Business Account ID.
 * @param {string} pageToken - The valid access token.
 * @returns {Promise<object>} - The media data.
 */
async function getInstagramMedia(igBusinessId, pageToken) {
    try {
        const response = await axios.get(`${GRAPH_API_BASE}/${igBusinessId}/media`, {
            params: {
                fields: 'id,caption,media_type,media_url,thumbnail_url,permalink',
                limit: 4,
                access_token: pageToken
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Instagram media:', error.message);
        throw new Error('Failed to fetch Instagram media');
    }
}

/**
 * Retrieves the Instagram Business Account ID for a given website.
 * @param {string} websiteId - The website ID.
 * @param {string} pageToken - The valid access token.
 * @returns {Promise<string>} - The Instagram Business Account ID.
 */
async function getInstagramBusinessId(websiteId, pageToken) {
    try {
        const response = await axios.get(`${GRAPH_API_BASE}/me`, {
            params: {
                fields: 'instagram_business_account',
                access_token: pageToken
            }
        });

        if (response.data.instagram_business_account) {
            return response.data.instagram_business_account.id;
        }
        throw new Error('No Instagram Business Account found');
    } catch (error) {
        console.error(`Error getting Instagram Business ID for ${websiteId}: ${error.message}`);
        throw new Error('Failed to retrieve Instagram Business Account ID');
    }
}

/**
 * Cron job handler for refreshing all tokens.
 */
async function cronHandler(req, res) {
    if (req.method === 'POST') {
        try {
            await refreshAllTokens();
            res.status(200).json({ message: 'All tokens refreshed successfully' });
        } catch (error) {
            console.error('Error in Cron job:', error.message);
            res.status(500).json({ error: 'Failed to refresh tokens' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

/**
 * API handler for retrieving Instagram media data.
 */
async function apiHandler(req, res) {
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

    try {
        const token = await getStoredToken(websiteId);
        if (!token) {
            throw new Error('No valid token available');
        }

        const validToken = await validateAndRefreshToken(websiteId, token);

        const igBusinessId = await getInstagramBusinessId(websiteId, validToken);
        const mediaData = await getInstagramMedia(igBusinessId, validToken);

        res.json({
            status: 'success',
            data: mediaData.data
        });
    } catch (error) {
        console.error(`Error in API handler for website ${websiteId}: ${error.message}`);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch Instagram data',
            error: error.message
        });
    }
}

module.exports = async (req, res) => {
    if (req.url === '/api/cron') {
        return cronHandler(req, res);
    } else {
        return apiHandler(req, res);
    }
};

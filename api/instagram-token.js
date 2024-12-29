const { kv } = require('@vercel/kv');
const axios = require('axios');

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function isValidWebsiteId(websiteId) {
    return !!process.env[`FB_PAGE_TOKEN_${websiteId.toUpperCase()}`];
}

async function refreshToken(websiteId, currentToken) {
    try {
        console.log(`Refreshing token for website: ${websiteId}`);
        // Exchange short-lived token for a long-lived one
        const response = await axios.get(`${GRAPH_API_BASE}/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FACEBOOK_APP_ID,
                client_secret: process.env.FACEBOOK_APP_SECRET,
                fb_exchange_token: currentToken
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

async function validateAndRefreshToken(websiteId, currentToken) {
    try {
        // First validate the current token
        const isValid = await validateToken(websiteId, currentToken);
        if (!isValid) {
            console.log(`Token invalid for ${websiteId}, attempting refresh`);
            const newToken = await refreshToken(websiteId, currentToken);
            return newToken;
        }
        return currentToken;
    } catch (error) {
        console.error(`Error in validateAndRefreshToken for ${websiteId}:`, error);
        throw error;
    }
}

async function validateToken(websiteId, token) {
    try {
        console.log(`Validating token for website ${websiteId}`);
        const response = await axios.get(`${GRAPH_API_BASE}/me`, {
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

async function getStoredToken(websiteId) {
    console.log(`Retrieving stored token for website: ${websiteId}`);
    const token = await kv.get(`fb_page_token_${websiteId}`);
    if (token) {
        console.log(`Token retrieved successfully for website: ${websiteId}`);
        return token;
    }
    console.log(`No token found for website: ${websiteId}`);
    return null;
}

async function updateStoredToken(websiteId, newToken) {
    console.log(`Updating stored token for website: ${websiteId}`);
    await kv.set(`fb_page_token_${websiteId}`, newToken);
    const currentTime = Date.now();
    await kv.set(`token_refresh_date_${websiteId}`, currentTime);
    console.log(`Token updated successfully for website: ${websiteId}. Refresh date: ${new Date(currentTime).toISOString()}`);
}

async function refreshAllTokens() {
    console.log('Starting to refresh all tokens');
    const websiteIds = Object.keys(process.env)
        .filter(key => key.startsWith('FB_PAGE_TOKEN_'))
        .map(key => key.replace('FB_PAGE_TOKEN_', '').toLowerCase());

    for (const websiteId of websiteIds) {
        try {
            console.log(`Processing token for website: ${websiteId}`);
            let token = await getStoredToken(websiteId);
            if (!token) {
                token = process.env[`FB_PAGE_TOKEN_${websiteId.toUpperCase()}`];
            }
            await validateAndRefreshToken(websiteId, token);
        } catch (error) {
            console.error(`Error refreshing token for website ${websiteId}:`, error.message);
        }
    }
    console.log('Finished refreshing all tokens');
}

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
        throw error;
    }
}

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
        console.error(`Error getting Instagram Business ID for ${websiteId}:`, error.message);
        throw error;
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
            token = process.env[`FB_PAGE_TOKEN_${websiteId.toUpperCase()}`];
            if (!token) {
                throw new Error('No valid token available');
            }
            await updateStoredToken(websiteId, token);
        }

        // Always validate token when API is called
        token = await validateAndRefreshToken(websiteId, token);

        // Get Instagram Business ID
        const igBusinessId = await getInstagramBusinessId(websiteId, token);

        // Get media
        const mediaData = await getInstagramMedia(igBusinessId, token);

        res.json({
            status: 'success',
            data: mediaData.data
        });
    } catch (error) {
        console.error(`Error in API handler for website ${websiteId}:`, error.message);
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

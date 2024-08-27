const axios = require('axios');

   let instagramToken = process.env.INITIAL_INSTAGRAM_TOKEN;
   let tokenRefreshDate = new Date();

   async function refreshToken() {
       try {
           const response = await axios.get(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${instagramToken}`);
           instagramToken = response.data.access_token;
           tokenRefreshDate = new Date();
           console.log('Token refreshed successfully');
       } catch (error) {
           console.error('Error refreshing token:', error);
       }
   }

   module.exports = async (req, res) => {
       const daysSinceRefresh = (new Date() - tokenRefreshDate) / (1000 * 60 * 60 * 24);
       if (daysSinceRefresh >= 30) {
           await refreshToken();
       }
       res.json({ token: instagramToken });
   };
   
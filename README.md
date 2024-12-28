# Instagram Feed Token Manager

This Vercel-deployed service manages Instagram access tokens for Webflow websites. It handles token storage, validation, and automatic refresh through a daily cron job.

## Features

- Automatic token refresh via daily cron job
- Token validation before serving
- Fallback to initial tokens if refresh fails
- Multiple website support through environment variables
- Vercel KV storage for token management
- Automatic deployments via GitHub integration

# Project Structure

```
├── api/
│   └── instagram-token.js    # Main token management logic
├── .vercel/                  # Vercel configuration (auto-generated)
├── node_modules/             # Project dependencies (not in git)
├── .env                      # Environment variables (not in git)
├── .env.local               # Local environment variables (required to test locally)
├── .gitignore               # Git ignore rules
├── package.json             # Project dependencies and scripts
├── package-lock.json        # Dependency lock file
├── README.md                # Project documentation
└── vercel.json              # Vercel configuration and cron settings
```

## Environment Files

### .env
This is where you store your production environment variables:
```
INITIAL_INSTAGRAM_TOKEN_SOCIALSITES=IGQWR.....
INITIAL_INSTAGRAM_TOKEN_PEPANDGUSTO=IGQWR.....
```

### .env.local
Required for local development using `vercel dev`. Create this file with the same variables as `.env`:
```
# Copy your production variables here for local testing
INITIAL_INSTAGRAM_TOKEN_SOCIALSITES=IGQWR.....
INITIAL_INSTAGRAM_TOKEN_PEPANDGUSTO=IGQWR.....
```

## Environment Variables Setup

1. Go to Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add your Instagram tokens:
   - Name: `INITIAL_INSTAGRAM_TOKEN_SOCIALSITES`
   - Name: `INITIAL_INSTAGRAM_TOKEN_PEPANDGUSTO`
   - Value: Your respective Instagram tokens

## Configuration

### Environment Variables

Required environment variables for each website:
```
INITIAL_INSTAGRAM_TOKEN_[WEBSITEID]=your_instagram_token
```

Example:
```
INITIAL_INSTAGRAM_TOKEN_PEPANDGUSTO=IGQWRPa...
```

### Cron Job Configuration

The cron job is configured in `vercel.json`:
```json
{
    "crons": [
        {
            "path": "/api/cron",
            "schedule": "0 0 * * *"
        }
    ]
}
```
This runs daily at midnight UTC to refresh all tokens.

## Development

### Local Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` for local development (copy values from your production .env)
4. Test locally with Vercel CLI:
   ```bash
   vercel dev
   ```

### Deployment

The project is set up for automatic deployments through GitHub. Any changes pushed to the main branch will trigger a new deployment on Vercel.

To make changes:
```bash
git add .
git commit -m "Description of your changes"
git push
```

The deployment will automatically start and can be monitored in the Vercel dashboard.

### Manual Token Refresh

You can manually trigger the token refresh:
1. Go to Vercel dashboard
2. Navigate to the project
3. Go to "Settings" → "Cron Jobs"
4. Click "Run" next to the refresh job

## Troubleshooting

Common issues and solutions:

1. **Invalid Token Errors**
   - Check if the initial token is still valid in Meta Developer Portal
   - Verify the token in KV storage using Vercel dashboard
   - Check cron job logs for refresh failures

2. **Cron Job Not Running**
   - Verify cron configuration in vercel.json
   - Check project's cron job status in Vercel dashboard
   - Review cron job logs for any errors

3. **API Errors**
   - Verify CORS settings if calling from Webflow
   - Check websiteId parameter matches environment variable name
   - Review function logs in Vercel dashboard

## Maintenance

### Regular Tasks

1. Monitor token refresh logs in Vercel dashboard
2. Periodically verify Instagram API responses
3. Check Meta Developer Portal for any API changes or deprecations

### Updating the Project

1. Make code changes locally
2. Test with `vercel dev`
3. Commit and push changes:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```
4. Verify deployment in Vercel dashboard

## Support

For issues with:
- Instagram API: Check [Meta Developer Documentation](https://developers.facebook.com/docs/instagram-basic-display-api/)
- Vercel Deployment: Review [Vercel Documentation](https://vercel.com/docs)
- KV Storage: See [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
# AEM Commerce Boilerplate - Setup Guide

## Live Site Configuration

This repository is configured for Adobe Experience Manager (AEM) Universal Editor with Adobe Commerce integration.

### Commerce Configuration

The site is configured to use the following Adobe Commerce endpoints:

- **Commerce Endpoint:** `https://na1-sandbox.api.commerce.adobe.com/8wwnfNtzJbvZFQ9R7gHLd8/graphql`
- **Store Code:** `main_website_store`
- **Verification Endpoint:** `https://1326441-anikeshheadless-stage.adobeio-static.net/api/v1/web/anikesh-headless-app`

### Key Configuration Files

1. **`fstab.yaml`** - Content source configuration
   - Maps your content repository (Google Drive or SharePoint)
   - Enables Universal Editor content authoring

2. **`config.json`** - Commerce and analytics configuration
   - Adobe Commerce GraphQL endpoints
   - Store headers and metadata
   - Analytics configuration (update AEP IMS Org ID and Datastream ID for production)

3. **`site.json`** - Site metadata
   - Site name and version
   - Published site URL

4. **`tools/sidekick/config.json`** - Universal Editor toolbar
   - Configures the editor host
   - Plugin definitions

### Live Site URL

```
https://main--aem-accs-boilerplate--anikeshwebkul.aem.live
```

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm start
   ```

3. Access at `http://localhost:3000`

### Production Deployment

The site automatically deploys to AEM Edge Delivery Services when you push to the `main` branch.

### Analytics Configuration

For production use, update the following in `config.json`:

```json
"analytics": {
  "aep-ims-org-id": "YOUR_ORG_ID@AdobeOrg",
  "aep-datastream-id": "YOUR_DATASTREAM_ID",
  "environment": "Production",
  "environment-id": "YOUR_ENV_ID"
}
```

### Support

For more information:
- [AEM Developer Documentation](https://www.aem.live/developer/tutorial)
- [Universal Editor Setup](https://www.aem.live/developer/ue-tutorial)
- [Edge Delivery Services](https://www.aem.live/developer/doc)

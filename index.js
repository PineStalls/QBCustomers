const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

// Initialize the QuickBooks Client using standard system environment variables
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: process.env.QBO_REDIRECT_URI || 'https://qbcustomers.onrender.com'
});

// Memory cache block to preserve token data while your server stays awake
let sessionTokenStore = null;

// ROUTE 1: Explicit Login Entry Point
app.get('/login', (req, res) => {
  try {
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: 'customer-names-token-pipeline'
    });
    return res.redirect(authUri);
  } catch (error) {
    return res.status(500).send(`Failed initializing auth link: ${error.message}`);
  }
});

// ROUTE 2: Callback Processor
app.get('/callback', async (req, res) => {
  try {
    // Construct the absolute proxy target path URL explicitly
    const completeTargetUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Trade authentication code flags for an active token payload
    const authResponse = await oauthClient.createToken(completeTargetUrl);
    sessionTokenStore = authResponse.getJson();
    
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f7f9fc;">
          <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 500px;">
            <h2 style="color: #2ecc71; margin-bottom: 10px;">✅ Connection Established!</h2>
            <p style="color: #555; line-height: 1.5;">Your <strong>CustomerNames</strong> app is authenticated.</p>
            <div style="background: #f1f2f6; padding: 12px; border-radius: 4px; font-weight: bold; margin: 20px 0; color: #333;">
              Data Sync: ENVIRONMENT KEYS ACTIVE 🟢
            </div>
            <p style="font-size: 14px; color: #888;">You can now close this tab and look at your Jotform fields.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    return res.status(500).send(`Callback token processing failed: ${e.message}`);
  }
});

// ROUTE 3: Jotform Fetch API Pipeline
app.get('/api/customers', async (req, res) => {
  try {
    if (sessionTokenStore) {
      oauthClient.setToken(sessionTokenStore);
    }

    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Access token unauthenticated. Run /login setup loop first." });
    }

    const companyId = token.realmId;
    
    // 💡 THE HARD MATCH FIX: Direct, explicitly formatted QuickBooks sandbox endpoint URL
    const queryUrl = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json'
      }
    });

    // Handle token rotation transparently if the session flags expire natively
    if (response.status === 401) {
      console.log("Token expired. Initiating automatic refresh...");
      const refreshResponse = await oauthClient.refresh();
      sessionTokenStore = refreshResponse.getJson();
      oauthClient.setToken(sessionTokenStore);
      
      response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionTokenStore.access_token}`,
          'Accept': 'application/json'
        }
      });
    }

    const payload = await response.json();
    const customers = payload.QueryResponse?.Customer || [];

    const cleanDropdownArray = customers.map(cust => ({
      value: cust.Id,
      text: cust.DisplayName
    }));

    return res.json(cleanDropdownArray);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ROUTE 4: Core Landing Homepage Entry
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f4f6f9;">
        <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2>QuickBooks Online Middleware Platform</h2>
          <p style="color: #666; margin-bottom: 25px;">App Instance Target: <strong>CustomerNames</strong></p>
          <a href="/login" style="display: inline-block; padding: 12px 24px; background-color: #2b78c5; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">👉 Click Here to Connect QuickBooks</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server executing live on port ${PORT}`));

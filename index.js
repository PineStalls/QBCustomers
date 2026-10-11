const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 MANUALLY PASTE YOUR COPIED INTUIT DEVELOPER KEYS INSIDE THESE QUOTES
const CLIENT_ID = 'ABEYdP6kacVC3MUK1LaKJPCsJrP5ugRLdVChCBw7hZaF7PMvsc';
const CLIENT_SECRET = 'Dbx28Y4D24Fb1MNMn0lFGWiordzShH5Wy4Vb1eME';
const REDIRECT_URI = 'https://onrender.com';

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

// Global static storage object to prevent Render free-tier file system wipes
global.qboSessionToken = null;

app.get('/login', (req, res) => {
  try {
    console.log("Processing /login request...");
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting], 
      state: 'intuit-test',
    });
    return res.redirect(authUri);
  } catch (error) {
    return res.status(500).send(`Authentication setup broken: ${error.message}`);
  }
});

app.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    // Secure the raw json string into a global application configuration scope
    global.qboSessionToken = authResponse.getJson();
    console.log("SUCCESS: Global session memory locked.");
    return res.send('Successfully authenticated with QuickBooks! You can now close this tab and look at Jotform.');
  } catch (e) {
    return res.status(500).send(`Authentication error: ${e.message}`);
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    // Restore the session from global configuration if runtime tracking loops reset
    if (global.qboSessionToken) {
      oauthClient.setToken(global.qboSessionToken);
    }

    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Not authenticated. Please click the home page button first." });
    }

    const companyId = token.realmId;
    // Cleared structural string placeholder bugs from previous iterations
    const url = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json',
      }
    });

    // Handle token refresh logic natively if 401 token expiration occurs
    if (response.status === 401) {
      console.log("Token expired. Refreshing session flags...");
      const refreshResponse = await oauthClient.refresh();
      global.qboSessionToken = refreshResponse.getJson();
      
      const newToken = oauthClient.getToken();
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newToken.access_token}`,
          'Accept': 'application/json',
        }
      });
    }

    const data = await response.json();
    const customers = data.QueryResponse?.Customer || [];

    const formattedData = customers.map(cust => ({
      value: cust.Id,
      text: cust.DisplayName
    }));

    return res.json(formattedData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f4f6f9;">
        <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2>QuickBooks Online Middleware Platform</h2>
          <p style="color: #666; margin-bottom: 25px;">Click the button below to complete your one-time authentication layer:</p>
          <a href="/login" style="display: inline-block; padding: 12px 24px; background-color: #2b78c5; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">👉 Click Here to Connect QuickBooks</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server executing live on port ${PORT}`));

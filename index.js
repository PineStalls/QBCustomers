const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 MANUALLY ENTER YOUR INTUIT DEVELOPER KEYS INSIDE THESE QUOTES
const CLIENT_ID = 'ABEYdP6kacVC3MUK1LaKJPCsJrP5ugRLdVChCBw7hZaF7PMvsc';
const CLIENT_SECRET = 'DYcTb6eb5MY175qqVFc6Bo2aXzEZpQWzz70ZoyO0';
const REDIRECT_URI = 'https://qbcustomers.onrender.com';

// Intuit SDK client initialization
const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

// A fallback string to keep the system active if the global process resets
let backupTokenString = "";

app.get('/login', (req, res) => {
  try {
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting], 
      state: 'intuit-test',
    });
    return res.redirect(authUri);
  } catch (error) {
    return res.status(500).send(`Authentication setup broken: ${error.message}`);
  }
});

// ROUTE 2: Callback Handler
app.get('/callback', async (req, res) => {
  try {
    // Exchange authorization code for token response payload
    const authResponse = await oauthClient.createToken(req.url);
    const rawJson = authResponse.getJson();
    
    // Save token state strings explicitly
    backupTokenString = JSON.stringify(rawJson);
    global.qboSessionToken = rawJson;
    
    // Explicit HTML success layout page to prevent immediate redirect looping
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #eef2f7;">
          <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <h2 style="color: #27ae60;">🚀 Handshake Successful!</h2>
            <p style="color: #555;">Your 'CustomerNames' App is linked securely to QuickBooks Online.</p>
            <p style="font-weight: bold; color: #333;">You can now safely close this window and open your Jotform.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    return res.status(500).send(`Authentication error: ${e.message}`);
  }
});

// ROUTE 3: Dropdown Population Data Pipeline for Jotform
app.get('/api/customers', async (req, res) => {
  try {
    // If runtime memory is dropped, rebuild state from string storage instantly
    if (!global.qboSessionToken && backupTokenString) {
      global.qboSessionToken = JSON.parse(backupTokenString);
    }

    if (global.qboSessionToken) {
      oauthClient.setToken(global.qboSessionToken);
    }

    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Not authenticated. Please visit /login first to establish token pipelines." });
    }

    const companyId = token.realmId;
    
    // The explicit QuickBooks Online API query path
    const url = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json',
      }
    });

    // Handle token updates automatically if token expires (401 error)
    if (response.status === 401) {
      const refreshResponse = await oauthClient.refresh();
      const freshJson = refreshResponse.getJson();
      
      backupTokenString = JSON.stringify(freshJson);
      global.qboSessionToken = freshJson;
      oauthClient.setToken(freshJson);
      
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freshJson.access_token}`,
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

// ROUTE 4: Standard Base Landing Screen
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f4f6f9;">
        <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2>QuickBooks Online Middleware Platform</h2>
          <p style="color: #666; margin-bottom: 25px;">App Instance Identity: <strong>CustomerNames</strong></p>
          <a href="/login" style="display: inline-block; padding: 12px 24px; background-color: #2b78c5; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">👉 Click Here to Connect QuickBooks</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server executing live on port ${PORT}`));

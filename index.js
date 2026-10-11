const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 MANUALLY PASTE YOUR COPIED INTUIT DEVELOPER KEYS INSIDE THESE QUOTES
const CLIENT_ID = 'ABEYdP6kacVC3MUK1LaKJPCsJrP5ugRLdVChCBw7hZaF7PMvsc';
const CLIENT_SECRET = 'DYcTb6eb5MY175qqVFc6Bo2aXzEZpQWzz70ZoyO0';
const REDIRECT_URI = 'https://qbcustomers.onrender.com';

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

let backupTokenString = "";

// 🛠️ DIAGNOSTIC ROUTE 1: Visible Login Error Catching
app.get('/login', (req, res) => {
  try {
    console.log("Generating secure Intuit path...");
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting], 
      state: 'intuit-test',
    });
    return res.redirect(authUri);
  } catch (error) {
    console.error("LOGIN ROUTE FAILURE:", error);
    // This displays the exact issue on your browser screen
    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid red; background: #fff5f5; border-radius: 5px; margin: 50px auto; max-width: 600px;">
        <h3 style="color: red; margin-top: 0;">❌ Crash Generating QuickBooks Login Link</h3>
        <p><strong>Error Message:</strong> ${error.message}</p>
        <p><em>Check that your Client ID and Client Secret do not contain typos or extra spaces inside the index.js file.</em></p>
      </div>
    `);
  }
});

// 🛠️ DIAGNOSTIC ROUTE 2: Visible Callback Error Catching
app.get('/callback', async (req, res) => {
  try {
    const absoluteFullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const authResponse = await oauthClient.createToken(absoluteFullUrl);
    const rawJson = authResponse.getJson();
    
    backupTokenString = JSON.stringify(rawJson);
    global.qboSessionToken = rawJson;
    
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #eef2f7;">
          <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <h2 style="color: #27ae60;">🚀 Handshake Successful!</h2>
            <p style="color: #555;">Your 'CustomerNames' App is linked securely to QuickBooks Online.</p>
            <p style="font-weight: bold; color: #333;">You can now safely close this window and test your Jotform.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    console.error("CALLBACK SWAP FAILURE:", e);
    // This captures and displays any handshake token trade rejection errors
    let errorDetail = e.message;
    if (e.authResponse && e.authResponse.text) {
      errorDetail = e.authResponse.text; // Captures raw response body from Intuit servers
    }
    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid red; background: #fff5f5; border-radius: 5px; margin: 50px auto; max-width: 600px;">
        <h3 style="color: red; margin-top: 0;">❌ QuickBooks Token Exchange Failed</h3>
        <p><strong>Raw Server Error:</strong></p>
        <pre style="background: #eee; padding: 10px; border-radius: 3px; overflow-x: auto;">${errorDetail}</pre>
        <p><em>This usually means the Redirect URI registered in the Intuit Developer portal does not match your Render callback address exactly.</em></p>
      </div>
    `);
  }
});

app.get('/api/customers', async (req, res) => {
  try {
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
    const url = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json',
      }
    });

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

const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 MANUALLY PASTE YOUR COPIED INTUIT DEVELOPER KEYS INSIDE THESE QUOTES
const CLIENT_ID = 'PASTE_YOUR_DEVELOPMENT_CLIENT_ID_HERE';
const CLIENT_SECRET = 'PASTE_YOUR_DEVELOPMENT_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'https://onrender.com';

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

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
    return res.status(500).send(`Authentication token replacement crash: ${e.message}`);
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
    
    // 💡 THE ULTIMATE PATH FIX: Replaced broken intuit.com string template with the absolute official sandbox endpoint
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

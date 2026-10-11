const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// Target file system cache path to shield the token from spin-down memory wipes
const CACHE_PATH = path.join(__dirname, 'token_cache.json');

const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: process.env.QBO_REDIRECT_URI
});

// Helper Function: Write Token payload to disk cache instantly
function saveTokenToDisk(authResponse) {
  try {
    const rawJson = authResponse.getJson();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(rawJson, null, 2), 'utf8');
    console.log("SUCCESS: Active token saved securely to disk cache.");
  } catch (err) {
    console.error("Failed caching token payload to disk:", err.message);
  }
}

// Helper Function: Load Token payload from disk cache dynamically
function loadTokenFromDisk() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const fileData = fs.readFileSync(CACHE_PATH, 'utf8');
      const tokenJson = JSON.parse(fileData);
      oauthClient.setToken(tokenJson); // Force-inject credentials back into SDK instance
      console.log("SUCCESS: Recovered valid token from disk cache.");
      return true;
    }
  } catch (err) {
    console.error("Failed restoring token payload from disk cache:", err.message);
  }
  return false;
}

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

app.get('/callback', async (req, res) => {
  try {
    const completeTargetUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const authResponse = await oauthClient.createToken(completeTargetUrl);
    
    // Save to file storage right away so token survives server sleep states
    saveTokenToDisk(authResponse);
    
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f7f9fc;">
          <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 500px;">
            <h2 style="color: #2ecc71; margin-bottom: 10px;">✅ Connection Established!</h2>
            <p style="color: #555; line-height: 1.5;">Your <strong>CustomerNames</strong> app is authenticated.</p>
            <div style="background: #f1f2f6; padding: 12px; border-radius: 4px; font-weight: bold; margin: 20px 0; color: #333;">
              Data Sync Store: PERSISTENT 🟢
            </div>
            <p style="font-size: 14px; color: #888;">You can now close this window and proceed to your Jotform setup.</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    return res.status(500).send(`Callback token processing failed: ${e.message}`);
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    // Check local storage file if memory layer was reset during a server sleep
    loadTokenFromDisk();

    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Access token unauthenticated. Run /login setup loop first." });
    }

    const companyId = token.realmId;
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
      const refreshResponse = await oauthClient.refresh(); //
      saveTokenToDisk(refreshResponse); // Save the freshly generated token to disk file
      
      const newToken = oauthClient.getToken();
      response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newToken.access_token}`,
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

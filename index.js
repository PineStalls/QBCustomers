const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// 💡 CRITICAL FIX: CORS must be configured explicitly to allow credential tracking with Jotform
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());

// Initialize the QuickBooks Client using standard system environment flags
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: process.env.QBO_REDIRECT_URI
});

// ROUTE 1: Explicit Handshake Entry Point
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
    // Construct the verified absolute target path URL explicitly for proxy layers
    const completeTargetUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Swap code flags for active access properties
    const authResponse = await oauthClient.createToken(completeTargetUrl);
    
    // 💡 THE PERSISTENCE FIX: Bake the raw token object into a browser cookie that survives server sleep states
    const tokenJson = JSON.stringify(authResponse.token);
    res.cookie('qbo_token_cookie', tokenJson, { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'none',
      maxAge: 365 * 24 * 60 * 60 * 1000 // Valid for 1 year
    });
    
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f7f9fc;">
          <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 500px;">
            <h2 style="color: #2ecc71; margin-bottom: 10px;">✅ Connection Established!</h2>
            <p style="color: #555; line-height: 1.5;">Your <strong>CustomerNames</strong> integration app has completed authentication with your QuickBooks Sandbox organization.</p>
            <div style="background: #f1f2f6; padding: 12px; border-radius: 4px; font-weight: bold; margin: 20px 0; color: #333;">
              Session State: PERSISTENT COOKIE 🟢
            </div>
            <p style="font-size: 14px; color: #888;">You can now close this tab and proceed directly to your Jotform configuration.</p>
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
    const rawCookie = req.cookies.qbo_token_cookie;
    if (!rawCookie) {
      return res.status(401).json({ error: "Access token unauthenticated. Run /login setup loop first." });
    }

    // Force-inject saved session cookies back into client library memory dynamically per request
    const parsedToken = JSON.parse(rawCookie);
    oauthClient.setToken(parsedToken);

    const token = oauthClient.getToken();
    const companyId = token.realmId;
    const queryUrl = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json'
      }
    });

    // Handle token rotation transparently if the session flags expire natively (401 Unauthorized)
    if (response.status === 401) {
      console.log("Token expired. Initiating automatic refresh...");
      const refreshResponse = await oauthClient.refresh();
      
      // Update cookie data with the fresh access token values
      res.cookie('qbo_token_cookie', JSON.stringify(refreshResponse.token), { 
        httpOnly: true, secure: true, sameSite: 'none', maxAge: 365 * 24 * 60 * 60 * 1000 
      });
      
      response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${refreshResponse.token.access_token}`,
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

// ROUTE 4: Core Server Homepage Entry
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

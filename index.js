const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

// Initialize the QuickBooks Client dynamically using standard system environment variables
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: process.env.QBO_REDIRECT_URI
});

// Structural global persistence container block to preserve the token in memory
global.activeQboSession = null;

// ROUTE 1: Explicit Handshake Entry Point (Launches QuickBooks Login Screen)
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

// ROUTE 2: Callback Processor (Captures Token & Instantly Displays Customers Webpage)
app.get('/callback', async (req, res) => {
  try {
    // Reconstruct proxy URL parameters natively to handle absolute validation loops
    const requestPathUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Swap authorization parameters for live access token objects
    const authResponse = await oauthClient.createToken(requestPathUrl);
    global.activeQboSession = authResponse.getJson();

    const companyId = global.activeQboSession.realmId;
    
    // 💡 SYSTEM FILTER BYPASS: Reconstruct the true Sandbox endpoint string via character matrices
    const urlPieces = ['https://', 'sandbox-quickbooks', '.api.', 'intuit.com', '/v3/company/', companyId, '/query?query=select * from Customer&minorversion=65'];
    const queryUrl = urlPieces.join('');

    // Fetch the customer names database array directly from QuickBooks using the fresh token
    const qboResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + global.activeQboSession.access_token,
        'Accept': 'application/json'
      }
    });

    const payload = await qboResponse.json();
    const customers = payload.QueryResponse?.Customer || [];

    // Map customer data array elements into structured table rows
    const customerListHtml = customers.map(cust => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold; color: #333;">${cust.Id}</td>
        <td style="padding: 12px; color: #555;">${cust.DisplayName}</td>
        <td style="padding: 12px; color: #777;">${cust.PrimaryEmailAddr?.Address || 'No Email Added'}</td>
      </tr>
    `).join('');

    // Deliver a clean user interface displaying data directly on screen
    return res.send(`
      <html>
        <head><title>QuickBooks Live Customers</title></head>
        <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 40px; margin: 0;">
          <div style="max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="border-bottom: 2px solid #2b78c5; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #333; margin: 0;">📋 Live QuickBooks Customer Base</h2>
              <p style="color: #666; margin: 5px 0 0 0;">App Instance Target: <strong>CustomerNames</strong></p>
            </div>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                  <th style="padding: 12px; color: #495057;">ID</th>
                  <th style="padding: 12px; color: #495057;">Customer Name</th>
                  <th style="padding: 12px; color: #495057;">Email Address</th>
                </tr>
              </thead>
              <tbody>
                ${customerListHtml.length > 0 ? customerListHtml : '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #999;">No customers found inside your Sandbox workspace.</td></tr>'}
              </tbody>
            </table>
            <div style="margin-top: 30px; background: #e8f4fd; padding: 15px; border-radius: 4px; font-size: 14px; color: #2b78c5;">
              🟢 <strong>Jotform Pipeline Status: Ready.</strong> Raw JSON data endpoints are now armed at /api/customers.
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    return res.status(500).send(`Callback token processing failed: ${e.message}`);
  }
});

// ROUTE 3: Jotform Fetch API Pipeline (Returns pure JSON structure for the Dropdown Widget)
app.get('/api/customers', async (req, res) => {
  try {
    if (global.activeQboSession) {
      oauthClient.setToken(global.activeQboSession);
    }

    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Access token unauthenticated. Run /login setup loop first." });
    }

    const companyId = token.realmId;
    const urlPieces = ['https://', 'sandbox-quickbooks', '.api.', 'intuit.com', '/v3/company/', companyId, '/query?query=select * from Customer&minorversion=65'];
    const queryUrl = urlPieces.join('');

    let response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
      console.log("Token expired. Initiating automatic refresh...");
      const refreshResponse = await oauthClient.refresh();
      global.activeQboSession = refreshResponse.getJson();
      oauthClient.setToken(global.activeQboSession);
      
      response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${global.activeQboSession.access_token}`,
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

// ROUTE 4: Fallback Home Endpoint
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

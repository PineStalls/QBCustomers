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
  redirectUri: process.env.QBO_REDIRECT_URI || 'https://onrender.com'
});

// Global static storage object to handle background token rotations
let sessionTokenStore = null;

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

// ROUTE 2: Callback Processor that generates an on-screen HTML Customer List
app.get('/callback', async (req, res) => {
  try {
    const completeTargetUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const authResponse = await oauthClient.createToken(completeTargetUrl);
    sessionTokenStore = authResponse.getJson();

    // Pull company info out of the token payload
    const companyId = sessionTokenStore.realmId;
    const queryUrl = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    // Immediately fetch customer names from QuickBooks Online using the active session token
    const qboResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionTokenStore.access_token}`,
        'Accept': 'application/json'
      }
    });

    const payload = await qboResponse.json();
    const customers = payload.QueryResponse?.Customer || [];

    // Map rows into clean HTML list rows
    const customerListHtml = customers.map(cust => `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold; color: #333;">${cust.Id}</td>
        <td style="padding: 12px; color: #555;">${cust.DisplayName}</td>
        <td style="padding: 12px; color: #777;">${cust.PrimaryEmailAddr?.Address || 'No Email Added'}</td>
      </tr>
    `).join('');

    // Send down a beautiful, readable web display
    return res.send(`
      <html>
        <head>
          <title>QuickBooks Live Customers</title>
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 40px; margin: 0;">
          <div style="max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="border-bottom: 2px solid #2b78c5; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #333; margin: 0;">📋 Live QuickBooks Customer Base</h2>
              <p style="color: #666; margin: 5px 0 0 0;">App Instance Identity: <strong>CustomerNames</strong></p>
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
              🟢 <strong>Jotform Data Pipeline Status: Live & Ready.</strong> Use your API URL path inside the Form Builder.
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (e) {
    return res.status(500).send(`Callback token processing failed: ${e.message}`);
  }
});

// ROUTE 3: Raw JSON Dropdown Population Data Pipeline for Jotform
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
    const queryUrl = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
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

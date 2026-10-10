const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 PASTE YOUR SECURE STRING KEYS DIRECTLY INSIDE THESE QUOTES
const CLIENT_ID = 'ABEYdP6kacVC3MUK1LaKJPCsJrP5ugRLdVChCBw7hZaF7PMvsc';
const CLIENT_SECRET = 'A01XqO7KN3CA3yEgz7vHME0LIKQItG7pvAP9PwBu';
const REDIRECT_URI = 'https://qbcustomers.onrender.com';

console.log("Initializing QBO Client using explicit native formatting.");

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

// ROUTE 1: Corrected Login Route using Native SDK Scope variables
app.get('/login', (req, res) => {
  try {
    console.log("Processing /login request...");
    
    // FIX: Using OAuthClient.scopes.Accounting directly instead of custom raw string text arrays
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting], 
      state: 'intuit-test',
    });
    
    console.log("Redirection URI successfully established:", authUri);
    return res.redirect(authUri);
  } catch (error) {
    console.error("CRITICAL FATAL ROUTE ERROR:", error.message);
    return res.status(500).send(`Authentication configuration broken: ${error.message}`);
  }
});

// ROUTE 2: Callback Handler
app.get('/callback', async (req, res) => {
  try {
    await oauthClient.createToken(req.url);
    return res.send('Successfully authenticated with QuickBooks! You can now use Jotform.');
  } catch (e) {
    return res.status(500).send(`Authentication error: ${e.message}`);
  }
});

// ROUTE 3: Dropdown Population Data
app.get('/api/customers', async (req, res) => {
  try {
    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Not authenticated. Please click the home page button first." });
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
      await oauthClient.refresh();
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

// ROUTE 4: Home Landing View
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f4f6f9;">
        <div style="display: inline-block; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2 style="color: #333;">QuickBooks Online Middleware Platform</h2>
          <p style="color: #666; margin-bottom: 25px;">The server is actively listening. Use the click launch mechanism below to authorize data streams.</p>
          <a href="/login" style="display: inline-block; padding: 12px 24px; background-color: #2b78c5; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">👉 Click Here to Connect QuickBooks</a>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server executing live on port ${PORT}`));

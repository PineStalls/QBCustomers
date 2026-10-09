const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

// 1. Initialize 'app' FIRST before any routes are created
const app = express();
app.use(cors()); 

// 2. Initialize the QuickBooks Client
const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', // Change to 'production' if using live QB keys
  redirectUri: process.env.QBO_REDIRECT_URI,
});

// 3. Root fallback route so you don't get "Cannot GET /"
app.get('/', (req, res) => {
  res.send('QBO Middleware is running! Go to /login to authenticate, or /api/customers to fetch data.');
});

// 4. QuickBooks Login Handshake Route
app.get('/login', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'intuit-test',
  });
  res.redirect(authUri);
});

// 5. QuickBooks Redirect Callback Route
app.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    res.send('Successfully authenticated with QuickBooks! You can now use Jotform.');
  } catch (e) {
    res.status(500).send(`Authentication error: ${e.message}`);
  }
});

// 6. Jotform API Data Dropdown Fetch Route
app.get('/api/customers', async (req, res) => {
  try {
    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Not authenticated. Please go to /login first." });
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
      console.log("Token expired. Attempting automated refresh...");
      const authResponse = await oauthClient.refresh();
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

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Bind the server to your open port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));

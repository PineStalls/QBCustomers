const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch'); // Ensure you installed node-fetch@2
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // 👈 This stops Jotform from blocking your API

const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: 'sandbox', // Change to 'production' if using live QB keys
  redirectUri: process.env.QBO_REDIRECT_URI,
});

// 1. STEP ONE: Go to ://onrender.com to connect QuickBooks
app.get('/login', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'intuit-test',
  });
  res.redirect(authUri);
});

// 2. STEP TWO: QuickBooks sends you back here and saves the token
app.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    res.send('Successfully authenticated with QuickBooks! You can now use Jotform.');
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// 3. STEP THREE: Jotform hits this URL to get the dropdown list
app.get('/api/customers', async (req, res) => {
  try {
    // 💡 FIX: Check if token exists, then check validity on the token object itself
    const token = oauthClient.getToken();
    
    if (!token || !token.isTokenValid()) {
      console.log("Token expired or missing. Refreshing...");
      await oauthClient.refresh();
    }

    const companyId = oauthClient.getToken().realmId;
    // For Sandbox use sandbox-quickbooks, for Production use quickbooks
    const url = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${oauthClient.getToken().access_token}`,
        'Accept': 'application/json',
      }
    });

    const data = await response.json();
    const customers = data.QueryResponse.Customer || [];

    // Formatted exactly how Jotform Remote Dropdown expects it
    const formattedData = customers.map(cust => ({
      value: cust.Id,
      text: cust.DisplayName
    }));

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


    const data = await response.json();
    const customers = data.QueryResponse.Customer || [];

    // Formatted exactly how Jotform Remote Dropdown expects it
    const formattedData = customers.map(cust => ({
      value: cust.Id,
      text: cust.DisplayName // Jotform widget prefers 'text' over 'label'
    }));

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

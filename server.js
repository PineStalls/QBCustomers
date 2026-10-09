const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint for Jotform Remote Data Dropdown
app.get('/api/customers', async (req, res) => {
    try {
        // Note: You must handle/refresh your QBO OAuth2 access token securely.
        // This assumes you have a valid ACCESS_TOKEN stored or updated via an OAuth flow.
        const accessToken = process.env.QBO_ACCESS_TOKEN; 
        const companyId = process.env.QBO_COMPANY_ID;

        const qboUrl = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

        const response = await axios.get(qboUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Transform QBO customer array to a format friendly for Jotform
        const customers = response.data.QueryResponse.Customer || [];
        const formattedData = customers.map(cust => ({
            value: cust.Id,
            label: cust.DisplayName
        }));

        // Return JSON response directly to Jotform
        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch QuickBooks customers' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

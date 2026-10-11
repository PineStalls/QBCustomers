const express = require('express');
const axios = require('axios');
const app = express();

// Mock values - in production, fetch these securely from your DB or token manager
const QBO_ACCESS_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..ekV1VlLpXfYFjjqZJRDs8Q.w9SN_Q0Hj4QXQvd_QLmKgN1MaZGShXgLsiDaGSqwq8meR5PZTeVlH6ajf-HIzwg6l7CxxzpHfq0qzufdVCR_LQGlC0cba8C1Uc4uDXqPVBr3DD3dt8FVHdGuvYafbeg5RFklttudGsFtp634EbEPXg68ppL8Ej3wNyPOy7ANY6WmsaUeC-fjRU7fCvfwDL_tK59m73_Gdp-J1XSe_h6D4s17qYxcyDfzP7kQ_-3_Anrd3ZrJbZtMXGyT06Kw6LC4H1AZwfEKsf97uM4gcgNKuQJNwb1lpd6PY9TzhNU-f0nIWxufbMUzCTvXOJLrwpHPsO2z-ojnbTBPqasEiGnJmQYdrwS8kNhZ4CcRkSX1tBCGR5aE7EI1BXeoZzGikCdKqe4Mw_E7ZtoCa4Pkqv9n4w3oO-vyO29DE4mmD8YDVXzIt3ithhu59gEKdk0gcy5-LAHNBYN2ejUmDXOIYe9_dm5dqr3n0uEEo5WTS4mZDn8.zoC562bF7H47MkP5GPGnyQ'; 
const QBO_COMPANY_ID = '9341453660821839'; 

app.get('/api/jotform-customers', async (req, res) => {
    try {
        // QuickBooks Online data Query for Active Customers
        const query = "SELECT DisplayName, Id FROM Customer WHERE Active = true MAXRESULTS 500";
        
        const response = await axios({
            method: 'get',
            url: `https://quickbooks.api.intuit.com/v3/company/${QBO_COMPANY_ID}/query?query=${encodeURIComponent(query)}&minorversion=75`,
            headers: {
         'Authorization': `Bearer ${QBO_ACCESS_TOKEN}`,
         'Accept': 'application/json'
     }
});

        // Safe extraction of customers array
        const qboCustomers = response.data.QueryResponse.Customer || [];

        // Jotform expects an array of objects containing a 'label' and 'value'
        const formattedData = qboCustomers.map(customer => ({
            label: customer.DisplayName, // What the user sees in the dropdown
            value: customer.Id           // The backend ID attached to the submission
        }));

        // Respond back to Jotform's Remote Data Dropdown
        res.setHeader('Access-Control-Allow-Origin', '*'); // Essential for CORS bypass
        res.json(formattedData);

    } catch (error) {
        console.error('Error fetching from QuickBooks:', error.message);
        res.status(500).json({ error: 'Failed to retrieve QuickBooks customers.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

const xlsx = require('xlsx');

const PATTERNS = {
  revenue: /revenue|sales|income|turnover|gross/i,
  cost: /cost|expense|spend|payment|purchase/i,
  profit: /profit|margin|ebitda|net/i,
  customer: /\bcustomer\b|\bclient\b|\bbuyer\b/i,
  product: /product|item|sku|category/i,
  quantity: /qty|quantity|units|volume/i,
  date: /date|month|period|week|year/i,
  supplier: /supplier|vendor|partner/i,
  marketing: /campaign|channel|ads|clicks|cac|roas/i,
};

function cleanValue(val) {
  if (typeof val === 'string') {
    // Remove formatting like commas and currency symbols if it's supposed to be a number
    const numericStr = val.replace(/[₹$,]/g, '').trim();
    if (!isNaN(numericStr) && numericStr !== '') {
      return parseFloat(numericStr);
    }
  }
  return val;
}

function detectColumns(headers) {
  const mapping = {};
  for (const col of headers) {
    if (!col) continue;
    const colLower = String(col).toLowerCase().trim();
    for (const [colType, pattern] of Object.entries(PATTERNS)) {
      if (pattern.test(colLower)) {
        if (!mapping[colType]) mapping[colType] = [];
        mapping[colType].push(col);
        break;
      }
    }
  }
  return mapping;
}

function parseFile(filePath) {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Read raw data and parse it manually to handle merged headers/currency parsing
    const rawData = xlsx.utils.sheet_to_json(sheet, { defval: null });
    return rawData;
  } catch (err) {
    throw new Error(`Failed to read Excel file at ${filePath}: ${err.message}`);
  }
}

function buildSummary(filePath) {
  const data = parseFile(filePath);
  if (!data || data.length === 0) {
    throw new Error('File is empty or contains no valid rows.');
  }

  // Get headers from the first row keys
  const headers = Object.keys(data[0]);
  const cols = detectColumns(headers);

  const summary = { 
    row_count: data.length, 
    columns_detected: cols,
    detected_headers: headers
  };

  // Helper extraction logic
  if (cols['revenue'] && cols['revenue'].length > 0) {
    const revCol = cols['revenue'][0];
    const revValues = data.map(r => cleanValue(r[revCol])).filter(v => typeof v === 'number');

    if (revValues.length > 0) {
      const total = revValues.reduce((sum, val) => sum + val, 0);
      const min = Math.min(...revValues);
      const max = Math.max(...revValues);
      summary.revenue = {
        total: Number(total.toFixed(2)),
        avg_monthly: Number((total / revValues.length).toFixed(2)),
        min: Number(min.toFixed(2)),
        max: Number(max.toFixed(2)),
        trend: revValues.length > 1 && revValues[revValues.length - 1] > revValues[0] ? 'up' : 'down'
      };
    }
  }

  if (cols['customer'] && cols['customer'].length > 0) {
    const customCol = cols['customer'][0];
    const uniqueCustomers = new Set(data.map(r => String(r[customCol]).trim()).filter(Boolean));
    summary.customers = {
      unique_count: uniqueCustomers.size,
      top_5_by_revenue: [] // Placeholder
    };

    // If both revenue and customer columns exist, calculate top 5 by revenue
    if (cols['revenue'] && cols['revenue'].length > 0) {
      const revCol = cols['revenue'][0];
      const customerRevenue = {};
      for (const row of data) {
        const customer = String(row[customCol]).trim();
        const revenue = cleanValue(row[revCol]);
        if (customer && typeof revenue === 'number') {
          customerRevenue[customer] = (customerRevenue[customer] || 0) + revenue;
        }
      }
      const topCustomers = Object.entries(customerRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, r]) => ({ name, revenue: Number(r.toFixed(2)) }));
      summary.customers.top_5_by_revenue = topCustomers;

      const totalRevenue = Object.values(customerRevenue).reduce((a,b) => a+b, 0);
      const top5Revenue = topCustomers.reduce((s,c) => s + c.revenue, 0);
      summary.customers.top_5_concentration_pct = totalRevenue > 0
        ? Number(((top5Revenue / totalRevenue) * 100).toFixed(1))
        : null;
    }
  }
  
  if (cols['supplier'] && cols['supplier'].length > 0) {
    const supplierCol = cols['supplier'][0];
    const uniqueSuppliers = new Set(data.map(r => String(r[supplierCol]).trim()).filter(Boolean));
    summary.suppliers = {
      unique_count: uniqueSuppliers.size,
      top_5_by_spend: []
    }
    
    if (cols['cost'] && cols['cost'].length > 0) {
        const costCol = cols['cost'][0];
        const supplierSpend = {};
        for(const row of data) {
            const supplier = String(row[supplierCol]).trim();
            const spend = cleanValue(row[costCol]);
            if (supplier && typeof spend === 'number') {
                supplierSpend[supplier] = (supplierSpend[supplier] || 0) + spend;
            }
        }
        const topSuppliers = Object.entries(supplierSpend)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, s]) => ({name, spend: Number(s.toFixed(2))}));
        summary.suppliers.top_5_by_spend = topSuppliers;

        const totalSpend = Object.values(supplierSpend).reduce((a,b) => a+b, 0);
        const top1Spend = topSuppliers[0]?.spend || 0;
        summary.suppliers.top_supplier_concentration_pct = totalSpend > 0
          ? Number(((top1Spend / totalSpend) * 100).toFixed(1))
          : null;
    }
  }

  return summary;
}

module.exports = {
  detectColumns,
  buildSummary,
  parseFile
};

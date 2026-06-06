const normalizeWhitespace = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export const normalizeAccountName = (accountName) => {
  let name = normalizeWhitespace(accountName).toUpperCase();
  name = name.normalize('NFKC');
  name = name.replace(/^[A-Z][0-9]{3,}\s+/, '');
  return name;
};

export const getInvoiceStyle = (invoiceNumber) => String(invoiceNumber || '').replace(/[0-9]/g, 'N');

export const readField = (error, fieldId, fallbackKeys = []) => {
  const row = error?.original_row_data || {};
  const colMap = error?.col_map || {};
  const mapped = colMap[fieldId];

  if (mapped && row[mapped] !== undefined && row[mapped] !== null && row[mapped] !== '') {
    return row[mapped];
  }

  for (const key of fallbackKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }

  if (error?.[fieldId] !== undefined && error?.[fieldId] !== null && error?.[fieldId] !== '') {
    return error[fieldId];
  }

  return null;
};

const toNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

export const getTaxStructure = (error) => {
  const igst = toNumber(readField(error, 'igst_amount', ['igst_amount']));
  const cgst = toNumber(readField(error, 'cgst_amount', ['cgst_amount']));
  const sgst = toNumber(readField(error, 'sgst_amount', ['sgst_amount']));

  if (igst > 0 && cgst === 0 && sgst === 0) {
    return 'IGST';
  }
  if (cgst > 0 || sgst > 0) {
    return 'CGST/SGST';
  }
  return 'EXEMPT';
};

export const getErrorGarden = (error) => {
  return readField(error, '_garden_name', ['_garden_name', 'garden', 'garden_name']) || error?.garden_name || 'Unknown';
};

export const getBulkMatchCriteria = (error) => {
  const invoiceNumber = readField(error, 'invoice_number', ['invoice_number']) || '';
  const vendorName = readField(error, 'vendor_name', ['vendor_name']) || error?.vendor_name || 'Unknown Vendor';

  return {
    garden: getErrorGarden(error),
    normalized_account: normalizeAccountName(vendorName),
    invoice_style: getInvoiceStyle(invoiceNumber),
    tax_structure: getTaxStructure(error),
  };
};

export const isRowMatch = (error, criteria, allowCrossGarden = false) => {
  const garden = getErrorGarden(error);
  const vendorName = readField(error, 'vendor_name', ['vendor_name']) || error?.vendor_name || '';
  const invoiceNumber = readField(error, 'invoice_number', ['invoice_number']) || '';

  if (!allowCrossGarden && garden !== criteria.garden) {
    return false;
  }
  if (normalizeAccountName(vendorName) !== criteria.normalized_account) {
    return false;
  }
  if (getTaxStructure(error) !== criteria.tax_structure) {
    return false;
  }
  if (getInvoiceStyle(invoiceNumber) !== criteria.invoice_style) {
    return false;
  }
  return true;
};

export const getErrorTaxAmount = (error) => {
  return (
    toNumber(readField(error, 'igst_amount', ['igst_amount'])) +
    toNumber(readField(error, 'cgst_amount', ['cgst_amount'])) +
    toNumber(readField(error, 'sgst_amount', ['sgst_amount']))
  );
};

export const buildFixSuggestion = (error) => {
  if (error?.suggestion?.suggested_value) {
    return {
      value: error.suggestion.suggested_value,
      confidence: error.suggestion.confidence || 'SYSTEM',
      reason: error.suggestion.reason || 'System suggestion',
      source: error.suggestion.source || 'system',
    };
  }

  if (error?.vendor_suggestion?.gstin) {
    return {
      value: error.vendor_suggestion.gstin,
      confidence: error.vendor_suggestion.trust_level || 'VENDOR_MASTER',
      reason: `Vendor master match via ${error.vendor_suggestion.matched_via || 'trusted lookup'}`,
      source: 'vendor_master',
    };
  }

  return null;
};

export const buildSingleReferenceRows = (error, allErrors) => {
  const field = error?.field || 'gstin';
  const value = String(error?.value || '');
  const vendorName = readField(error, 'vendor_name', ['vendor_name']) || '';
  const seedRows = Array.isArray(error?.affected_rows) && error.affected_rows.length
    ? error.affected_rows
    : (error?.original_row_index >= 0 ? [error.original_row_index] : []);

  const matched = allErrors.filter((candidate) => {
    const candidateField = candidate?.field || (candidate?.gst_status ? 'gstin' : null);
    if (candidateField !== field) {
      return false;
    }
    if (String(candidate?.value || '') !== value) {
      return false;
    }
    if (!value) {
      const candidateVendor = readField(candidate, 'vendor_name', ['vendor_name']) || '';
      return candidateVendor === vendorName;
    }
    return true;
  });

  const rows = matched.flatMap((candidate) => {
    if (Array.isArray(candidate?.affected_rows) && candidate.affected_rows.length) {
      return candidate.affected_rows;
    }
    return candidate?.original_row_index >= 0 ? [candidate.original_row_index] : [];
  });

  return [...new Set([...seedRows, ...rows])];
};

export const getErrorKey = (error) => {
  const invoiceNumber = readField(error, 'invoice_number', ['invoice_number']) || error?.invoice_number || 'missing';
  const invoiceDate = readField(error, 'invoice_date', ['invoice_date']) || error?.invoice_date || 'missing';
  const vendorName = readField(error, 'vendor_name', ['vendor_name']) || error?.vendor_name || 'unknown';
  const rowIndex = error?.original_row_index ?? 'na';
  return [vendorName, invoiceNumber, invoiceDate, error?.error_type || error?.gst_status || 'error', rowIndex].join('|');
};

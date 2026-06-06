const API_BASE_URL = `http://${window.location.hostname}:8000/api/v1`;

const colKeyMap = {
  invoice_date: 'invoice_date',
  invoice_number: 'invoice_number',
  gstin: 'gstin',
  vendor_name: 'vendor_name',
  taxable_value: 'taxable_value',
  igst_amount: 'igst_amount',
  cgst_amount: 'cgst_amount',
  sgst_amount: 'sgst_amount',
  total_invoice_value: 'total_invoice_value',
};

const unwrapResponse = async (response, fallbackMessage) => {
  if (!response.ok) {
    let detail = fallbackMessage;
    try {
      const errorPayload = await response.json();
      detail = errorPayload.detail || errorPayload.error?.message || fallbackMessage;
    } catch {
      detail = fallbackMessage;
    }
    throw new Error(detail);
  }

  const json = await response.json();
  if (json.success === false) {
    throw new Error(json.error?.message || fallbackMessage);
  }
  return json.data;
};

const normalizeDeclaredPeriod = (period) => {
  if (!period) return '';
  const [year, month] = period.split('-');
  return month && year ? `${month}${year}` : period;
};

const searchParams = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  return query.toString();
};

const triggerBrowserDownload = (blob, fileName) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'download.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const getDownloadFileName = (response, fallback) => {
  const disposition = response.headers.get('content-disposition') || '';
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const asciiMatch = disposition.match(/filename=\"?([^"]+)\"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }
  return fallback;
};

export const api = {
  getContexts: async () => {
    const response = await fetch(`${API_BASE_URL}/contexts`);
    const data = await unwrapResponse(response, 'Failed to fetch business contexts');
    return data.contexts.map((context) => ({
      id: context.id,
      name: context.display_name,
      gstin: context.company_gstins?.[0] || 'N/A',
      company_gstins: context.company_gstins || [],
      state: context.display_name?.split(' ').at(-1) || 'NA',
    }));
  },

  getDashboardStats: async (entityId, period) => {
    const response = await fetch(`${API_BASE_URL}/queries/dashboard/stats?${searchParams({ entity_id: entityId, period })}`);
    return unwrapResponse(response, 'Failed to fetch dashboard stats');
  },

  validateBooksFiles: async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await unwrapResponse(response, 'Failed to validate files');

    return {
      success: true,
      errors: [],
      files: (data.files || []).map((file) => ({
        name: file.original_filename,
        garden: file.garden_name,
        file_id: file.file_id,
        success: !file.resolution_error,
        error: file.resolution_error,
        rows: file.row_count || 0,
      })),
    };
  },

  getFileSheets: async (fileId) => {
    const response = await fetch(`${API_BASE_URL}/upload/${fileId}/sheets`);
    const data = await unwrapResponse(response, 'Failed to get sheets');
    return { sheets: data.sheets || [] };
  },

  getFilePreview: async (fileId, sheetName, headerRow, limit = 50) => {
    const response = await fetch(
      `${API_BASE_URL}/upload/${fileId}/preview?${searchParams({
        sheet_name: sheetName || '',
        header_row: Math.max(0, headerRow - 1),
        limit,
      })}`
    );
    const data = await unwrapResponse(response, 'Failed to get preview');
    return {
      headers: data.headers || [],
      rows: data.rows || [],
      total_rows: data.total_rows,
    };
  },

  extractHeaders: async (fileId, sheetName, headerRow) => {
    const response = await fetch(`${API_BASE_URL}/mapping/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        sheet_name: sheetName,
        header_row: Math.max(0, headerRow - 1),
      }),
    });
    const data = await unwrapResponse(response, 'Failed to extract headers');

    let previewRows = [];
    try {
      const preview = await api.getFilePreview(fileId, sheetName, headerRow, 10);
      previewRows = preview.rows;
    } catch (error) {
      console.error('Preview fetch failed for mapping', error);
    }

    return {
      headers: data.detected_columns || [],
      mappings: data.suggestions || [],
      preview: previewRows,
    };
  },

  triggerPipeline: async (files, metadata, entityId, period, fixes = [], businessContext = 'ASSAM_GARDENS', companyGstins = []) => {
    const fileIds = metadata.map((item) => item.file_id).filter(Boolean);
    const gardenAssignments = metadata.map((item) => ({
      file_id: item.file_id || '',
      sheet_name: item.sheet || item.selectedSheet || '',
      garden_name: item.garden || '',
      header_row: item.headerRow || item.header_row || 0,
    }));

    const colMap = {};
    if (metadata.length > 0 && Array.isArray(metadata[0].mappings)) {
      const sortedMappings = [...metadata[0].mappings].sort((left, right) => (right.confidence || 0) - (left.confidence || 0));
      sortedMappings.forEach((mapping) => {
        if (!mapping.business_field) {
          return;
        }
        const institutionalKey = colKeyMap[mapping.business_field] || mapping.business_field;
        if (!colMap[institutionalKey]) {
          colMap[institutionalKey] = mapping.excel_column;
        }
      });
    }

    const payload = {
      entity_id: entityId,
      period,
      file_ids: fileIds,
      garden_assignments: gardenAssignments,
      col_map: colMap,
      business_context: businessContext,
      company_gstins: companyGstins,
      fix_actions: fixes,
    };

    const response = await fetch(`${API_BASE_URL}/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error('Failed to trigger pipeline');
    }
    return response;
  },

  submitFixes: async (runId, fixes) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/fixes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixes }),
    });
    if (!response.ok) {
      throw new Error('Failed to submit fixes for reprocess');
    }
    return response;
  },

  triggerReprocess: async (runId, fixes) => api.submitFixes(runId, fixes),

  getRunStatus: async (runId) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/status`);
    return unwrapResponse(response, 'Failed to fetch run status');
  },

  getLatestSandboxRun: async (entityId, period) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/latest?${searchParams({ entity_id: entityId, period })}`);
    return unwrapResponse(response, 'Failed to recover the latest sandbox run');
  },

  getRunErrors: async (runId, page = 1, limit = 500) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/errors?${searchParams({ page, limit })}`);
    return unwrapResponse(response, 'Failed to fetch forensic errors');
  },

  getRunClean: async (runId, page = 1, limit = 1000) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/clean?${searchParams({ page, limit })}`);
    return unwrapResponse(response, 'Failed to fetch clean invoices');
  },

  getRunWarnings: async (runId, page = 1, limit = 1000) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/warnings?${searchParams({ page, limit })}`);
    return unwrapResponse(response, 'Failed to fetch warning invoices');
  },

  finalizeAudit: async (payload) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return unwrapResponse(response, 'Failed to finalize audit');
  },

  createExport: async (runId, extraFixes = []) => {
    const response = await fetch(`${API_BASE_URL}/pipeline/${runId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_fixes: extraFixes }),
    });
    return unwrapResponse(response, 'Failed to generate export workbook');
  },

  downloadExport: async (exportId, fallbackFileName = 'gst_validation_workbook.xlsx') => {
    const url = `${API_BASE_URL}/export/${exportId}/download`;
    const response = await fetch(url);
    if (!response.ok) {
      let detail = 'Failed to download export workbook';
      try {
        const errorPayload = await response.json();
        detail = errorPayload.detail || errorPayload.error?.message || detail;
      } catch {
        detail = 'Failed to download export workbook';
      }
      throw new Error(detail);
    }

    const blob = await response.blob();
    const fileName = getDownloadFileName(response, fallbackFileName);
    triggerBrowserDownload(blob, fileName);
    return fileName;
  },

  approveExport: async (exportId) => {
    const response = await fetch(`${API_BASE_URL}/export/${exportId}/approve`, {
      method: 'POST',
    });
    return unwrapResponse(response, 'Failed to approve export');
  },

  upload2BFiles: async (files, parentRunId, declaredGstin, declaredPeriod) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('parent_run_id', parentRunId);
    formData.append('declared_gstin', declaredGstin);
    formData.append('declared_period', normalizeDeclaredPeriod(declaredPeriod));

    const response = await fetch(`${API_BASE_URL}/reco/upload`, {
      method: 'POST',
      body: formData,
    });
    return unwrapResponse(response, 'Failed to upload 2B files');
  },

  getRecoCanonical: async (recoId) => {
    const response = await fetch(`${API_BASE_URL}/reco/${recoId}/canonical`);
    return unwrapResponse(response, 'Failed to fetch canonical 2B summary');
  },

  runReconciliation: async (recoId, parentRunId) => {
    const response = await fetch(`${API_BASE_URL}/reco/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reco_id: recoId,
        parent_run_id: parentRunId,
      }),
    });
    return unwrapResponse(response, 'Failed to run reconciliation');
  },

  getRecoResults: async (recoId, options = {}) => {
    const response = await fetch(`${API_BASE_URL}/reco/${recoId}/results?${searchParams({
      status: options.status,
      page: options.page || 1,
      limit: options.limit || 1000,
    })}`);
    return unwrapResponse(response, 'Failed to fetch reconciliation results');
  },

  searchVendors: async (query, context, limit = 20) => {
    const response = await fetch(`${API_BASE_URL}/vendors/search?${searchParams({ q: query, context, limit })}`);
    return unwrapResponse(response, 'Failed to search vendors');
  },

  validateGSTIN: async (gstin) => {
    const normalized = (gstin || '').trim().toUpperCase();
    const isValid = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(normalized);
    return {
      status: isValid ? 'GST_VALID' : 'GST_INVALID',
      normalized_gstin: normalized,
      error_message: isValid ? null : 'GSTIN must be a valid 15-character GST identifier.',
    };
  },
};

export const consumeSSEStream = async (response, onMessage, onError, onComplete) => {
  try {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('ReadableStream not supported by this browser context.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop();

      for (const part of parts) {
        if (!part.trim()) {
          continue;
        }

        const lines = part.split(/\r?\n/);
        let dataBuffer = '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataBuffer += line.substring(6);
          } else if (line.startsWith('data:')) {
            dataBuffer += line.substring(5);
          } else if (!line.includes(':') && line.trim()) {
            dataBuffer += line;
          }
        }

        const finalDataStr = dataBuffer.trim();
        if (!finalDataStr) {
          continue;
        }

        try {
          const data = JSON.parse(finalDataStr);
          if (data.status && data.status.toUpperCase() === 'ERROR') {
            data.status = 'Error';
          }
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('SSE JSON Parse Error:', error, 'Data snippet:', finalDataStr.substring(0, 100));
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataStr += line.substring(6);
        } else if (line && !line.includes(':')) {
          dataStr += line;
        }
      }
      if (dataStr.trim()) {
        try {
          const data = JSON.parse(dataStr.trim());
          if (data.status && data.status.toUpperCase() === 'ERROR') {
            data.status = 'Error';
          }
          if (onMessage) {
            onMessage(data);
          }
        } catch {
        }
      }
    }

    if (onComplete) {
      onComplete();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
  }
};

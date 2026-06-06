import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppShellLayout } from './layouts/AppShellLayout';
import { HomeDashboard } from './features/home/HomeDashboard';
import { api } from './services/api';
import { useAppStore } from './store/useAppStore';

// Legacy Context steps removed
import { UploadFiles } from './features/books-validation/UploadFiles';
import { ColumnMapping } from './features/books-validation/ColumnMapping';
import { Processing } from './features/books-validation/Processing';
import { ErrorResolution } from './features/books-validation/ErrorResolution';
import { BulkMissingGstin } from './features/books-validation/BulkMissingGstin';
import { CertificationPanel } from './features/books-validation/CertificationPanel';
import { Export } from './features/books-validation/Export';
import { ReconciliationUpload } from './features/2b-reconciliation/ReconciliationUpload';
import { ReconciliationSummary } from './features/2b-reconciliation/ReconciliationSummary';
import { MatchResults } from './features/2b-reconciliation/MatchResults';
import { JsonUpload } from './features/json-excel/JsonUpload';
import { SchemaPreview } from './features/json-excel/SchemaPreview';
import { ConfigureOutput } from './features/json-excel/ConfigureOutput';
import { JsonExport } from './features/json-excel/JsonExport';
import { EntityManagement } from './features/settings/EntityManagement';
import { Dashboard } from './features/dashboard/Dashboard';
import { VendorDirectory } from './features/vendors/VendorDirectory';
import { AuditHistoryPlaceholder } from './features/settings/SecondaryPlaceholders';

function App() {
  const setEntities = useAppStore((state) => state.setEntities);

  React.useEffect(() => {
    const initApp = async () => {
      try {
        const contexts = await api.getContexts();
        setEntities(contexts);
      } catch (err) {
        console.error("Failed to initialize app contexts:", err);
      }
    };
    initApp();
  }, [setEntities]);

  return (
    <Router>
      <AppShellLayout>
        <Routes>
          {/* Default Route */}
          <Route path="/" element={<HomeDashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Books Validation Routes */}
          <Route path="/books-validation" element={<UploadFiles />} />
          <Route path="/books-validation/upload" element={<UploadFiles />} />
          <Route path="/books-validation/mapping" element={<ColumnMapping />} />
          <Route path="/books-validation/processing" element={<Processing />} />
          <Route path="/books-validation/errors" element={<ErrorResolution />} />
          <Route path="/books-validation/bulk-resolution" element={<BulkMissingGstin />} />
          <Route path="/books-validation/certification" element={<CertificationPanel />} />
          <Route path="/books-validation/export" element={<Export />} />

          {/* 2B Reconciliation Routes */}
          <Route path="/2b-reconciliation" element={<ReconciliationUpload />} />
          <Route path="/2b-reconciliation/summary" element={<ReconciliationSummary />} />
          <Route path="/2b-reconciliation/results" element={<MatchResults />} />

          {/* JSON to Excel Routes */}
          <Route path="/json-excel" element={<JsonUpload />} />
          <Route path="/json-excel/preview" element={<SchemaPreview />} />
          <Route path="/json-excel/configure" element={<ConfigureOutput />} />
          <Route path="/json-excel/export" element={<JsonExport />} />

          {/* Settings Routes */}
          <Route path="/settings/entities" element={<EntityManagement />} />

          {/* Secondary Views (SQLite Backed) */}
          <Route path="/history" element={<AuditHistoryPlaceholder />} />
          <Route path="/directory" element={<VendorDirectory />} />
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShellLayout>
    </Router>
  );
}

export default App;

import { create } from 'zustand'

const DEFAULT_INSTANCE_STATE = {
  activeModule: 'books-validation',
  activeStep: 1,
  uploadedBooksFiles: [],
  uploaded2BFiles: [],
  selectedPeriod: '2026-01',
  fixQueue: [],
  columnMappings: null,
  currentRunId: null,
  currentRecoId: null,
  currentExportId: null,
  currentExportApproved: false,
  currentAuditResults: { summary: null, col_map: {}, clean: [], warnings: [], errors: [] },
};

export const useAppStore = create((set, get) => ({
  activeModule: 'books-validation',
  activeStep: 1,
  businessContext: 'Loading...',
  entities: [],
  activeEntityId: null,
  isSidebarOpen: true,

  // Instance Storage (Entity Specific)
  instances: {},

  // Active State (Mirrors the active instance)
  uploadedBooksFiles: [],
  uploaded2BFiles: [],
  selectedPeriod: '2026-01',
  selectedGSTIN: '',
  activeCompanyGSTINs: [],
  fixQueue: [],
  columnMappings: null,
  currentRunId: null,
  currentRecoId: null,
  currentExportId: null,
  currentExportApproved: false,
  currentAuditResults: { summary: null, col_map: {}, clean: [], warnings: [], errors: [] },

  setUploadedBooksFiles: (filesOrUpdater) => set((state) => {
    const files = typeof filesOrUpdater === 'function' ? filesOrUpdater(state.uploadedBooksFiles) : filesOrUpdater;
    const newState = { uploadedBooksFiles: files };
    get().syncToInstance(newState);
    return newState;
  }),

  setUploaded2BFiles: (files) => set((state) => {
    const newState = { uploaded2BFiles: files };
    get().syncToInstance(newState);
    return newState;
  }),

  setSelectedPeriod: (period) => set((state) => {
    const newState = { selectedPeriod: period };
    get().syncToInstance(newState);
    return newState;
  }),

  setSelectedGSTIN: (gstin) => set({ selectedGSTIN: gstin }),

  setColumnMappings: (mappings) => set((state) => {
    const newState = { columnMappings: mappings };
    get().syncToInstance(newState);
    return newState;
  }),

  setCurrentRunId: (runId) => set(() => {
    const newState = { currentRunId: runId };
    get().syncToInstance(newState);
    return newState;
  }),

  setCurrentRecoId: (recoId) => set(() => {
    const newState = { currentRecoId: recoId };
    get().syncToInstance(newState);
    return newState;
  }),

  setCurrentExportId: (exportId) => set(() => {
    const newState = { currentExportId: exportId };
    get().syncToInstance(newState);
    return newState;
  }),

  setCurrentExportApproved: (approved) => set(() => {
    const newState = { currentExportApproved: approved };
    get().syncToInstance(newState);
    return newState;
  }),

  setCurrentAuditResults: (results) => set((state) => {
    const nextResults = {
      summary: results?.summary || null,
      col_map: results?.col_map || {},
      clean: results?.clean || [],
      warnings: results?.warnings || [],
      errors: results?.errors || [],
    };
    const newState = { currentAuditResults: nextResults };
    get().syncToInstance(newState);
    return newState;
  }),

  addFix: (fix) => set((state) => {
    const isDuplicate = (f) => {
      if (fix.scope === 'BULK' && f.scope === 'BULK') {
        return f.field === fix.field &&
          JSON.stringify(f.match_criteria) === JSON.stringify(fix.match_criteria);
      }
      return f.scope === fix.scope &&
        f.field === fix.field &&
        JSON.stringify(f.reference_rows || []) === JSON.stringify(fix.reference_rows || []);
    };

    const existingIdx = state.fixQueue.findIndex(isDuplicate);
    let nextQueue = [...state.fixQueue];

    if (existingIdx >= 0) {
      nextQueue[existingIdx] = { ...nextQueue[existingIdx], ...fix };
    } else {
      nextQueue.push(fix);
    }

    get().syncToInstance({ fixQueue: nextQueue });
    return { fixQueue: nextQueue };
  }),

  clearFixQueue: () => set((state) => {
    get().syncToInstance({ fixQueue: [] });
    return { fixQueue: [] };
  }),

  resetPipeline: () => set(() => {
    const pipelineState = {
      uploadedBooksFiles: [],
      uploaded2BFiles: [],
      fixQueue: [],
      columnMappings: null,
      currentRunId: null,
      currentRecoId: null,
      currentExportId: null,
      currentExportApproved: false,
      currentAuditResults: { summary: null, col_map: {}, clean: [], warnings: [], errors: [] },
      activeStep: 1,
    };
    get().syncToInstance(pipelineState);
    return pipelineState;
  }),

  setActiveModule: (module) => set((state) => {
    const newState = { activeModule: module, activeStep: 1 };
    get().syncToInstance(newState);
    return newState;
  }),

  setActiveStep: (step) => set((state) => {
    const newState = { activeStep: step };
    get().syncToInstance(newState);
    return newState;
  }),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setBusinessContext: (context) => set({ businessContext: context }),

  setActiveEntity: (id) => set((state) => {
    const entity = state.entities.find(e => e.id === id);
    if (!entity) return state;

    // Persist selection for page refreshes
    localStorage.setItem('gst_active_entity_id', id);

    // 1. Save current state to current instance before switching
    const currentInstanceData = {
      activeModule: state.activeModule,
      activeStep: state.activeStep,
      uploadedBooksFiles: state.uploadedBooksFiles,
      uploaded2BFiles: state.uploaded2BFiles,
      selectedPeriod: state.selectedPeriod,
      fixQueue: state.fixQueue,
      columnMappings: state.columnMappings,
      currentRunId: state.currentRunId,
      currentRecoId: state.currentRecoId,
      currentExportId: state.currentExportId,
      currentExportApproved: state.currentExportApproved,
      currentAuditResults: state.currentAuditResults,
    };

    const nextInstances = {
      ...state.instances,
      [state.activeEntityId]: currentInstanceData
    };

    // 2. Load next instance state or defaults
    const nextInstance = state.instances[id] || { ...DEFAULT_INSTANCE_STATE };

    return {
      activeEntityId: id,
      businessContext: entity.name,
      selectedGSTIN: entity.gstin,
      activeCompanyGSTINs: entity.company_gstins || [],
      instances: nextInstances,
      // Hydrate active state from the loaded instance
      ...nextInstance
    };
  }),

  syncToInstance: (data) => set((state) => {
    if (!state.activeEntityId) return state;
    return {
      instances: {
        ...state.instances,
        [state.activeEntityId]: {
          ...(state.instances[state.activeEntityId] || { ...DEFAULT_INSTANCE_STATE }),
          ...data
        }
      }
    };
  }),

  setEntities: (entities) => set((state) => {
    if (entities.length === 0) return { entities: [] };

    // Check if there's a persisted entity ID from a previous session
    const persistedId = localStorage.getItem('gst_active_entity_id');
    const persistedEntity = persistedId ? entities.find(e => e.id === persistedId) : null;

    // If no active entity yet, pick the persisted one or the first one
    if (state.activeEntityId === null) {
      const activeEntity = persistedEntity || entities[0];
      return {
        entities,
        activeEntityId: activeEntity.id,
        businessContext: activeEntity.name,
        selectedGSTIN: activeEntity.gstin,
        activeCompanyGSTINs: activeEntity.company_gstins || [],
        // Initialize instance if missing
        instances: {
          [activeEntity.id]: state.instances[activeEntity.id] || { ...DEFAULT_INSTANCE_STATE }
        },
        ...(state.instances[activeEntity.id] || { ...DEFAULT_INSTANCE_STATE })
      };
    }

    return { entities };
  }),

  addEntity: (entity) => set((state) => ({
    entities: [...state.entities, entity],
  })),

  updateEntity: (entityId, updates) => set((state) => {
    const entities = state.entities.map((entity) =>
      entity.id === entityId ? { ...entity, ...updates } : entity
    );
    const activeEntity = entities.find((entity) => entity.id === state.activeEntityId);
    return {
      entities,
      businessContext: activeEntity?.name || state.businessContext,
      selectedGSTIN: activeEntity?.gstin || state.selectedGSTIN,
    };
  }),

  deleteEntity: (entityId) => set((state) => {
    const entities = state.entities.filter((entity) => entity.id !== entityId);
    const nextActiveEntity = state.activeEntityId === entityId ? entities[0] || null : entities.find((entity) => entity.id === state.activeEntityId);

    if (!nextActiveEntity) {
      localStorage.removeItem('gst_active_entity_id');
      return {
        entities: [],
        activeEntityId: null,
        businessContext: 'Loading...',
        selectedGSTIN: '',
        activeCompanyGSTINs: [],
        instances: {},
        ...DEFAULT_INSTANCE_STATE,
      };
    }

    localStorage.setItem('gst_active_entity_id', nextActiveEntity.id);

    return {
      entities,
      activeEntityId: nextActiveEntity.id,
      businessContext: nextActiveEntity.name,
      selectedGSTIN: nextActiveEntity.gstin,
      activeCompanyGSTINs: nextActiveEntity.company_gstins || [],
      instances: {
        ...state.instances,
        [nextActiveEntity.id]: state.instances[nextActiveEntity.id] || { ...DEFAULT_INSTANCE_STATE },
      },
      ...(state.instances[nextActiveEntity.id] || { ...DEFAULT_INSTANCE_STATE }),
    };
  }),
}))

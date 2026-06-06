import React, { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Edit2, Trash2, X, Save, Lock, MapPin, Hash, ShieldCheck, FileText } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const GST_STATE_CODES = {
  '18': 'Assam',
  '19': 'West Bengal',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '07': 'Delhi',
  '33': 'Tamil Nadu',
  '09': 'Uttar Pradesh',
  '24': 'Gujarat',
  '32': 'Kerala',
  '36': 'Telangana'
};

const extractFromGSTIN = (gstin) => {
  if (!gstin || gstin.length < 15) return { stateCode: '', stateName: 'Unknown', pan: '' };
  const stateCode = gstin.substring(0, 2);
  const pan = gstin.substring(2, 12);
  return {
    stateCode,
    stateName: GST_STATE_CODES[stateCode] || 'Unknown',
    pan
  };
};

export const EntityManagement = () => {
  const { entities, activeEntityId, setActiveEntity, addEntity, updateEntity, deleteEntity } = useAppStore();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    type: 'Branch'
  });

  const handleOpenDrawer = (entity = null) => {
    if (entity) {
      setEditingEntity(entity);
      setFormData({
        name: entity.name,
        gstin: entity.gstin,
        type: entity.type
      });
    } else {
      setEditingEntity(null);
      setFormData({
        name: '',
        gstin: '',
        type: 'Branch'
      });
    }
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setEditingEntity(null);
  };

  const handleSave = () => {
    if (!formData.name || !formData.gstin) return;

    if (editingEntity) {
      updateEntity(editingEntity.id, formData);
    } else {
      const newEntity = {
        id: Date.now().toString(), // Simple ID generation
        ...formData
      };
      addEntity(newEntity);
    }
    handleCloseDrawer();
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to remove this entity?')) {
      deleteEntity(id);
    }
  };

  const { stateName, pan } = extractFromGSTIN(formData.gstin);

  return (
    <div className="flex-1 overflow-x-hidden flex flex-col items-center p-8 bg-stone-50/30">

      {/* Hero Zone */}
      <div className="w-full max-w-5xl mb-8 relative p-8 rounded-2xl overflow-hidden border border-brand-emerald/10 bg-white shadow-sm flex items-center justify-between">
        <div className="absolute inset-0 bg-linear-to-r from-brand-forest/5 to-brand-emerald/5 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-stone-900 tracking-tight flex items-center gap-3">
            <Building2 className="w-8 h-8 text-brand-forest" strokeWidth={2.5} />
            Entity Management
          </h1>
          <p className="text-stone-500 mt-2 font-medium">Configure active workspace contexts and GST profiles</p>
        </div>
        <button
          onClick={() => handleOpenDrawer()}
          className="relative z-10 flex items-center gap-2 bg-linear-to-r from-brand-forest to-brand-emerald text-white px-5 py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" />
          <span className="font-bold">Add Entity</span>
        </button>
      </div>

      {/* Entity Grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {entities.map(entity => {
          const { stateName, pan } = extractFromGSTIN(entity.gstin);
          const isActive = entity.id === activeEntityId;

          return (
            <motion.div
              key={entity.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setActiveEntity(entity.id)}
              className={`p-6 bg-white rounded-xl cursor-pointer transition-all border-l-4 ${isActive
                  ? 'border-l-brand-emerald shadow-lg border-y-brand-emerald/10 border-r-brand-emerald/10'
                  : 'border-l-transparent shadow-sm hover:shadow-md border-y-stone-100 border-r-stone-100'
                }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${entity.type === 'Primary' ? 'bg-indigo-50 text-indigo-600' : 'bg-stone-50 text-stone-500'
                  }`}>
                  {entity.type}
                </div>
                {isActive && (
                  <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-brand-emerald/10 text-brand-forest rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Active
                  </div>
                )}
              </div>

              <h3 className="text-lg font-bold text-stone-900 leading-tight mb-2 truncate" title={entity.name}>
                {entity.name}
              </h3>

              <div className="space-y-3 mb-6 mt-4">
                <div className="flex items-center gap-2 text-stone-600">
                  <Hash className="w-4 h-4 text-stone-400" />
                  <span className="font-mono text-[13px] font-semibold">{entity.gstin}</span>
                </div>
                <div className="flex items-center gap-2 text-stone-500">
                  <FileText className="w-4 h-4 text-stone-400" />
                  <span className="text-[12px] font-medium">PAN: <span className="font-mono">{pan || '---'}</span></span>
                </div>
                <div className="flex items-center gap-2 text-stone-500">
                  <MapPin className="w-4 h-4 text-stone-400" />
                  <span className="text-[12px] font-medium">{stateName}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100">
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpenDrawer(entity); }}
                  className="p-2 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(entity.id, e)}
                  disabled={entities.length === 1}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-stone-400"
                  title={entities.length === 1 ? 'Cannot delete the only entity' : 'Delete entity'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add/Edit Drawer (P11 animation spec) */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseDrawer}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm"
              style={{ zIndex: 100 }}
            />
            <motion.div
              initial={{ x: '100%', boxShadow: '-20px 0 25px -5px rgb(0 0 0 / 0)' }}
              animate={{ x: 0, boxShadow: '-20px 0 25px -5px rgb(0 0 0 / 0.1)' }}
              exit={{ x: '100%', boxShadow: '-20px 0 25px -5px rgb(0 0 0 / 0)' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full md:w-[480px] bg-white flex flex-col border-l border-stone-200"
              style={{ zIndex: 110 }}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-6 border-b border-stone-100 bg-stone-50/50">
                <h2 className="text-xl font-bold text-stone-900 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-emerald/10 flex items-center justify-center text-brand-forest">
                    {editingEntity ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </div>
                  {editingEntity ? 'Edit Entity' : 'Add New Entity'}
                </h2>
                <button
                  onClick={handleCloseDrawer}
                  className="p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-900 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                {/* Notice */}
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[13px] font-bold text-amber-900 mb-1">Administrative Action</h4>
                    <p className="text-amber-700 text-xs">Modifying an entity's GSTIN will affect ongoing validations and multi-garden resolutions for this business context.</p>
                  </div>
                </div>

                {/* Form Elements */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-black tracking-widest text-stone-500 uppercase mb-2">
                      Entity Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Assam Gardens (Head Office)"
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-brand-emerald focus:border-brand-emerald transition-all placeholder:text-stone-300 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black tracking-widest text-stone-500 uppercase mb-2">
                      GSTIN Code
                    </label>
                    <input
                      type="text"
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                      maxLength={15}
                      placeholder="e.g. 18AABCU9602R1ZM"
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-brand-emerald focus:border-brand-emerald transition-all placeholder:text-stone-300 font-mono font-bold"
                    />

                    {/* Auto-extracted context info */}
                    {formData.gstin.length > 2 && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="p-2.5 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-stone-400 uppercase">State</span>
                          <span className="text-xs font-semibold text-stone-700">{stateName}</span>
                        </div>
                        <div className="p-2.5 rounded-md bg-stone-50 border border-stone-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-stone-400 uppercase">PAN</span>
                          <span className="text-xs font-mono font-bold text-stone-700">{pan || '...'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-black tracking-widest text-stone-500 uppercase mb-2">
                      Entity Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setFormData({ ...formData, type: 'Primary' })}
                        className={`p-3 rounded-lg border text-sm font-semibold transition-all ${formData.type === 'Primary'
                            ? 'bg-brand-emerald/10 border-brand-emerald/30 text-brand-forest ring-1 ring-brand-emerald/20'
                            : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                          }`}
                      >
                        Primary (HQ)
                      </button>
                      <button
                        onClick={() => setFormData({ ...formData, type: 'Branch' })}
                        className={`p-3 rounded-lg border text-sm font-semibold transition-all ${formData.type === 'Branch'
                            ? 'bg-brand-emerald/10 border-brand-emerald/30 text-brand-forest ring-1 ring-brand-emerald/20'
                            : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                          }`}
                      >
                        Branch Office
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-6 border-t border-stone-100 bg-white flex items-center justify-end gap-3">
                <button
                  onClick={handleCloseDrawer}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formData.name || !formData.gstin}
                  className="flex items-center gap-2 bg-linear-to-r from-brand-forest to-brand-emerald text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-md disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {editingEntity ? 'Save Changes' : 'Create Entity'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};

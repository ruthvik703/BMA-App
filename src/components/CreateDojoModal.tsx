import React, { useState, useEffect } from 'react';
import { Dojo, DojoProfileField } from '../types';
import { DEFAULT_STUDENT_PROFILE_FIELDS, PRIMARY_DOJOS } from '../dojoConfig';
import {
  X,
  Plus,
  Trash2,
  Check,
  Building2,
  Sliders,
  Sparkles,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  MapPin,
  Phone,
  Layers,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';

interface CreateDojoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDojo: (dojo: Dojo) => Promise<void> | void;
  existingDojo?: Dojo | null;
  existingDojos?: Dojo[];
  currentUserName?: string;
}

export function CreateDojoModal({
  isOpen,
  onClose,
  onSaveDojo,
  existingDojo,
  existingDojos = [],
  currentUserName = 'Admin',
}: CreateDojoModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [profileFields, setProfileFields] = useState<DojoProfileField[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Custom Field Form State
  const [showCustomFieldForm, setShowCustomFieldForm] = useState(false);
  const [customFieldLabel, setCustomFieldLabel] = useState('');
  const [customFieldType, setCustomFieldType] = useState<'text' | 'number' | 'date' | 'boolean' | 'select'>('text');
  const [customFieldOptions, setCustomFieldOptions] = useState('');
  const [customFieldRequired, setCustomFieldRequired] = useState(false);

  // Initialize or reset form values
  useEffect(() => {
    if (!isOpen) return;

    if (existingDojo) {
      setName(existingDojo.name);
      setAddress(existingDojo.address || '');
      setPhone(existingDojo.phone || '');
      
      // Merge with default fields to ensure no missing keys
      const existingFieldMap = new Map((existingDojo.customProfileFields || []).map(f => [f.id, f]));
      const merged: DojoProfileField[] = DEFAULT_STUDENT_PROFILE_FIELDS.map(def => {
        if (existingFieldMap.has(def.id)) {
          return { ...def, ...existingFieldMap.get(def.id)! };
        }
        return { ...def };
      });

      // Append any custom added fields from existing dojo
      (existingDojo.customProfileFields || []).forEach(f => {
        if (f.isCustom && !merged.some(m => m.id === f.id)) {
          merged.push(f);
        }
      });

      setProfileFields(merged);
    } else {
      setName('');
      setAddress('');
      setPhone('');
      setProfileFields(DEFAULT_STUDENT_PROFILE_FIELDS.map(f => ({ ...f })));
    }

    setErrorMessage(null);
    setShowCustomFieldForm(false);
    setCustomFieldLabel('');
    setCustomFieldType('text');
    setCustomFieldOptions('');
    setCustomFieldRequired(false);
  }, [isOpen, existingDojo]);

  if (!isOpen) return null;

  // Toggle field enabled
  const toggleFieldEnabled = (fieldId: string) => {
    if (fieldId === 'name') return; // Name is always required
    setProfileFields(prev =>
      prev.map(f => (f.id === fieldId ? { ...f, enabled: !f.enabled } : f))
    );
  };

  // Toggle field required
  const toggleFieldRequired = (fieldId: string) => {
    if (fieldId === 'name') return;
    setProfileFields(prev =>
      prev.map(f => (f.id === fieldId ? { ...f, required: !f.required } : f))
    );
  };

  // Add a brand new custom field
  const handleAddCustomField = () => {
    if (!customFieldLabel.trim()) {
      setErrorMessage('Please provide a name/label for the custom field.');
      return;
    }

    const fieldId = `custom_${customFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const options = customFieldType === 'select'
      ? customFieldOptions.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;

    if (customFieldType === 'select' && (!options || options.length === 0)) {
      setErrorMessage('Please provide comma-separated options for the select field.');
      return;
    }

    const newField: DojoProfileField = {
      id: fieldId,
      label: customFieldLabel.trim(),
      category: 'custom',
      type: customFieldType,
      options,
      enabled: true,
      required: customFieldRequired,
      isCustom: true,
    };

    setProfileFields(prev => [...prev, newField]);
    setCustomFieldLabel('');
    setCustomFieldType('text');
    setCustomFieldOptions('');
    setCustomFieldRequired(false);
    setShowCustomFieldForm(false);
    setErrorMessage(null);
  };

  // Delete a custom field
  const handleDeleteCustomField = (fieldId: string) => {
    setProfileFields(prev => prev.filter(f => f.id !== fieldId));
  };

  // Preset handlers
  const handleEnableAll = () => {
    setProfileFields(prev => prev.map(f => ({ ...f, enabled: true })));
  };

  const handleMinimalPreset = () => {
    setProfileFields(prev =>
      prev.map(f => {
        if (['name', 'programs', 'rankings'].includes(f.id)) {
          return { ...f, enabled: true, required: true };
        }
        return { ...f, enabled: false };
      })
    );
  };

  const handleResetDefaults = () => {
    setProfileFields(DEFAULT_STUDENT_PROFILE_FIELDS.map(f => ({ ...f })));
  };

  // Save Dojo
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Program name cannot be empty.');
      return;
    }

    // Check duplicate name against primary dojos
    if (PRIMARY_DOJOS.some(p => p.toLowerCase() === trimmedName.toLowerCase())) {
      setErrorMessage(`"${trimmedName}" is one of the three primary default locations. Please choose a different name.`);
      return;
    }

    // Check duplicate name against other custom dojos
    const duplicate = existingDojos.find(
      d => d.name.toLowerCase() === trimmedName.toLowerCase() && d.id !== existingDojo?.id
    );
    if (duplicate) {
      setErrorMessage(`A program with the name "${trimmedName}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const dojoId = existingDojo?.id || `dojo_${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
      const payload: Dojo = {
        id: dojoId,
        name: trimmedName,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        customProfileFields: profileFields,
        createdAt: existingDojo?.createdAt || new Date().toISOString(),
        createdBy: existingDojo?.createdBy || currentUserName,
      };

      await onSaveDojo(payload);
      onClose();
    } catch (err: any) {
      console.error('Failed to save program:', err);
      setErrorMessage(err.message || 'Failed to save program. Please check permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  const standardFields = profileFields.filter(f => !f.isCustom);
  const customFields = profileFields.filter(f => f.isCustom);
  const enabledCount = profileFields.filter(f => f.enabled).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/30 flex items-center justify-center text-red-500 shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                {existingDojo ? 'Edit Program' : 'Create New Program'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Configure program details, location info, and customize student profile fields.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-6 space-y-6 scrollbar-thin">
          {errorMessage && (
            <div className="p-3.5 bg-red-950/40 border border-red-600/40 rounded-xl flex items-start gap-3 text-red-200 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Program Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2 border-b border-zinc-800 pb-2">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Program General Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Program Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mason Program, Fairfield Satellite, After-School Martial Arts"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-red-600 rounded-xl text-sm text-white placeholder-zinc-500 outline-none font-medium transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Address / Facility Details (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 7420 Kingsgate Way, Mason, OH"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-red-600 rounded-xl text-sm text-white placeholder-zinc-500 outline-none font-medium transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Contact Phone (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. (513) 555-0199"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-red-600 rounded-xl text-sm text-white placeholder-zinc-500 outline-none font-medium transition"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Customizable Student Profile Fields */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2">
              <div>
                <h3 className="text-xs font-black text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-amber-500" />
                  Student Profile Available Fields
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Select which fields should be visible when creating or editing a student in this program.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                  {enabledCount} of {profileFields.length} Active
                </span>
                <button
                  type="button"
                  onClick={handleEnableAll}
                  className="text-[10px] uppercase font-bold text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 cursor-pointer transition"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleMinimalPreset}
                  className="text-[10px] uppercase font-bold text-zinc-400 hover:text-white px-2 py-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 cursor-pointer transition"
                >
                  Minimal
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-[10px] uppercase font-bold text-zinc-400 hover:text-white p-1 bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-800 cursor-pointer transition"
                  title="Reset to default template"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Standard Profile Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {standardFields.map(field => {
                const isLocked = field.id === 'name';
                return (
                  <div
                    key={field.id}
                    onClick={() => !isLocked && toggleFieldEnabled(field.id)}
                    className={`p-3 rounded-xl border transition-all select-none flex items-center justify-between gap-3 ${
                      field.enabled
                        ? 'bg-zinc-900/90 border-zinc-700/80 shadow-sm'
                        : 'bg-zinc-950/40 border-zinc-800/60 opacity-60'
                    } ${!isLocked ? 'cursor-pointer hover:border-zinc-600' : 'cursor-default'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          field.enabled
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-zinc-900 border-zinc-800 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-zinc-200 truncate">
                          {field.label}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {field.category ? field.category.toUpperCase() : 'STANDARD'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {isLocked ? (
                        <span className="px-2 py-0.5 rounded bg-red-950/60 border border-red-700/40 text-[9.5px] font-mono text-red-400 font-bold uppercase">
                          Permanent
                        </span>
                      ) : (
                        field.enabled && (
                          <button
                            type="button"
                            onClick={() => toggleFieldRequired(field.id)}
                            className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase transition ${
                              field.required
                                ? 'bg-amber-950/60 border border-amber-600/50 text-amber-300'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700'
                            }`}
                            title="Toggle required status"
                          >
                            {field.required ? 'Required' : 'Optional'}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom Extra Fields List */}
            {customFields.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Program Custom Attributes ({customFields.length})
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {customFields.map(field => (
                    <div
                      key={field.id}
                      className="p-3 rounded-xl border bg-amber-950/10 border-amber-900/30 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleFieldEnabled(field.id)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                            field.enabled
                              ? 'bg-amber-600 border-amber-500 text-white'
                              : 'bg-zinc-900 border-zinc-800 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-zinc-100 truncate">
                            {field.label}
                          </span>
                          <span className="text-[10px] text-amber-400/80 font-mono">
                            Type: {field.type?.toUpperCase() || 'TEXT'}
                            {field.options && ` (${field.options.length} options)`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleFieldRequired(field.id)}
                          className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase transition ${
                            field.required
                              ? 'bg-amber-950/60 border border-amber-600/50 text-amber-300'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          {field.required ? 'Req' : 'Opt'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomField(field.id)}
                          className="p-1 hover:text-red-400 text-zinc-500 transition rounded hover:bg-zinc-800"
                          title="Delete custom field"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Field Sub-builder */}
            {!showCustomFieldForm ? (
              <button
                type="button"
                onClick={() => setShowCustomFieldForm(true)}
                className="w-full py-2.5 px-4 border border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-500" />
                Add Custom Profile Attribute
              </button>
            ) : (
              <div className="p-4 bg-zinc-900/90 border border-amber-500/30 rounded-xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    New Custom Field Definition
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowCustomFieldForm(false)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Field Name / Label
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Emergency Contact, T-Shirt Size"
                      value={customFieldLabel}
                      onChange={e => setCustomFieldLabel(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Field Input Type
                    </label>
                    <select
                      value={customFieldType}
                      onChange={e => setCustomFieldType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value="text">Text Box</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Yes/No Checkbox</option>
                      <option value="select">Dropdown Select</option>
                    </select>
                  </div>

                  {customFieldType === 'select' && (
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Dropdown Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Small, Medium, Large, X-Large"
                        value={customFieldOptions}
                        onChange={e => setCustomFieldOptions(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 outline-none focus:border-amber-500"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2 flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-300">
                      <input
                        type="checkbox"
                        checked={customFieldRequired}
                        onChange={e => setCustomFieldRequired(e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                      />
                      Make field required on profile creation
                    </label>

                    <button
                      type="button"
                      onClick={handleAddCustomField}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-lg transition"
                    >
                      Add Field
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900 font-bold text-xs uppercase tracking-wider transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-950/50 transition flex items-center gap-2"
            >
              {isSaving ? (
                <>Saving Program...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {existingDojo ? 'Save Program Changes' : 'Create Program'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

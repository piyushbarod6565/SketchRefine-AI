import React from 'react';
import { 
  Layers, 
  Plus, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  ChevronUp, 
  ChevronDown,
  Edit2
} from 'lucide-react';
import { LayerData } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LayerPanelProps {
  layers: LayerData[];
  activeLayerId: string;
  onAddLayer: () => void;
  onRemoveLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onRenameLayer: (id: string, name: string) => void;
  onSelectLayer: (id: string) => void;
  onReorderLayers: (startIndex: number, endIndex: number) => void;
}

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  activeLayerId,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onToggleLock,
  onOpacityChange,
  onRenameLayer,
  onSelectLayer,
  onReorderLayers
}) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState('');

  const startEditing = (layer: LayerData) => {
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      onRenameLayer(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden flex flex-col h-full transition-colors duration-300">
      <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gray-50/50 dark:bg-white/5">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <Layers size={18} className="text-indigo-600 dark:text-indigo-400" />
          Layers
        </h3>
        <button 
          onClick={onAddLayer}
          className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          title="Add Layer"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <AnimatePresence initial={false}>
          {[...layers].reverse().map((layer, index) => {
            const actualIndex = layers.length - 1 - index;
            const isActive = layer.id === activeLayerId;

            return (
              <motion.div
                key={layer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group p-2 rounded-2xl border transition-all ${
                  isActive 
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500/50 shadow-sm' 
                    : 'bg-white dark:bg-slate-800/50 border-black/5 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10'
                }`}
                onClick={() => onSelectLayer(layer.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onReorderLayers(actualIndex, actualIndex + 1); }}
                      disabled={actualIndex === layers.length - 1}
                      className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onReorderLayers(actualIndex, actualIndex - 1); }}
                      disabled={actualIndex === 0}
                      className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingId === layer.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                        className="w-full text-sm font-medium bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-500 rounded px-1 outline-none text-gray-900 dark:text-white"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className={`text-sm font-medium truncate ${isActive ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-700 dark:text-gray-300'}`}>
                          {layer.name}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); startEditing(layer); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-opacity"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        layer.visible ? 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10' : 'text-red-500 bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        layer.locked ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveLayer(layer.id); }}
                      disabled={layers.length <= 1}
                      className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 px-1 flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium w-6">Op:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={layer.opacity}
                    onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 h-1 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono w-8 text-right">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LayerPanel;

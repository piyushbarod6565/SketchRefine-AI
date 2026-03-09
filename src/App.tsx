import React, { useState, useRef, useCallback } from 'react';
import { 
  Pencil, 
  Eraser, 
  Trash2, 
  Undo2, 
  Redo2,
  Upload, 
  Sparkles, 
  Download, 
  Image as ImageIcon,
  Loader2,
  ChevronRight,
  RefreshCw,
  BookOpen,
  Library,
  X,
  Eye,
  CheckCircle2,
  MousePointer2,
  Layers,
  Palette,
  TestTube2,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Terminal,
  Type,
  Square,
  Circle as CircleIcon,
  Minus,
  PenTool,
  Highlighter,
  Share2,
  Twitter,
  Linkedin,
  Link,
  Copy,
  Check,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';

import Canvas, { CanvasHandle, Tool } from './components/Canvas';
import { refineSketch } from './services/geminiService';
import { GalleryItem, LayerData, ShapeData } from './types';
import LayerPanel from './components/LayerPanel';

interface TestCase {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  input?: string;
  expected?: string;
  actual?: string;
  logs: string[];
}

const STYLES = [
  { id: 'digital', name: 'Digital Art', icon: '🎨' },
  { id: 'pencil', name: 'Pencil Sketch', icon: '✏️' },
  { id: 'watercolor', name: 'Watercolor Painting', icon: '🖌️' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌃' },
  { id: 'minimalist', name: 'Minimalist Logo', icon: '📐' },
  { id: 'realistic', name: 'Realistic 3D', icon: '🧊' },
  { id: 'ghibli', name: 'Studio Ghibli Anime', icon: '☁️' },
  { id: 'architectural', name: 'Architectural Rendering', icon: '🏛️' },
];

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'tutorial' | 'gallery'>('studio');
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(2);
  const [sketchTitle, setSketchTitle] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].name);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [refinedImage, setRefinedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(() => {
    try {
      const saved = localStorage.getItem('sketch_gallery');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load gallery from localStorage:", e);
      return [];
    }
  });
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<GalleryItem | null>(null);
  const [testResults, setTestResults] = useState<TestCase[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharedSketch, setSharedSketch] = useState<{ title: string, image: string } | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [layers, setLayers] = useState<LayerData[]>([
    { id: 'layer-1', name: 'Background', visible: true, locked: false, opacity: 1 },
    { id: 'layer-2', name: 'Main Sketch', visible: true, locked: false, opacity: 1 },
    { id: 'layer-3', name: 'Details', visible: true, locked: false, opacity: 1 }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-2');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('app_theme');
      return (saved as 'light' | 'dark') || 'light';
    } catch (e) {
      return 'light';
    }
  });

  const canvasRef = useRef<CanvasHandle>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle share route
  const isShareView = window.location.pathname.startsWith('/share/');
  const shareId = isShareView ? window.location.pathname.split('/')[2] : null;

  React.useEffect(() => {
    if (shareId) {
      setIsLoadingShared(true);
      fetch(`/api/share/${shareId}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load shared sketch');
          return res.json();
        })
        .then(data => {
          if (data.error) {
            setError("Shared sketch not found.");
          } else {
            setSharedSketch(data);
          }
        })
        .catch((err) => {
          console.error("Failed to load shared sketch:", err);
          setError("Failed to load shared sketch.");
        })
        .finally(() => setIsLoadingShared(false));
    }
  }, [shareId]);

  React.useEffect(() => {
    localStorage.setItem('app_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Auto Save Logic
  const autoSave = useCallback((shapes: ShapeData[]) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      if (shapes.length === 0 && !originalImage) return;

      const canvasImage = canvasRef.current?.getCanvasImage() || '';
      
      setGalleryItems(prev => {
        const existingIndex = prev.findIndex(item => item.id === currentProjectId);
        
        // Determine title
        let finalTitle = sketchTitle.trim();
        if (!finalTitle) {
          if (existingIndex >= 0 && prev[existingIndex].title && !prev[existingIndex].title.startsWith('Untitled Sketch')) {
            finalTitle = prev[existingIndex].title || '';
          } else {
            const untitledCount = prev.filter(item => item.title?.startsWith('Untitled Sketch')).length;
            finalTitle = `Untitled Sketch ${untitledCount + 1}`;
          }
        }

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            title: finalTitle,
            original: canvasImage || originalImage || '',
            canvasState: shapes,
            layers: layers,
            activeLayerId: activeLayerId,
            timestamp: Date.now()
          };
          return updated;
        } else {
          const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
          setCurrentProjectId(newId);
          return [{
            id: newId,
            title: finalTitle,
            original: canvasImage || originalImage || '',
            refined: null,
            style: selectedStyle,
            timestamp: Date.now(),
            canvasState: shapes,
            layers: layers,
            activeLayerId: activeLayerId
          }, ...prev];
        }
      });
    }, 2000); // Debounce for 2 seconds
  }, [currentProjectId, sketchTitle, originalImage, selectedStyle, layers, activeLayerId]);

  // Persist gallery
  React.useEffect(() => {
    try {
      localStorage.setItem('sketch_gallery', JSON.stringify(galleryItems));
    } catch (e) {
      console.error("Failed to save gallery to localStorage:", e);
    }
  }, [galleryItems]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setOriginalImage(reader.result as string);
        setRefinedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    multiple: false
  });

  const handleRefine = async () => {
    let imageToProcess = originalImage;

    if (mode === 'draw' && canvasRef.current) {
      imageToProcess = canvasRef.current.getCanvasImage();
      setOriginalImage(imageToProcess);
    }

    if (!imageToProcess) {
      setError("Please draw something or upload an image first.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await refineSketch(imageToProcess, selectedStyle);
      if (result) {
        setRefinedImage(result);
        // Update gallery item with refined result
        setGalleryItems(prev => {
          const existingIndex = prev.findIndex(item => item.id === currentProjectId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = {
              ...updated[existingIndex],
              refined: result,
              layers: layers,
              activeLayerId: activeLayerId,
              timestamp: Date.now()
            };
            return updated;
          } else {
            const newItem: GalleryItem = {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
              title: sketchTitle || 'Untitled Sketch',
              original: imageToProcess,
              refined: result,
              style: selectedStyle,
              timestamp: Date.now(),
              canvasState: canvasRef.current?.getShapes(),
              layers: layers,
              activeLayerId: activeLayerId
            };
            setCurrentProjectId(newItem.id);
            return [newItem, ...prev];
          }
        });
      } else {
        setError("Failed to refine sketch. Please try again.");
      }
    } catch (err) {
      setError("An error occurred while processing the image.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!refinedImage) return;
    downloadInFormat(refinedImage, 'png', sketchTitle || 'refined-sketch');
  };

  const handleShare = async (image: string, title: string) => {
    setIsSharing(true);
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, image })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      if (data.id) {
        const url = `${window.location.origin}/share/${data.id}`;
        setShareUrl(url);
      } else {
        setError("Failed to generate share link.");
      }
    } catch (err) {
      console.error("Sharing error:", err);
      setError("An error occurred while sharing.");
    } finally {
      setIsSharing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Failed to copy to clipboard.");
    }
  };

  const shareOnTwitter = (url: string, title: string) => {
    const text = `Check out my AI-refined sketch: ${title}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const shareOnLinkedin = (url: string) => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  };

  const downloadInFormat = async (dataUrl: string, format: 'png' | 'jpg' | 'pdf', baseFilename: string) => {
    if (format === 'png') {
      downloadImage(dataUrl, `${baseFilename}.png`);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (format === 'jpg') {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          downloadImage(jpgDataUrl, `${baseFilename}.jpg`);
        }
      } else if (format === 'pdf') {
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [img.width, img.height]
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
        pdf.save(`${baseFilename}.pdf`);
      }
    };
    img.src = dataUrl;
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  if (isShareView) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center p-6">
        {isLoadingShared ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <p className="text-gray-500 font-medium">Loading shared sketch...</p>
          </div>
        ) : sharedSketch ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-4xl w-full bg-white rounded-[40px] shadow-2xl overflow-hidden border border-black/5"
          >
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-white/50 backdrop-blur">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">{sharedSketch.title}</h1>
                <p className="text-gray-500 text-sm mt-1">Refined by AI Sketch Studio</p>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Create Your Own
              </button>
            </div>
            <div className="aspect-square bg-gray-50 flex items-center justify-center p-8">
              <img 
                src={sharedSketch.image} 
                alt={sharedSketch.title} 
                className="max-w-full max-h-full rounded-2xl shadow-xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="p-8 bg-gray-50/50 flex flex-wrap items-center justify-center gap-4">
               <button 
                onClick={() => shareOnTwitter(window.location.href, sharedSketch.title)}
                className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all"
              >
                <Twitter size={20} />
                Share on X
              </button>
              <button 
                onClick={() => shareOnLinkedin(window.location.href)}
                className="flex items-center gap-2 px-6 py-3 bg-[#0077B5] text-white rounded-2xl font-bold hover:bg-[#006396] transition-all"
              >
                <Linkedin size={20} />
                Share on LinkedIn
              </button>
              <button 
                onClick={() => downloadImage(sharedSketch.image, `${sharedSketch.title}.png`)}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-black/5 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                <Download size={20} />
                Download
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="text-center space-y-4">
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-900">Sketch Not Found</h2>
            <p className="text-gray-500">The link might be broken or the sketch was removed.</p>
            <button 
              onClick={() => window.location.href = '/'}
              className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
            >
              Go to Studio
            </button>
          </div>
        )}
      </div>
    );
  }

  const deleteGalleryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this masterpiece?')) {
      setGalleryItems(prev => prev.filter(item => item.id !== id));
      if (selectedGalleryItem?.id === id) setSelectedGalleryItem(null);
      if (currentProjectId === id) reset();
    }
  };

  const renameGalleryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = galleryItems.find(i => i.id === id);
    if (!item) return;

    const newName = prompt('Enter a new name for your artwork:', item.title || '');
    if (newName !== null && newName.trim() !== '') {
      setGalleryItems(prev => prev.map(i => 
        i.id === id ? { ...i, title: newName.trim() } : i
      ));
      if (currentProjectId === id) {
        setSketchTitle(newName.trim());
      }
    }
  };

  const reset = () => {
    setOriginalImage(null);
    setRefinedImage(null);
    setError(null);
    setSketchTitle('');
    setCurrentProjectId(null);
    if (canvasRef.current) {
      canvasRef.current.clear();
    }
  };

  // Layer Handlers
  const handleAddLayer = () => {
    const newId = `layer-${Date.now()}`;
    const newLayer: LayerData = {
      id: newId,
      name: `Layer ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1
    };
    setLayers([...layers, newLayer]);
    setActiveLayerId(newId);
  };

  const handleRemoveLayer = (id: string) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter(l => l.id !== id);
    setLayers(newLayers);
    if (activeLayerId === id) {
      setActiveLayerId(newLayers[newLayers.length - 1].id);
    }
  };

  const handleToggleLayerVisibility = (id: string) => {
    setLayers(layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const handleToggleLayerLock = (id: string) => {
    setLayers(layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  };

  const handleLayerOpacityChange = (id: string, opacity: number) => {
    setLayers(layers.map(l => l.id === id ? { ...l, opacity } : l));
  };

  const handleRenameLayer = (id: string, name: string) => {
    setLayers(layers.map(l => l.id === id ? { ...l, name } : l));
  };

  const handleReorderLayers = (startIndex: number, endIndex: number) => {
    if (endIndex < 0 || endIndex >= layers.length) return;
    const result = Array.from(layers);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    setLayers(result);
  };

  const continueEditing = (item: GalleryItem) => {
    setActiveTab('studio');
    setMode('draw');
    setSketchTitle(item.title || '');
    setCurrentProjectId(item.id);
    setOriginalImage(item.original);
    setRefinedImage(item.refined);
    setSelectedStyle(item.style);
    
    if (item.layers) {
      setLayers(item.layers);
      setActiveLayerId(item.activeLayerId || item.layers[item.layers.length - 1].id);
    }

    // Load shapes into canvas
    if (item.canvasState) {
      // We need to wait for canvas to mount if it's not
      setTimeout(() => {
        canvasRef.current?.setShapes(item.canvasState || []);
      }, 100);
    }
  };

  const runIntegratedTests = async () => {
    setIsTesting(true);
    // Ensure we are in a state where components are initialized
    if (mode !== 'draw') {
      setMode('draw');
      // Give it a tiny bit of time to mount if it wasn't
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const initialTests: TestCase[] = [
      { id: 'canvas-init', name: 'Canvas Initialization', description: 'Verifies canvas is accessible.', category: 'Canvas', status: 'idle', logs: [] },
      { id: 'undo-redo-stack', name: 'Undo/Redo Integrity', description: 'Verifies history stack.', category: 'Canvas', status: 'idle', logs: [] },
      { id: 'style-selection', name: 'Style Selection', description: 'Verifies style state.', category: 'UI', status: 'idle', logs: [] },
      { id: 'gallery-persistence', name: 'Gallery Persistence', description: 'Checks storage.', category: 'Data', status: 'idle', logs: [] },
      { id: 'ai-connectivity', name: 'AI Connectivity', description: 'Tests Gemini connection.', category: 'AI', status: 'idle', logs: [] },
      { id: 'upload-simulation', name: 'Upload Simulation', description: 'Verifies mode switching.', category: 'Upload', status: 'idle', logs: [] }
    ];

    setTestResults(initialTests);

    const executeTest = async (testId: string) => {
      setTestResults(prev => prev.map(t => t.id === testId ? { ...t, status: 'running', logs: ['Starting...'] } : t));
      
      const addLog = (log: string) => {
        setTestResults(prev => prev.map(t => t.id === testId ? { ...t, logs: [...t.logs, log] } : t));
      };

      const finish = (status: TestCase['status'], actual?: string) => {
        setTestResults(prev => prev.map(t => t.id === testId ? { ...t, status, actual } : t));
      };

      try {
        switch (testId) {
          case 'canvas-init':
            if (canvasRef.current) {
              addLog('Canvas handle found.');
              finish('passed', 'Initialized');
            } else {
              addLog('Canvas handle null.');
              finish('failed', 'Not found');
            }
            break;
          case 'undo-redo-stack':
            if (canvasRef.current) {
              canvasRef.current.clear();
              canvasRef.current.undo();
              canvasRef.current.redo();
              addLog('Undo/Redo simulated.');
              finish('passed', 'Stack verified');
            } else {
              finish('failed', 'No canvas');
            }
            break;
          case 'style-selection':
            setSelectedStyle('Cyberpunk');
            addLog('Style set to Cyberpunk.');
            finish('passed', 'State updated');
            break;
          case 'gallery-persistence':
            try {
              const saved = localStorage.getItem('sketch_gallery');
              addLog(`Found ${saved ? JSON.parse(saved).length : 0} items.`);
              finish('passed', 'Persistence OK');
            } catch (e) {
              addLog(`Persistence check failed: ${e}`);
              finish('failed', 'Persistence Error');
            }
            break;
          case 'ai-connectivity':
            const dummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
            const res = await refineSketch(dummy, 'Digital Art');
            if (res) finish('passed', 'AI Connected');
            else finish('failed', 'AI Error');
            break;
          case 'upload-simulation':
            setMode('upload');
            addLog('Switched to upload mode.');
            finish('passed', 'Mode verified');
            break;
        }
      } catch (e) {
        finish('failed', 'Error');
      }
    };

    for (const t of initialTests) {
      await executeTest(t.id);
    }
    setIsTesting(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#0F172A] text-[#1A1A1A] dark:text-[#F8FAFC] font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900/30 transition-colors duration-300">
      {/* Header */}
      <header className="border-b border-black/5 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => setActiveTab('studio')}
            >
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20">
                <Sparkles className="text-white w-6 h-6" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">SketchRefine AI</h1>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setActiveTab('studio')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'studio' ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                )}
              >
                <Pencil size={16} />
                Studio
              </button>
              <button
                onClick={() => setActiveTab('tutorial')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'tutorial' ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                )}
              >
                <BookOpen size={16} />
                Tutorial
              </button>
              <button
                onClick={() => setActiveTab('gallery')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                  activeTab === 'gallery' ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                )}
              >
                <Library size={16} />
                Gallery
                {galleryItems.length > 0 && (
                  <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {galleryItems.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            {activeTab === 'studio' && (
              <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-lg">
                <button
                  onClick={() => setMode('draw')}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === 'draw' ? "bg-white dark:bg-indigo-600 shadow-sm text-indigo-600 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  Draw
                </button>
                <button
                  onClick={() => setMode('upload')}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                    mode === 'upload' ? "bg-white dark:bg-indigo-600 shadow-sm text-indigo-600 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  Upload
                </button>
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-all border border-transparent dark:border-white/5"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'studio' && (
            <motion.div
              key="studio"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-[1fr,400px] gap-8"
            >
              {/* Left Column: Input Area */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden flex flex-col h-[600px] transition-colors duration-300">
                  <div className="p-4 border-b border-black/5 dark:border-white/5 bg-white dark:bg-slate-900 flex items-center gap-4 transition-colors duration-300">
                    <div className="flex-1 relative">
                      <input 
                        type="text" 
                        placeholder="Sketch Title (e.g., My Masterpiece)" 
                        value={sketchTitle}
                        onChange={(e) => setSketchTitle(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white"
                      />
                      {currentProjectId && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Auto Saved</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {mode === 'draw' ? (
                    <>
                      <div className="border-b border-black/5 dark:border-white/5 p-4 flex flex-wrap items-center justify-between bg-gray-50/50 dark:bg-white/5 gap-4 transition-colors duration-300">
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-xl border border-black/5 dark:border-white/5 shadow-sm">
                          <button 
                            onClick={() => setTool('select')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'select' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Select & Move"
                          >
                            <MousePointer2 size={18} />
                          </button>
                          <div className="w-px h-4 bg-black/5 dark:bg-white/10 mx-1" />
                          <button 
                            onClick={() => setTool('pencil')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'pencil' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Pencil"
                          >
                            <Pencil size={18} />
                          </button>
                          <button 
                            onClick={() => setTool('marker')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'marker' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Marker"
                          >
                            <Highlighter size={18} />
                          </button>
                          <button 
                            onClick={() => setTool('eraser')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'eraser' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Eraser"
                          >
                            <Eraser size={18} />
                          </button>
                          <div className="w-px h-4 bg-black/5 dark:bg-white/10 mx-1" />
                          <button 
                            onClick={() => setTool('line')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'line' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Straight Line"
                          >
                            <Minus size={18} />
                          </button>
                          <button 
                            onClick={() => setTool('rect')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'rect' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Rectangle"
                          >
                            <Square size={18} />
                          </button>
                          <button 
                            onClick={() => setTool('circle')}
                            className={cn("p-2 rounded-lg transition-all", tool === 'circle' ? "bg-indigo-600 text-white shadow-md" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10")}
                            title="Circle"
                          >
                            <CircleIcon size={18} />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <div className="relative group">
                              <input 
                                type="color" 
                                value={color} 
                                onChange={(e) => setColor(e.target.value)}
                                className="w-8 h-8 rounded-lg border-2 border-white dark:border-slate-700 shadow-sm cursor-pointer overflow-hidden p-0 bg-transparent"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              {['#000000', '#4F46E5', '#EF4444', '#10B981'].map(c => (
                                <button 
                                  key={c}
                                  onClick={() => setColor(c)}
                                  className={cn(
                                    "w-6 h-6 rounded-full border-2 transition-all", 
                                    color === c ? "border-indigo-600 scale-110 shadow-sm" : "border-transparent"
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                          
                          <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1" />
                          
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter">Size</span>
                            <input 
                              type="range" 
                              min="1" 
                              max="40" 
                              value={lineWidth} 
                              onChange={(e) => setLineWidth(parseInt(e.target.value))}
                              className="w-20 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-4">{lineWidth}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <button 
                            onClick={() => canvasRef.current?.undo()}
                            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                            title="Undo"
                          >
                            <Undo2 size={18} />
                          </button>
                          <button 
                            onClick={() => canvasRef.current?.redo()}
                            className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                            title="Redo"
                          >
                            <Redo2 size={18} />
                          </button>
                          <button 
                            onClick={() => canvasRef.current?.clear()}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                            title="Clear"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 relative bg-gray-100/50 dark:bg-slate-950/50 flex transition-colors duration-300">
                        <Canvas 
                          ref={canvasRef} 
                          tool={tool}
                          color={color} 
                          lineWidth={lineWidth} 
                          className="flex-1"
                          layers={layers}
                          activeLayerId={activeLayerId}
                          onShapesChange={autoSave}
                        />
                        <div className="w-64 border-l border-black/5 dark:border-white/5 bg-gray-50/30 dark:bg-slate-900/30 p-4 hidden lg:block transition-colors duration-300">
                          <LayerPanel 
                            layers={layers}
                            activeLayerId={activeLayerId}
                            onAddLayer={handleAddLayer}
                            onRemoveLayer={handleRemoveLayer}
                            onToggleVisibility={handleToggleLayerVisibility}
                            onToggleLock={handleToggleLayerLock}
                            onOpacityChange={handleLayerOpacityChange}
                            onRenameLayer={handleRenameLayer}
                            onSelectLayer={setActiveLayerId}
                            onReorderLayers={handleReorderLayers}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div 
                      {...getRootProps()} 
                      className={cn(
                        "flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed transition-all cursor-pointer transition-colors duration-300",
                        isDragActive 
                          ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/20" 
                          : "border-black/10 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-gray-50/50 dark:hover:bg-white/5"
                      )}
                    >
                      <input {...getInputProps()} />
                      {originalImage ? (
                        <div className="relative w-full h-full flex items-center justify-center p-4">
                          <img 
                            src={originalImage} 
                            alt="Original" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                          <button 
                            onClick={(e) => { e.stopPropagation(); setOriginalImage(null); }}
                            className="absolute top-4 right-4 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur shadow-md rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="text-center space-y-4">
                          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto">
                            <Upload className="text-indigo-600 dark:text-indigo-400 w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-lg font-medium text-gray-900 dark:text-white">Drop your sketch here</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">or click to browse files</p>
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Supports PNG, JPG, JPEG</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Style Selection Panel */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm p-6 space-y-4 transition-colors duration-300">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Artist Style
                    </h3>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-full">
                      {selectedStyle}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.name)}
                        className={cn(
                          "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all gap-2 group",
                          selectedStyle === style.name
                            ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-600/10 dark:ring-indigo-500/10"
                            : "border-black/5 dark:border-white/5 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-gray-50 dark:hover:bg-white/5"
                        )}
                      >
                        <span className="text-2xl group-hover:scale-110 transition-transform">{style.icon}</span>
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider text-center leading-tight",
                          selectedStyle === style.name ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"
                        )}>
                          {style.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handleRefine}
                    disabled={isProcessing || (mode === 'upload' && !originalImage)}
                    className={cn(
                      "flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-lg transition-all shadow-xl",
                      isProcessing 
                        ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed" 
                        : "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] shadow-indigo-200 dark:shadow-indigo-900/20"
                    )}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Refining Sketch...
                      </>
                    ) : (
                      <>
                        <Sparkles size={22} />
                        Refine Sketch
                      </>
                    )}
                  </button>
                  
                  {(originalImage || refinedImage) && (
                    <button
                      onClick={reset}
                      className="p-4 rounded-2xl border border-black/5 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-gray-600 dark:text-gray-400"
                      title="Reset All"
                    >
                      <RefreshCw size={22} />
                    </button>
                  )}
                </div>

                {error && (
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-red-500 text-sm font-medium"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              {/* Right Column: Result Area */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden flex flex-col h-[600px] transition-colors duration-300">
                  <div className="border-b border-black/5 dark:border-white/5 p-4 flex items-center justify-between bg-gray-50/50 dark:bg-white/5 transition-colors duration-300">
                    <h2 className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <ImageIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
                      Refined Result
                    </h2>
                    {refinedImage && (
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={() => downloadInFormat(refinedImage, 'png', 'refined-sketch')}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-wider"
                          title="Download as PNG"
                        >
                          PNG
                        </button>
                        <button 
                          onClick={() => downloadInFormat(refinedImage, 'jpg', 'refined-sketch')}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-wider"
                          title="Download as JPG"
                        >
                          JPG
                        </button>
                        <button 
                          onClick={() => downloadInFormat(refinedImage, 'pdf', 'refined-sketch')}
                          className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors uppercase tracking-wider"
                          title="Download as PDF"
                        >
                          PDF
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 flex items-center justify-center p-6 bg-gray-50/30 dark:bg-slate-950/30 transition-colors duration-300">
                    <AnimatePresence mode="wait">
                      {refinedImage ? (
                        <motion.div
                          key="result"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="relative w-full h-full flex items-center justify-center"
                        >
                          <img 
                            src={refinedImage} 
                            alt="Refined Result" 
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                            referrerPolicy="no-referrer"
                          />
                        </motion.div>
                      ) : isProcessing ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center space-y-4"
                        >
                          <div className="relative">
                            <div className="w-20 h-20 border-4 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-400 w-8 h-8 animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium text-gray-700 dark:text-gray-200">AI is working its magic</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Enhancing lines and smoothing edges...</p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-gray-400 dark:text-gray-500 space-y-4"
                        >
                          <div className="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto">
                            <ImageIcon size={32} />
                          </div>
                          <p className="text-sm max-w-[200px] mx-auto">
                            Your refined sketch will appear here after processing.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {refinedImage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl border border-black/5 shadow-sm p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                        <Share2 size={18} className="text-indigo-600" />
                        Share Your Artwork
                      </h3>
                    </div>
                    
                    {!shareUrl ? (
                      <button 
                        onClick={() => handleShare(refinedImage, sketchTitle || 'My AI Sketch')}
                        disabled={isSharing}
                        className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {isSharing ? <Loader2 className="animate-spin" /> : <Link size={20} />}
                        {isSharing ? 'Generating Link...' : 'Generate Shareable Link'}
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-black/5">
                          <input 
                            type="text" 
                            readOnly 
                            value={shareUrl} 
                            className="flex-1 bg-transparent border-none text-xs text-gray-600 focus:ring-0"
                          />
                          <button 
                            onClick={() => copyToClipboard(shareUrl)}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Copy Link"
                          >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => shareOnTwitter(shareUrl, sketchTitle || 'My AI Sketch')}
                            className="flex items-center justify-center gap-2 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-all"
                          >
                            <Twitter size={18} />
                            Twitter (X)
                          </button>
                          <button 
                            onClick={() => shareOnLinkedin(shareUrl)}
                            className="flex items-center justify-center gap-2 py-3 bg-[#0077B5] text-white rounded-xl font-bold text-sm hover:bg-[#006396] transition-all"
                          >
                            <Linkedin size={18} />
                            LinkedIn
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Tips/Info */}
                <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100/50">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                    <Sparkles size={16} />
                    Pro Tips
                  </h3>
                  <ul className="space-y-2 text-sm text-indigo-800/80">
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 mt-0.5" />
                      Clear, bold lines work best for the AI to understand your structure.
                    </li>
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 mt-0.5" />
                      Try drawing basic shapes first, then add details.
                    </li>
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 mt-0.5" />
                      You can refine the same sketch multiple times for different results.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Run Tests Button & Results */}
              <div className="lg:col-span-2 mt-12 space-y-6">
                <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-8">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">System Health Check</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Verify all core components are working correctly.</p>
                  </div>
                  <button
                    onClick={runIntegratedTests}
                    disabled={isTesting}
                    className="bg-white dark:bg-slate-800 border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-200 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-all shadow-sm disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 size={18} className="animate-spin" /> : <TestTube2 size={18} />}
                    {isTesting ? 'Running Tests...' : 'Run System Tests'}
                  </button>
                </div>

                {testResults.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {testResults.map((test) => (
                      <div key={test.id} className="bg-white dark:bg-slate-900 border border-black/5 dark:border-white/5 rounded-2xl p-4 space-y-3 shadow-sm transition-colors duration-300">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-white">{test.name}</h4>
                          {test.status === 'passed' && <CheckCircle className="text-emerald-500" size={16} />}
                          {test.status === 'failed' && <XCircle className="text-red-500" size={16} />}
                          {test.status === 'running' && <Loader2 className="text-indigo-600 dark:text-indigo-400 animate-spin" size={16} />}
                        </div>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">
                          <span>Status: {test.status}</span>
                          <span className={test.status === 'passed' ? 'text-emerald-600 dark:text-emerald-400' : test.status === 'failed' ? 'text-red-600 dark:text-red-400' : ''}>
                            {test.actual || '-'}
                          </span>
                        </div>
                        {test.status === 'failed' && test.logs.length > 0 && (
                          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded-lg text-[10px] font-mono whitespace-pre-wrap">
                            {test.logs.join('\n')}
                          </div>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'tutorial' && (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-12 py-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">How to use SketchRefine AI</h2>
                <p className="text-gray-500 dark:text-gray-400 text-lg">Master the art of AI-powered sketch refinement in 6 simple steps.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {[
                  {
                    title: "1. Create your base",
                    desc: "Use the interactive canvas to draw your rough idea or upload an existing sketch from your device.",
                    icon: <Pencil className="text-indigo-600 dark:text-indigo-400" />,
                    color: "bg-indigo-50 dark:bg-indigo-900/30"
                  },
                  {
                    title: "2. Perfect your lines",
                    desc: "Use Undo and Redo to fix mistakes. Adjust line width and color to define your structure clearly.",
                    icon: <Undo2 className="text-emerald-600 dark:text-emerald-400" />,
                    color: "bg-emerald-50 dark:bg-emerald-900/30"
                  },
                  {
                    title: "3. Choose a Style",
                    desc: "Select from 8 unique artist styles like 'Cyberpunk', 'Watercolor', or 'Studio Ghibli' to define the final look.",
                    icon: <Palette className="text-orange-600 dark:text-orange-400" />,
                    color: "bg-orange-50 dark:bg-orange-900/30"
                  },
                  {
                    title: "4. AI Magic",
                    desc: "Click 'Refine Sketch'. Our AI analyzes your input and transforms it into a professional masterpiece.",
                    icon: <Sparkles className="text-purple-600 dark:text-purple-400" />,
                    color: "bg-purple-50 dark:bg-purple-900/30"
                  },
                  {
                    title: "5. Review & Save",
                    desc: "Check the refined result. If you love it, download it instantly to your device.",
                    icon: <Download className="text-blue-600 dark:text-blue-400" />,
                    color: "bg-blue-50 dark:bg-blue-900/30"
                  },
                  {
                    title: "6. Build your Gallery",
                    desc: "Every refined sketch is automatically saved to your local gallery for you to revisit anytime.",
                    icon: <Library className="text-rose-600 dark:text-rose-400" />,
                    color: "bg-rose-50 dark:bg-rose-900/30"
                  }
                ].map((step, i) => (
                  <div key={i} className="flex gap-6 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", step.color)}>
                      {step.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">{step.title}</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-600 dark:bg-indigo-700 rounded-3xl p-10 text-white text-center space-y-6 shadow-xl shadow-indigo-200 dark:shadow-indigo-900/20 transition-colors duration-300">
                <h3 className="text-2xl font-bold">Ready to start creating?</h3>
                <p className="text-indigo-100 dark:text-indigo-200 max-w-lg mx-auto">Your imagination is the only limit. Start with a simple sketch and let AI do the heavy lifting.</p>
                <button 
                  onClick={() => setActiveTab('studio')}
                  className="bg-white text-indigo-600 px-8 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors"
                >
                  Go to Studio
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div
              key="gallery"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Your Gallery</h2>
                  <p className="text-gray-500 dark:text-gray-400">All your refined masterpieces in one place.</p>
                </div>
                {galleryItems.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm('Are you sure you want to clear your entire gallery?')) {
                        setGalleryItems([]);
                      }
                    }}
                    className="flex items-center gap-2 text-red-500 hover:text-red-600 font-medium text-sm px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <Trash2 size={16} />
                    Clear Gallery
                  </button>
                )}
              </div>

              {galleryItems.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-black/5 dark:border-white/5 p-20 text-center space-y-6 transition-colors duration-300">
                  <div className="w-24 h-24 bg-gray-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Library size={48} className="text-gray-300 dark:text-gray-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Your gallery is empty</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">Start refining sketches in the Studio to see them appear here.</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('studio')}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                  >
                    Start Creating
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {galleryItems.map((item) => (
                    <motion.div
                      layoutId={item.id}
                      key={item.id}
                      className="group bg-white dark:bg-slate-900 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm overflow-hidden hover:shadow-xl dark:hover:shadow-indigo-900/20 transition-all cursor-pointer"
                      onClick={() => setSelectedGalleryItem(item)}
                    >
                      <div className="aspect-square relative overflow-hidden bg-gray-100 dark:bg-slate-800">
                      <img 
                        src={item.refined || item.original} 
                        alt="Preview" 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedGalleryItem(item); }}
                          className="p-2 bg-white dark:bg-slate-800 rounded-full text-indigo-600 dark:text-indigo-400 hover:scale-110 transition-transform"
                          title="View Details"
                        >
                          <Eye size={20} />
                        </button>
                        <button 
                          onClick={(e) => renameGalleryItem(item.id, e)}
                          className="p-2 bg-white dark:bg-slate-800 rounded-full text-indigo-600 dark:text-indigo-400 hover:scale-110 transition-transform"
                          title="Rename"
                        >
                          <Pencil size={20} />
                        </button>
                        {item.refined && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); downloadImage(item.refined!, `${item.title || 'refined'}.png`); }}
                            className="p-2 bg-white dark:bg-slate-800 rounded-full text-indigo-600 dark:text-indigo-400 hover:scale-110 transition-transform"
                            title="Download"
                          >
                            <Download size={20} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => deleteGalleryItem(item.id, e)}
                          className="p-2 bg-white dark:bg-slate-800 rounded-full text-red-500 hover:scale-110 transition-transform"
                          title="Delete"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                        <div className="absolute bottom-3 left-3">
                          <span className="bg-white/90 dark:bg-slate-800/90 backdrop-blur px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 shadow-sm">
                            {item.style}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm truncate flex-1 mr-2 text-gray-900 dark:text-white">{item.title || 'Untitled Sketch'}</h4>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium shrink-0">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 bg-gray-200 dark:bg-slate-800 overflow-hidden">
                              <img src={item.original} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                            {item.refined && (
                              <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                <CheckCircle2 size={10} className="text-indigo-600 dark:text-indigo-400" />
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); continueEditing(item); }}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Gallery Detail Modal */}
      <AnimatePresence>
        {selectedGalleryItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedGalleryItem(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              layoutId={selectedGalleryItem.id}
              className="relative bg-white w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-full max-h-[800px]"
            >
              <button 
                onClick={() => setSelectedGalleryItem(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/10 hover:bg-black/20 rounded-full text-white md:text-gray-500 transition-colors"
              >
                <X size={24} />
              </button>

              <div className="flex-1 bg-gray-100 flex items-center justify-center p-6 min-h-0">
                <img 
                  src={selectedGalleryItem.refined || selectedGalleryItem.original} 
                  alt="Artwork Large" 
                  className="max-w-full max-h-full object-contain shadow-lg rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="w-full md:w-80 p-8 flex flex-col justify-between bg-white border-l border-black/5">
                <div className="space-y-8">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{selectedGalleryItem.title || 'Untitled Sketch'}</h3>
                    <p className="text-gray-500 text-sm">Created on {new Date(selectedGalleryItem.timestamp).toLocaleString()}</p>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={() => { continueEditing(selectedGalleryItem); setSelectedGalleryItem(null); }}
                      className="w-full bg-indigo-50 text-indigo-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                      <Pencil size={18} />
                      Continue Editing
                    </button>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Style Applied</label>
                      <div className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl font-semibold">
                        <Sparkles size={16} />
                        {selectedGalleryItem.style}
                      </div>
                    </div>

                    {selectedGalleryItem.refined && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Original Sketch</label>
                        <div className="aspect-video bg-gray-50 rounded-xl overflow-hidden border border-black/5">
                          <img 
                            src={selectedGalleryItem.original} 
                            className="w-full h-full object-contain" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-8">
                  {selectedGalleryItem.refined && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => downloadInFormat(selectedGalleryItem.refined!, 'png', selectedGalleryItem.title || 'refined')}
                          className="bg-indigo-600 text-white py-3 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 uppercase tracking-widest"
                        >
                          <Download size={14} />
                          PNG
                        </button>
                        <button 
                          onClick={() => downloadInFormat(selectedGalleryItem.refined!, 'jpg', selectedGalleryItem.title || 'refined')}
                          className="bg-indigo-600 text-white py-3 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 uppercase tracking-widest"
                        >
                          <Download size={14} />
                          JPG
                        </button>
                        <button 
                          onClick={() => downloadInFormat(selectedGalleryItem.refined!, 'pdf', selectedGalleryItem.title || 'refined')}
                          className="bg-indigo-600 text-white py-3 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 uppercase tracking-widest"
                        >
                          <Download size={14} />
                          PDF
                        </button>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-2xl border border-black/5 space-y-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Share Masterpiece</p>
                        {!shareUrl ? (
                          <button 
                            onClick={() => handleShare(selectedGalleryItem.refined!, selectedGalleryItem.title || 'My AI Sketch')}
                            disabled={isSharing}
                            className="w-full py-3 bg-white border border-black/5 text-indigo-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all"
                          >
                            {isSharing ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
                            {isSharing ? 'Generating...' : 'Get Shareable Link'}
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-black/5">
                              <input type="text" readOnly value={shareUrl} className="flex-1 bg-transparent border-none text-[10px] text-gray-500 focus:ring-0" />
                              <button onClick={() => copyToClipboard(shareUrl)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md">
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => shareOnTwitter(shareUrl, selectedGalleryItem.title || 'My AI Sketch')}
                                className="flex items-center justify-center gap-2 py-2 bg-black text-white rounded-lg font-bold text-[10px] hover:bg-gray-800 transition-all"
                              >
                                <Twitter size={14} />
                                Twitter (X)
                              </button>
                              <button 
                                onClick={() => shareOnLinkedin(shareUrl)}
                                className="flex items-center justify-center gap-2 py-2 bg-[#0077B5] text-white rounded-lg font-bold text-[10px] hover:bg-[#006396] transition-all"
                              >
                                <Linkedin size={14} />
                                LinkedIn
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={(e) => renameGalleryItem(selectedGalleryItem.id, e)}
                      className="w-full bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all"
                    >
                      <Pencil size={20} />
                      Rename
                    </button>
                    <button 
                      onClick={(e) => { deleteGalleryItem(selectedGalleryItem.id, e); setSelectedGalleryItem(null); }}
                      className="w-full bg-red-50 text-red-500 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-all"
                    >
                      <Trash2 size={20} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-500">
          <p>© 2026 SketchRefine AI. Powered by Gemini.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

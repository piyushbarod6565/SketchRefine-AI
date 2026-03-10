import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Line, Rect, Circle, Transformer } from 'react-konva';
import Konva from 'konva';
import { LayerData, ShapeData } from '../types';

export type Tool = 'pencil' | 'marker' | 'eraser' | 'line' | 'rect' | 'circle' | 'select';

interface CanvasProps {
  tool?: Tool;
  color?: string;
  lineWidth?: number;
  className?: string;
  layers: LayerData[];
  activeLayerId: string;
  onShapesChange?: (shapes: ShapeData[]) => void;
}

export interface CanvasHandle {
  getCanvasImage: () => string;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  getShapes: () => ShapeData[];
  setShapes: (shapes: ShapeData[]) => void;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ 
  tool = 'pencil', 
  color = '#000000', 
  lineWidth = 2, 
  className = '',
  layers,
  activeLayerId,
  onShapesChange
}, ref) => {
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [history, setHistory] = useState<ShapeData[][]>([]);
  const [redoStack, setRedoStack] = useState<ShapeData[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);

  // Handle resizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Handle transformer
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      const selectedNode = stageRef.current.findOne('#' + selectedId);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }
  }, [selectedId]);

  const saveToHistory = (newShapes: ShapeData[]) => {
    setHistory(prev => [...prev.slice(-19), shapes]);
    setRedoStack([]);
    setShapes(newShapes);
  };

  useEffect(() => {
    onShapesChange?.(shapes);
  }, [shapes, onShapesChange]);

  const handleMouseDown = (e: any) => {
    if (tool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
      return;
    }

    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (activeLayer?.locked || !activeLayer?.visible) {
      isDrawing.current = false;
      return;
    }

    let newShape: ShapeData;
    const common = {
      id,
      layerId: activeLayerId,
      stroke: tool === 'eraser' ? '#ffffff' : color,
      strokeWidth: lineWidth,
      opacity: tool === 'marker' ? 0.5 : 1,
      globalCompositeOperation: tool === 'eraser' ? 'destination-out' : 'source-over',
    };

    if (tool === 'pencil' || tool === 'marker' || tool === 'eraser') {
      newShape = {
        ...common,
        type: tool,
        points: [pos.x, pos.y],
      };
    } else if (tool === 'line') {
      newShape = {
        ...common,
        type: 'line',
        points: [pos.x, pos.y, pos.x, pos.y],
      };
    } else if (tool === 'rect') {
      newShape = {
        ...common,
        type: 'rect',
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
      };
    } else if (tool === 'circle') {
      newShape = {
        ...common,
        type: 'circle',
        x: pos.x,
        y: pos.y,
        radius: 0,
      };
    } else {
      return;
    }

    setShapes([...shapes, newShape]);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current || tool === 'select') return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    const lastShape = shapes[shapes.length - 1];
    
    if (!lastShape) return;

    const newShapes = shapes.slice(0, -1);
    let updatedShape = { ...lastShape };

    if (tool === 'pencil' || tool === 'marker' || tool === 'eraser') {
      updatedShape.points = [...(updatedShape.points || []), pos.x, pos.y];
    } else if (tool === 'line') {
      const points = updatedShape.points || [];
      updatedShape.points = [points[0], points[1], pos.x, pos.y];
    } else if (tool === 'rect') {
      updatedShape.width = pos.x - (updatedShape.x || 0);
      updatedShape.height = pos.y - (updatedShape.y || 0);
    } else if (tool === 'circle') {
      const dx = pos.x - (updatedShape.x || 0);
      const dy = pos.y - (updatedShape.y || 0);
      updatedShape.radius = Math.sqrt(dx * dx + dy * dy);
    }

    setShapes([...newShapes, updatedShape]);
  };

  const handleMouseUp = () => {
    if (isDrawing.current) {
      isDrawing.current = false;
      setHistory(prev => [...prev.slice(-19), shapes.slice(0, -1)]);
      setRedoStack([]);
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    const id = node.id();
    const newShapes = shapes.map(s => {
      if (s.id === id) {
        const updated = { ...s };
        updated.x = node.x();
        updated.y = node.y();
        if (s.type === 'rect') {
          updated.width = node.width() * node.scaleX();
          updated.height = node.height() * node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
        } else if (s.type === 'circle') {
          updated.radius = node.radius() * node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
        }
        return updated;
      }
      return s;
    });
    saveToHistory(newShapes);
  };

  const handleDragEnd = (e: any) => {
    const id = e.target.id();
    const newShapes = shapes.map(s => {
      if (s.id === id) {
        return { ...s, x: e.target.x(), y: e.target.y() };
      }
      return s;
    });
    saveToHistory(newShapes);
  };

  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      if (!stageRef.current) return '';
      // Hide transformer for the image
      const oldSelectedId = selectedId;
      setSelectedId(null);
      
      // We need to draw a white background if we want a non-transparent image
      // or just return the data URL.
      // Gemini usually handles transparent PNGs fine, but let's ensure it's clear.
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
      setSelectedId(oldSelectedId);
      return dataUrl;
    },
    clear: () => {
      saveToHistory([]);
      setSelectedId(null);
    },
    undo: () => {
      if (history.length === 0) return;
      const lastState = history[history.length - 1];
      setRedoStack(prev => [...prev, shapes]);
      setShapes(lastState);
      setHistory(prev => prev.slice(0, -1));
      setSelectedId(null);
    },
    redo: () => {
      if (redoStack.length === 0) return;
      const nextState = redoStack[redoStack.length - 1];
      setHistory(prev => [...prev, shapes]);
      setShapes(nextState);
      setRedoStack(prev => prev.slice(0, -1));
      setSelectedId(null);
    },
    getShapes: () => shapes,
    setShapes: (newShapes: ShapeData[]) => {
      setShapes(newShapes);
      setHistory([]);
      setRedoStack([]);
      setSelectedId(null);
    }
  }));

  return (
    <div ref={containerRef} className={`relative bg-white dark:bg-slate-900 overflow-hidden ${className}`}>
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        ref={stageRef}
      >
        {layers.map((layerData) => (
          <Layer 
            key={layerData.id} 
            visible={layerData.visible} 
            opacity={layerData.opacity}
          >
            {shapes
              .filter(shape => shape.layerId === layerData.id)
              .map((shape) => {
                const draggable = tool === 'select' && !layerData.locked;
                
                if (shape.type === 'pencil' || shape.type === 'marker' || shape.type === 'eraser' || shape.type === 'line') {
                  return (
                    <Line
                      key={shape.id}
                      id={shape.id}
                      points={shape.points}
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={shape.globalCompositeOperation as any}
                      opacity={shape.opacity}
                      draggable={draggable}
                      onClick={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onTap={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onDragEnd={handleDragEnd}
                    />
                  );
                }
                if (shape.type === 'rect') {
                  return (
                    <Rect
                      key={shape.id}
                      id={shape.id}
                      x={shape.x}
                      y={shape.y}
                      width={shape.width}
                      height={shape.height}
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
                      draggable={draggable}
                      onClick={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onTap={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onDragEnd={handleDragEnd}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                }
                if (shape.type === 'circle') {
                  return (
                    <Circle
                      key={shape.id}
                      id={shape.id}
                      x={shape.x}
                      y={shape.y}
                      radius={shape.radius}
                      stroke={shape.stroke}
                      strokeWidth={shape.strokeWidth}
                      draggable={draggable}
                      onClick={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onTap={() => tool === 'select' && !layerData.locked && setSelectedId(shape.id)}
                      onDragEnd={handleDragEnd}
                      onTransformEnd={handleTransformEnd}
                    />
                  );
                }
                return null;
              })}
            {tool === 'select' && activeLayerId === layerData.id && <Transformer ref={transformerRef} />}
          </Layer>
        ))}
      </Stage>
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;

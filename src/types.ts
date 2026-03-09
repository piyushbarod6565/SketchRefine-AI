import { Tool } from './components/Canvas';

export interface LayerData {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface ShapeData {
  id: string;
  type: Tool;
  layerId: string;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  globalCompositeOperation?: string;
}

export interface GalleryItem {
  id: string;
  title?: string;
  original: string;
  refined: string | null;
  style: string;
  timestamp: number;
  canvasState?: ShapeData[];
  layers?: LayerData[];
  activeLayerId?: string;
}

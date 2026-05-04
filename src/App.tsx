/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GoogleGenAI } from "@google/genai";
import { 
  BookOpen, MessageSquare, Cloud, Zap, Waves, 
  ChevronLeft, ChevronRight, Star, X, 
  Sparkles, Settings2, Play, Target, Cpu, Image as ImageIcon, Move, Key,
  Undo2, Redo2
} from 'lucide-react';

// ==========================================
// 100 FX NEXUS: PROCEDURAL SHADER PIPELINE
// Mathematically advanced 2D-to-3D displacement
// ==========================================
const VERTEX_NEXUS = `
  varying vec2 vUv;
  varying float vDistortion;
  varying vec3 vWorldNormal;
  
  uniform float uTime;
  uniform int uRegionCount;
  uniform vec2 uRegionCenters[10];
  uniform vec3 uRegionParams[10]; 
  uniform float uRegionSpeed[10];

  // Simplex 3D Noise for base 2D-to-3D terrain generation
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){ 
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0); 
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    float baseDepth = snoise(vec3(uv.x * 2.5, uv.y * 2.5, uTime * 0.05)) * 1.5;
    pos.z += baseDepth;

    float totalDistortion = 0.0;
    for(int i=0; i<10; i++) {
      if(i >= uRegionCount) break;
      float dist = distance(vUv, uRegionCenters[i]);
      float radius = uRegionParams[i].x;
      
      if(dist < radius) {
        float falloff = smoothstep(radius, 0.0, dist);
        float type = uRegionParams[i].y;
        float intensity = uRegionParams[i].z;
        float speed = uRegionSpeed[i];

        if(type < 0.5) { // Wave
           float zShift = sin(dist * 30.0 - uTime * speed * 5.0) * intensity * falloff;
           pos.z += zShift; totalDistortion += abs(zShift) * 0.1;
        } else if(type < 1.5) { // Bulge
           float zShift = sin(uTime * speed * 4.0) * intensity * falloff * 2.0;
           pos.z += zShift; totalDistortion += abs(zShift) * 0.2;
        } else { // Shake
           pos.x += sin(uTime * 50.0 * speed) * intensity * falloff * 0.3;
           pos.y += cos(uTime * 45.0 * speed) * intensity * falloff * 0.3;
           float zShift = sin(uTime * 60.0 * speed) * intensity * falloff * 0.8;
           pos.z += zShift; totalDistortion += abs(zShift) * 0.5;
        }
      }
    }
    
    vDistortion = totalDistortion + abs(baseDepth * 0.2);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_NEXUS = `
  varying vec2 vUv;
  varying float vDistortion;
  
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform int uStyle; // 0: Normal, 1: High Contrast, 2: Monochrome, 3: Inverted, 4: Screen
  
  void main() {
    float caStrength = clamp(vDistortion * 0.015, 0.0, 0.05); 
    vec4 colorR = texture2D(uTexture, vec2(vUv.x + caStrength, vUv.y));
    vec4 colorG = texture2D(uTexture, vUv);
    vec4 colorB = texture2D(uTexture, vec2(vUv.x - caStrength, vUv.y));
    
    float depthShadow = clamp(1.0 - (vDistortion * 0.15), 0.4, 1.1);
    vec3 finalColor = vec3(colorR.r, colorG.g, colorB.b) * depthShadow;

    if (uStyle == 1) { // High Contrast
      finalColor = mix(finalColor, smoothstep(0.15, 0.85, finalColor), 0.8);
      finalColor = pow(finalColor, vec3(1.2)); // Slight gamma crush for contrast
    } else if (uStyle == 2) { // Monochrome
      float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      finalColor = vec3(lum);
    } else if (uStyle == 3) { // Inverted
      finalColor = 1.0 - finalColor;
    }
    
    gl_FragColor = vec4(finalColor, colorG.a * uOpacity);
  }
`;

// ==========================================
// API MATRIX
// ==========================================
const ApiMatrix = {
  image: async (prompt: string, key: string) => {
    if(!key) throw new Error("API Key required.");
    const ai = new GoogleGenAI({ apiKey: key });
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] }
      });

      if (!response.candidates?.[0]?.content?.parts) {
        throw new Error("No response from AI engine.");
      }

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      throw new Error("API did not return image data.");
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }
};

// ==========================================
// TYPES
// ==========================================
interface Bubble {
  id: string;
  type: string;
  text: string;
  x: number;
  y: number;
}

interface Region {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: string;
  intensity: number;
  speed: number;
}

interface Page {
  id: string;
  imageUrl: string;
  bubbles: Bubble[];
  regions: Region[];
  blendMode?: 'ALPHA' | 'ADD' | 'MULTIPLY' | 'SCREEN';
  visualStyle?: number;
}

// ==========================================
// DRAGGABLE MICRO-MARQUEE
// ==========================================
const TouchMarquee = ({ position, title, children }: { position: {x: number, y: number}, title: string, children: React.ReactNode }) => {
  const [pos, setPos] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initX: pos.x, initY: pos.y });

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
    setIsDragging(true); 
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y }; 
    target.setPointerCapture(e.pointerId);
  };
  
  const onPointerMove = (e: React.PointerEvent) => { 
    if (!isDragging) return; 
    setPos({ 
      x: dragRef.current.initX + (e.clientX - dragRef.current.startX), 
      y: dragRef.current.initY + (e.clientY - dragRef.current.startY) 
    }); 
  };
  
  const onPointerUp = (e: React.PointerEvent) => { 
    setIsDragging(false); 
    (e.target as HTMLElement).releasePointerCapture(e.pointerId); 
  };

  return (
    <div 
      className={`fixed z-50 flex flex-col pointer-events-auto shadow-[0_15px_35px_rgba(0,0,0,0.9)] backdrop-blur-xl bg-[#0a0a0f]/90 border border-white/10 rounded-sm overflow-hidden transition-all duration-300`} 
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, width: isCollapsed ? '28px' : '280px' }}
    >
      <div 
        className={`h-6 bg-red-950/40 border-b border-red-500/20 flex items-center justify-between px-2 ${!isCollapsed ? 'cursor-grab active:cursor-grabbing' : ''}`} 
        onPointerDown={onPointerDown} 
        onPointerMove={onPointerMove} 
        onPointerUp={onPointerUp}
      >
        {!isCollapsed && (
          <span className="text-[8px] font-black text-red-500 tracking-[0.2em] uppercase flex items-center gap-2 pointer-events-none">
            <Cpu size={10}/> {title}
          </span>
        )}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-white/40 hover:text-white p-0.5 z-10 transition-colors">
          <Move size={10} />
        </button>
      </div>
      {!isCollapsed && <div className="p-3 flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar">{children}</div>}
    </div>
  );
};

// ==========================================
// CORE APP
// ==========================================
export default function App() {
  const [mode, setMode] = useState<'cad' | 'reader'>('cad'); 
  const [logs, setLogs] = useState<{msg: string, timestamp: number}[]>([{ msg: "SYS_INIT: READY.", timestamp: Date.now() }]);
  const [isGenerating, setIsGenerating] = useState(false);

  const [pages, setPages] = useState<Page[]>([
    { 
      id: 'page_1', 
      imageUrl: 'https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=1080', 
      bubbles: [{ id: 'b1', type: 'thought', text: 'SYSTEM ONLINE.', x: 15, y: 15 }], 
      regions: [{ id: 'r1', x: 50, y: 50, radius: 45, type: 'wave', intensity: 1.5, speed: 1.2 }] 
    }
  ]);

  // --- HISTORY ENGINE ---
  const [undoStack, setUndoStack] = useState<Page[][]>([]);
  const [redoStack, setRedoStack] = useState<Page[][]>([]);

  const recordHistorySnapshot = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-29), pages]);
    setRedoStack([]);
  }, [pages]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, pages]);
    setUndoStack(prev => prev.slice(0, -1));
    setPages(previous);
    addLog("SYS: UNDO_COMMAND executed.");
  }, [undoStack, pages]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, pages]);
    setRedoStack(prev => prev.slice(0, -1));
    setPages(next);
    addLog("SYS: REDO_COMMAND executed.");
  }, [redoStack, pages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [genPrompt, setGenPrompt] = useState("");
  const [selectedTool, setSelectedTool] = useState<string | null>(null); 
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<{
    scene: THREE.Scene | null,
    camera: THREE.PerspectiveCamera | null,
    renderer: THREE.WebGLRenderer | null,
    comicMeshes: THREE.Mesh[],
    raycaster: THREE.Raycaster | null,
    mouse: THREE.Vector2 | null,
    textureLoader: THREE.TextureLoader | null,
    dynamicLight: THREE.PointLight | null
  }>({ 
    scene: null, camera: null, renderer: null, comicMeshes: [], 
    raycaster: null, mouse: null, textureLoader: null, dynamicLight: null 
  });

  const stateRefs = useRef({ mode, pages, activePageIndex });
  useEffect(() => { stateRefs.current = { mode, pages, activePageIndex }; }, [mode, pages, activePageIndex]);

  const addLog = useCallback((msg: string) => setLogs(prev => [...prev.slice(-4), { msg, timestamp: Date.now() }]), []);

  // --- AUDIO & FX ---
  const playGenerativeSoundFX = (text: string) => {
    try {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      if(!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const dist = ctx.createWaveShaper();
      
      const curve = new Float32Array(44100);
      for(let i=0; i<44100; i++) curve[i] = Math.sin(i*0.01)*5;
      dist.curve = curve;
      dist.oversample = '4x';
      
      osc.connect(gainNode);
      gainNode.connect(dist);
      dist.connect(ctx.destination);
      
      const t = text.toUpperCase();
      const now = ctx.currentTime;
      let lightColor = 0xffffff;

      if (t.includes('Z') || t.includes('S')) {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
        gainNode.gain.setValueAtTime(1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        lightColor = 0x00ffff;
      } else if (t.includes('B') || t.includes('M') || t.includes('K')) {
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(1, now + 0.6);
        gainNode.gain.setValueAtTime(1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now); osc.stop(now + 0.6);
        lightColor = 0xff0033;
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.15);
        gainNode.gain.setValueAtTime(1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        lightColor = 0xffaa00;
      }

      if (engineRef.current.dynamicLight) {
        engineRef.current.dynamicLight.color.setHex(lightColor);
        engineRef.current.dynamicLight.intensity = 5.0;
      }
    } catch(e) {}
  };

  // --- THREE.JS ENGINE ---
  useEffect(() => {
    let frameId: number;
    const initThreeJS = () => {
      if (!canvasRef.current || engineRef.current.scene) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050508);
      scene.fog = new THREE.FogExp2(0x050508, 0.015);

      const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 0, 45);

      const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: false });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const gridHelper = new THREE.GridHelper(400, 200, 0x4f46e5, 0x111122);
      gridHelper.position.y = -25;
      scene.add(gridHelper);

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const dirLight = new THREE.DirectionalLight(0xa5b4fc, 0.8);
      dirLight.position.set(20, 30, 40);
      scene.add(dirLight);

      const actionLight = new THREE.PointLight(0xff0000, 0.0, 100);
      actionLight.position.set(0, 0, 20);
      scene.add(actionLight);
      
      engineRef.current = { 
        scene, camera, renderer, comicMeshes: [], 
        raycaster: new THREE.Raycaster(), mouse: new THREE.Vector2(), 
        textureLoader: new THREE.TextureLoader(), dynamicLight: actionLight 
      };

      const handleResize = () => {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);

      const onMouseDown = (e: MouseEvent) => {
        const { mode: cMode, activePageIndex: cActiveIdx } = stateRefs.current;
        if(cMode !== 'cad' || !selectedTool || !engineRef.current.camera || !engineRef.current.raycaster || !engineRef.current.mouse) return;
        
        const eng = engineRef.current;
        eng.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        eng.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        eng.raycaster.setFromCamera(eng.mouse, eng.camera);
        
        const mesh = eng.comicMeshes[cActiveIdx];
        if(!mesh) return;

        const hits = eng.raycaster.intersectObject(mesh);
        if (hits.length > 0 && hits[0].uv) {
          const x = hits[0].uv.x * 100;
          const y = (1 - hits[0].uv.y) * 100;
          
          recordHistorySnapshot();
          setPages(prev => {
            const arr = [...prev];
            const p = {...arr[cActiveIdx]};
            if(selectedTool === 'region') {
              p.regions = [...(p.regions || []), { id: `r_${Date.now()}`, x, y, radius: 20, type: 'wave', intensity: 2, speed: 2 }];
            } else {
              p.bubbles = [...(p.bubbles || []), { id: `b_${Date.now()}`, type: selectedTool, text: selectedTool==='sound'?'BOOM':'...', x, y }];
            }
            arr[cActiveIdx] = p;
            return arr;
          });
          setSelectedTool(null);
          addLog(`NEXUS: Element injected at [${x.toFixed(0)}, ${y.toFixed(0)}]`);
        }
      };
      window.addEventListener('mousedown', onMouseDown);

      const animate = () => {
        frameId = requestAnimationFrame(animate);
        const eng = engineRef.current;
        if (!eng.scene || !eng.camera || !eng.renderer || !eng.dynamicLight) return;
        
        const t = Date.now() * 0.001;
        const { mode: cMode, activePageIndex: cActiveIdx, pages: cPages } = stateRefs.current;

        if (eng.dynamicLight.intensity > 0) eng.dynamicLight.intensity -= 0.1; 
        
        // --- SMOOTH CAMERA PERSPECTIVE ---
        const targetCamPos = new THREE.Vector3(0, 0, 45);
        const lookAtPos = new THREE.Vector3(0, 0, 0);

        if (cMode === 'cad') {
          // CAD mode: wider view, slight dynamic orbital movement to show strata depth
          targetCamPos.set(
            Math.sin(t * 0.3) * 3, 
            Math.cos(t * 0.2) * 2, 
            55 + Math.sin(t * 0.1) * 5
          );
        } else {
          // Reader mode: closer, more stable focus
          targetCamPos.set(
            Math.sin(t * 0.5) * 0.8, 
            Math.cos(t * 0.4) * 0.6, 
            42
          );
        }
        
        eng.camera.position.lerp(targetCamPos, 0.04);
        eng.camera.lookAt(lookAtPos);

        eng.comicMeshes.forEach((mesh, idx) => {
          if (!cPages[idx]) return;
          const page = cPages[idx];
          let targetPos = new THREE.Vector3(0, 0, 0);
          let targetRot = new THREE.Euler(0, 0, 0);
          let targetOpacity = 1;

          if (cMode === 'reader') {
            if (idx < cActiveIdx) { 
              targetPos.set(-40, 0, 20); 
              targetRot.set(0, 0.4, 0);
              targetOpacity = 0; 
            }
            else if (idx === cActiveIdx) { 
              targetPos.set(0, 0, 0); 
              targetRot.set(0, 0, 0);
              targetOpacity = 1; 
            }
            else { 
              targetPos.set(40, 0, -20); 
              targetRot.set(0, -0.4, 0);
              targetOpacity = 0; 
            }
          } else {
            // CAD mode: Stacked strata with slight fanning
            if (idx < cActiveIdx) { 
              targetPos.set(0, 0, 30 + (cActiveIdx - idx) * 20); 
              targetOpacity = 0; 
            }
            else if (idx === cActiveIdx) { 
              targetPos.set(0, 0, 0); 
              targetRot.set(0, 0, 0);
              targetOpacity = 1; 
            }
            else { 
              const offset = idx - cActiveIdx;
              targetPos.set(offset * 0.5, offset * -0.5, -offset * 12); 
              targetRot.set(offset * 0.02, offset * -0.05, 0);
              targetOpacity = Math.max(0, 1 - offset * 0.15); 
            }
          }

          mesh.position.lerp(targetPos, 0.08); 
          mesh.rotation.x += (targetRot.x - mesh.rotation.x) * 0.08;
          mesh.rotation.y += (targetRot.y - mesh.rotation.y) * 0.08;
          mesh.rotation.z += (targetRot.z - mesh.rotation.z) * 0.08;

          const mat = mesh.material as THREE.ShaderMaterial;
          if (mat.uniforms) {
            mat.uniforms.uOpacity.value += (targetOpacity - mat.uniforms.uOpacity.value) * 0.1;
            mat.uniforms.uTime.value = t;
            
            // Apply Blend Modes & Styles
            const blendMode = page.blendMode || 'ALPHA';
            if (blendMode === 'ADD') mesh.material.blending = THREE.AdditiveBlending;
            else if (blendMode === 'MULTIPLY') mesh.material.blending = THREE.MultiplyBlending;
            else if (blendMode === 'SCREEN') {
              mesh.material.blending = THREE.CustomBlending;
              mesh.material.blendEquation = THREE.AddEquation;
              mesh.material.blendSrc = THREE.OneMinusDstColorFactor;
              mesh.material.blendDst = THREE.OneFactor;
            }
            else mesh.material.blending = THREE.NormalBlending;

            mat.uniforms.uStyle.value = page.visualStyle || 0;

            if (idx === cActiveIdx) {
              const regs = page.regions || [];
              mat.uniforms.uRegionCount.value = Math.min(regs.length, 10);
              regs.slice(0, 10).forEach((reg, i) => {
                mat.uniforms.uRegionCenters.value[i].set(reg.x / 100, (100 - reg.y) / 100);
                mat.uniforms.uRegionParams.value[i].set(reg.radius / 100, reg.type === 'wave' ? 0.0 : reg.type === 'bulge' ? 1.0 : 2.0, reg.intensity);
                mat.uniforms.uRegionSpeed.value[i] = reg.speed;
              });
            } else {
              mat.uniforms.uRegionCount.value = 0;
            }
          }

          if (idx === cActiveIdx && eng.camera) {
            page.bubbles.forEach(b => {
              const wp = new THREE.Vector3((b.x/100)*20-10, ((100-b.y)/100)*30-15, 0.5).applyMatrix4(mesh.matrixWorld).project(eng.camera);
              const el = document.getElementById(b.id);
              if (el) {
                el.style.transform = `translate(-50%, -50%) translate(${(wp.x*0.5+0.5)*window.innerWidth}px, ${(wp.y*-0.5+0.5)*window.innerHeight}px) scale(${1 + (mesh.position.z/100)})`;
                el.style.opacity = mat.uniforms.uOpacity.value < 0.5 ? '0' : '1';
                el.style.pointerEvents = mat.uniforms.uOpacity.value < 0.5 ? 'none' : 'auto';
              }
            });
          }
        });
        eng.renderer.render(eng.scene, eng.camera);
      };
      animate();
      return () => { 
        window.removeEventListener('resize', handleResize); 
        window.removeEventListener('mousedown', onMouseDown); 
        cancelAnimationFrame(frameId); 
      };
    };
    initThreeJS();
  }, []);

  // Update Plane Meshes when pages change
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng.scene || !eng.textureLoader) return;
    pages.forEach((page, i) => {
      if (!eng.comicMeshes[i]) {
        const geo = new THREE.PlaneGeometry(20, 30, 64, 64);
        eng.textureLoader!.load(page.imageUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.ShaderMaterial({
            vertexShader: VERTEX_NEXUS,
            fragmentShader: FRAGMENT_NEXUS,
            uniforms: {
              uTexture: { value: tex },
              uTime: { value: 0 },
              uOpacity: { value: 0 },
              uStyle: { value: 0 },
              uRegionCount: { value: 0 },
              uRegionCenters: { value: Array(10).fill(0).map(() => new THREE.Vector2()) },
              uRegionParams: { value: Array(10).fill(0).map(() => new THREE.Vector3()) },
              uRegionSpeed: { value: new Float32Array(10).fill(0) }
            },
            transparent: true,
            side: THREE.DoubleSide
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0, 0, -100); 
          eng.scene!.add(mesh);
          eng.comicMeshes[i] = mesh;
        });
      }
    });
  }, [pages]);

  const handleGenerateComicImage = async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      addLog("ERR: GEMINI_API_KEY is missing from environment.");
      return;
    }
    setIsGenerating(true);
    addLog("SYNTH: Initializing Generative Kinematics...");
    try {
      const comicFilter = "Masterpiece graphic novel art, highly detailed ink and pen, dynamic perspective, dramatic flat lighting, vibrant comic color palette. ";
      const b64Url = await ApiMatrix.image(comicFilter + genPrompt, apiKey);
      setPages(prev => [...prev, { id: `p_${Date.now()}`, imageUrl: b64Url, bubbles: [], regions: [] }]);
      setActivePageIndex(pages.length);
      setGenPrompt("");
      addLog("SUCCESS: Layer synthesis complete.");
    } catch (e: any) {
      addLog(`ERR: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateActivePage = (updates: Partial<Page>) => {
    recordHistorySnapshot();
    setPages(prev => prev.map((pg, i) => i === activePageIndex ? { ...pg, ...updates } : pg));
  };

  return (
    <div className="h-screen w-full bg-[#020205] text-gray-100 font-mono overflow-hidden relative select-none">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 1px; height: 1px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.5); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.4); }
        .bubble-base { position: absolute; top: 0; left: 0; transform-origin: center; will-change: transform; pointer-events: auto; cursor: pointer; }
        .micro-btn { display:flex; align-items:center; justify-content:center; gap:4px; padding:6px 12px; font-size:8px; font-weight:black; text-transform:uppercase; border:1px solid rgba(255,255,255,0.1); border-radius:1px; transition:all 0.2s; cursor:pointer; background: rgba(255,255,255,0.05); color: #9ca3af; }
        .micro-btn:hover { background: rgba(255,255,255,0.1); color: white; }
        .micro-btn.active { background: #dc2626; border-color: #ef4444; color: white; shadow: 0 0 15px rgba(220, 38, 38, 0.3); }
        .micro-input { background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); font-size: 8px; padding: 6px; outline: none; border-radius:1px; color: white; width:100%; transition: border-color 0.2s; }
        .micro-input:focus { border-color: rgba(239, 68, 68, 0.5); }
      `}</style>

      {/* Grid Background */}
      <div className="absolute inset-0 grid-bg opacity-10 pointer-events-none" />
      
      {/* Viewport Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <div className="w-[50vw] h-[70vh] bg-red-500/5 rounded-full blur-[120px]" />
      </div>

      <canvas ref={canvasRef} className={`absolute inset-0 z-0 ${selectedTool ? 'cursor-crosshair' : ''}`} />
      
      {/* Scanline Overlay */}
      <div className="absolute inset-0 scanlines pointer-events-none opacity-30 z-[5]" />

      {/* DRAGGABLE TOOLS */}
      <TouchMarquee position={{x: 24, y: 24}} title="SYS.CORE_WORKSPACE">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>setMode('cad')} className={`micro-btn flex-1 ${mode==='cad'?'active':''}`}><BookOpen size={10}/> Cad Mode</button>
          <button onClick={()=>setMode('reader')} className={`micro-btn flex-1 ${mode==='reader'?'active':''}`}><Play size={10}/> Reader</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={undo} disabled={undoStack.length === 0} className="micro-btn flex-1 disabled:opacity-30"><Undo2 size={10}/> Undo</button>
          <button onClick={redo} disabled={redoStack.length === 0} className="micro-btn flex-1 disabled:opacity-30"><Redo2 size={10}/> Redo</button>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/5">
          <div className="space-y-1">
            <div className="text-[6px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
              <Settings2 size={8}/> Blending Mode
            </div>
            <select 
              value={pages[activePageIndex]?.blendMode || 'ALPHA'} 
              onChange={(e) => updateActivePage({ blendMode: e.target.value as any })}
              className="micro-input w-full h-8 bg-[#0a0a0f] border border-white/10 rounded-sm text-[8px] uppercase tracking-widest outline-none focus:border-red-500/50"
            >
              <option value="ALPHA">Normal / Alpha</option>
              <option value="ADD">Additive (FX)</option>
              <option value="MULTIPLY">Multiply (Ink)</option>
              <option value="SCREEN">Screen (Glow)</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-[6px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
              <Sparkles size={8}/> Visual Style
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[
                { name: 'Normal', val: 0 },
                { name: 'High Contrast', val: 1 },
                { name: 'Monochrome', val: 2 },
                { name: 'Inverted', val: 3 }
              ].map(style => (
                <button 
                  key={style.val}
                  onClick={() => updateActivePage({ visualStyle: style.val })}
                  className={`py-1.5 text-[7px] uppercase font-bold border transition-all ${
                    (pages[activePageIndex]?.visualStyle || 0) === style.val 
                    ? 'bg-red-600 border-red-500 text-white shadow-[0_0_10px_rgba(220,38,38,0.3)]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === 'cad' && (
          <div className="bg-black/40 border border-white/5 p-2 rounded">
            <div className="text-[6px] text-gray-500 uppercase tracking-widest mb-2 font-black">Spatial Toolbox</div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={()=>setSelectedTool(t=>t==='speech'?null:'speech')} className={`h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-sm transition-all hover:border-red-500/50 ${selectedTool==='speech'?'active border-red-500':''}`}><MessageSquare size={12}/></button>
              <button onClick={()=>setSelectedTool(t=>t==='thought'?null:'thought')} className={`h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-sm transition-all hover:border-red-500/50 ${selectedTool==='thought'?'active border-red-500':''}`}><Cloud size={12}/></button>
              <button onClick={()=>setSelectedTool(t=>t==='sound'?null:'sound')} className={`h-8 flex items-center justify-center bg-white/5 border border-white/10 rounded-sm transition-all hover:border-red-500/50 ${selectedTool==='sound'?'active border-red-500 text-yellow-500':'text-yellow-500/70'}`}><Zap size={12}/></button>
              <button onClick={()=>setSelectedTool(t=>t==='region'?null:'region')} className={`h-8 flex items-center justify-center bg-emerald-900/30 border border-emerald-500/30 rounded-sm transition-all hover:border-emerald-500 ${selectedTool==='region'?'bg-emerald-600 border-emerald-400 text-white':''}`}><Target size={12}/></button>
            </div>
          </div>
        )}
      </TouchMarquee>

      {/* DRAGGABLE MATRIX CONTROL */}
      <TouchMarquee position={{x: window.innerWidth - 304, y: 24}} title="GEN.MATRIX_CONTROL">
        <div className="flex items-center justify-between bg-black/60 p-2 border border-white/10 rounded">
           <button onClick={() => setActivePageIndex(Math.max(0, activePageIndex-1))} className="p-1 text-gray-500 hover:text-white transition-colors"><ChevronLeft size={12}/></button>
           <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">PANEL {activePageIndex+1} / {pages.length}</span>
           <button onClick={() => setActivePageIndex(Math.min(pages.length-1, activePageIndex+1))} className="p-1 text-gray-500 hover:text-white transition-colors"><ChevronRight size={12}/></button>
        </div>

        {mode === 'cad' && (
          <>
            <div className="flex flex-col gap-2 border-l-2 border-red-600 pl-3">
              <span className="text-[8px] text-red-400 uppercase tracking-[0.2em] font-black flex items-center gap-2"><ImageIcon size={10}/> Directive Input</span>
              <textarea 
                value={genPrompt} 
                onChange={e=>setGenPrompt(e.target.value)} 
                placeholder="Declare panel visualization parameters..." 
                className="micro-input resize-none h-24 custom-scrollbar text-[9px] leading-relaxed" 
              />
              <button 
                onClick={handleGenerateComicImage} 
                disabled={isGenerating||!genPrompt} 
                className="w-full py-2.5 bg-red-700 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(185,28,28,0.4)] disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles size={10} className="animate-spin"/> SYNTHESIZING STRATA
                  </div>
                ) : 'INITIATE SYNTHESIS'}
              </button>
            </div>
            
            <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
              <span className="text-[8px] text-emerald-400 uppercase tracking-[0.2em] font-black flex items-center gap-2"><Waves size={10}/> Active FX Nodes</span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {pages[activePageIndex]?.regions?.map((reg, idx) => (
                  <div key={reg.id} className="bg-emerald-950/20 border border-emerald-500/20 p-2 rounded group">
                    <div className="flex justify-between items-center text-[7px] text-emerald-300 mb-1">
                      <span className="font-black uppercase">NODE_{idx+1}: {reg.type}_EXTRUDE</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono opacity-60">v_mag: {reg.radius.toFixed(0)}</span>
                        <button onClick={()=>{ 
                          const p=pages[activePageIndex]; 
                          updateActivePage({regions: p.regions.filter(r=>r.id!==reg.id)}); 
                        }} className="text-red-500/70 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={8}/></button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <select 
                        value={reg.type} 
                        onChange={e=>{ 
                          const p=pages[activePageIndex]; 
                          updateActivePage({regions: p.regions.map(r=>r.id===reg.id?{...r,type:e.target.value}:r)}); 
                        }} 
                        className="bg-black/40 border-none text-[6px] text-emerald-400/80 uppercase outline-none focus:text-white"
                      >
                        <option value="wave">Waveform</option>
                        <option value="bulge">Pressure</option>
                        <option value="shake">Oscillation</option>
                      </select>
                      <div className="relative h-1 bg-black/60 rounded-full overflow-hidden">
                        <div 
                          className="absolute inset-y-0 left-0 bg-emerald-500 transition-all" 
                          style={{ width: `${(reg.radius/60)*100}%` }} 
                        />
                        <input 
                          type="range" min="5" max="60" 
                          value={reg.radius} 
                          onChange={e=>{ 
                            const p=pages[activePageIndex]; 
                            updateActivePage({regions: p.regions.map(r=>r.id===reg.id?{...r,radius:parseFloat(e.target.value)}:r)}); 
                          }} 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {(!pages[activePageIndex]?.regions || pages[activePageIndex].regions.length === 0) && (
                  <div className="text-[7px] text-gray-600 text-center uppercase tracking-widest py-4 border border-dashed border-white/5 rounded">
                    No spatial nodes initialized
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </TouchMarquee>

      {/* OVERLAY BUBBLES */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        {(mode === 'cad' || mode === 'reader') && pages[activePageIndex]?.bubbles.map(b => (
          <div 
            key={b.id} id={b.id} 
            className={`bubble-base p-4 min-w-[120px] max-w-[240px] shadow-[10px_10px_0px_rgba(0,0,0,0.2)] transition-all duration-300 ${
              b.type==='speech'?'bg-white text-black rounded-lg rounded-br-none border-2 border-black':
              b.type==='thought'?'bg-gray-100 text-black rounded-[2rem] border-2 border-dashed border-gray-400':
              'bg-yellow-400 text-red-700 font-black text-3xl scale-125 transform rotate-[-5deg] border-4 border-red-700 rounded drop-shadow-[0_0_20px_rgba(250,204,21,0.4)] uppercase italic'
            }`}
            onClick={() => {
              if (mode === 'reader' || (mode === 'cad' && !selectedTool)) {
                if(b.type === 'sound') playGenerativeSoundFX(b.text);
              }
            }}
          >
            {mode === 'cad' ? (
              <div className="group relative">
                <textarea 
                  value={b.text} 
                  onChange={e => { 
                    const p=pages[activePageIndex]; 
                    updateActivePage({bubbles: p.bubbles.map(ub=>ub.id===b.id?{...ub,text:e.target.value}:ub)}); 
                  }} 
                  className="bg-transparent w-full text-center outline-none resize-none overflow-hidden text-[11px] font-black leading-tight uppercase" 
                  rows={2} 
                />
                <button 
                  onClick={e => { 
                    e.stopPropagation(); 
                    const p=pages[activePageIndex]; 
                    updateActivePage({bubbles: p.bubbles.filter(ub=>ub.id!==b.id)}); 
                  }} 
                  className="absolute -top-6 -right-6 bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-auto transition-opacity shadow-lg"
                >
                  <X size={10} />
                </button>
              </div>
            ) : <span className="text-[11px] font-black leading-tight uppercase block">{b.text}</span>}
          </div>
        ))}
        {mode === 'cad' && pages[activePageIndex]?.regions?.map((reg, idx) => (
          <div 
            key={reg.id} 
            className="absolute top-0 left-0 border border-emerald-500/40 border-dashed rounded-full pointer-events-none opacity-30 flex items-center justify-center animate-pulse" 
            style={{ 
              width:`${reg.radius*2}%`, height:`${reg.radius*2}%`, 
              transform:'translate(-50%, -50%)', left:`${reg.x}%`, top:`${reg.y}%`
            }}
          >
            <div className="relative">
              <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_15px_#10b981]" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 px-2 py-0.5 border border-emerald-500/20 text-[8px] text-emerald-400 font-black uppercase tracking-widest">
                FX_NODE_0{idx+1}: {reg.type}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SYSTEMS LOG BAR */}
      <div className="absolute bottom-0 left-0 w-full h-6 bg-[#050508] border-t border-red-500/30 flex items-center px-4 z-[60] overflow-hidden pointer-events-none">
        <div className="flex items-center gap-2 mr-8 text-red-600 font-black text-[10px] uppercase tracking-widest shrink-0">
          <Star size={10} className="fill-red-600 animate-pulse" />
          SYS.LOG
        </div>
        <div className="flex-1 whitespace-nowrap overflow-hidden relative">
           <div className="animate-[marquee_30s_linear_infinite] inline-block text-[8px] font-mono text-gray-500 uppercase tracking-widest">
             {logs.map((l, i) => (
               <span key={i} className="mr-12 flex-inline items-center gap-2">
                 <span className={i % 2 === 0 ? 'text-emerald-500' : 'text-red-400'}>[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                 <span className="ml-2">{l.msg}</span>
               </span>
             ))}
           </div>
        </div>
      </div>
      
      {/* LOADING OVERLAY */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center p-6 border border-red-500/30 bg-[#0a0a0f] rounded-lg shadow-[0_0_50px_rgba(220,38,38,0.2)]">
            <Cpu size={32} className="text-red-500 animate-pulse mb-4" />
            <span className="text-[10px] text-red-400 font-black tracking-[0.4em] uppercase animate-pulse">Generative Strata Active</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Keyframes for the log marquee
const style = document.createElement('style');
style.textContent = `
  @keyframes marquee {
    0% { transform: translateX(50%); }
    100% { transform: translateX(-100%); }
  }
`;
document.head.appendChild(style);

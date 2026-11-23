import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CalendarCheck,
  Camera,
  ChevronDown,
  ChevronUp,
  Moon,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import { SportCategory, Venue } from '../types/courtsync';

interface Venue3DViewerModalProps {
  initialSport: SportCategory;
  venues: Venue[];
  onClose: () => void;
  onBookVenue: (venueId: string) => void;
}

type CameraPresetId = 'iso' | 'court' | 'player' | 'top';
type LightingMood = 'day' | 'night';

const SPORTS: SportCategory[] = ['Badminton', 'Futsal', 'Padel', 'Mini Soccer'];

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { label: 'Isometrik', pos: [19, 13.5, 20], target: [0, 0.8, 0] },
  court: { label: 'Sisi Lapangan', pos: [0, 5.2, 20], target: [0, 1.1, 0] },
  player: { label: 'Sudut Pemain', pos: [-14.5, 2.4, 1.5], target: [8, 1.0, 0] },
  top: { label: 'Atas (Taktik)', pos: [0.01, 27, 4.5], target: [0, 0, 0] },
};

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /swiftshader|llvmpipe|software|mesa offscreen|angle.*swiftshader/i.test(rendererStr);
  } catch {
    return true;
  }
}

/**
 * Generates high-resolution crisp procedural court markings CanvasTexture for each sport.
 */
function createCourtCanvasTexture(sport: SportCategory, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (sport === 'Badminton') {
    // BWF Emerald Vinyl Surface + dark slate apron
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 1024, 512);

    ctx.fillStyle = '#0f8c5c';
    ctx.fillRect(92, 64, 840, 384);

    // Subtle matte vinyl grain
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 64; i++) {
      ctx.fillRect(92 + i * 13.2, 64, 2, 384);
    }

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    // Outer doubles boundary
    ctx.strokeRect(112, 84, 800, 344);
    // Singles side lines
    ctx.beginPath();
    ctx.moveTo(112, 114);
    ctx.lineTo(912, 114);
    ctx.moveTo(112, 398);
    ctx.lineTo(912, 398);
    // Long service lines for doubles
    ctx.moveTo(164, 84);
    ctx.lineTo(164, 428);
    ctx.moveTo(860, 84);
    ctx.lineTo(860, 428);
    // Short service lines
    ctx.moveTo(410, 84);
    ctx.lineTo(410, 428);
    ctx.moveTo(614, 84);
    ctx.lineTo(614, 428);
    // Center service lines
    ctx.moveTo(112, 256);
    ctx.lineTo(410, 256);
    ctx.moveTo(614, 256);
    ctx.lineTo(912, 256);
    ctx.stroke();

    // Subtle court center badge
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COURTSYNC BWF PRO', 512, 52);
  } else if (sport === 'Futsal') {
    // Deep Navy + Royal Blue FIFA Vinyl Court
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(72, 46, 880, 420);

    // Subtle alternating court bands
    ctx.fillStyle = 'rgba(15,23,42,0.12)';
    for (let x = 72; x < 952; x += 88) {
      ctx.fillRect(x, 46, 44, 420);
    }

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.strokeRect(86, 60, 852, 392);

    // Center line & circle
    ctx.beginPath();
    ctx.moveTo(512, 60);
    ctx.lineTo(512, 452);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(512, 256, 64, 0, Math.PI * 2);
    ctx.stroke();

    // Left & right penalty arcs
    ctx.beginPath();
    ctx.arc(86, 256, 118, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(938, 256, 118, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();

    // Center spot & penalty spots
    ctx.fillStyle = '#f8fafc';
    [
      [512, 256],
      [204, 256],
      [820, 256],
    ].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (sport === 'Padel') {
    // World Padel Tour Electric Blue Mondo Turf
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 1024, 512);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(108, 60, 808, 392);

    // Fine turf texture stripes
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 60; y < 452; y += 16) {
      ctx.fillRect(108, y, 808, 6);
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.strokeRect(114, 66, 796, 380);

    // Service lines
    ctx.beginPath();
    ctx.moveTo(274, 66);
    ctx.lineTo(274, 446);
    ctx.moveTo(750, 66);
    ctx.lineTo(750, 446);
    // Center service line
    ctx.moveTo(274, 256);
    ctx.lineTo(750, 256);
    ctx.stroke();
  } else {
    // Mini Soccer 7v7 Striped Synthetic Grass
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, 1024, 512);

    const stripeCount = 12;
    const stripeW = 920 / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
      ctx.fillRect(52 + i * stripeW, 38, stripeW + 1, 436);
    }

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.strokeRect(68, 52, 888, 408);

    // Halfway line & circle
    ctx.beginPath();
    ctx.moveTo(512, 52);
    ctx.lineTo(512, 460);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(512, 256, 68, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty boxes
    ctx.strokeRect(68, 138, 126, 236);
    ctx.strokeRect(830, 138, 126, 236);
    // Goal boxes
    ctx.strokeRect(68, 194, 44, 124);
    ctx.strokeRect(912, 194, 44, 124);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy || 4);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a subtle radial contact shadow texture placed beneath grounded props.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.42)');
  grad.addColorStop(0.65, 'rgba(2, 6, 23, 0.14)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a crisp CourtSync digital scoreboard texture.
 */
function createScoreboardTexture(sport: SportCategory): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 240);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`COURTSYNC BANDUNG · ${sport.toUpperCase()}`, 256, 52);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 88px monospace';
  const score =
    sport === 'Badminton'
      ? '21 : 19'
      : sport === 'Padel'
      ? '40 : 30'
      : '04 : 03';
  ctx.fillText(score, 256, 158);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('LIVE ARENA PREVIEW · WIB', 256, 214);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a composite player bench (frame legs, wood/slate slats, backrest, contact shadow).
 */
function buildTeamBench(shadowTex: THREE.CanvasTexture, castShadow: boolean): THREE.Group {
  const group = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.15 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.45, metalness: 0.2 });

  // Seat deck
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.65), seatMat);
  seat.position.set(0, 0.52, 0);
  seat.castShadow = castShadow;
  group.add(seat);

  // Backrest
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.42, 0.08), seatMat);
  back.position.set(0, 0.88, -0.28);
  back.castShadow = castShadow;
  group.add(back);

  // Emerald trim strip
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.05, 0.09), accentMat);
  trim.position.set(0, 1.11, -0.28);
  group.add(trim);

  // 3 sturdy legs
  [-1.4, 0, 1.4].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.56), metalMat);
    leg.position.set(x, 0.26, 0);
    leg.castShadow = castShadow;
    group.add(leg);
  });

  // Ground contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.9, 1.25),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  return group;
}

/**
 * Builds a composite overhead or corner LED stadium floodlight pole/rig.
 */
function buildFloodlightTower(
  height: number,
  isNight: boolean,
  castShadow: boolean
): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.78 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(isNight ? 0xfff7ed : 0xe2e8f0),
    emissiveIntensity: isNight ? 2.4 : 0.45,
    roughness: 0.2,
  });

  // Concrete pedestal
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.65, 10), housingMat);
  base.position.y = 0.325;
  base.castShadow = castShadow;
  group.add(base);

  // Tapered main steel pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.18, height, 10), poleMat);
  pole.position.y = height / 2 + 0.5;
  pole.castShadow = castShadow;
  group.add(pole);

  // Crossbar head
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.16), poleMat);
  bar.position.set(0, height + 0.45, 0.18);
  group.add(bar);

  // 3 LED projector heads
  [-0.56, 0, 0.56].forEach((offsetX) => {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.26), housingMat);
    hood.position.set(offsetX, height + 0.36, 0.34);
    hood.rotation.x = 0.38;
    group.add(hood);

    const emitter = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), lampMat);
    emitter.position.set(offsetX, height + 0.32, 0.48);
    emitter.rotation.x = 0.38;
    group.add(emitter);
  });

  return group;
}

/**
 * Builds composite tubular goal frame + net for Futsal or Mini Soccer.
 */
function buildGoalFrame(width: number, height: number, depth: number, castShadow: boolean): THREE.Group {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.35 });
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.8,
    metalness: 0.05,
    transparent: true,
    opacity: 0.38,
    wireframe: true,
  });

  const radius = 0.065;
  // Left & Right front uprights
  [-width / 2, width / 2].forEach((z) => {
    const upright = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), postMat);
    upright.position.set(0, height / 2, z);
    upright.castShadow = castShadow;
    group.add(upright);

    // Top rear depth bar
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, depth, 8), postMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.set(-depth / 2, height, z);
    group.add(topBar);

    // Bottom depth rail
    const botBar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius * 0.75, depth, 8), postMat);
    botBar.rotation.z = Math.PI / 2;
    botBar.position.set(-depth / 2, 0.05, z);
    group.add(botBar);

    // Rear angled stanchion
    const rear = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, height, 8), postMat);
    rear.position.set(-depth, height / 2, z);
    group.add(rear);
  });

  // Crossbar
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width + radius * 2, 12), postMat);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(0, height, 0);
  crossbar.castShadow = castShadow;
  group.add(crossbar);

  // Netting panels (back, top, sides)
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 10, 6), netMat);
  backNet.rotation.y = Math.PI / 2;
  backNet.position.set(-depth, height / 2, 0);
  group.add(backNet);

  const topNet = new THREE.Mesh(new THREE.PlaneGeometry(depth, width, 4, 10), netMat);
  topNet.rotation.x = Math.PI / 2;
  topNet.position.set(-depth / 2, height, 0);
  group.add(topNet);

  [-width / 2, width / 2].forEach((z) => {
    const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(depth, height, 4, 6), netMat);
    sideNet.position.set(-depth / 2, height / 2, z);
    group.add(sideNet);
  });

  return group;
}

/**
 * Builds composite net + tensioned steel posts (Badminton or Padel).
 */
function buildCourtNet(width: number, height: number, castShadow: boolean): THREE.Group {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.8 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.8,
    transparent: true,
    opacity: 0.55,
    wireframe: true,
    side: THREE.DoubleSide,
  });

  [-width / 2, width / 2].forEach((z) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.45), postMat);
    base.position.set(0, 0.07, z);
    base.castShadow = castShadow;
    group.add(base);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, height + 0.08, 12), postMat);
    post.position.set(0, (height + 0.08) / 2, z);
    post.castShadow = castShadow;
    group.add(post);
  });

  // Top white tape
  const topTape = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, width), tapeMat);
  topTape.position.set(0, height - 0.04, 0);
  group.add(topTape);

  // Braided net mesh
  const netHeight = height * 0.52;
  const netPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, netHeight, 24, 6), meshMat);
  netPlane.rotation.y = Math.PI / 2;
  netPlane.position.set(0, height - netHeight / 2 - 0.04, 0);
  group.add(netPlane);

  return group;
}

export const Venue3DViewerModal: React.FC<Venue3DViewerModalProps> = ({
  initialSport,
  venues,
  onClose,
  onBookVenue,
}) => {
  const [activeSport, setActiveSport] = useState<SportCategory>(initialSport);
  const [lightingMood, setLightingMood] = useState<LightingMood>('night');
  const [activePreset, setActivePreset] = useState<CameraPresetId>('iso');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetTriggerRef = useRef<CameraPresetId | null>('iso');
  const lightingMoodRef = useRef<LightingMood>(lightingMood);
  const activeSportRef = useRef<SportCategory>(activeSport);

  const matchingVenue = venues.find((v) => v.sport === activeSport) ?? venues[0];

  useEffect(() => {
    lightingMoodRef.current = lightingMood;
  }, [lightingMood]);

  useEffect(() => {
    activeSportRef.current = activeSport;
  }, [activeSport]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const isNight = lightingMood === 'night';
    const skyColor = new THREE.Color(isNight ? 0x0b1222 : 0xdbeafe);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(skyColor, 28, 72);

    // Studio IBL PBR environment reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = isNight ? 0.55 : 0.85;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.2, 140);
    const initialPreset = CAMERA_PRESETS[activePreset];
    camera.position.set(...initialPreset.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 8;
    controls.maxDistance = 42;
    controls.target.set(...initialPreset.target);
    controls.update();

    // Lighting rig: warm key directional + cool hemisphere fill + ambient rim
    const hemiLight = new THREE.HemisphereLight(
      isNight ? 0x93c5fd : 0xe0f2fe,
      isNight ? 0x1e293b : 0x334155,
      isNight ? 0.65 : 1.15
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      isNight ? 0xfff1db : 0xfff8eb,
      isNight ? 2.4 : 2.1
    );
    keyLight.position.set(14, 22, 12);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 4;
      keyLight.shadow.camera.far = 55;
      keyLight.shadow.camera.left = -20;
      keyLight.shadow.camera.right = 20;
      keyLight.shadow.camera.top = 20;
      keyLight.shadow.camera.bottom = -20;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x34d399, isNight ? 0.65 : 0.25);
    rimLight.position.set(-16, 12, -14);
    scene.add(rimLight);

    // Arena foundation floor + Court deck
    const arenaGroup = new THREE.Group();
    scene.add(arenaGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const courtTexture = createCourtCanvasTexture(activeSport, maxAniso);
    const shadowTex = createContactShadowTexture();
    const scoreboardTex = createScoreboardTexture(activeSport);

    // Extended surrounding ground slab
    const outerSlab = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({
        color: isNight ? 0x0f172a : 0x94a3b8,
        roughness: 0.92,
        metalness: 0.05,
      })
    );
    outerSlab.rotation.x = -Math.PI / 2;
    outerSlab.position.y = -0.05;
    outerSlab.receiveShadow = !isSoftwareGl;
    arenaGroup.add(outerSlab);

    // Raised athletic plinth
    const courtLen = activeSport === 'Mini Soccer' ? 24 : activeSport === 'Futsal' ? 21 : 18;
    const courtWid = activeSport === 'Mini Soccer' ? 14 : activeSport === 'Futsal' ? 12 : 10;

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(courtLen + 3.2, 0.24, courtWid + 3.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.15 })
    );
    plinth.position.y = -0.12;
    plinth.receiveShadow = !isSoftwareGl;
    arenaGroup.add(plinth);

    // Playable procedural court surface
    const courtSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(courtLen, courtWid),
      new THREE.MeshStandardMaterial({
        map: courtTexture,
        roughness: activeSport === 'Mini Soccer' || activeSport === 'Padel' ? 0.84 : 0.42,
        metalness: 0.06,
      })
    );
    courtSurface.rotation.x = -Math.PI / 2;
    courtSurface.position.y = 0.01;
    courtSurface.receiveShadow = !isSoftwareGl;
    arenaGroup.add(courtSurface);

    // Sport-specific composite 3D equipment
    const castShadow = !isSoftwareGl;
    if (activeSport === 'Badminton') {
      const net = buildCourtNet(courtWid * 0.72, 1.55, castShadow);
      arenaGroup.add(net);

      // Composite Umpire Chair on far side
      const chair = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.75 });
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.5 });
      [
        [-0.3, -0.3],
        [0.3, -0.3],
        [-0.3, 0.3],
        [0.3, 0.3],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.0, 8), steel);
        leg.position.set(lx, 1.0, lz);
        leg.castShadow = castShadow;
        chair.add(leg);
      });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.75), seatMat);
      seat.position.set(0, 2.02, 0);
      chair.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.08), seatMat);
      back.position.set(0, 2.34, -0.34);
      chair.add(back);
      chair.position.set(0, 0, -courtWid / 2 - 0.85);
      arenaGroup.add(chair);
    } else if (activeSport === 'Padel') {
      const net = buildCourtNet(courtWid * 0.82, 0.92, castShadow);
      arenaGroup.add(net);

      // Panoramic Tempered Glass Back & Corner Walls + Steel Mullions
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.24,
        roughness: 0.08,
        metalness: 0.1,
        transmission: 0.5,
      });
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.8 });

      const wallH = 3.2;
      const halfL = courtLen * 0.41;
      const halfW = courtWid * 0.41;

      // Both end glass walls
      [-halfL, halfL].forEach((x) => {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, wallH, halfW * 2), glassMat);
        glass.position.set(x, wallH / 2, 0);
        arenaGroup.add(glass);

        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, halfW * 2 + 0.15), frameMat);
        topRail.position.set(x, wallH, 0);
        arenaGroup.add(topRail);

        // Corner & mid steel pillars
        [-halfW, -halfW * 0.35, halfW * 0.35, halfW].forEach((z) => {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH + 0.08, 0.14), frameMat);
          pillar.position.set(x, wallH / 2, z);
          pillar.castShadow = castShadow;
          arenaGroup.add(pillar);
        });
      });

      // Side panoramic glass corners & metallic cage mid-sections
      const cageMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        wireframe: true,
        transparent: true,
        opacity: 0.42,
      });
      [-halfW, halfW].forEach((z) => {
        const cage = new THREE.Mesh(new THREE.PlaneGeometry(halfL * 2, 2.8, 16, 6), cageMat);
        cage.position.set(0, 1.4, z);
        arenaGroup.add(cage);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(halfL * 2, 0.1, 0.1), frameMat);
        rail.position.set(0, 2.8, z);
        arenaGroup.add(rail);
      });
    } else {
      // Futsal & Mini Soccer Goals on both ends
      const goalW = activeSport === 'Mini Soccer' ? 4.4 : 3.2;
      const goalH = activeSport === 'Mini Soccer' ? 2.15 : 1.85;
      const goalD = activeSport === 'Mini Soccer' ? 1.5 : 1.1;
      const xOffset = courtLen * 0.425;

      const leftGoal = buildGoalFrame(goalW, goalH, goalD, castShadow);
      leftGoal.position.set(-xOffset, 0, 0);
      arenaGroup.add(leftGoal);

      const rightGoal = buildGoalFrame(goalW, goalH, goalD, castShadow);
      rightGoal.rotation.y = Math.PI;
      rightGoal.position.set(xOffset, 0, 0);
      arenaGroup.add(rightGoal);
    }

    // Two Team Benches along sideline
    const benchA = buildTeamBench(shadowTex, castShadow);
    benchA.position.set(-4.2, 0, -courtWid / 2 - 1.15);
    arenaGroup.add(benchA);

    const benchB = buildTeamBench(shadowTex, castShadow);
    benchB.position.set(4.2, 0, -courtWid / 2 - 1.15);
    arenaGroup.add(benchB);

    // Digital CourtSync Scoreboard mounted on steel stanchions
    const sbGroup = new THREE.Group();
    const sbPoleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.75 });
    [-1.4, 1.4].forEach((x) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.2, 10), sbPoleMat);
      st.position.set(x, 2.1, 0);
      st.castShadow = castShadow;
      sbGroup.add(st);
    });
    const sbHousing = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.4 })
    );
    sbHousing.position.set(0, 4.4, 0);
    sbHousing.castShadow = castShadow;
    sbGroup.add(sbHousing);

    const sbScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(4.1, 1.88),
      new THREE.MeshBasicMaterial({ map: scoreboardTex })
    );
    sbScreen.position.set(0, 4.4, 0.16);
    sbGroup.add(sbScreen);

    sbGroup.position.set(0, 0, -courtWid / 2 - 2.6);
    arenaGroup.add(sbGroup);

    // 4 Corner Stadium LED Floodlight Towers
    const towerH = activeSport === 'Mini Soccer' ? 9.5 : 7.6;
    const towerCorners: Array<[number, number, number]> = [
      [-courtLen / 2 - 1.2, -courtWid / 2 - 1.2, Math.PI * 0.25],
      [courtLen / 2 + 1.2, -courtWid / 2 - 1.2, -Math.PI * 0.25],
      [-courtLen / 2 - 1.2, courtWid / 2 + 1.2, Math.PI * 0.75],
      [courtLen / 2 + 1.2, courtWid / 2 + 1.2, -Math.PI * 0.75],
    ];
    towerCorners.forEach(([tx, tz, rotY]) => {
      const tower = buildFloodlightTower(towerH, isNight, castShadow);
      tower.position.set(tx, 0, tz);
      tower.rotation.y = rotY;
      arenaGroup.add(tower);
    });

    // Pre-allocated scratch vectors for smooth damped camera preset transitions
    const desiredCamPos = new THREE.Vector3(...initialPreset.pos);
    const desiredTarget = new THREE.Vector3(...initialPreset.target);
    let isTransitioning = false;

    const onControlStart = () => {
      isTransitioning = false;
      presetTriggerRef.current = null;
    };
    controls.addEventListener('start', onControlStart);

    // ResizeObserver for crisp viewport sizing
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let lastTime = performance.now();
    let frameTimer: number | null = null;
    let disposed = false;

    const animate = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (presetTriggerRef.current) {
        const preset = CAMERA_PRESETS[presetTriggerRef.current];
        desiredCamPos.set(...preset.pos);
        desiredTarget.set(...preset.target);
        isTransitioning = true;
        presetTriggerRef.current = null;
      }

      if (isTransitioning) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 5.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 5.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 5.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, 5.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, 5.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, 5.5, dt);

        if (
          camera.position.distanceTo(desiredCamPos) < 0.08 &&
          controls.target.distanceTo(desiredTarget) < 0.05
        ) {
          isTransitioning = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameTimer = window.setTimeout(() => {
          rafId = requestAnimationFrame(animate);
        }, 50);
      } else {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (frameTimer !== null) window.clearTimeout(frameTimer);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();

      // Dispose all GPU geometries, materials, and textures
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m && 'map' in m && m.map instanceof THREE.Texture) {
              m.map.dispose();
            }
            m?.dispose();
          });
        }
      });
      courtTexture.dispose();
      shadowTex.dispose();
      scoreboardTex.dispose();
      envTarget.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [activeSport, lightingMood]);

  const triggerPreset = (presetId: CameraPresetId) => {
    setActivePreset(presetId);
    presetTriggerRef.current = presetId;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tur 3D Lapangan CourtSync"
      className="fixed inset-0 z-50 bg-[#0b1222] text-white overflow-hidden"
    >
      {/* Isolated Full-Viewport WebGL Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Minimal Top-Left Corner Title Overlay (Solid dark rgba, zero backdrop-filter) */}
      <div className="pointer-events-none fixed top-4 left-4 right-4 flex items-start justify-between gap-3 z-10">
        <div className="pointer-events-auto bg-[#0F172A]/95 border border-slate-700/80 rounded-xl px-4 py-2.5 max-w-md shadow-xl">
          <p className="text-[11px] font-semibold text-emerald-400">
            Tur 3D Lapangan · {activeSport}
          </p>
          <h2 className="font-display font-bold text-sm sm:text-base text-white tracking-tight mt-0.5">
            {matchingVenue ? matchingVenue.name : `Standar Lapangan ${activeSport} Bandung`}
          </h2>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Seret untuk memutar · Gulir untuk zoom · {matchingVenue ? matchingVenue.area : 'Bandung Raya'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup Tur 3D"
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0F172A]/95 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold rounded-xl shadow-xl transition-colors"
        >
          <X className="w-4 h-4" />
          <span>Tutup 3D</span>
        </button>
      </div>

      {/* Collapsible Compact Bottom Control Dock (Solid dark rgba, zero backdrop-filter, <= 15% height) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-4xl">
        <div className="bg-[#0F172A]/95 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {SPORTS.map((sport) => {
                const active = activeSport === sport;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => {
                      setActiveSport(sport);
                      triggerPreset('iso');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDockCollapsed((c) => !c)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 rounded-lg transition-colors"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Kontrol</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Sembunyikan</span>
                  </>
                )}
              </button>
              {matchingVenue ? (
                <button
                  type="button"
                  onClick={() => {
                    onBookVenue(matchingVenue.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Booking GOR Ini</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs rounded-lg transition-colors whitespace-nowrap"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Kembali ke Jelajah</span>
                </button>
              )}
            </div>
          </div>

          {!dockCollapsed && (
            <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Camera Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 mr-1">
                  <Camera className="w-3.5 h-3.5" />
                  Kamera:
                </span>
                {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetId) => (
                  <button
                    key={presetId}
                    type="button"
                    onClick={() => triggerPreset(presetId)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                      activePreset === presetId
                        ? 'bg-slate-700 border-emerald-400 text-white'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {CAMERA_PRESETS[presetId].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => triggerPreset('iso')}
                  title="Reset posisi kamera"
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lighting Mood Switch */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLightingMood('day')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    lightingMood === 'day'
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Siang Bandung</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightingMood('night')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    lightingMood === 'night'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Malam Prime Time</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

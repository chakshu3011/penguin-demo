import "./App.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  XR,
  ARButton,
  Interactive,
  useHitTest,
  useXR,
} from "@react-three/xr";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ======================================================
// GLOBAL SETTINGS
// ======================================================

const MINDAR_SCRIPT = "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";
const TARGET_SRC = "/targets/icy-marker.mind";

const GAME_SIZES = {
  android: {
    iceModelScale: 0.09,
    iceGroundRadius: 1.9,
    penguinScale: 0.9,
    itemScales: { fish: 0.0075, krill: 0.0035, plastic: 0.004 },
    itemY: 0.34,
    itemMinRadius: 0.65,
    itemMaxRadius: 1.35,
  },
  mindar: {
    iceGroundRadius: 0.82,
    iceModelScale: 0.12,
    penguinScale: 0.78,
    itemScales: { fish: 0.011, krill: 0.005, plastic: 0.0055 },
    itemMinRadius: 0.32,
    itemMaxRadius: 0.58,
    itemZ: 0.18,
  },
};

// ======================================================
// WEIGHTED SPAWN GENERATION (70% Fish, 20% Krill, 10% Plastic)
// ======================================================
const generateWeightedItem = (platform) => {
  const settings = GAME_SIZES[platform];
  const angle = Math.random() * Math.PI * 2;
  const radius = settings.itemMinRadius + Math.random() * (settings.itemMaxRadius - settings.itemMinRadius);

  const roll = Math.random();
  let type = "fish";
  if (roll > 0.7 && roll <= 0.9) {
    type = "krill";
  } else if (roll > 0.9) {
    type = "plastic";
  }

  let position;
  if (platform === "android") {
    position = [Math.cos(angle) * radius, settings.itemY, Math.sin(angle) * radius];
  } else {
    position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, settings.itemZ);
  }

  return { type, position };
};

// ======================================================
// DEVICE HELPERS
// ======================================================
const isIOSDevice = () => {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
};

// ======================================================
// MODEL PRELOADS FOR ANDROID WEBXR
// ======================================================
useGLTF.preload("/models/penguin.glb");
useGLTF.preload("/models/fish.glb");
useGLTF.preload("/models/krill.glb");
useGLTF.preload("/models/plastic.glb");
useGLTF.preload("/models/ice_floe.glb");

function loadMindARScript() {
  return new Promise((resolve, reject) => {
    if (window.MINDAR && window.MINDAR.IMAGE) {
      resolve(window.MINDAR.IMAGE.MindARThree);
      return;
    }
    const existingScript = document.querySelector(`script[src="${MINDAR_SCRIPT}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (window.MINDAR && window.MINDAR.IMAGE) resolve(window.MINDAR.IMAGE.MindARThree);
        else reject(new Error("MindAR execution error"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = MINDAR_SCRIPT;
    script.async = true;
    script.onload = () => {
      if (window.MINDAR && window.MINDAR.IMAGE) resolve(window.MINDAR.IMAGE.MindARThree);
      else reject(new Error("MindAR initialization missing context"));
    };
    document.body.appendChild(script);
  });
}

// ======================================================
// ANDROID WEBXR GEOMETRY
// ======================================================
function BigIceGround({ android = true }) {
  const settings = android ? GAME_SIZES.android : GAME_SIZES.mindar;
  return (
    <group position={[0, -0.025, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[settings.iceGroundRadius, 96]} />
        <meshBasicMaterial color="#dff8ff" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[settings.iceGroundRadius * 0.88, settings.iceGroundRadius, 96]} />
        <meshBasicMaterial color="#76d7ff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function IceFloe() {
  const ice = useGLTF("/models/ice_floe.glb");
  return <primitive object={ice.scene} scale={GAME_SIZES.android.iceModelScale} position={[0, -0.01, 0]} />;
}

function Penguin({ targetPosition }) {
  const group = useRef();
  const penguin = useGLTF("/models/penguin.glb");
  const { actions, names } = useAnimations(penguin.animations, group);

  useEffect(() => {
    if (names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().fadeIn(0.25).play();
    }
  }, [actions, names]);

  // Android Vector Interpolation tracking engine loop
  useFrame((state, delta) => {
    if (group.current && targetPosition) {
      const target = new THREE.Vector3(...targetPosition);
      const dir = new THREE.Vector3().subVectors(target, group.current.position);
      dir.y = 0; // Lock to ground plane alignment metrics

      if (dir.lengthSq() > 0.01) {
        const targetAngle = Math.atan2(dir.x, dir.z);
        group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetAngle, delta * 4.5);
        group.current.position.lerp(target, delta * 1.5);
        group.current.position.y = 0.03; // Maintain stable model baseline
      }
    }
  });

  return <primitive ref={group} object={penguin.scene} scale={GAME_SIZES.android.penguinScale} position={[0, 0.03, 0]} />;
}

function XRTracker({ onXRStart }) {
  const { isPresenting } = useXR();
  useEffect(() => { onXRStart(isPresenting); }, [isPresenting, onXRStart]);
  return null;
}

function Reticle({ onPlace }) {
  const reticleRef = useRef();
  const { camera } = useThree();

  useHitTest((hitMatrix, hit) => {
    if (hit && reticleRef.current) {
      hitMatrix.decompose(reticleRef.current.position, reticleRef.current.quaternion, reticleRef.current.scale);
    }
  });

  return (
    <Interactive onSelect={() => {
      if (!reticleRef.current) return;
      const spawnPos = reticleRef.current.position.clone();
      const dirX = spawnPos.x - camera.position.x;
      const dirZ = spawnPos.z - camera.position.z;
      const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (distance > 0 && distance < 1.7) {
        const push = 1.7 - distance;
        spawnPos.x += (dirX / distance) * push;
        spawnPos.z += (dirZ / distance) * push;
      }
      onPlace(spawnPos);
    }}>
      <mesh ref={reticleRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.24, 48]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
      </mesh>
    </Interactive>
  );
}

// ======================================================
// ANDROID DYNAMIC NODE COMPONENT
// ======================================================
function AndroidItemNode({ type, position, onCollect }) {
  const ref = useRef();
  const fishModel = useGLTF("/models/fish.glb");
  const krillModel = useGLTF("/models/krill.glb");
  const plasticModel = useGLTF("/models/plastic.glb");

  const activeScene = useMemo(() => {
    if (type === "krill") return krillModel.scene;
    if (type === "plastic") return plasticModel.scene;
    return fishModel.scene;
  }, [type, fishModel, krillModel, plasticModel]);

  const { actions, names } = useAnimations(type === "krill" ? krillModel.animations : [], ref);

  useEffect(() => {
    if (type === "krill" && names && names.length > 0 && actions[names[0]]) {
      actions[names[0]].reset().play();
    }
  }, [type, actions, names]);

  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.y += 0.035;
      ref.current.position.y = position[1] + Math.sin(Date.now() * 0.004) * 0.06;
    }
  });

  return (
    <Interactive onSelect={onCollect}>
      <group ref={ref} position={position}>
        <primitive object={activeScene} scale={GAME_SIZES.android.itemScales[type]} position={[0, 0, 0]} />
      </group>
    </Interactive>
  );
}

// ======================================================
// INITIALIZE MINDAR BACKDROP
// ======================================================
function createMindARIceGround() {
  const group = new THREE.Group();
  const settings = GAME_SIZES.mindar;

  const circleGeometry = new THREE.CircleGeometry(settings.iceGroundRadius, 96);
  const circleMaterial = new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const circle = new THREE.Mesh(circleGeometry, circleMaterial);
  group.add(circle);

  const ringGeometry = new THREE.RingGeometry(settings.iceGroundRadius * 0.88, settings.iceGroundRadius, 96);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x76d7ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.set(0, 0, 0.004);
  group.add(ring);

  return group;
}

// ======================================================
// MINDAR CORE GAME LOOP CONTAINER (iOS fallback engine)
// ======================================================
function MindARMarkerGame({
  isActive,
  targetSrc,
  isGameOver,
  onReady,
  onTrackingChange,
  onItemCollected,
  activeItem,
}) {
  const containerRef = useRef(null);
  const mindarRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  const itemGroupRef = useRef(null);
  const itemHitRef = useRef(null);
  const markerFoundRef = useRef(false);

  const mixerRef = useRef(null);
  const krillMixerRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());

  const isGameOverRef = useRef(isGameOver);
  const onItemCollectedRef = useRef(onItemCollected);
  const onTrackingChangeRef = useRef(onTrackingChange);
  const onReadyRef = useRef(onReady);

  const penguinRootRef = useRef(null);
  const lastCollectTimeRef = useRef(0);

  useEffect(() => { isGameOverRef.current = isGameOver; }, [isGameOver]);
  useEffect(() => { onItemCollectedRef.current = onItemCollected; }, [onItemCollected]);
  useEffect(() => { onTrackingChangeRef.current = onTrackingChange; }, [onTrackingChange]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // Synchronize dynamic items inside iOS loop structure
  useEffect(() => {
    if (!isActive || !sceneRef.current || !itemGroupRef.current || !itemHitRef.current) return;

    // Reset old items to prevent overlap clipping
    while (itemGroupRef.current.children.length > 0) {
      itemGroupRef.current.remove(itemGroupRef.current.children[0]);
    }

    krillMixerRef.current = null;
    const loader = new GLTFLoader();
    const modelPath = `/models/${activeItem.type}.glb`;

    loader.load(modelPath, (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(GAME_SIZES.mindar.itemScales[activeItem.type]);
      
      // Flip layout alignment vectors to face correct vertical marker parameters
      if (activeItem.type !== "krill") {
        model.rotation.x = Math.PI / 2;
      }
      
      itemGroupRef.current.add(model);

      if (activeItem.type === "krill" && gltf.animations && gltf.animations.length > 0) {
        const kmixer = new THREE.AnimationMixer(model);
        krillMixerRef.current = kmixer;
        kmixer.clipAction(gltf.animations[0]).reset().play();
      }

      itemGroupRef.current.position.copy(activeItem.position);
      itemHitRef.current.position.copy(activeItem.position);
    });

  }, [activeItem, isActive]);

  useEffect(() => {
    if (!isActive) return;
    let disposed = false;
    let pointerHandler = null;

    const setupMindAR = async () => {
      try {
        const MindARThree = await loadMindARScript();
        if (disposed || !containerRef.current) return;

        const mindarThree = new MindARThree({
          container: containerRef.current,
          imageTargetSrc: targetSrc,
          uiScanning: "yes",
          uiLoading: "yes",
          filterMinCF: 0.0001,
          filterBeta: 0.001,
        });

        mindarRef.current = mindarThree;
        const { renderer, scene, camera } = mindarThree;
        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = camera;

        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.style.position = "absolute";
        renderer.domElement.style.inset = "0";

        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.4);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
        directionalLight.position.set(0, 2, 3);
        scene.add(directionalLight);

        const anchor = mindarThree.addAnchor(0);

        anchor.onTargetFound = () => {
          markerFoundRef.current = true;
          if (onTrackingChangeRef.current) onTrackingChangeRef.current(true);
        };
        anchor.onTargetLost = () => {
          markerFoundRef.current = false;
          if (onTrackingChangeRef.current) onTrackingChangeRef.current(false);
        };

        anchor.group.add(createMindARIceGround());
        const loader = new GLTFLoader();

        const [iceGltf, penguinGltf] = await Promise.all([
          loader.loadAsync("/models/ice_floe.glb"),
          loader.loadAsync("/models/penguin.glb"),
        ]);

        if (disposed) return;

        const iceModel = iceGltf.scene;
        iceModel.scale.setScalar(GAME_SIZES.mindar.iceModelScale);
        iceModel.position.set(0, 0, 0.025);
        iceModel.rotation.x = Math.PI / 2;
        anchor.group.add(iceModel);

        const penguinRoot = new THREE.Group();
        penguinRoot.position.set(0, 0, 0.03);
        const penguinModel = penguinGltf.scene;
        penguinModel.scale.setScalar(GAME_SIZES.mindar.penguinScale);
        penguinModel.rotation.x = Math.PI / 2;
        penguinRoot.add(penguinModel);
        anchor.group.add(penguinRoot);
        penguinRootRef.current = penguinRoot;

        if (penguinGltf.animations && penguinGltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(penguinModel);
          mixerRef.current = mixer;
          mixer.clipAction(penguinGltf.animations[0]).reset().play();
        }

        const itemGroup = new THREE.Group();
        anchor.group.add(itemGroup);
        itemGroupRef.current = itemGroup;

        const itemHitGeometry = new THREE.SphereGeometry(0.18, 24, 24);
        const itemHitMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthWrite: false });
        const itemHit = new THREE.Mesh(itemHitGeometry, itemHitMaterial);
        anchor.group.add(itemHit);
        itemHitRef.current = itemHit;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        pointerHandler = (event) => {
          if (!rendererRef.current || !cameraRef.current || !itemHitRef.current || isGameOverRef.current || !markerFoundRef.current) return;
          event.preventDefault();

          const now = Date.now();
          if (now - lastCollectTimeRef.current < 250) return;

          const rect = rendererRef.current.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(pointer, cameraRef.current);
          const hits = raycaster.intersectObject(itemHitRef.current, true);

          if (hits.length > 0) {
            lastCollectTimeRef.current = now;
            if (onItemCollectedRef.current) onItemCollectedRef.current();
          }
        };

        renderer.domElement.addEventListener("pointerdown", pointerHandler, { passive: false });
        await mindarThree.start();
        if (onReadyRef.current) onReadyRef.current();

        renderer.setAnimationLoop(() => {
          const delta = clockRef.current.getDelta();
          if (mixerRef.current) mixerRef.current.update(delta);
          if (krillMixerRef.current) krillMixerRef.current.update(delta);

          // iOS tracking waddle interpolation loop matrix engine
          if (penguinRootRef.current && activeItem && markerFoundRef.current) {
            const pRoot = penguinRootRef.current;
            // Map flat plane tracking targeting nodes for iOS landscape space
            const targetVec = new THREE.Vector3(activeItem.position.x, activeItem.position.y, 0.03);
            const dir = new THREE.Vector3().subVectors(targetVec, pRoot.position);
            
            if (dir.lengthSq() > 0.005) {
              const targetAngle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
              pRoot.rotation.z = THREE.MathUtils.lerp(pRoot.rotation.z, targetAngle, delta * 4.0);
              pRoot.position.lerp(targetVec, delta * 1.2);
            }
          }

          if (itemGroupRef.current && itemHitRef.current) {
            const floatingZ = activeItem.position.z + Math.sin(Date.now() * 0.004) * 0.035;
            itemGroupRef.current.position.z = floatingZ;
            itemHitRef.current.position.z = floatingZ;
            itemGroupRef.current.rotation.z += 0.035;
          }

          renderer.render(scene, camera);
        });
      } catch (e) {
        console.error(e);
      }
    };

    setupMindAR();

    return () => {
      disposed = true;
      if (rendererRef.current && pointerHandler) rendererRef.current.domElement.removeEventListener("pointerdown", pointerHandler);
      if (rendererRef.current) rendererRef.current.setAnimationLoop(null);
      if (mindarRef.current) mindarRef.current.stop();
      markerFoundRef.current = false;
      if (onTrackingChangeRef.current) onTrackingChangeRef.current(false);
    };
  }, [isActive, targetSrc]);

  if (!isActive) return null;
  return <div ref={containerRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", zIndex: 1, background: "black" }} />;
}

// ======================================================
// MAIN ENTRY APP PIPELINE
// ======================================================
export default function App() {
  const [overlayElement, setOverlayElement] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [webXRSupported, setWebXRSupported] = useState(false);
  const [supportChecked, setSupportChecked] = useState(false);

  const [mode, setMode] = useState("intro");
  const [isXRPresenting, setIsXRPresenting] = useState(false);
  const [androidGamePosition, setAndroidGamePosition] = useState(null);
  
  // Reconfigured tracking engine configuration state
  const [activeItem, setActiveItem] = useState(() => generateWeightedItem("android"));

  const [mindARReady, setMindARReady] = useState(false);
  const [markerFound, setMarkerFound] = useState(false);

  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60); // 1 Minute Countdown Requirement
  const [isGameOver, setIsGameOver] = useState(false);
  const [plasticDeath, setPlasticDeath] = useState(false); // Sudden Death Flag

  const ambience = useRef(null);
  const collect = useRef(null);
  const footsteps = useRef(null);
  const penguinChirp = useRef(null);

  const gameIsActive = useMemo(() => {
    if (mode === "android-webxr") return isXRPresenting;
    if (mode === "mindar-marker") return mindARReady;
    return false;
  }, [mode, isXRPresenting, mindARReady]);

  const gameHasStartedForTimer = useMemo(() => {
    if (mode === "android-webxr") return Boolean(androidGamePosition);
    if (mode === "mindar-marker") return markerFound;
    return false;
  }, [mode, androidGamePosition, markerFound]);

  useEffect(() => {
    const checkSupport = async () => {
      const ios = isIOSDevice();
      setIsIOS(ios);
      if (typeof navigator !== "undefined" && navigator.xr && !ios) {
        try {
          const supported = await navigator.xr.isSessionSupported("immersive-ar");
          setWebXRSupported(supported);
        } catch (e) {
          setWebXRSupported(false);
        }
      } else {
        setWebXRSupported(false);
      }
      setSupportChecked(true);
    };
    checkSupport();
  }, []);

  useEffect(() => {
    ambience.current = new Audio("/audios/antarctic_ambience.mp3");
    ambience.current.loop = true;
    ambience.current.volume = 0.3;
    collect.current = new Audio("/audios/fish_collect.mp3");
    footsteps.current = new Audio("/audios/snow_footsteps.mp3");
    footsteps.current.volume = 0.5;
    penguinChirp.current = new Audio("/audios/baby_penguin.mp3");
    penguinChirp.current.volume = 1.0;

    return () => {
      if (ambience.current) ambience.current.pause();
      if (collect.current) collect.current.pause();
      if (footsteps.current) footsteps.current.pause();
      if (penguinChirp.current) penguinChirp.current.pause();
    };
  }, []);

  useEffect(() => {
    let timer;
    if (gameHasStartedForTimer && timeLeft > 0 && !isGameOver) {
      timer = setInterval(() => { setTimeLeft((prev) => prev - 1); }, 1000);
    } else if (timeLeft === 0 && !isGameOver) {
      setIsGameOver(true);
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
    }
    return () => clearInterval(timer);
  }, [gameHasStartedForTimer, timeLeft, isGameOver]);

  const handleCollection = () => {
    if (isGameOver) return;

    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    // SUDDEN PLASTIC DEATH CHECK
    if (activeItem.type === "plastic") {
      setPlasticDeath(true);
      setIsGameOver(true);
      if (penguinChirp.current) {
        penguinChirp.current.currentTime = 0;
        penguinChirp.current.play().catch((e) => console.log(e));
      }
      return;
    }

    const pointsGained = activeItem.type === "krill" ? 2 : 1;
    setScore((s) => s + pointsGained);

    if (collect.current) {
      collect.current.currentTime = 0;
      collect.current.play().catch((e) => console.log(e));
    }
    if (footsteps.current) {
      footsteps.current.currentTime = 0;
      footsteps.current.play().catch((e) => console.log(e));
    }

    const nextPlatform = mode === "mindar-marker" ? "mindar" : "android";
    setActiveItem(generateWeightedItem(nextPlatform));
  };

  const startMindARGame = () => {
    setScore(0);
    setTimeLeft(60);
    setIsGameOver(false);
    setPlasticDeath(false);
    setActiveItem(generateWeightedItem("mindar"));
    setMode("mindar-marker");
    if (ambience.current) ambience.current.play().catch((e) => console.log(e));
  };

  const stopGame = () => {
    if (ambience.current) ambience.current.pause();
    setScore(0);
    setTimeLeft(60);
    setIsGameOver(false);
    setPlasticDeath(false);
    setAndroidGamePosition(null);
    setMode("intro");
    setIsXRPresenting(false);
    setMindARReady(false);
    setMarkerFound(false);
  };

  const playAgain = () => {
    setScore(0);
    setTimeLeft(60);
    setIsGameOver(false);
    setPlasticDeath(false);
    setAndroidGamePosition(null);
    const platform = mode === "mindar-marker" ? "mindar" : "android";
    setActiveItem(generateWeightedItem(platform));
    if (ambience.current) ambience.current.play().catch((e) => console.log(e));
  };

  const getEndMessage = () => {
    if (plasticDeath) return "You fed plastic to ICY which is deadly for penguins to eat! ❌😭";
    if (score === 0) return "ICY is sad and starving! 😭";
    if (score <= 5) return "ICY survived, but is still hungry! 🐟";
    if (score <= 12) return "ICY is well-fed and happy! 🐧";
    return "ICY is stuffed and ready to dance! 🎉";
  };

  const showIntro = mode === "intro" && !isXRPresenting;
  const showHUD = gameIsActive;
  const androidCanUseWebXR = supportChecked && webXRSupported && !isIOS;
  const shouldUseIOSFallback = supportChecked && (isIOS || !webXRSupported);

  return (
    <div style={{ width: "100vw", height: "100dvh", overflow: "hidden", position: "relative", backgroundColor: "#0b0f19", touchAction: "none" }}>
      
      {/* IOS MARKER RUNTIME LAYOUT CONTAINER */}
      <MindARMarkerGame
        isActive={mode === "mindar-marker"}
        targetSrc={TARGET_SRC}
        isGameOver={isGameOver}
        onReady={() => setMindARReady(true)}
        onTrackingChange={setMarkerFound}
        onItemCollected={handleCollection}
        activeItem={activeItem}
      />

      {/* INTRO LANDING SHEET */}
      {showIntro && (
        <div style={{ position: "absolute", zIndex: 5, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "white", padding: "24px", boxSizing: "border-box", textAlign: "center" }}>
          <h1 style={{ fontSize: "44px", marginBottom: "10px", lineHeight: 1 }}>ICY AR</h1>
          <p style={{ fontSize: "18px", opacity: 0.85, marginBottom: "28px" }}>An Augmented Reality Experience</p>

          {shouldUseIOSFallback && (
            <>
              <p style={{ maxWidth: "320px", fontSize: "15px", opacity: 0.85, marginBottom: "24px" }}>
                Scan the **ICY Marker** image with your camera view to anchor the ice floe. Avoid marine plastic litter!
              </p>
              <button onClick={startMindARGame} style={{ padding: "15px 32px", fontSize: "17px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "white", color: "#0b0f19", cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
                Start iOS AR Game
              </button>
            </>
          )}
        </div>
      )}

      {/* DYNAMIC HUB DISPLAY SCREEN */}
      <div ref={setOverlayElement} style={{ position: "absolute", zIndex: 10, width: "100%", height: "100%", pointerEvents: "none", display: showHUD ? "flex" : "none", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "20px", width: "100%", boxSizing: "border-box", alignItems: "flex-start" }}>
          <div style={{ color: "white", fontSize: "24px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
            Score: {score}
          </div>
          {!isGameOver && (
            <div style={{ color: timeLeft <= 10 ? "#e11d48" : "white", fontSize: "28px", fontWeight: "bold", textShadow: "2px 2px 4px rgba(0,0,0,0.8)" }}>
              00:{timeLeft.toString().padStart(2, "0")}
            </div>
          )}
          <button onClick={stopGame} style={{ padding: "10px 18px", fontSize: "14px", fontWeight: "bold", borderRadius: "20px", border: "2px solid white", background: "#e11d48", color: "white", pointerEvents: "auto", cursor: "pointer" }}>
            Exit
          </button>
        </div>

        {mode === "android-webxr" && isXRPresenting && !androidGamePosition && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "white", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.55)", padding: "12px 22px", borderRadius: "12px", maxWidth: "300px" }}>
            Scan the floor and tap the ring to place ICY!
          </div>
        )}

        {mode === "mindar-marker" && mindARReady && !markerFound && !isGameOver && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#facc15", fontSize: "18px", fontWeight: "bold", textAlign: "center", background: "rgba(0,0,0,0.75)", padding: "14px 24px", borderRadius: "12px", width: "75%" }}>
            Point camera at the printed Icy Marker! 📷
          </div>
        )}

        {isGameOver && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.9)", zIndex: 50, color: "white", textAlign: "center", padding: "20px", pointerEvents: "auto" }}>
            <h1 style={{ fontSize: "42px", marginBottom: "10px", color: plasticDeath ? "#e11d48" : "#10b981" }}>
              {plasticDeath ? "GAME OVER" : "TIME'S UP!"}
            </h1>
            <p style={{ fontSize: "22px", marginBottom: "15px" }}>Final Score: <b>{score}</b></p>
            <p style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "35px", color: "#60a5fa", maxWidth: "320px" }}>{getEndMessage()}</p>
            <button onClick={playAgain} style={{ padding: "15px 35px", fontSize: "18px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "#2B4BAA", color: "white", cursor: "pointer" }}>
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* ANDROID ENTRY CONTROL ACCESSIBILITY */}
      {androidCanUseWebXR && overlayElement && (
        <ARButton
          sessionInit={{ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlayElement } }}
          onClick={() => { setMode("android-webxr"); setScore(0); setTimeLeft(60); setIsGameOver(false); setPlasticDeath(false); setActiveItem(generateWeightedItem("android")); if (ambience.current) ambience.current.play().catch(e => console.log(e)); }}
          style={{ position: "absolute", bottom: "40px", left: "50%", transform: "translateX(-50%)", padding: "14px 28px", fontSize: "16px", fontWeight: "bold", borderRadius: "30px", border: "none", background: "white", color: "black", zIndex: 20 }}
        />
      )}

      {/* WEBXR RECT-THREE RENDERING LAYOUT */}
      {mode === "android-webxr" && (
        <Canvas camera={{ position: [0, 0, 0], fov: 60, near: 0.01, far: 100 }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }}>
          <XR>
            <XRTracker onXRStart={setIsXRPresenting} />
            {isXRPresenting && (
              <>
                <ambientLight intensity={2} />
                {!androidGamePosition ? (
                  <Reticle onPlace={setAndroidGamePosition} />
                ) : (
                  <Suspense fallback={null}>
                    <group position={androidGamePosition}>
                      <BigIceGround android />
                      <IceFloe />
                      <Penguin targetPosition={activeItem.position} />
                      {!isGameOver && (
                        <AndroidItemNode type={activeItem.type} position={activeItem.position} onCollect={handleCollection} />
                      )}
                    </group>
                  </Suspense>
                )}
              </>
            )}
          </XR>
        </Canvas>
      )}
    </div>
  );
}
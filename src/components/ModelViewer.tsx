/* eslint-disable react/no-unknown-property */
import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

interface ModelViewerProps {
  imageUrl: string | null;
  onCameraChange?: (params: { position: [number, number, number], rotation: [number, number, number], fov: number }) => void;
}

const ProductModel = ({ imageUrl }: { imageUrl: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = React.useMemo(() => new THREE.TextureLoader().load(imageUrl), [imageUrl]);
  
  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[2.5, 2.5, 0.05]} />
      {/* 6 materials for the 6 sides of the box */}
      <meshStandardMaterial attach="material-0" color="#f5f5f7" />
      <meshStandardMaterial attach="material-1" color="#f5f5f7" />
      <meshStandardMaterial attach="material-2" color="#f5f5f7" />
      <meshStandardMaterial attach="material-3" color="#f5f5f7" />
      <meshStandardMaterial attach="material-4" map={texture} transparent={true} />
      <meshStandardMaterial attach="material-5" color="#f5f5f7" />
    </mesh>
  );
};

export const ModelViewer: React.FC<ModelViewerProps> = ({ imageUrl, onCameraChange }) => {
  return (
    <div className="w-full h-full bg-[#fbfbfd] rounded-[32px] overflow-hidden border border-black/5 shadow-inner relative">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={2} castShadow />
        <pointLight position={[-5, 5, -5]} intensity={1} />
        <hemisphereLight intensity={0.5} groundColor="#000000" />
        
        {imageUrl && <ProductModel imageUrl={imageUrl} />}
        
        <OrbitControls 
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 1.75} 
          onChange={(e) => {
            if (onCameraChange && e?.target?.object) {
              const camera = e.target.object as THREE.PerspectiveCamera;
              onCameraChange({
                position: [camera.position.x, camera.position.y, camera.position.z],
                rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
                fov: camera.fov
              });
            }
          }}
        />
        <Environment preset="city" />
        <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={10} blur={2.5} far={4} />
      </Canvas>
      
      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end pointer-events-none">
        <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-black/5 shadow-lg pointer-events-auto">
          <p className="text-[10px] font-black text-[#86868b] uppercase tracking-widest mb-1">3D Interaction</p>
          <p className="text-[12px] font-bold text-black">鼠标左键旋转 / 右键平移 / 滚轮缩放</p>
        </div>
      </div>
    </div>
  );
};

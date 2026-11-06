// Model exchange with other tools. Imports from CAD and DCC formats are converted once to GLB,
// the only format projects embed. Exports write the composition for Blender, CAD viewers, AR.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { CADMesh } from '../editor';

export const IMPORT_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'ply', '3mf', 'dae', 'fbx', 'step', 'stp', 'iges', 'igs'];

export interface Converted { glb: Uint8Array; units: 'm' | 'file'; }

const neutral = () => new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.55, name: 'Matière' });

/** Meshes triangulated by OpenCascade (in the desktop's CAD process), in metres. */
function fromCAD(meshes: CADMesh[]): THREE.Object3D {
  if (!meshes.length) throw new Error('Le fichier CAO ne contient aucune surface lisible.');
  const group = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    if (!m.normal) g.computeVertexNormals();
    // One editable material per CAD colour, so parts can be recoloured separately.
    const key = m.color ? m.color.join(',') : 'default';
    if (!materials.has(key)) {
      const mat = neutral();
      if (m.color) mat.color.setRGB(m.color[0], m.color[1], m.color[2], THREE.SRGBColorSpace);
      mat.name = m.name || 'Matière ' + (materials.size + 1);
      materials.set(key, mat);
    }
    const mesh = new THREE.Mesh(g, materials.get(key));
    mesh.name = m.name;
    group.add(mesh);
  }
  return group;
}

async function load(bytes: Uint8Array, ext: string, cad?: () => Promise<CADMesh[]>): Promise<{ object: THREE.Object3D; units: Converted['units'] }> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const text = () => new TextDecoder().decode(bytes);
  switch (ext) {
    case 'step': case 'stp': case 'iges': case 'igs': if (!cad) throw new Error('Conversion CAO indisponible.'); return { object: fromCAD(await cad()), units: 'm' };
    case 'obj': { const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'); return { object: new OBJLoader().parse(text()), units: 'file' }; }
    case 'stl': { const { STLLoader } = await import('three/addons/loaders/STLLoader.js'); return { object: new THREE.Mesh(new STLLoader().parse(buffer), neutral()), units: 'file' }; }
    case 'ply': {
      const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
      const g = new PLYLoader().parse(buffer);
      if (!g.attributes.normal) g.computeVertexNormals();
      const m = neutral();
      if (g.attributes.color) m.vertexColors = true;
      return { object: new THREE.Mesh(g, m), units: 'file' };
    }
    case '3mf': { const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js'); return { object: new ThreeMFLoader().parse(buffer), units: 'file' }; }
    case 'dae': { const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js'); const r = new ColladaLoader().parse(text(), ''); return { object: r!.scene, units: 'file' }; }
    case 'fbx': { const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js'); return { object: new FBXLoader().parse(buffer, ''), units: 'file' }; }
  }
  throw new Error('Format non pris en charge : ' + ext);
}

/** Convert any supported model to GLB. Materials without a name get one so they show in the inspector. */
export async function convertToGLB(bytes: Uint8Array, ext: string, cad?: () => Promise<CADMesh[]>): Promise<Converted> {
  const { object, units } = await load(bytes, ext, cad);
  let triangles = 0;
  object.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.BufferGeometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const mat of [m.material].flat()) if (!mat.name) mat.name = 'Matière';
  });
  if (!triangles) throw new Error('Le modèle ne contient aucune géométrie.');
  if (triangles > 3_000_000) throw new Error('Modèle trop détaillé (3 millions de triangles maximum). Simplifiez-le avant l’import.');
  const glb = await new GLTFExporter().parseAsync(object, { binary: true }) as ArrayBuffer;
  return { glb: new Uint8Array(glb), units };
}

export type ExportFormat = 'glb' | 'obj' | 'usdz';

/** Serialise an export scene. GLB keeps materials and fabrics; USDZ opens in AR Quick Look on iPhone. */
export async function exportScene(scene: THREE.Object3D, format: ExportFormat): Promise<string> {
  const b64 = (u8: Uint8Array) => { let s = ''; for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000)); return btoa(s); };
  if (format === 'glb') return 'data:model/gltf-binary;base64,' + b64(new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }) as ArrayBuffer));
  if (format === 'obj') { const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js'); return 'data:text/plain;base64,' + b64(new TextEncoder().encode(new OBJExporter().parse(scene))); }
  const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
  return 'data:model/vnd.usdz+zip;base64,' + b64(await new USDZExporter().parseAsync(scene));
}

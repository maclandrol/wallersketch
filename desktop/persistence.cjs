const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const MAX_PROJECT = 250 * 1024 * 1024;
const MAX_IMPORT = 80 * 1024 * 1024;

// Structural check of a project before it is written or handed to the window. The renderer
// performs the detailed validation; this guards file size, format and embedded resources.
function projectText(data) {
  if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_PROJECT) throw Error('Projet trop volumineux (250 Mo maximum).');
  let project;
  try { project = JSON.parse(data); } catch { throw Error('Le fichier projet est illisible.'); }
  if (!project || !['wallersketch', 'cocktail-studio'].includes(project.format) || ![1, 2].includes(project.version) || typeof project.name !== 'string' || !Array.isArray(project.items)) throw Error('Ce fichier n’est pas un projet WallerSketch compatible.');
  const assets = project.assets ?? [];
  if (!Array.isArray(assets) || project.items.length > 10000 || assets.length > 200) throw Error('Le projet dépasse les limites de la scène.');
  const extensions = {'model/gltf-binary':['model','.glb'],'model/gltf+json':['model','.gltf'],'image/png':['texture','.png'],'image/jpeg':['texture','.jpg'],'image/webp':['texture','.webp']};
  for (const asset of assets) {
    const format = asset && extensions[asset.mime];
    if (!format || asset.type !== format[0] || typeof asset.data !== 'string' || asset.data.length > 35 * 1024 * 1024 || asset.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) throw Error('Ressource intégrée invalide ou trop volumineuse.');
    validateImport('embedded' + format[1],Buffer.from(asset.data,'base64'),asset.type);
  }
  return data;
}

async function readBounded(filePath, limit) {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw Error('Fichier trop volumineux ou non pris en charge.');
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw Error('Fichier trop volumineux.');
    return bytes;
  } finally { await handle.close(); }
}

async function atomicWrite(filePath, bytes) {
  const temporary = path.join(path.dirname(filePath), '.' + path.basename(filePath) + '.' + randomUUID() + '.tmp');
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close(); handle = undefined;
    await fs.rename(temporary, filePath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
  // File data is synced before replacement; directory sync is unavailable on Windows.
  if (process.platform !== 'win32') {
    const directory = await fs.open(path.dirname(filePath), 'r').catch(() => null);
    if (directory) { try { await directory.sync().catch(() => {}); } finally { await directory.close(); } }
  }
}

function embeddedGLTF(json) {
  if (!json || json.asset?.version !== '2.0' || !Array.isArray(json.scenes) || !Array.isArray(json.nodes)) throw Error('Modèle glTF 2.0 invalide.');
  for (const collection of [json.buffers || [], json.images || []]) {
    if (!Array.isArray(collection)) throw Error('Ressources glTF invalides.');
    for (const resource of collection) {
      if (resource.uri !== undefined && (typeof resource.uri !== 'string' || !/^data:[^,;]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(resource.uri))) throw Error('Utilisez un GLB ou un glTF avec toutes ses ressources intégrées.');
    }
  }
  if (JSON.stringify(json).includes('KHR_draco_mesh_compression') || JSON.stringify(json).includes('EXT_meshopt_compression')) throw Error('Exportez ce modèle sans compression Draco ou Meshopt.');
  if ((json.nodes?.length || 0) > 2000 || (json.meshes?.length || 0) > 1000) throw Error('Modèle trop complexe (2 000 éléments maximum).');
  return json;
}

const head = (bytes, n = 512) => bytes.subarray(0, n).toString('latin1');
const SOURCE_FORMATS = {
  '.obj': b => /^\s*(#|v |o |g |mtllib|vn |vt |f |s )/m.test(head(b, 4096)),
  '.stl': b => head(b, 5) === 'solid' || (b.length >= 84 && b.readUInt32LE(80) * 50 + 84 === b.length),
  '.ply': b => head(b, 3) === 'ply',
  '.3mf': b => b[0] === 0x50 && b[1] === 0x4b,
  '.dae': b => /<COLLADA/i.test(head(b, 2048)),
  '.fbx': b => head(b, 18) === 'Kaydara FBX Binary' || /FBXHeaderExtension/.test(head(b, 4096)),
  '.step': b => /ISO-10303-21/.test(head(b, 64)),
  '.stp': b => /ISO-10303-21/.test(head(b, 64)),
  '.iges': b => b.length > 80 && /S\s*\d+\s*$/m.test(head(b, 81)),
  '.igs': b => b.length > 80 && /S\s*\d+\s*$/m.test(head(b, 81)),
};

function validateImport(name, bytes, kind) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_IMPORT) throw Error('Import limité à 80 Mo par fichier.');
  const extension = path.extname(name).toLowerCase();
  let mime;
  if (kind === 'model') {
    if (extension === '.glb') {
      if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error('Fichier GLB invalide.');
      const length = bytes.readUInt32LE(12);
      if (length > bytes.length - 20) throw Error('Fichier GLB tronqué.');
      let json;
      try { json = JSON.parse(bytes.toString('utf8', 20, 20 + length).trim()); } catch { throw Error('Le modèle GLB est illisible.'); }
      embeddedGLTF(json);
      let offset = 20 + length;
      while (offset < bytes.length) {
        if (offset + 8 > bytes.length) throw Error('Fichier GLB tronqué.');
        const chunkLength = bytes.readUInt32LE(offset);
        offset += 8 + chunkLength;
        if (offset > bytes.length) throw Error('Fichier GLB tronqué.');
      }
      mime = 'model/gltf-binary';
    } else if (extension === '.gltf') {
      let json;
      try { json = JSON.parse(bytes.toString('utf8')); } catch { throw Error('Le modèle glTF est illisible.'); }
      embeddedGLTF(json); mime = 'model/gltf+json';
    } else if (SOURCE_FORMATS[extension]) {
      // Converted to GLB in the window; here we only check that the file is what it claims.
      if (!SOURCE_FORMATS[extension](bytes)) throw Error('Ce fichier ne ressemble pas à un ' + extension.slice(1).toUpperCase() + ' valide.');
      mime = 'application/octet-stream';
    } else throw Error('Formats acceptés : GLB, glTF, OBJ, STL, PLY, 3MF, DAE, FBX, STEP, IGES.');
  } else if (kind === 'texture') {
    let width, height;
    if (extension === '.png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); mime = 'image/png';
    } else if (['.jpg','.jpeg'].includes(extension) && bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
          height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
        }
        offset += length;
      }
      mime = 'image/jpeg';
    } else if (extension === '.webp' && bytes.length >= 30 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) {
      const chunk = bytes.toString('ascii',12,16);
      if (chunk === 'VP8X') { width = 1 + bytes.readUIntLE(24,3); height = 1 + bytes.readUIntLE(27,3); }
      else if (chunk === 'VP8L' && bytes[20] === 47) { width = 1 + (bytes[21] | ((bytes[22] & 63) << 8)); height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 15) << 10)); }
      else if (chunk === 'VP8 ' && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) { width = bytes.readUInt16LE(26) & 16383; height = bytes.readUInt16LE(28) & 16383; }
      mime = 'image/webp';
    } else throw Error('Choisissez une image PNG, JPEG ou WebP valide.');
    if (!width || !height) throw Error('L’image est illisible.');
    if (width > 8192 || height > 8192 || width * height > 32000000) throw Error('Texture limitée à 8 192 pixels par côté et 32 mégapixels.');
  } else throw Error('Type d’import inconnu.');
  return {id:randomUUID(),name:path.basename(name),type:kind,mime,data:bytes.toString('base64')};
}

function safeName(raw, extension) {
  let name = String(raw).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,90) || 'WallerSketch';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name + extension;
}

/** Decode one export: a PNG data URL or an SVG document. */
function exportBytes(file) {
  if (!file || typeof file.name !== 'string' || typeof file.data !== 'string' || file.data.length > 300 * 1024 * 1024) throw Error('Fichier d’export invalide ou trop volumineux.');
  if (file.data.startsWith('data:image/png;base64,')) {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(file.data)) throw Error('Image d’export invalide.');
    const bytes = Buffer.from(file.data.slice('data:image/png;base64,'.length), 'base64');
    if (bytes.length < 24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Image PNG invalide.');
    return {name:safeName(file.name,'.png'),bytes,kind:'png'};
  }
  const binary = {'data:model/gltf-binary;base64,': ['.glb', b => b.toString('ascii', 0, 4) === 'glTF'], 'data:model/vnd.usdz+zip;base64,': ['.usdz', b => b[0] === 0x50 && b[1] === 0x4b], 'data:text/plain;base64,': ['.obj', () => true]};
  for (const [prefix, [ext, ok]] of Object.entries(binary)) if (file.data.startsWith(prefix)) {
    const bytes = Buffer.from(file.data.slice(prefix.length), 'base64');
    if (!ok(bytes)) throw Error('Fichier 3D d’export invalide.');
    return {name: safeName(file.name, ext), bytes, kind: ext.slice(1)};
  }
  if (file.data.startsWith('<svg') && file.data.trimEnd().endsWith('</svg>') && !/<script|on\w+=|href=["']\s*(?!#)/i.test(file.data)) return {name:safeName(file.name,'.svg'),bytes:Buffer.from(file.data,'utf8'),kind:'svg'};
  throw Error('Format d’export non pris en charge.');
}
module.exports = {MAX_PROJECT,MAX_IMPORT,projectText,readBounded,atomicWrite,validateImport,exportBytes,safeName};

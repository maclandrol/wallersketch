// CAD conversion (STEP, IGES) in an Electron utility process: OpenCascade parses untrusted
// files away from both the window and the main process. Output is in metres.
let occt;
process.parentPort.on('message', async ({data}) => {
  try {
    occt ??= await require('occt-import-js')();
    const read = data.ext === 'step' || data.ext === 'stp' ? occt.ReadStepFile : occt.ReadIgesFile;
    const r = read(new Uint8Array(data.bytes), {linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.4});
    if (!r?.success || !r.meshes?.length) throw Error('Le fichier CAO ne contient aucune surface lisible.');
    process.parentPort.postMessage({id: data.id, meshes: r.meshes.map(m => ({
      name: m.name ?? '', color: m.color ?? null,
      position: Float32Array.from(m.attributes.position.array),
      normal: m.attributes.normal ? Float32Array.from(m.attributes.normal.array) : null,
      index: Uint32Array.from(m.index.array),
    }))});
  } catch (e) {
    process.parentPort.postMessage({id: data.id, error: String(e?.message ?? e)});
  }
});

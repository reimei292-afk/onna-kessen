import fs from 'fs';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
// 使い方: (three を入れた場所で) node tools/fbx_sample.mjs <file.fbx> [frames.json]
const SRC = process.argv[2] || 'death.fbx', OUTF = process.argv[3] || 'frames.json';
const buf = fs.readFileSync(SRC);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const clip = obj.animations[0];
const names = ['Hips','Spine','Spine1','Spine2','Neck','Head','HeadTop_End','LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','LeftToe_End','RightUpLeg','RightLeg','RightFoot','RightToeBase','RightToe_End','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftShoulder','RightShoulder'];
const B = {}; obj.traverse(o => { if (o.isBone) { const k = o.name.replace('mixamorig', ''); if (!B[k]) B[k] = o; } });
const mixer = new THREE.AnimationMixer(obj); const act = mixer.clipAction(clip); act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.play();
const fps = 30, n = Math.round(clip.duration * fps) + 1, frames = [], hipQ = [];
const v = new THREE.Vector3(), q = new THREE.Quaternion();
for (let i = 0; i < n; i++) {
  mixer.setTime(Math.min(clip.duration - 1e-4, i / fps)); obj.updateMatrixWorld(true);
  const f = {}; for (const k of names) { B[k].getWorldPosition(v); f[k] = [v.x, v.y, v.z]; }
  B.Hips.getWorldQuaternion(q); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); f._hipEuler = [e.x, e.y, e.z];
  frames.push(f);
}
fs.writeFileSync(OUTF, JSON.stringify({ fps, n, dur: clip.duration, file: SRC.split('/').pop(), frames }));
console.log('n', n, 'scale', obj.scale.toArray());
for (const i of [0, 10, 20, 30, 40, 50, 60, 70, 80, 93]) { const f = frames[i]; console.log(i, 'hips', f.Hips.map(x => x.toFixed(1)).join(','), 'head', f.HeadTop_End.map(x => x.toFixed(1)).join(','), 'euler', f._hipEuler.map(x => (x * 57.3).toFixed(0)).join(','), 'lFoot', f.LeftFoot.map(x=>x.toFixed(0)).join(','), 'rFoot', f.RightFoot.map(x=>x.toFixed(0)).join(',')); }

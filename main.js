var serialWebSocket = new WebSocket("ws://127.0.0.1:8000")
let element_position = 0;

import * as THREE from './node_modules/three/build/three.module.js';

const TARGET_X = 6;
const SHOT_TIME = 20000;
const CLEAR_TIME = 5000;
var shot_started = false
var step = 1
var element_speed = 1
const massPositions = { center: { x: 0, y: 0 }, noncenter: { x: 100, y: 100 } }
let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(45, 1920 / 1000, 1, 1000);
let masExp = 5
let printerStepZ = 10
let printerPosition = { x: massPositions.center.x, y: massPositions.center.y, z: 0 }
const masText = document.getElementById("mass-text")
//camera.position.set(0, 20, 800).setLength(50);
camera.position.set(30, 6, 0)
camera.rotation.set(-1.5, 1.2, 1.5)
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#bg')
});
renderer.setSize(1920, 1080);
renderer.setClearColor(0x202020);
document.body.appendChild(renderer.domElement);
document.getElementById("move_back_button").disabled = true
//let controls = new OrbitControls(camera, renderer.domElement);
function movePrinter() {
  serialWebSocket.send(`G90\r\n`)
  serialWebSocket.send(`G0 X${printerPosition.x} Y${printerPosition.y} Z${printerPosition.z}\r\n`)
}
let uniforms = {
  spherePosition: { value: new THREE.Vector3() },
  radius: { value: 4 },
  planeHeight: { value: -3 },
  bendHeight: { value: 0.9 }, // of radius [0..1],
  smoothness: { value: 10 }
}

let gs = new THREE.IcosahedronGeometry(1, 7);
let c1 = new THREE.Color(0x00ffff);
let c2 = new THREE.Color(0xff00ff);
let c = new THREE.Color();
let clrs = [];
for (let i = 0; i < gs.attributes.position.count; i++) {
  c.lerpColors(c1, c2, (1 - gs.attributes.position.getY(i)) / 2);
  clrs.push(c.r, c.g, c.b);
}
gs.setAttribute("color", new THREE.Float32BufferAttribute(clrs, 3));

let ms = new THREE.PointsMaterial({
  size: 0.5,
  vertexColors: true,
  onBeforeCompile: shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <clipping_planes_fragment>`,
      `
      if (length(gl_PointCoord - 0.5) > 0.5 ) discard; // make points round
      #include <clipping_planes_fragment>
      `
    );
  }
});
let s = new THREE.Points(gs, ms);
s.scale.setScalar(uniforms.radius.value);
s.userData = {
  posPrev: new THREE.Vector3(),
  posNext: new THREE.Vector3(),
  rotAxis: new THREE.Vector3(),
  dist: new THREE.Vector3(),

}
setPosition(s.userData.posPrev, 0);
scene.add(s)

let gpl = new THREE.PlaneGeometry(40, 40, 100, 100);
gpl.rotateX(Math.PI * -0.5);
let mpl = new THREE.PointsMaterial({
  size: 0.15,
  color: 0xffffff,
  onBeforeCompile: shader => {
    shader.uniforms.spherePosition = uniforms.spherePosition;
    shader.uniforms.radius = uniforms.radius;
    shader.uniforms.planeHeight = uniforms.planeHeight;
    shader.uniforms.bendHeight = uniforms.bendHeight;
    shader.uniforms.smoothness = uniforms.smoothness;

    shader.vertexShader = `
      uniform vec3 spherePosition;
      uniform float radius;
      uniform float planeHeight;
      uniform float bendHeight;
      uniform float smoothness;
      
      varying float h;
      
      float getSphereCone(vec3 p, float h, float r){
        	float dist = length(p.xz - spherePosition.xz);
          
          float hratio = -r * h;
          float limR = sqrt(r * r - hratio * hratio);

          float res = 0.;
          if (dist <= limR){
            res = -sqrt(r * r - dist * dist);
          }
          else {
            res = hratio - (dist - limR) * (limR / hratio);
          }

          return res;
      }
      
      vec2 smoothfunc(float a, float b, float k){
        float h = max(0., min(1., ((b - a) / k) + 0.5));
        float m = h * (1. - h) * k;
        return vec2((h * a) + ((1. - h) * b) - (m * 0.5), h);
      }
      
      ${shader.vertexShader}
    `.replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
      
      float a = planeHeight;

      float b = getSphereCone(transformed, bendHeight, radius);
      
      vec2 res = smoothfunc(a, b, smoothness);
      transformed.y = res.x;
      h = res.y;
      
      `
    );
    //console.log(shader.vertexShader)
    shader.fragmentShader = `
      varying float h;
      ${shader.fragmentShader}
    `.replace(
      `vec4 diffuseColor = vec4( diffuse, opacity );`,
      `
        vec3 col = mix(vec3(0, 0.5, 1), vec3(1), h);
        vec4 diffuseColor = vec4( col, opacity );
      `
    );
    //console.log(shader.fragmentShader);
  }
});
let pl = new THREE.Points(gpl, mpl);
scene.add(pl);


let clock = new THREE.Clock();

let time_buffer = 0;
renderer.setAnimationLoop(_ => {
  let t = clock.getElapsedTime() * 0.5;
  if (uniforms.spherePosition.value.getComponent(2) < TARGET_X - 0.1 && element_position == 1) {
    if (!clock.running) {
      clock.start();
    }
    animateSphere(t);
  }
  else if (uniforms.spherePosition.value.getComponent(2) > 0 && element_position == 0) {
    if (!clock.running) {
      clock.start();
      clock.elapsedTime = time_buffer;
    }
    animateSphere(t);

  }
  else {
    if (!shot_started) unblockButtons();
    time_buffer = clock.elapsedTime;
    clock.stop();
  }
  uniforms.spherePosition.value.copy(s.position);
  // camera.position.y = pl.position.y
  renderer.render(scene, camera);
})

function animateSphere(t) {

  let pPrev = s.userData.posPrev;
  let pNext = s.userData.posNext;
  let rotAxis = s.userData.rotAxis;
  let dist = s.userData.dist;
  setPosition(s.position, t);
  setPosition(pNext, t + 0.001);
  rotAxis.subVectors(pNext, s.position);
  rotAxis.set(rotAxis.z, 0, -rotAxis.x).normalize();


  let d = dist.subVectors(s.position, pPrev).length();
  let dFull = 2 * Math.PI * uniforms.radius.value;
  let aRatio = d / dFull;
  let a = Math.PI * 2 * aRatio;

  s.rotateOnWorldAxis(rotAxis, a);

  pPrev.copy(s.position);

}

function setPosition(p, t) {
  p.set(
    //  Math.cos(t * 0.314) * 10,
    0,
    0,
    Math.sin(t * 1) * TARGET_X
  )
}



document.getElementById('move_forward_button').onclick = function () {
  printerPosition.x = massPositions.noncenter.x;
  printerPosition.y = massPositions.noncenter.y;
  movePrinter();
  element_position = 1;
  blockButtons();
}

document.getElementById('move_back_button').onclick = function () {
  printerPosition.x = massPositions.center.x;
  printerPosition.y = massPositions.center.y;
  movePrinter();
  element_position = 0;
  blockButtons();
}

document.getElementById('shot_button').onclick = function () {

  shootBalls()
  shot_started = true
  blockButtons()
  setTimeout(function () {
    clearBalls()
    setTimeout(function () {
      shot_started = false
      unblockButtons();
    }, CLEAR_TIME)
  }, SHOT_TIME)

}

document.getElementById('move_down_button').onclick = function () {


  // camera.position.y += 1;
  document.getElementById('move_up_button').disabled = false;

  let counter = 0;
  if (uniforms.planeHeight.value < 5) {
    step += 1
    masText.innerHTML = `Масса: 10<sup>${masExp * step}</sup> кг`
    let interval = setInterval(function () {
      document.getElementById('move_down_button').disabled = true;
      camera.position.y += 0.1;
      uniforms.planeHeight.value += 0.1;
      counter += 1;
      if (counter == 15) {
        document.getElementById('move_down_button').disabled = false;
        clearInterval(interval);
      }

    }, 20)
    printerPosition.z -= printerStepZ;
    console.log(printerPosition.z)
    movePrinter()
  }

  if (step == 7) document.getElementById('move_down_button').disabled = true;


}
document.getElementById('move_up_button').onclick = function () {
  console.log(camera.position)
  console.log(camera.rotation)
  document.getElementById('move_down_button').disabled = false;
  let counter = 0;
  if (uniforms.planeHeight.value > -3) {
    step -= 1;
    masText.innerHTML = `Масса: 10<sup>${masExp * step}</sup> кг`
    let interval = setInterval(function () {
      document.getElementById('move_up_button').disabled = true;
      camera.position.y -= 0.1;
      uniforms.planeHeight.value -= 0.1;
      counter += 1;
      if (counter == 15) {
        document.getElementById('move_up_button').disabled = false;
        clearInterval(interval);
      }

    }, 20)
    printerPosition.z += printerStepZ;

    movePrinter()
  }
  if (step == 1) document.getElementById('move_up_button').disabled = true;

}
function blockButtons() {
  document.getElementById('move_forward_button').disabled = true;
  document.getElementById('move_back_button').disabled = true;
  document.getElementById('shot_button').disabled = true;
  document.getElementById('move_down_button').disabled = true;
  document.getElementById('move_up_button').disabled = true;
}
function unblockButtons() {
  if (element_position == 0) document.getElementById('move_forward_button').disabled = false;
  if (element_position == 1) document.getElementById('move_back_button').disabled = false;
  document.getElementById('shot_button').disabled = false;
  if (step != 7) document.getElementById('move_down_button').disabled = false;
  if (step != 1) document.getElementById('move_up_button').disabled = false;
}
function shootBalls() {
  console.log("shot!")
  serialWebSocket.send("shoot")
}
function clearBalls() {
  serialWebSocket.send("G28\r\n")
  serialWebSocket.send("G92 X0 Y0 Z0\r\n")
  printerPosition.x = massPositions.center.x;
  printerPosition.y = massPositions.center.y;
  movePrinter()
}
serialWebSocket.onclose = function (e) {
  console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
  setTimeout(function () {
    serialWebSocket = new WebSocket("ws://127.0.0.1:8000")
  }, 1000);
};

serialWebSocket.onerror = function (err) {
  console.error('Socket encountered error: ', err.message, 'Closing socket');
  ws.close();
};
serialWebSocket.onopen = (event) => {
  clearBalls();
  movePrinter()
};
console.log('penis')
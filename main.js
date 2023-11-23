console.clear();

let element_position = 0;

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.127.0/build/three.module.js";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/controls/OrbitControls.js";
import {GUI} from "https://cdn.jsdelivr.net/npm/three@0.127.0/examples/jsm/libs/dat.gui.module.js";

let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(45, 700 / 500, 1, 1000);
camera.position.set(0, 20, 800).setLength(50);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg')
});
renderer.setSize(700, 500);
renderer.setClearColor(0x202020);
document.body.appendChild(renderer.domElement);

let controls = new OrbitControls(camera, renderer.domElement);

let uniforms = {
  spherePosition: {value: new THREE.Vector3()},
  radius: {value: 4},
  planeHeight: {value: -4},
  bendHeight: {value: 0.80}, // of radius [0..1],
  smoothness: {value: 5}
}

let gs = new THREE.IcosahedronGeometry(1, 7);
let c1 = new THREE.Color(0x00ffff);
let c2 = new THREE.Color(0xff00ff);
let c = new THREE.Color();
let clrs = [];
for(let i = 0; i < gs.attributes.position.count; i++){
  c.lerpColors(c1, c2, (1 - gs.attributes.position.getY(i)) / 2);
  clrs.push(c.r, c.g, c.b);
}
gs.setAttribute("color", new THREE.Float32BufferAttribute(clrs, 3));

let ms = new THREE.PointsMaterial({
  size: 3, 
  vertexColors: false,
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

// let gui = new GUI();
// gui.add(uniforms.radius, "value", 1, 5).name("sphere radius").onChange(v => {s.scale.setScalar(v)});
// gui.add(uniforms.planeHeight, "value", -5, 5).name("plane height");
// gui.add(uniforms.bendHeight, "value", 0.01, 0.99).name("bend at");
// gui.add(uniforms.smoothness, "value", 0, 50).name("smoothness");

window.addEventListener( 'resize', onWindowResize );

let clock = new THREE.Clock();

let time_buffer = 0;
renderer.setAnimationLoop( _ => {
    if (element_position == 0){
        document.getElementById('move_forward_button').disabled = false;
        document.getElementById('move_back_button').disabled = true;
    }
    else{
        document.getElementById('move_forward_button').disabled = true;
        document.getElementById('move_back_button').disabled = false;
    }
  let t = clock.getElapsedTime() * 0.5;
  if (uniforms.spherePosition.value.getComponent(2) < 14 && element_position == 1){
    if (!clock.running){
        clock.start();
    }
    animateSphere(t);
  }
  else if (uniforms.spherePosition.value.getComponent(2) > 0 && element_position == 0){
    if (!clock.running){
        clock.start();
        clock.elapsedTime = time_buffer;
    }
    animateSphere(t);
    
  }
  else{
    time_buffer = clock.elapsedTime;
    clock.stop();
  }
  uniforms.spherePosition.value.copy(s.position);
	renderer.render(scene, camera);
})

function animateSphere(t){
  
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

function setPosition(p, t){
    p.set(
        0, // Math.cos(t * 0.314) * 15,
        0,
        Math.sin(t * 1) * 15
    )
}

function onWindowResize() {

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( innerWidth, innerHeight );

}

document.getElementById('move_forward_button').onclick = function() {
    element_position = 1;
    document.getElementById('move_back_button').disabled = true;
}
document.getElementById('move_back_button').onclick = function() {
    element_position = 0;
    document.getElementById('move_forward_button').disabled = true;
}
document.getElementById('move_down_button').onclick = function() {
    document.getElementById('move_up_button').disabled = false;
    
    let counter = 0;
    if ( uniforms.planeHeight.value < 5){
        let interval = setInterval(function() {
            uniforms.planeHeight.value += 0.1;
            counter += 1;
            if (counter == 15){
                clearInterval(interval);
            }

        }, 20)
    }
    else{
        document.getElementById('move_down_button').disabled = true;
    }
     
    
}
document.getElementById('move_up_button').onclick = function() {
    document.getElementById('move_down_button').disabled = false;
    let counter = 0;
    if ( uniforms.planeHeight.value > -5){
        let interval = setInterval(function() {
            uniforms.planeHeight.value -= 0.1;
            counter += 1;
            if (counter == 15){
                clearInterval(interval);
            }

        }, 20)
        }
    else{
        document.getElementById('move_up_button').disabled = true;
    }
     
    
}
console.log('penis')
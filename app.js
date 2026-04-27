let stream;
let video = document.getElementById("video");
let monitoring = false;
let lastFrame;
let facing = "user";

async function startCamera(){
stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:facing}});
video.srcObject = stream;
}

async function toggleCamera(){
facing = facing==="user"?"environment":"user";
startCamera();
}

function toggleMonitoring(){
monitoring = !monitoring;
if(monitoring) detectMotion();
}

function detectMotion(){
if(!monitoring) return;

let canvas=document.createElement("canvas");
canvas.width=64; canvas.height=48;
let ctx=canvas.getContext("2d");

ctx.drawImage(video,0,0,64,48);
let data=ctx.getImageData(0,0,64,48).data;

if(lastFrame){
let diff=0;
for(let i=0;i<data.length;i+=4){
if(Math.abs(data[i]-lastFrame[i])>20) diff++;
}
if(diff>500) triggerAlert();
}

lastFrame=data;
requestAnimationFrame(detectMotion);
}

function triggerAlert(){
document.body.style.background="red";
if(document.getElementById("flashToggle").checked) flashTorch();
setTimeout(()=>{document.body.style.background="black";},300);
}

async function flashTorch(){
let track=stream.getVideoTracks()[0];
let cap=track.getCapabilities();
if(cap.torch){
await track.applyConstraints({advanced:[{torch:true}]});
setTimeout(()=>{track.applyConstraints({advanced:[{torch:false}]});},300);
}
}
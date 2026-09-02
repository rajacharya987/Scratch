/**
 * WGSL shaders for the WebGPU backend (same lighting model as the WebGL2 path).
 */

const PBR_WGSL = `
struct Camera {
  viewProj : mat4x4<f32>,
  view : mat4x4<f32>,
  proj : mat4x4<f32>,
  position : vec3<f32>,
  _pad0 : f32,
};
struct Object {
  model : mat4x4<f32>,
  normal : mat4x4<f32>,
  albedo : vec4<f32>,
  params : vec4<f32>, // metallic, roughness, emissive, isGround
};
struct Lights {
  ambient : vec4<f32>,
  dirDir : vec4<f32>,
  dirColor : vec4<f32>,
  skyTop : vec4<f32>,
  skyBottom : vec4<f32>,
  ground : vec4<f32>,
  flags : vec4<f32>, // rayTrace, pointCount
  pointPos : array<vec4<f32>, 4>,
  pointColor : array<vec4<f32>, 4>,
  fogColor : vec4<f32>,  // rgb, enabled
  fogParams : vec4<f32>, // density, height, falloff, maxDist
  fogVol : vec4<f32>,    // scattering, g, intensity, start
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> object : Object;
@group(0) @binding(2) var<uniform> lights : Lights;
@group(0) @binding(3) var shadowMap : texture_depth_2d;
@group(0) @binding(4) var shadowSamp : sampler_comparison;

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv : vec2<f32>,
};

@vertex
fn vs_main(@location(0) pos : vec3<f32>, @location(1) n : vec3<f32>, @location(2) uv : vec2<f32>) -> VSOut {
  var out : VSOut;
  let world = object.model * vec4<f32>(pos, 1.0);
  out.worldPos = world.xyz;
  out.normal = (object.normal * vec4<f32>(n, 0.0)).xyz;
  out.uv = uv;
  out.position = camera.viewProj * world;
  return out;
}

const PI = 3.14159265359;

fn distributionGGX(N : vec3<f32>, H : vec3<f32>, roughness : f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);
  return a2 / (PI * denom * denom);
}
fn geometrySchlickGGX(NdotV : f32, roughness : f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}
fn fresnelSchlick(cosTheta : f32, F0 : vec3<f32>) -> vec3<f32> {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}
fn shadeLight(
  N : vec3<f32>, V : vec3<f32>, L : vec3<f32>, radiance : vec3<f32>,
  albedo : vec3<f32>, metallic : f32, roughness : f32
) -> vec3<f32> {
  let H = normalize(V + L);
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySchlickGGX(max(dot(N, V), 0.0), roughness) * geometrySchlickGGX(max(dot(N, L), 0.0), roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  let spec = (NDF * G * F) / max(4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0), 0.001);
  let kD = (vec3<f32>(1.0) - F) * (1.0 - metallic);
  return (kD * albedo / PI + spec) * radiance * max(dot(N, L), 0.0);
}
fn groundAlbedo(p : vec3<f32>, base : vec3<f32>) -> vec3<f32> {
  let g = abs(floor(p.x / 40.0) + floor(p.z / 40.0));
  let checker = g % 2.0;
  return mix(base, base * 1.25, checker);
}

fn phaseHG(cosTheta : f32, g : f32) -> f32 {
  let g2 = g * g;
  let denom = max(1e-4, 1.0 + g2 - 2.0 * g * cosTheta);
  return (1.0 - g2) / (4.0 * 3.14159265359 * pow(denom, 1.5));
}

fn applyVolumetricFog(colorIn : vec3<f32>, worldPos : vec3<f32>) -> vec3<f32> {
  if (lights.fogColor.w < 0.5 || lights.fogParams.x <= 0.0) {
    return colorIn;
  }
  let cam = camera.position;
  let delta = worldPos - cam;
  let dist = length(delta);
  let rayLen = min(dist, max(lights.fogParams.w, 1.0));
  if (rayLen < 0.05) {
    return colorIn;
  }
  let rayDir = delta / max(dist, 1e-5);
  let steps = 6;
  let stepLen = rayLen / f32(steps);
  var pos = cam + rayDir * (stepLen * 0.5);
  let sunL = normalize(-lights.dirDir.xyz);
  var T = 1.0;
  var inSc = vec3<f32>(0.0);
  let gPh = clamp(lights.fogVol.y, 0.0, 0.95);
  let sunCol = lights.dirColor.xyz * lights.dirColor.w * lights.fogVol.z;
  let nearStart = max(lights.fogVol.w, 0.0);
  for (var s = 0; s < 6; s++) {
    if (T < 0.02) { break; }
    let travel = (f32(s) + 0.5) * stepLen;
    let nearFade = smoothstep(0.0, nearStart + 1.0, travel);
    let h = pos.y - lights.fogParams.y;
    var dens = lights.fogParams.x * exp(-max(h, 0.0) * max(lights.fogParams.z, 0.001)) * nearFade;
    dens = max(dens, 1e-6);
    let phase = phaseHG(dot(rayDir, sunL), gPh);
    let opt = dens * stepLen;
    let stepT = exp(-opt);
    let Li = sunCol * phase * lights.fogVol.x;
    inSc += T * Li * (1.0 - stepT);
    T *= stepT;
    pos += rayDir * stepLen;
  }
  let pk = max(inSc.r, max(inSc.g, inSc.b));
  if (pk > 0.95) {
    inSc *= 0.95 / pk;
  }
  var heightFactor = exp(-max(worldPos.y - lights.fogParams.y, 0.0) * max(lights.fogParams.z, 0.001));
  heightFactor = mix(0.55, 1.0, heightFactor);
  let fogFactor = clamp((1.0 - T) * heightFactor, 0.0, 1.0) * 0.58;
  let fogCol = max(lights.fogColor.xyz, lights.skyBottom.xyz * 0.55 + vec3<f32>(0.45, 0.55, 0.72) * 0.45);
  var color = mix(colorIn, fogCol, fogFactor);
  color += inSc;
  return color;
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  var N = normalize(in.normal);
  let V = normalize(camera.position - in.worldPos);
  var albedo = object.albedo.xyz;
  if (object.params.w > 0.5) {
    albedo = groundAlbedo(in.worldPos, lights.ground.xyz);
  }
  let metallic = clamp(object.params.x, 0.0, 1.0);
  let roughness = clamp(object.params.y, 0.045, 1.0);
  let Ldir = normalize(-lights.dirDir.xyz);
  var Lo = shadeLight(N, V, Ldir, lights.dirColor.xyz * lights.dirColor.w, albedo, metallic, roughness);
  for (var i = 0; i < 4; i++) {
    if (f32(i) >= lights.flags.y) { break; }
    var L = lights.pointPos[i].xyz - in.worldPos;
    let dist = length(L);
    L = L / max(dist, 0.0001);
    let atten = 1.0 / (1.0 + dist * dist * 0.00008);
    Lo += shadeLight(N, V, L, lights.pointColor[i].xyz * lights.pointColor[i].w * atten, albedo, metallic, roughness);
  }
  var color = lights.ambient.xyz * albedo + Lo + albedo * object.params.z;
  if (lights.flags.x > 0.5) {
    let R = reflect(-V, N);
    var refl = mix(lights.skyBottom.xyz, lights.skyTop.xyz, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
    if (R.y < -0.001 && in.worldPos.y > 0.5) {
      let t = -in.worldPos.y / R.y;
      let hit = in.worldPos + R * t;
      refl = groundAlbedo(hit, lights.ground.xyz) * 0.55;
    }
    let fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    let mixAmt = mix(0.08, 0.7, metallic) + fres * (1.0 - roughness);
    color = mix(color, refl, clamp(mixAmt, 0.0, 0.85));
  }
  color = applyVolumetricFog(color, in.worldPos);
  color = color / (color + vec3<f32>(1.0));
  color = pow(color, vec3<f32>(1.0 / 2.2));
  return vec4<f32>(color, object.albedo.w);
}
`;

const SKY_WGSL = `
struct SkyUniforms {
  invViewProj : mat4x4<f32>,
  skyTop : vec4<f32>,
  skyBottom : vec4<f32>,
  sunDir : vec4<f32>,
  camPos : vec4<f32>,
  sunColor : vec4<f32>,
  fogColor : vec4<f32>,
  fogParams : vec4<f32>,
  fogVol : vec4<f32>,
  skyFx : vec4<f32>,
  cloudParams : vec4<f32>,
  godRay : vec4<f32>,
};
@group(0) @binding(0) var<uniform> u : SkyUniforms;
struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) clip : vec2<f32>,
};
@vertex
fn vs_main(@location(0) pos : vec2<f32>) -> VSOut {
  var out : VSOut;
  out.position = vec4<f32>(pos, 1.0, 1.0);
  out.clip = pos;
  return out;
}
fn phaseHGSky(cosTheta : f32, g : f32) -> f32 {
  let g2 = g * g;
  let denom = max(1e-4, 1.0 + g2 - 2.0 * g * cosTheta);
  return (1.0 - g2) / (4.0 * 3.14159265359 * pow(denom, 1.5));
}
fn hash21(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
fn noise21(p : vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn fbm21(p0 : vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 3; i++) {
    v += a * noise21(p);
    p *= 2.04;
    a *= 0.5;
  }
  return v;
}
fn skyUV(dir : vec3<f32>) -> vec2<f32> {
  let uu = atan2(dir.z, dir.x) / 6.2831853 + 0.5;
  let vv = 1.0 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265;
  return vec2<f32>(uu, vv);
}
fn atmosphereApprox(V : vec3<f32>, sunL : vec3<f32>) -> vec3<f32> {
  let vy = max(V.y, 0.0);
  let cosT = clamp(dot(V, sunL), -1.0, 1.0);
  let pr = 0.75 * (1.0 + cosT * cosT);
  let sunH = max(sunL.y, 0.0);
  let day = clamp(sunH * 1.5 + 0.05, 0.0, 1.0);
  var rayleigh = vec3<f32>(5.8, 13.5, 33.1) * (pr / (vy * 15.0 + 0.15) * 0.12 * day);
  rayleigh += vec3<f32>(0.50, 0.78, 1.40) * (0.10 * day);
  let horizon = clamp(1.0 - vy * 2.5, 0.0, 1.0);
  let dusk = clamp(1.0 - sunH * 2.5, 0.0, 1.0) * day;
  rayleigh.x += dusk * horizon * 0.13 * day;
  var col = rayleigh / (rayleigh + vec3<f32>(1.0));
  if (V.y < 0.0) {
    col = mix(col, u.skyBottom.xyz * 0.4, clamp(-V.y, 0.0, 1.0));
  }
  return col;
}
fn cloudDensity(dir : vec3<f32>, coverage : f32, densMul : f32, wind : f32) -> f32 {
  if (dir.y < -0.02) { return 0.0; }
  let uv = skyUV(dir);
  if (uv.y < 0.02 || uv.y > 0.78) { return 0.0; }
  let t = uv.y / 0.78;
  let slab = clamp(1.0 - abs(t - 0.38) / 0.42, 0.0, 1.0);
  let band2 = sin(clamp(t, 0.0, 1.0) * 3.14159265) * 0.45 + slab * 0.55;
  if (band2 < 0.02) { return 0.0; }
  let p = (uv + vec2<f32>(wind * 0.22, wind * 0.08)) * 2.2;
  let low = fbm21(p * 0.48);
  let mid = fbm21(p);
  var puff = 1.0 - fbm21(p * 1.55);
  puff = puff * puff;
  var d = low * 0.34 + mid * 0.38 + puff * 0.28;
  let thresh = 0.44 - clamp(coverage, 0.0, 1.0) * 0.52;
  d = clamp((d - thresh) / 0.38, 0.0, 1.0);
  d = d * d * (3.0 - 2.0 * d);
  return clamp(d * max(densMul, 0.4) * (0.35 + 0.75 * band2), 0.0, 1.0);
}
@fragment
fn fs_main(in : VSOut) -> @location(0) vec4<f32> {
  let far = u.invViewProj * vec4<f32>(in.clip, 1.0, 1.0);
  let worldFar = far.xyz / far.w;
  let rayDir = normalize(worldFar - u.camPos.xyz);
  let sunL = normalize(-u.sunDir.xyz);
  let sdot = max(dot(rayDir, sunL), 0.0);
  let grad = mix(u.skyBottom.xyz, u.skyTop.xyz, clamp(rayDir.y * 0.65 + 0.35, 0.0, 1.0));
  var col = mix(grad, atmosphereApprox(rayDir, sunL), 0.78);
  let sunCol = max(u.sunColor.xyz, vec3<f32>(1.0, 0.92, 0.75));
  let cover = u.cloudParams.x;
  let cDens = u.cloudParams.y;
  let wind = u.cloudParams.z * u.cloudParams.w;
  var cloud = 0.0;
  if (u.skyFx.y > 0.5) {
    cloud = cloudDensity(rayDir, cover, cDens, wind);
    var shadow = 0.0;
    var cdir = rayDir;
    for (var i = 0; i < 2; i++) {
      cdir = normalize(mix(cdir, sunL, 0.12));
      shadow += cloudDensity(cdir, cover, cDens, wind);
    }
    shadow = clamp(shadow * 0.38, 0.0, 1.0);
    let silver = pow(sdot, 8.0) * 0.85 * (1.0 - shadow);
    var cloudCol = vec3<f32>(1.0, 0.97, 0.95) * (0.35 + 0.55 * (1.0 - shadow) + silver);
    cloudCol = mix(cloudCol, col, clamp((1.0 - rayDir.y) * 0.35, 0.0, 0.55));
    col = mix(col, cloudCol, cloud);
  }
  if (u.skyFx.x > 0.5 && sunL.y > -0.12) {
    let disc = smoothstep(0.9972, 0.9994, sdot);
    col += sunCol * (disc * 1.35 + pow(sdot, 32.0) * 0.45 + pow(sdot, 8.0) * 0.22);
    col += vec3<f32>(1.0, 0.9, 0.7) * disc * 0.55;
  }
  if (u.skyFx.z > 0.5 && sunL.y > -0.08) {
    var acc = 0.0;
    var decay = 1.0;
    var p = rayDir;
    for (var i = 0; i < 6; i++) {
      p = normalize(mix(p, sunL, 0.14));
      var occ = 1.0;
      if (u.skyFx.y > 0.5) {
        occ = 1.0 - cloudDensity(p, cover, cDens, wind);
      }
      acc += pow(max(dot(p, sunL), 0.0), 22.0) * occ * decay;
      decay *= 0.74;
    }
    col += sunCol * acc * u.godRay.x * 0.55;
  }
  if (u.fogColor.w > 0.5 && u.fogParams.x > 0.0) {
    let rayLen = max(u.fogParams.w, 1.0);
    let stepLen = rayLen / 6.0;
    var pos = u.camPos.xyz + rayDir * (stepLen * 0.5);
    let sunL = normalize(-u.sunDir.xyz);
    var T = 1.0;
    var inSc = vec3<f32>(0.0);
    let gPh = clamp(u.fogVol.y, 0.0, 0.95);
    let sunCol = u.sunColor.xyz * u.fogVol.z;
    let nearStart = max(u.fogVol.w, 0.0);
    for (var s = 0; s < 6; s++) {
      if (T < 0.02) { break; }
      let travel = (f32(s) + 0.5) * stepLen;
      let nearFade = smoothstep(0.0, nearStart + 1.0, travel);
      let h = pos.y - u.fogParams.y;
      var dens = u.fogParams.x * exp(-max(h, 0.0) * max(u.fogParams.z, 0.001)) * nearFade;
      dens = max(dens, 1e-6);
      let phase = phaseHGSky(dot(rayDir, sunL), gPh);
      let opt = dens * stepLen;
      let stepT = exp(-opt);
      inSc += T * sunCol * phase * u.fogVol.x * (1.0 - stepT);
      T *= stepT;
      pos += rayDir * stepLen;
    }
    let pk = max(inSc.r, max(inSc.g, inSc.b));
    if (pk > 0.95) {
      inSc *= 0.95 / pk;
    }
    let fogCol = max(u.fogColor.xyz, u.skyBottom.xyz * 0.55 + vec3<f32>(0.45, 0.55, 0.72) * 0.45);
    col = mix(col, fogCol, (1.0 - T) * 0.45);
    col += inSc;
  }
  return vec4<f32>(col, 1.0);
}
`;

module.exports = {PBR_WGSL, SKY_WGSL};

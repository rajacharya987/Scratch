/**
 * WebGL2 GLSL 300 es shaders for the unified 3D pass.
 * Forward PBR + directional shadow map + optional plane/sky ray-traced reflections.
 */

const PBR_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat4 uNormalMatrix;
uniform mat4 uLightVP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUv;
out vec4 vLightSpace;

void main() {
    vec4 world = uModel * vec4(aPosition, 1.0);
    vWorldPos = world.xyz;
    vNormal = mat3(uNormalMatrix) * aNormal;
    vUv = aUv;
    vLightSpace = uLightVP * world;
    gl_Position = uProj * uView * world;
}
`;

const PBR_FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUv;
in vec4 vLightSpace;

uniform vec3 uCameraPos;
uniform vec3 uAlbedo;
uniform float uMetallic;
uniform float uRoughness;
uniform float uEmissive;
uniform float uOpacity;

uniform vec3 uAmbient;
uniform vec3 uDirLightDir;
uniform vec3 uDirLightColor;
uniform float uDirLightIntensity;

uniform vec3 uPointLightPos[4];
uniform vec3 uPointLightColor[4];
uniform float uPointLightIntensity[4];
uniform int uPointLightCount;

uniform sampler2D uShadowMap;
uniform bool uReceiveShadow;
uniform bool uRayTrace;
uniform bool uIsGround;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uGroundColor;

uniform vec3 uFogColor;
uniform vec4 uFogParams;  // enabled, density, height, falloff
uniform vec4 uFogParams2; // maxDist, scattering, g, intensity
uniform float uFogStart;

out vec4 fragColor;

const float PI = 3.14159265359;

float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / (PI * denom * denom);
}

float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    return geometrySchlickGGX(max(dot(N, V), 0.0), roughness) *
           geometrySchlickGGX(max(dot(N, L), 0.0), roughness);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float shadowFactor(vec4 lightSpace, vec3 N, vec3 L) {
    vec3 proj = lightSpace.xyz / lightSpace.w;
    proj = proj * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) {
        return 1.0;
    }
    float bias = max(0.004 * (1.0 - dot(N, L)), 0.0008);
    float closest = texture(uShadowMap, proj.xy).r;
    return (proj.z - bias) > closest ? 0.45 : 1.0;
}

vec3 skyColor(vec3 dir) {
    float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    return mix(uSkyBottom, uSkyTop, t);
}

vec3 groundAlbedo(vec3 p) {
    float g = abs(floor(p.x / 40.0) + floor(p.z / 40.0));
    float checker = mod(g, 2.0);
    return mix(uGroundColor, uGroundColor * 1.25, checker);
}

float phaseHG(float cosTheta, float g) {
    float g2 = g * g;
    float denom = max(1e-4, 1.0 + g2 - 2.0 * g * cosTheta);
    return (1.0 - g2) / (4.0 * 3.14159265359 * pow(denom, 1.5));
}

float fogShadowAt(vec3 worldPos) {
    vec4 ls = uLightVP * vec4(worldPos, 1.0);
    if (abs(ls.w) < 1e-5) return 1.0;
    vec3 proj = ls.xyz / ls.w * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) {
        return 1.0;
    }
    float closest = texture(uShadowMap, proj.xy).r;
    return (proj.z - 0.0015) > closest ? 0.12 : 1.0;
}

vec3 applyVolumetricFog(vec3 color, vec3 worldPos) {
    if (uFogParams.x < 0.5 || uFogParams.y <= 0.0) return color;
    vec3 cam = uCameraPos;
    vec3 delta = worldPos - cam;
    float dist = length(delta);
    float rayLen = min(dist, max(uFogParams2.x, 1.0));
    if (rayLen < 0.05) return color;
    vec3 rayDir = delta / max(dist, 1e-5);

    const int STEPS = 6;
    float stepLen = rayLen / float(STEPS);
    vec3 pos = cam + rayDir * (stepLen * 0.5);
    vec3 sunL = normalize(-uDirLightDir);
    float T = 1.0;
    vec3 inSc = vec3(0.0);
    float gPh = clamp(uFogParams2.z, 0.0, 0.95);
    vec3 sunCol = uDirLightColor * uDirLightIntensity * uFogParams2.w;
    float nearStart = max(uFogStart, 0.0);

    for (int s = 0; s < STEPS; s++) {
        if (T < 0.02) break;
        float travel = (float(s) + 0.5) * stepLen;
        float nearFade = smoothstep(0.0, nearStart + 1.0, travel);
        float h = pos.y - uFogParams.z;
        float dens = uFogParams.y * exp(-max(h, 0.0) * max(uFogParams.w, 0.001)) * nearFade;
        dens = max(dens, 1e-6);
        float shadow = fogShadowAt(pos);
        float phase = phaseHG(dot(rayDir, sunL), gPh);
        float opt = dens * stepLen;
        float stepT = exp(-opt);
        vec3 Li = sunCol * shadow * phase * uFogParams2.y;
        inSc += T * Li * (1.0 - stepT);
        T *= stepT;
        pos += rayDir * stepLen;
    }

    float pk = max(inSc.r, max(inSc.g, inSc.b));
    if (pk > 0.95) inSc *= 0.95 / pk;

    float heightFactor = exp(-max(worldPos.y - uFogParams.z, 0.0) * max(uFogParams.w, 0.001));
    heightFactor = mix(0.55, 1.0, heightFactor);
    float fogFactor = clamp((1.0 - T) * heightFactor, 0.0, 1.0) * 0.58;
    vec3 fogCol = max(uFogColor, vec3(0.45, 0.55, 0.72) * 0.45 + uSkyBottom * 0.55);
    color = mix(color, fogCol, fogFactor);
    color += inSc;
    return color;
}

vec3 shadeLight(vec3 N, vec3 V, vec3 L, vec3 radiance, vec3 albedo, float metallic, float roughness) {
    vec3 H = normalize(V + L);
    vec3 F0 = mix(vec3(0.04), albedo, metallic);
    float NDF = distributionGGX(N, H, roughness);
    float G = geometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
    vec3 specular = (NDF * G * F) / max(4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0), 0.001);
    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
    float NdotL = max(dot(N, L), 0.0);
    return (kD * albedo / PI + specular) * radiance * NdotL;
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 albedo = uIsGround ? groundAlbedo(vWorldPos) : uAlbedo;
    float roughness = clamp(uRoughness, 0.045, 1.0);
    float metallic = clamp(uMetallic, 0.0, 1.0);

    vec3 Lo = vec3(0.0);
    vec3 Ldir = normalize(-uDirLightDir);
    float shadow = uReceiveShadow ? shadowFactor(vLightSpace, N, Ldir) : 1.0;
    Lo += shadeLight(N, V, Ldir, uDirLightColor * uDirLightIntensity, albedo, metallic, roughness) * shadow;

    for (int i = 0; i < 4; i++) {
        if (i >= uPointLightCount) break;
        vec3 L = uPointLightPos[i] - vWorldPos;
        float dist = length(L);
        L = L / max(dist, 0.0001);
        float atten = 1.0 / (1.0 + dist * dist * 0.00008);
        Lo += shadeLight(N, V, L, uPointLightColor[i] * uPointLightIntensity[i] * atten, albedo, metallic, roughness);
    }

    vec3 color = (uAmbient * albedo) + Lo + (albedo * uEmissive);

    if (uRayTrace) {
        vec3 R = reflect(-V, N);
        vec3 refl;
        if (R.y < -0.001 && vWorldPos.y > 0.5) {
            float t = -vWorldPos.y / R.y;
            vec3 hit = vWorldPos + R * t;
            refl = groundAlbedo(hit) * 0.55;
        } else {
            refl = skyColor(R);
        }
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float mixAmt = mix(0.08, 0.7, metallic) + fres * (1.0 - roughness);
        color = mix(color, refl, clamp(mixAmt, 0.0, 0.85));
    }

    color = applyVolumetricFog(color, vWorldPos);
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0 / 2.2));
    fragColor = vec4(color, uOpacity);
}
`;

const DEPTH_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() {
    gl_Position = uLightVP * uModel * vec4(aPosition, 1.0);
}
`;

const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}
`;

const SKY_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec3 vDir;
uniform mat4 uInvViewProj;
void main() {
    gl_Position = vec4(aPos, 1.0, 1.0);
    vec4 far = uInvViewProj * vec4(aPos, 1.0, 1.0);
    vDir = far.xyz / far.w;
}
`;

const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform vec3 uDirLightColor;
uniform float uDirLightIntensity;
uniform vec3 uFogColor;
uniform vec4 uFogParams;
uniform vec4 uFogParams2;
uniform float uFogStart;
uniform mat4 uLightVP;
uniform sampler2D uShadowMap;
uniform vec4 uSkyFx;
uniform vec4 uCloudParams;
uniform float uGodRayIntensity;
out vec4 fragColor;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm21(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * noise21(p);
        p *= 2.04;
        a *= 0.5;
    }
    return v;
}
vec2 skyUV(vec3 dir) {
    float u = atan(dir.z, dir.x) / 6.2831853 + 0.5;
    float v = 1.0 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265;
    return vec2(u, v);
}
float cloudDensity(vec3 dir, float coverage, float densMul, float wind) {
    if (dir.y < -0.02) return 0.0;
    vec2 uv = skyUV(dir);
    float v = uv.y;
    if (v < 0.02 || v > 0.78) return 0.0;
    float t = v / 0.78;
    float slab = 1.0 - abs(t - 0.38) / 0.42;
    slab = clamp(slab, 0.0, 1.0);
    float band = sin(clamp(t, 0.0, 1.0) * 3.14159265);
    float band2 = band * 0.45 + slab * 0.55;
    if (band2 < 0.02) return 0.0;
    vec2 w = vec2(wind * 0.22, wind * 0.08);
    vec2 p = (uv + w) * 2.2;
    float low = fbm21(p * 0.48);
    float mid = fbm21(p);
    float puff = 1.0 - fbm21(p * 1.55);
    puff = puff * puff;
    float d = low * 0.34 + mid * 0.38 + puff * 0.28;
    float thresh = 0.44 - clamp(coverage, 0.0, 1.0) * 0.52;
    d = clamp((d - thresh) / 0.38, 0.0, 1.0);
    d = d * d * (3.0 - 2.0 * d);
    d *= max(densMul, 0.4) * (0.35 + 0.75 * band2);
    return clamp(d, 0.0, 1.0);
}
float phaseHG(float cosTheta, float g) {
    float g2 = g * g;
    float denom = max(1e-4, 1.0 + g2 - 2.0 * g * cosTheta);
    return (1.0 - g2) / (4.0 * 3.14159265359 * pow(denom, 1.5));
}
vec3 atmosphere(vec3 V, vec3 sunL, float sunI) {
    float vy = max(V.y, 0.0);
    float kr = 1.0 / (vy * 15.0 + 0.15);
    float km = 1.0 / (vy * 8.0 + 0.2);
    float cosT = clamp(dot(V, sunL), -1.0, 1.0);
    float pr = 0.75 * (1.0 + cosT * cosT);
    float g = 0.76;
    float g2 = g * g;
    float pm = (1.0 - g2) / max(1e-4, pow(1.0 + g2 - 2.0 * g * cosT, 1.5));
    float sunH = max(sunL.y, 0.0);
    float day = clamp(sunH * 1.5 + 0.05, 0.0, 1.0);
    float I = sunI * day;
    vec3 rayleigh = vec3(5.8, 13.5, 33.1) * (pr * kr * 0.12 * I);
    vec3 mie = vec3(2.0) * (pm * km * 0.045 * I);
    rayleigh += vec3(0.50, 0.78, 1.40) * (0.10 * I);
    float horizon = clamp(1.0 - vy * 2.5, 0.0, 1.0);
    float dusk = clamp(1.0 - sunH * 2.5, 0.0, 1.0) * day;
    rayleigh.x += dusk * horizon * 0.13 * I;
    rayleigh.y += dusk * horizon * 0.035 * I;
    rayleigh.z *= 1.0 - dusk * horizon * 0.45;
    rayleigh += vec3(0.10, 0.11, 0.13) * horizon * day * I;
    float nightAmt = clamp(1.0 - day * 1.2, 0.0, 1.0);
    vec3 night = vec3(0.006, 0.010, 0.028) + vec3(0.012, 0.018, 0.040) * horizon;
    vec3 col = mix(rayleigh + mie, night, nightAmt);
    if (V.y < 0.0) {
        float gt = clamp(-V.y, 0.0, 1.0);
        col = mix(col, uSkyBottom * (0.15 + 0.35 * day), gt);
    }
    col = col / (col + vec3(1.0));
    return col;
}
float fogShadowAt(vec3 worldPos) {
    vec4 ls = uLightVP * vec4(worldPos, 1.0);
    if (abs(ls.w) < 1e-5) return 1.0;
    vec3 proj = ls.xyz / ls.w * 0.5 + 0.5;
    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) {
        return 1.0;
    }
    float closest = texture(uShadowMap, proj.xy).r;
    return (proj.z - 0.0015) > closest ? 0.12 : 1.0;
}

void main() {
    vec3 worldFar = vDir;
    vec3 rayDir = normalize(worldFar - uCameraPos);
    vec3 sunL = normalize(-uSunDir);
    float sdot = max(dot(rayDir, sunL), 0.0);
    vec3 skyMix = mix(uSkyBottom, uSkyTop, clamp(rayDir.y * 0.65 + 0.35, 0.0, 1.0));
    vec3 col = mix(atmosphere(rayDir, sunL, sunI), skyMix, 0.22);
    vec3 sunCol = max(uDirLightColor, vec3(1.0, 0.92, 0.75));

    float cover = uCloudParams.x;
    float cDens = uCloudParams.y;
    float wind = uCloudParams.z * uCloudParams.w;
    float cloudsOn = uSkyFx.y;
    float cloud = 0.0;
    if (cloudsOn > 0.5) {
        cloud = cloudDensity(rayDir, cover, cDens, wind);
        float shadow = 0.0;
        vec3 cdir = rayDir;
        for (int i = 0; i < 2; i++) {
            cdir = normalize(mix(cdir, sunL, 0.12));
            shadow += cloudDensity(cdir, cover, cDens, wind);
        }
        shadow = clamp(shadow * 0.38, 0.0, 1.0);
        vec3 albedo = vec3(1.0, 0.97, 0.95);
        float silver = pow(sdot, 8.0) * 0.85 * (1.0 - shadow);
        vec3 cloudCol = albedo * (0.35 + 0.55 * (1.0 - shadow) + silver);
        cloudCol = mix(cloudCol, col, clamp((1.0 - rayDir.y) * 0.35, 0.0, 0.55));
        col = mix(col, cloudCol, cloud);
    }

    if (uSkyFx.x > 0.5 && sunL.y > -0.12) {
        float disc = smoothstep(0.9972, 0.9994, sdot);
        float glow = pow(sdot, 32.0);
        float haze = pow(sdot, 8.0);
        float corona = pow(sdot, 3.2) * 0.12;
        col += sunCol * (disc * 1.35 + glow * 0.45 + haze * 0.22 + corona);
        col += vec3(1.0, 0.9, 0.7) * disc * 0.55;
    }

    if (uSkyFx.z > 0.5 && sunL.y > -0.08) {
        float acc = 0.0;
        float decay = 1.0;
        vec3 p = rayDir;
        for (int i = 0; i < 6; i++) {
            p = normalize(mix(p, sunL, 0.14));
            float occ = 1.0;
            if (cloudsOn > 0.5) {
                occ = 1.0 - cloudDensity(p, cover, cDens, wind);
            }
            acc += pow(max(dot(p, sunL), 0.0), 22.0) * occ * decay;
            decay *= 0.74;
        }
        col += sunCol * acc * uGodRayIntensity * 0.55;
    }

    if (uSkyFx.w > 0.5 && sunL.y < 0.12 && rayDir.y > 0.02) {
        float nightAmt = clamp((-sunL.y + 0.12) / 0.35, 0.0, 1.0);
        vec3 g = floor(rayDir * 52.0 + vec3(17.0, 9.0, 3.0));
        float h = hash21(g.xy + g.z);
        if (h > 1.0 - 0.016 * nightAmt) {
            col += vec3(1.0, 0.94, 1.08) * h * nightAmt * 0.9;
        }
    }

    if (uFogParams.x > 0.5 && uFogParams.y > 0.0) {
        float rayLen = max(uFogParams2.x, 1.0);
        const int STEPS = 6;
        float stepLen = rayLen / float(STEPS);
        vec3 pos = uCameraPos + rayDir * (stepLen * 0.5);
        float T = 1.0;
        vec3 inSc = vec3(0.0);
        float gPh = clamp(uFogParams2.z, 0.0, 0.95);
        vec3 scatterCol = sunCol * uDirLightIntensity * uFogParams2.w;
        float nearStart = max(uFogStart, 0.0);
        for (int s = 0; s < STEPS; s++) {
            if (T < 0.02) break;
            float travel = (float(s) + 0.5) * stepLen;
            float nearFade = smoothstep(0.0, nearStart + 1.0, travel);
            float hgt = pos.y - uFogParams.z;
            float dens = uFogParams.y * exp(-max(hgt, 0.0) * max(uFogParams.w, 0.001)) * nearFade;
            dens = max(dens, 1e-6);
            float shadow = fogShadowAt(pos);
            float phase = phaseHG(dot(rayDir, sunL), gPh);
            float opt = dens * stepLen;
            float stepT = exp(-opt);
            inSc += T * scatterCol * shadow * phase * uFogParams2.y * (1.0 - stepT);
            T *= stepT;
            pos += rayDir * stepLen;
        }
        float pk = max(inSc.r, max(inSc.g, inSc.b));
        if (pk > 0.95) inSc *= 0.95 / pk;
        vec3 fogCol = max(uFogColor, vec3(0.45, 0.55, 0.72) * 0.45 + uSkyBottom * 0.55);
        col = mix(col, fogCol, (1.0 - T) * 0.45);
        col += inSc;
    }

    fragColor = vec4(col, 1.0);
}
`;

module.exports = {PBR_VS, PBR_FS, DEPTH_VS, DEPTH_FS, SKY_VS, SKY_FS};

<template>
  <div ref="globeContainer" class="globe-container">

    <div class="globe-background"></div>
    <canvas ref="globeCanvas" class="globe-canvas"></canvas>

    <div v-if="showDebug" class="debug-panel">
      <div class="debug-header">
        <h3>Three.js 调试面板</h3>
        <button @click="toggleDebug">隐藏</button>
      </div>
      <div class="debug-content">
        <div class="debug-section">
          <h4>资源加载</h4>
          <p>地球纹理: {{ debugInfo.textureLoaded ? '✅' : '❌' }}</p>
          <p>凹凸贴图: {{ debugInfo.bumpMapLoaded ? '✅' : '❌' }}</p>
          <p>高光贴图: {{ debugInfo.specularMapLoaded ? '✅' : '❌' }}</p>
          <p>国家边界数据: {{ debugInfo.geoDataLoaded ? `✅ (${debugInfo.bordersCreated}条)` : '❌' }}</p>
        </div>
        <div class="debug-section">
          <h4>场景信息</h4>
          <p>FPS: {{ debugInfo.fps }}</p>
          <p>三角形数量: {{ debugInfo.triangles }}</p>
          <p>对象数量: {{ debugInfo.objects }}</p>
          <p>内存使用: {{ debugInfo.memory }} MB</p>
        </div>
        <div class="debug-section">
          <h4>交互状态</h4>
          <p>最后选择: {{ debugInfo.lastSelected || '无' }}</p>
          <p>最后悬停: {{ debugInfo.lastHovered || '无' }}</p>
          <p>相机位置: X:{{ debugInfo.cameraPosition.x.toFixed(2) }} Y:{{ debugInfo.cameraPosition.y.toFixed(2) }} Z:{{ debugInfo.cameraPosition.z.toFixed(2) }}</p>
          <p>光源位置: X:{{ debugInfo.lightPosition.x.toFixed(2) }} Y:{{ debugInfo.lightPosition.y.toFixed(2) }} Z:{{ debugInfo.lightPosition.z.toFixed(2) }}</p>
        </div>
        <div class="debug-section" v-if="debugInfo.lastError">
          <h4>错误信息</h4>
          <p class="error">{{ debugInfo.lastError }}</p>
        </div>
        <div class="debug-actions">
          <button @click="reloadData">重新加载数据</button>
          <button @click="resetCamera">重置相机</button>
          <button @click="resetHighlights">重置高亮</button>
        </div>
      </div>
    </div>
    <button class="debug-toggle" @click="toggleDebug">调试</button>
    
<!-- 添加标签调试面板 -->
    <div v-if="showDebug" class="label-debug-panel">
      <div class="debug-header">
        <h3>标签调试信息</h3>
      </div>
      <div class="debug-content">
        <p>已创建标签: {{ labelDebugInfo.labelsCreated }}</p>
        <p>可见标签: {{ labelDebugInfo.visibleLabels }}</p>
        <p>最后更新: {{ labelDebugInfo.lastUpdate }}</p>
        <p>标签可见性: {{ labelVisibility ? '显示' : '隐藏' }}</p>
        <div class="debug-actions">
          <button @click="toggleLabels">{{ labelVisibility ? '隐藏标签' : '显示标签' }}</button>
          <button @click="forceUpdateLabels">强制更新标签</button>
        </div>
      </div>
    </div>

    <!-- 国家信息提示框 -->
    <div v-if="hoveredCountryInfo && !isZoomedIn" class="country-tooltip" :style="tooltipStyle">
      <div class="tooltip-content">
        <h4>{{ hoveredCountryInfo.country_name_zh || hoveredCountryInfo.country_name }}</h4>
        <p>国家代码: {{ hoveredCountryInfo.country_id }}</p>
        <p v-if="hoveredCountryInfo.total_active_ipv6">IPv6地址数: {{ hoveredCountryInfo.total_active_ipv6 }}</p>
      </div>
    </div>
    
    <!-- 地球控制面板 -->
    <div class="globe-controls">
      <button v-if="!isZoomedIn" @click="rotateGlobe('left')" title="向左旋转">
        <span class="control-icon">←</span>
      </button>
      <button v-if="!isZoomedIn" @click="rotateGlobe('right')" title="向右旋转">
        <span class="control-icon">→</span>
      </button>
      <button v-if="!isZoomedIn" @click="rotateGlobe('up')" title="向上旋转">
        <span class="control-icon">↑</span>
      </button>
      <button v-if="!isZoomedIn" @click="rotateGlobe('down')" title="向下旋转">
        <span class="control-icon">↓</span>
      </button>
      <button v-if="!isZoomedIn" @click="toggleAutoRotate" :class="{ active: autoRotate }" title="自动旋转">
        <span class="control-icon">⟳</span>
      </button>
      <button v-if="!isZoomedIn" @click="zoomIn" title="放大">
        <span class="control-icon">+</span>
      </button>
      <button v-if="!isZoomedIn" @click="zoomOut" title="缩小">
        <span class="control-icon">-</span>
      </button>
      <button v-if="!isZoomedIn" @click="toggleLabels" :class="{ active: labelVisibility }" title="显示/隐藏国家标签">
        <span class="control-icon">🏷️</span>
      </button>

      <button v-if="!isZoomedIn" @click="toggleParticleSystem" title="切换粒子效果">
        <span class="control-icon">🔄</span>
      </button>
      <button v-if="isZoomedIn" @click="resetCamera" title="返回全球视图" class="return-button">
        <span class="control-icon">↩</span>
      </button>
    </div>
    <!-- 地球 -->
    
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>加载中...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import earthTexture from '@/assets/images/earth_texture.jpg'
import earthBump from '@/assets/images/8k_earth_normal_map_1.jpg'
import earthSpecular from '@/assets/images/8k_earth_specular_map.jpg'
import spaceBackground from '@/assets/images/background.jpg'
import countriesGeoData from '@/assets/data/countries.geo.json'
import axios from 'axios'

const props = defineProps({
  countries: Array,
  asns: Array
})

const emit = defineEmits([
  'country-selected', 
  'asn-selected', 
  'retry-fetch', 
  'data-load-success', 
  'data-load-error',
  'zoom-changed' // 添加新的事件
])

const globeContainer = ref(null)
const showDebug = ref(false)
const isLoading = ref(true)
const retryCount = ref(0)
const maxRetries = 3
const countryCenters = ref({})
const hoveredCountryInfo = ref(null)
const mousePosition = ref({ x: 0, y: 0 })
const dragThreshold = 5 // 拖拽阈值，像素单位
const isDragging = ref(false)
const mouseDownPosition = ref({ x: 0, y: 0 })
const mouseDownTime = ref(0)
const clickTimeThreshold = 200 // 点击时间阈值，毫秒
const autoRotate = ref(false)
const lastClickTime = ref(0)
const clickDelay = 300 // 毫秒
const isZoomedIn = ref(false)//是否处于放大状态
// 计算tooltip样式
const tooltipStyle = computed(() => {
  return {
    left: `${mousePosition.value.x + 15}px`,
    top: `${mousePosition.value.y + 20}px`
  }
})
const countryLabels = ref([]);  // 存储国家标签对象
const labelVisibility = ref(true);  // 控制标签显示/隐藏

const particleSystemType = ref('matrix'); // 'matrix' 或 'detection'


// Three.js 核心变量
let scene, camera, renderer, globe, controls
let composer, outlinePass, bloomPass
let selectedCountry = null
let selectedAsn = null
let animationId = null
let frameCount = 0
let lastFpsUpdate = 0
let directionalLight
let bordersGroup = null
let hoveredBorder = null
let raycaster = new THREE.Raycaster()
let mouse = new THREE.Vector2()
let particleSystem // 粒子系统
let matrixParticleSystem // 黑客帝国风格粒子系统
let rotationSpeed = 0.001 // 自动旋转速度

// 调试信息
const debugInfo = ref({
  textureLoaded: false,
  bumpMapLoaded: false,
  specularMapLoaded: false,
  geoDataLoaded: false,
  bordersCreated: 0,
  fps: 0,
  triangles: 0,
  objects: 0,
  memory: 0,
  lastSelected: null,
  lastHovered: null,
  cameraPosition: { x: 0, y: 0, z: 0 },
  lightPosition: { x: 0, y: 0, z: 0 },
  lastError: null
})

const toggleDebug = () => {
  showDebug.value = !showDebug.value
}

const initScene = () => {
  if (!globeContainer.value) return
  
  // 创建场景
  scene = new THREE.Scene()
  
  // 添加背景
  const textureLoader = new THREE.TextureLoader()
  textureLoader.load(spaceBackground, (texture) => {
    scene.background = texture
  })
  
  // 创建相机
  const width = globeContainer.value.clientWidth
  const height = globeContainer.value.clientHeight
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  // 设置初始相机位置，使中国位于中心
  // 中国的经纬度大约是 35.8617, 104.1954
  const lat = 35.8617
  const lng = 104.1954
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  // 计算相机位置，使中国朝向观察者
  camera.position.x = -Math.sin(phi) * Math.cos(theta) * 2.5
  camera.position.y = Math.cos(phi) * 2.5
  camera.position.z = Math.sin(phi) * Math.sin(theta) * 2.5
  
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 0) // 设置透明背景

  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.zIndex = '1'; // 确保在背景层之上

  globeContainer.value.appendChild(renderer.domElement)
  
  

  // 创建控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.rotateSpeed = 0.5
  controls.minDistance = 1.5
  controls.maxDistance = 5
  controls.enablePan = false
  controls.autoRotate = autoRotate.value
  controls.autoRotateSpeed = 0.5
  
  // 添加光源
  const ambientLight = new THREE.AmbientLight(0x404040, 1)
  scene.add(ambientLight)
  
  directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
  directionalLight.position.set(5, 3, 5)
  directionalLight.castShadow = true
  scene.add(directionalLight)
  
  // 添加点光源
  const pointLight = new THREE.PointLight(0x0088ff, 1, 10)
  pointLight.position.set(2, 2, 2)
  scene.add(pointLight)
  
  // 创建后期处理
  composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)
  
  // 添加轮廓效果
  outlinePass = new OutlinePass(
    new THREE.Vector2(width, height),
    scene,
    camera
  )
  outlinePass.edgeStrength = 3.5    // 降低边缘强度，使其更柔和
  outlinePass.edgeGlow = 1.0        // 降低发光效果
  outlinePass.edgeThickness = 1.5   // 减小边缘厚度
  outlinePass.pulsePeriod = 0
  outlinePass.visibleEdgeColor.set(0xffff00) // 黄色高亮
  outlinePass.hiddenEdgeColor.set(0xffff00)
  
  // 添加辉光效果
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.0,  // 增强强度
    0.6,  // 增加半径
    0.8   // 降低阈值
  )
  composer.addPass(bloomPass)
  
  // 添加FXAA抗锯齿
  const fxaaPass = new ShaderPass(FXAAShader)
  fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height)
  composer.addPass(fxaaPass)
  
  // 创建地球
  createGlobe()
  
  // 添加粒子系统
  createParticleSystem()

  
  // 加载国家中心坐标
  loadCountryCenters().then(() => {
    // 添加国家边界
    addCountryBorders()
    
    // 添加ASN标记
    addAsnMarkers()
  })
  
  // 添加事件监听器
  window.addEventListener('resize', onWindowResize)
  // 使用 passive: true 提高触摸设备上的性能
  globeContainer.value.addEventListener('mousedown', onMouseDown, { passive: true })
  globeContainer.value.addEventListener('mouseup', onMouseUp, { passive: true })
  globeContainer.value.addEventListener('mousemove', onDocumentMouseMove, { passive: true })
  
  // 添加触摸事件支持
  globeContainer.value.addEventListener('touchstart', (e) => {
    e.preventDefault()
    if (e.touches.length === 1) {
      onMouseDown({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      })
    }
  })
  
  globeContainer.value.addEventListener('touchend', (e) => {
    e.preventDefault()
    onMouseUp({
      clientX: mousePosition.value.x,
      clientY: mousePosition.value.y
    })
  })
  
  globeContainer.value.addEventListener('touchmove', (e) => {
    e.preventDefault()
    if (e.touches.length === 1) {
      onDocumentMouseMove({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      })
    }
  })
  // 开始动画循环
  animate()
}

const createParticleSystem = () => {
  // 移除现有的粒子系统
  if (matrixParticleSystem) {
    scene.remove(matrixParticleSystem);
    if (matrixParticleSystem.geometry) matrixParticleSystem.geometry.dispose();
    if (matrixParticleSystem.material) matrixParticleSystem.material.dispose();
    matrixParticleSystem = null;
  }
  
  if (particleSystem) {
    scene.remove(particleSystem);
    if (particleSystem.geometry) particleSystem.geometry.dispose();
    if (particleSystem.material) particleSystem.material.dispose();
    particleSystem = null;
  }
  
  if (particleSystemType.value === 'matrix') {
    createMatrixParticleSystem();
  } else {
    createDetectionParticleSystem();
  }
}

// 创建黑客帝国风格粒子系统
const createMatrixParticleSystem = () => {
  // 移除旧的粒子系统
  if (matrixParticleSystem) {
    scene.remove(matrixParticleSystem)
    if (matrixParticleSystem.geometry) matrixParticleSystem.geometry.dispose()
    if (matrixParticleSystem.material) matrixParticleSystem.material.dispose()
  }
  
  const particleCount = 2000
  const particles = new THREE.BufferGeometry()
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const sizes = new Float32Array(particleCount)
  const opacities = new Float32Array(particleCount)
  
  // 创建粒子
  for (let i = 0; i < particleCount; i++) {
    // 随机位置，但限制在地球周围的球形区域
    const radius = 1.1 + Math.random() * 0.5
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI
    
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
    
    // 随机颜色，以绿色为主
    const greenIntensity = 0.5 + Math.random() * 0.5
    colors[i * 3] = 0.1 + Math.random() * 0.2 // 少量红色
    colors[i * 3 + 1] = greenIntensity // 主要是绿色
    colors[i * 3 + 2] = 0.1 + Math.random() * 0.3 // 少量蓝色
    
    // 随机大小
    sizes[i] = 0.01 + Math.random() * 0.03
    
    // 随机透明度
    opacities[i] = 0.1 + Math.random() * 0.9
  }
  
  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particles.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  particles.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1))
  
  // 创建着色器材质
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      uniform float time;
      
      void main() {
        vOpacity = opacity;
        // 添加一些基于时间的波动
        vec3 pos = position;
        float wave = sin(time * 2.0 + position.x * 5.0) * 0.02;
        pos.y += wave;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      
      void main() {
        // 创建一个圆形点
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        float alpha = smoothstep(0.5, 0.4, dist) * vOpacity;
        
        // 绿色为主的颜色
        vec3 color = vec3(0.1, 0.8, 0.3);
        
        // 添加一些发光效果
        float glow = exp(-dist * 5.0) * 0.5;
        color += vec3(0.1, 0.5, 0.2) * glow;
        
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  })
  
  matrixParticleSystem = new THREE.Points(particles, particleMaterial)
  scene.add(matrixParticleSystem)
}

// Detection风格粒子系统（新增）
const createDetectionParticleSystem = () => {
  // 移除现有的粒子系统
  if (particleSystem) {
    scene.remove(particleSystem);
    if (particleSystem.geometry) particleSystem.geometry.dispose();
    if (particleSystem.material) particleSystem.material.dispose();
    particleSystem = null;
  }
  
  // 创建与DetectionPlatformView一致的粒子系统
  const particleCount = 400; // 适当的粒子数量
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const velocities = new Float32Array(particleCount * 3);
  const opacities = new Float32Array(particleCount);
  
  // 创建粒子 - 使用与DetectionPlatformView相同的逻辑
  for (let i = 0; i < particleCount; i++) {
    // 随机位置，分布在地球周围的球形区域
    const radius = 1.5 + Math.random() * 1.0; // 地球周围区域
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    
    // 白色粒子，与DetectionPlatformView一致
    colors[i * 3] = 1.0;     // 红色通道
    colors[i * 3 + 1] = 1.0; // 绿色通道
    colors[i * 3 + 2] = 1.0; // 蓝色通道
    
    // 随机大小 - 与DetectionPlatformView一致
    sizes[i] = 0.005 + Math.random() * 0.015;
    
    // 随机速度 - 与DetectionPlatformView一致的慢速移动
    velocities[i * 3] = (Math.random() * 0.5 - 0.25) * 0.01;
    velocities[i * 3 + 1] = (Math.random() * 0.5 - 0.25) * 0.01;
    velocities[i * 3 + 2] = (Math.random() * 0.5 - 0.25) * 0.01;
    
    // 随机透明度 - 与DetectionPlatformView一致
    opacities[i] = Math.random() * 0.5 + 0.25;
  }
  
  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  particles.userData.velocities = velocities;
  particles.userData.opacities = opacities;
  
  // 使用与DetectionPlatformView相同的材质设置
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.03,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    depthWrite: false
  });
  
  particleSystem = new THREE.Points(particles, particleMaterial);
  scene.add(particleSystem);
  
  // 添加线条连接系统
  createParticleConnections();
}
// 创建线条连接系统
const createParticleConnections = () => {
  // 如果已存在连接线系统，先移除
  if (scene.userData.lineSystem) {
    scene.remove(scene.userData.lineSystem);
    if (scene.userData.lineSystem.geometry) scene.userData.lineSystem.geometry.dispose();
    if (scene.userData.lineSystem.material) scene.userData.lineSystem.material.dispose();
    scene.userData.lineSystem = null;
  }
  
  // 创建线条几何体
  const lineGeometry = new THREE.BufferGeometry();
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  
  // 创建空的线条系统
  const lineSystem = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(lineSystem);
  scene.userData.lineSystem = lineSystem;
}
// 更新黑客帝国风格粒子系统
const updateMatrixParticleSystem = (time) => {
  if (!matrixParticleSystem) return
  
  // 更新时间uniform
  matrixParticleSystem.material.uniforms.time.value = time * 0.001
  
  // 随机更新一些粒子的透明度，创造闪烁效果
  const opacities = matrixParticleSystem.geometry.attributes.opacity.array
  const count = opacities.length
  
  for (let i = 0; i < count; i++) {
    if (Math.random() > 0.95) {
      opacities[i] = Math.random()
    }
  }
  
  matrixParticleSystem.geometry.attributes.opacity.needsUpdate = true
  
  // 缓慢旋转粒子系统
  matrixParticleSystem.rotation.y += 0.0010
}

// 更新Detection风格粒子系统（新增）
const updateDetectionParticleSystem = (time) => {
  if (!particleSystem) return;
  
  const positions = particleSystem.geometry.attributes.position.array;
  const velocities = particleSystem.geometry.userData.velocities;
  const opacities = particleSystem.geometry.userData.opacities;
  const count = positions.length / 3;
  
  // 更新粒子位置
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    
    // 更新位置
    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];
    
    // 边界检查 - 与DetectionPlatformView一致的反弹效果
    const distance = Math.sqrt(
      positions[i3] * positions[i3] + 
      positions[i3 + 1] * positions[i3 + 1] + 
      positions[i3 + 2] * positions[i3 + 2]
    );
    
    // 如果粒子太远或太近，反弹
    if (distance > 3.0 || distance < 1.0) {
      velocities[i3] = -velocities[i3];
      velocities[i3 + 1] = -velocities[i3 + 1];
      velocities[i3 + 2] = -velocities[i3 + 2];
    }
  }
  
  particleSystem.geometry.attributes.position.needsUpdate = true;
  
  // 更新粒子之间的连接线
  updateParticleConnections();
}
// 更新粒子之间的连接线
const updateParticleConnections = () => {
  if (!particleSystem || !scene.userData.lineSystem) return;
  
  const positions = particleSystem.geometry.attributes.position.array;
  const count = positions.length / 3;
  
  // 收集需要连线的点对
  const linePositions = [];
  const maxDistance = 0.4; // 减小最大连线距离，原来是0.5
  
  // 限制连线数量，避免性能问题
  const maxLines = 400; // 设置最大连线数量
  let lineCount = 0;
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const px1 = positions[i3];
    const py1 = positions[i3 + 1];
    const pz1 = positions[i3 + 2];
    
    // 使用步进来减少计算量
    for (let j = i + 1; j < count; j++) {
      // 如果已达到最大连线数量，跳出循环
      if (lineCount >= maxLines) break;
      
      const j3 = j * 3;
      const px2 = positions[j3];
      const py2 = positions[j3 + 1];
      const pz2 = positions[j3 + 2];
      
      // 计算距离
      const dx = px1 - px2;
      const dy = py1 - py2;
      const dz = pz1 - pz2;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // 如果距离小于阈值，添加连线
      if (distance < maxDistance) {
        linePositions.push(px1, py1, pz1);
        linePositions.push(px2, py2, pz2);
        lineCount++;
      }
    }
  }
  
  // 更新线条几何体
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  
  // 更新线条系统
  scene.userData.lineSystem.geometry.dispose();
  scene.userData.lineSystem.geometry = lineGeometry;
}
const updateParticleSystem = (time) => {
  if (particleSystemType.value === 'matrix') {
    updateMatrixParticleSystem(time);
  } else {
    updateDetectionParticleSystem(time);
  }
}

const toggleParticleSystem = () => {
  particleSystemType.value = particleSystemType.value === 'matrix' ? 'detection' : 'matrix';
  createParticleSystem();
}

const createGlobe = () => {
  const geometry = new THREE.SphereGeometry(1, 64, 64) // 增加几何体细节
  const placeholderMaterial = new THREE.MeshPhongMaterial({
    color: 0x1a3d8f,
    specular: 0x111111,
    shininess: 5,
    emissive: 0x0a1a3f,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.7 // 增加透明度
  })

  const loadTexture = (path, onLoad) => {
    return new Promise((resolve, reject) => {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        path,
        (texture) => {
          onLoad(true)
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy() // 提高纹理质量
          resolve(texture)
        },
        undefined,
        (error) => {
          console.error(`纹理加载失败: ${path}`, error)
          debugInfo.value.lastError = `${path}加载失败: ${error.message}`
          onLoad(false)
          resolve(null)
        }
      )
    })
  }

  Promise.all([
    loadTexture(earthTexture, (success) => { debugInfo.value.textureLoaded = success }),
    loadTexture(earthBump, (success) => { debugInfo.value.bumpMapLoaded = success }),
    loadTexture(earthSpecular, (success) => { debugInfo.value.specularMapLoaded = success })
  ]).then(([texture, bumpMap, specularMap]) => {
    const material = new THREE.MeshPhongMaterial({
      map: texture || undefined,
      bumpMap: bumpMap || undefined,
      bumpScale: bumpMap ? 0.1 : 0, // 增加凹凸效果
      specularMap: specularMap || undefined,
      specular: new THREE.Color(0x333333),
      shininess: 30, // 增加光泽度
      emissive: new THREE.Color(0x0a1a3f),
      emissiveIntensity: 0.5, // 增加自发光强度
      transparent: true,
      opacity: 0.85 // 设置透明度
    })

    const atmosphereGeometry = new THREE.SphereGeometry(1.02, 64, 64)
    const atmosphereMaterial = new THREE.MeshPhongMaterial({
      color: 0x4ca6ff,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
      emissive: 0x0066ff,
      emissiveIntensity: 0.2,
      blending: THREE.AdditiveBlending
    })
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphere)
    
    globe = new THREE.Mesh(geometry, material)
    globe.castShadow = true
    globe.receiveShadow = true
    globe.userData = { isClickable: true } // 确保地球对象可点击
    scene.add(globe)
    
    // 地球创建成功后，尝试加载国家边界
    nextTick(() => {
      addCountryBorders()
      
      // 加载国家中心坐标后创建标签
      loadCountryCenters().then(() => {
        // 初始化标签
        createCountryLabels()
        console.log('国家标签初始化完成')
      }).catch(error => {
        console.error('加载国家中心坐标失败:', error)
        debugInfo.value.lastError = `加载国家中心坐标失败: ${error.message}`
      })
    })
  }).catch(error => {
    console.error('地球创建失败:', error)
    debugInfo.value.lastError = `地球创建失败: ${error.message}`
    globe = new THREE.Mesh(geometry, placeholderMaterial)
    scene.add(globe)
  })
}

// 添加创建国家标签的函数
const createCountryLabels = () => {
  // 清除现有标签
  countryLabels.value.forEach(label => {
    if (label.element && label.element.parentNode) {
      label.element.parentNode.removeChild(label.element);
    }
  });
  countryLabels.value = [];
  
  if (!props.countries || !globeContainer.value) {
    console.warn('无法创建国家标签：缺少国家数据或容器');
    return;
  }
  
  // 重置标签调试信息
  labelDebugInfo.value.labelsCreated = 0;
  
  // 为每个国家创建标签
  props.countries.forEach(country => {
    // 获取国家中心坐标
    let center = countryCenters.value[country.country_id];
    
    // 如果没有预定义的中心坐标，尝试从地理数据中计算
    if (!center && countriesGeoData && countriesGeoData.features) {
      const feature = countriesGeoData.features.find(f => f.id === country.country_id);
      if (feature && feature.geometry) {
        // 根据几何类型获取第一个坐标点作为中心点
        if (feature.geometry.type === 'MultiPolygon' && feature.geometry.coordinates && feature.geometry.coordinates.length > 0) {
          const firstRing = feature.geometry.coordinates[0][0];
          if (firstRing && firstRing.length > 0) {
            const [lng, lat] = firstRing[0];
            center = { lat, lng };
            // 保存计算出的中心点以便重用
            countryCenters.value[country.country_id] = center;
          }
        } else if (feature.geometry.type === 'Polygon' && feature.geometry.coordinates && feature.geometry.coordinates.length > 0) {
          const firstRing = feature.geometry.coordinates[0];
          if (firstRing && firstRing.length > 0) {
            const [lng, lat] = firstRing[0];
            center = { lat, lng };
            // 保存计算出的中心点以便重用
            countryCenters.value[country.country_id] = center;
          }
        }
      }
    }
    
    // 如果仍然没有中心坐标，跳过此国家
    if (!center) {
      console.warn(`无法为国家 ${country.country_id} 创建标签：缺少中心坐标`);
      return;
    }
    
    const { lat, lng } = center;
    
    // 创建标签元素
    const labelElement = document.createElement('div');
    labelElement.className = 'country-label';
    
    // 优先使用中文名称，如果没有则使用国家ID
    labelElement.textContent = country.country_name_zh || country.country_name || country.country_id;
    
    labelElement.style.position = 'absolute';
    labelElement.style.color = '#ffffff';
    labelElement.style.fontSize = '10px'; // 调小字体大小
    labelElement.style.fontWeight = 'bold';
    labelElement.style.textShadow = '0 0 2px #000000';
    labelElement.style.padding = '1px 3px'; // 减小内边距
    labelElement.style.borderRadius = '2px';
    labelElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    labelElement.style.pointerEvents = 'none'; // 防止标签干扰鼠标事件
    labelElement.style.display = labelVisibility.value ? 'block' : 'none';
    labelElement.style.zIndex = '1000';
    
    // 添加到容器
    globeContainer.value.appendChild(labelElement);
    
    // 存储标签信息
    countryLabels.value.push({
      element: labelElement,
      country: country,
      position: { lat, lng }
    });
    
    // 更新调试信息
    labelDebugInfo.value.labelsCreated++;
  });
  
  console.log(`创建了 ${labelDebugInfo.value.labelsCreated} 个国家标签`);
  
  // 初始更新标签位置
  updateLabelPositions();
};

// 更新标签位置的函数
const updateLabelPositions = () => {
  if (!camera || !scene || !globeContainer.value) return;
  
  // 如果处于放大状态，隐藏所有标签
  if (isZoomedIn.value) {
    countryLabels.value.forEach(label => {
      if (label.element) {
        label.element.style.display = 'none';
      }
    });
    labelDebugInfo.value.visibleLabels = 0;
    return;
  }
  
  const containerRect = globeContainer.value.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  
  let visibleCount = 0;
  
  countryLabels.value.forEach(label => {
    const { lat, lng } = label.position;
    
    // 将经纬度转换为3D坐标
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    
    const x = -Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    
    // 创建3D点
    const point = new THREE.Vector3(x, y, z);
    
    // 检查点是否在相机前方（可见面）
    const cameraPosition = camera.position.clone();
    const globeCenter = new THREE.Vector3(0, 0, 0);
    const pointToCamera = new THREE.Vector3().subVectors(cameraPosition, point);
    const globeToPoint = new THREE.Vector3().subVectors(point, globeCenter).normalize();
    
    // 点积计算 - 判断点是否在可见面
    const dotProduct = pointToCamera.dot(globeToPoint);
    
    // 将3D坐标转换为屏幕坐标
    point.multiplyScalar(1.05); // 将标签位置稍微抬高，避免被地球遮挡
    const screenPosition = point.clone().project(camera);
    
    // 转换为像素坐标
    const x2d = (screenPosition.x * 0.5 + 0.5) * containerWidth;
    const y2d = (-screenPosition.y * 0.5 + 0.5) * containerHeight;
    
    // 更新标签位置 - 只显示在可见面的标签
    if (dotProduct > 0 && x2d >= 0 && x2d <= containerWidth && y2d >= 0 && y2d <= containerHeight) {
      // 在容器范围内且在可见面，显示标签
      if (labelVisibility.value) {
        label.element.style.display = 'block';
        label.element.style.left = `${x2d}px`;
        label.element.style.top = `${y2d}px`;
        label.element.style.zIndex = '1000'; // 确保标签在最上层
        visibleCount++;
      } else {
        label.element.style.display = 'none';
      }
    } else {
      // 不在可见范围，隐藏标签
      label.element.style.display = 'none';
    }
  });
  
  // 更新调试信息
  labelDebugInfo.value.visibleLabels = visibleCount;
  labelDebugInfo.value.lastUpdate = new Date().toLocaleTimeString();
};

const showAllLabels = () => {
  countryLabels.value.forEach(label => {
    if (label.element) {
      label.element.style.display = 'block';
      // 添加明显的样式
      label.element.style.border = '2px solid red';
      label.element.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
      label.element.style.color = '#ffff00';
      label.element.style.fontWeight = 'bold';
      label.element.style.zIndex = '9999';
      
      // 获取容器尺寸
      const containerRect = globeContainer.value.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      
      // 计算位置 - 均匀分布在容器中
      const index = countryLabels.value.indexOf(label);
      const total = countryLabels.value.length;
      const cols = Math.ceil(Math.sqrt(total));
      const rows = Math.ceil(total / cols);
      
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const x = (col + 0.5) * (containerWidth / cols);
      const y = (row + 0.5) * (containerHeight / rows);
      
      // 设置位置
      label.element.style.left = `${x}px`;
      label.element.style.top = `${y}px`;
    }
  });
  
  // 更新调试信息
  labelDebugInfo.value.visibleLabels = countryLabels.value.length;
  labelDebugInfo.value.lastUpdate = new Date().toLocaleTimeString();
  
  console.log(`强制显示所有 ${countryLabels.value.length} 个标签`);
};

const labelDebugInfo = ref({
  labelsCreated: 0,
  visibleLabels: 0,
  lastUpdate: null,
  centers: {}
});

const toggleLabels = () => {
  labelVisibility.value = !labelVisibility.value;
  countryLabels.value.forEach(label => {
    label.element.style.display = labelVisibility.value ? 'block' : 'none';
  });
};

// 加载国家中心坐标
const loadCountryCenters = async () => {
  try {
    // 不再尝试从API获取国家中心坐标
    // 而是使用备用数据和从地理数据中计算的中心点
    console.log('使用本地计算的国家中心坐标')
    
    // 初始化一些常用国家的中心坐标作为备用
    const backupCenters = {
      'US': { lat: 37.0902, lng: -95.7129 },
      'CN': { lat: 35.8617, lng: 104.1954 },
      'RU': { lat: 61.5240, lng: 105.3188 },
      'BR': { lat: -14.2350, lng: -51.9253 },
      'IN': { lat: 20.5937, lng: 78.9629 },
      'CA': { lat: 56.1304, lng: -106.3468 },
      'AU': { lat: -25.2744, lng: 133.7751 },
      'MX': { lat: 23.6345, lng: -102.5528 },
      'JP': { lat: 36.2048, lng: 138.2529 },
      'DE': { lat: 51.1657, lng: 10.4515 }
    }
    
    // 将备用中心坐标合并到countryCenters中
    Object.keys(backupCenters).forEach(key => {
      if (!countryCenters.value[key]) {
        countryCenters.value[key] = backupCenters[key];
      }
    });
    
    console.log('国家中心坐标初始化成功:', Object.keys(countryCenters.value).length)
    return true
  } catch (error) {
    console.error('初始化国家中心坐标失败:', error)
    return false
  }
}

const addCountryBorders = async () => {
  debugInfo.value.geoDataLoaded = false
  debugInfo.value.bordersCreated = 0
  isLoading.value = true

  if (!props.countries?.length) {
    console.warn('国家数据为空，尝试重新获取数据')
    debugInfo.value.lastError = '国家数据未加载完成'
    emit('retry-fetch')
    
    // 设置延迟重试
    if (retryCount.value < maxRetries) {
      retryCount.value++
      setTimeout(() => {
        addCountryBorders()
      }, 2000)
    } else {
      isLoading.value = false
    }
    return
  }

  if (!globe) {
    console.warn('地球对象未创建，等待地球模型初始化')
    debugInfo.value.lastError = '地球模型未初始化完成'
    setTimeout(() => addCountryBorders(), 1000)
    return 
  }

  try {
    // 清除现有的边界组
    if (bordersGroup) {
      scene.remove(bordersGroup)
      // 释放资源
      bordersGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
      bordersGroup = null
    }
    
    // 创建新的边界组
    const geoData = countriesGeoData
    bordersGroup = new THREE.Group()
    let bordersCreated = 0
    
    // 创建国家ID映射
    const countryMap = props.countries.reduce((map, country) => {
      map[country.country_id] = country
      if (country.iso3_code) map[country.iso3_code] = country
      return map
    }, {})
    
    // 处理每个国家特征
    for (const feature of geoData.features) {
    const country = countryMap[feature.id]
    
    if (country) {
      try {
        const coordinates = feature.geometry.coordinates
        const isMultiPolygon = feature.geometry.type === 'MultiPolygon'
        const polygons = isMultiPolygon ? coordinates : [coordinates]
        
        // 计算国家中心点 - 使用第一个多边形的第一个环的中心点
        if (!countryCenters.value[country.country_id] && polygons.length > 0 && polygons[0].length > 0) {
          const firstRing = polygons[0][0];
          if (firstRing && firstRing.length > 0) {
            // 计算所有点的平均值作为中心点
            let sumLat = 0, sumLng = 0;
            let pointCount = 0;
            
            // 取样计算中心点（不必使用所有点，可以减少计算量）
            const sampleStep = Math.max(1, Math.floor(firstRing.length / 10)); // 每10个点取1个样本
            
            for (let i = 0; i < firstRing.length; i += sampleStep) {
              const [lng, lat] = firstRing[i];
              sumLat += lat;
              sumLng += lng;
              pointCount++;
            }
            
            if (pointCount > 0) {
              const centerLat = sumLat / pointCount;
              const centerLng = sumLng / pointCount;
              
              // 保存计算出的中心点
              countryCenters.value[country.country_id] = {
                lat: centerLat,
                lng: centerLng
              };
              
              // 更新调试信息
              labelDebugInfo.value.centers[country.country_id] = {
                lat: centerLat,
                lng: centerLng,
                source: 'calculated'
              };
            }
          }
        }
        
        // 为每个多边形创建线条
        for (const polygon of polygons) {
          for (const ring of polygon) {
            const points = []
            
            // 将经纬度坐标转换为3D坐标
            for (const coord of ring) {
              const [long, lat] = coord
              const phi = (90 - lat) * (Math.PI / 180)
              const theta = (long + 180) * (Math.PI / 180)
              
              // 稍微将边界抬高，以避免与地球表面重叠
              points.push(new THREE.Vector3(
                -Math.sin(phi) * Math.cos(theta) * 1.015, // 增加边界高度
                Math.cos(phi) * 1.015,
                Math.sin(phi) * Math.sin(theta) * 1.015
              ))
            }
            
            // 确保有足够的点来创建线条
            if (points.length > 1) {
              const geometry = new THREE.BufferGeometry().setFromPoints(points)
              const material = new THREE.LineBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.9, // 增加不透明度
                linewidth: 2.0 // 加粗线条
              });
              
              const line = new THREE.Line(geometry, material)
              line.userData = { 
                country, 
                isClickable: true,
                countryId: country.country_id
              }
              
              bordersGroup.add(line)
              bordersCreated++
              
              // 如果没有中心坐标，使用第一个点的坐标作为备用
              if (!countryCenters.value[country.country_id]) {
                const firstPoint = ring[0]
                countryCenters.value[country.country_id] = {
                  lat: firstPoint[1],
                  lng: firstPoint[0]
                }
                
                // 更新调试信息
                labelDebugInfo.value.centers[country.country_id] = {
                  lat: firstPoint[1],
                  lng: firstPoint[0],
                  source: 'firstPoint'
                };
              }
            }
          }
        }
          
        // ... existing code ...
      } catch (e) {
        console.warn(`处理 ${feature.id} 边界失败:`, e)
      }
    }
  }
    
    // 将边界组添加到场景
    scene.add(bordersGroup)
    
    // 更新调试信息
    debugInfo.value.geoDataLoaded = true
    debugInfo.value.bordersCreated = bordersCreated
    debugInfo.value.lastError = null
    
    // 重置重试计数
    retryCount.value = 0
    
    // 初始化国家中心坐标
    await loadCountryCenters()

    // 创建国家标签
    createCountryLabels()
    
    // 通知加载成功
    emit('data-load-success')
    console.log('国家边界加载成功:', bordersCreated)
  } catch (error) {
    console.error('加载国家边界失败:', error)
    debugInfo.value.lastError = `加载国家边界失败: ${error.message}`
    debugInfo.value.geoDataLoaded = false
    
    // 清理资源
    if (bordersGroup) {
      scene.remove(bordersGroup)
      bordersGroup = null
    }
    
    // 通知加载失败
    emit('data-load-error')
    
    // 设置延迟重试
    if (retryCount.value < maxRetries) {
      retryCount.value++
      setTimeout(() => {
        addCountryBorders()
      }, 2000)
    }
  } finally {
    isLoading.value = false
  }
}

// 鼠标按下事件
const onMouseDown = (event) => {
  isDragging.value = false
  mouseDownPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  
  mouseDownTime.value = Date.now()

  // 获取容器的边界矩形
  const rect = globeContainer.value.getBoundingClientRect()
  
  // 计算鼠标相对于容器的精确位置
  mousePosition.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

// 鼠标释放事件
const onMouseUp = (event) => {

  const clickDuration = Date.now() - mouseDownTime.value

  const dx = Math.abs(event.clientX - mouseDownPosition.value.x)
  const dy = Math.abs(event.clientY - mouseDownPosition.value.y)
  const movedDistance = Math.sqrt(dx * dx + dy * dy)

  const isClick = clickDuration < clickTimeThreshold && movedDistance < dragThreshold
  // 如果是拖拽结束，不触发点击事件
  if (isDragging.value || !isClick) {
    isDragging.value = false
    mouseDownPosition.value = null
    return
  }
  
  // 检查是否是双击（防止重复触发）
  const now = Date.now()
  if (now - lastClickTime.value < clickDelay) {
    lastClickTime.value = now
    return
  }
  lastClickTime.value = now
  
  // 处理点击事件
  onDocumentClick(event)
  
  // 重置鼠标状态
  mouseDownPosition.value = null
}

// 地球旋转控制
const rotateGlobe = (direction) => {
  if (!controls || !camera) return
  
  const rotationSpeed = 1.5
  const currentPosition = camera.position.clone()
  const targetPosition = currentPosition.clone()
  
  switch (direction) {
    case 'left':
      targetPosition.x = currentPosition.x * Math.cos(rotationSpeed) - currentPosition.z * Math.sin(rotationSpeed)
      targetPosition.z = currentPosition.x * Math.sin(rotationSpeed) + currentPosition.z * Math.cos(rotationSpeed)
      break
    case 'right':
      targetPosition.x = currentPosition.x * Math.cos(-rotationSpeed) - currentPosition.z * Math.sin(-rotationSpeed)
      targetPosition.z = currentPosition.x * Math.sin(-rotationSpeed) + currentPosition.z * Math.cos(-rotationSpeed)
      break
    case 'up':
      if (camera.position.y < 2.5) {
        targetPosition.y = currentPosition.y + 0.5
      }
      break
    case 'down':
      if (camera.position.y > -2.5) {
        targetPosition.y = currentPosition.y - 0.5
      }
      break
  }
  
  // 动画过渡
  const duration = 300
  let startTime = null
  
  const animateRotation = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    // 使用缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 3)
    
    camera.position.lerpVectors(currentPosition, targetPosition, easeProgress)
    controls.update()
    
    if (progress < 1) {
      requestAnimationFrame(animateRotation)
    }
  }
  
  requestAnimationFrame(animateRotation)
}

// 切换自动旋转
const toggleAutoRotate = () => {
  if (!controls) return
  autoRotate.value = !autoRotate.value
  controls.autoRotate = autoRotate.value
}

// 缩放控制
const zoomIn = () => {
  if (!camera || !controls) return
  
  const currentDistance = camera.position.length()
  if (currentDistance > controls.minDistance + 0.1) {
    const targetPosition = camera.position.clone().normalize().multiplyScalar(currentDistance - 0.3)
    
    // 动画过渡
    const duration = 300
    let startTime = null
    const startPosition = camera.position.clone()
    
    const animateZoom = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      
      // 使用缓动函数
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      
      camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
      controls.update()
      
      if (progress < 1) {
        requestAnimationFrame(animateZoom)
      }
    }
    
    requestAnimationFrame(animateZoom)
  }
}

const zoomOut = () => {
  if (!camera || !controls) return
  
  const currentDistance = camera.position.length()
  if (currentDistance < controls.maxDistance - 0.1) {
    const targetPosition = camera.position.clone().normalize().multiplyScalar(currentDistance + 0.3)
    
    // 动画过渡
    const duration = 300
    let startTime = null
    const startPosition = camera.position.clone()
    
    const animateZoom = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      
      // 使用缓动函数
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      
      camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
      controls.update()
      
      if (progress < 1) {
        requestAnimationFrame(animateZoom)
      }
    }
    
    requestAnimationFrame(animateZoom)
  }
}

const addAsnMarkers = () => {
  if (!props.asns || !globe) {
    debugInfo.value.lastError = 'ASN数据或地球对象未准备好'
    return
  }
  
  // 移除旧的标记
  globe.children.forEach(child => {
    if (child.userData?.asn) {
      globe.remove(child)
      if (child.geometry) child.geometry.dispose()
      if (child.material) child.material.dispose()
    }
  })
  
  // 添加新的ASN标记
  props.asns.forEach(asn => {
    if (!asn.location || asn.location.length !== 2) {
      console.warn('ASN缺少位置信息:', asn.asn)
      return
    }
    
    const [long, lat] = asn.location
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (long + 180) * (Math.PI / 180)
    
    const x = -Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)
    
    const markerGeometry = new THREE.SphereGeometry(0.01, 16, 16)
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
      emissive: 0x00ff88,
      emissiveIntensity: 0.5
    })
    
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.position.set(x * 1.02, y * 1.02, z * 1.02)
    marker.userData = {
      asn,
      isClickable: true,
      type: 'asn'
    }
    
    globe.add(marker)
  })
}

const onWindowResize = () => {
  if (!camera || !renderer || !globeContainer.value) return
  
  camera.aspect = globeContainer.value.clientWidth / globeContainer.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
  
  if (composer) {
    composer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
    
    if (outlinePass) {
      outlinePass.resolution.set(
        globeContainer.value.clientWidth * window.devicePixelRatio,
        globeContainer.value.clientHeight * window.devicePixelRatio
      )
    }
  }
}

const animate = (timestamp) => {
  animationId = requestAnimationFrame(animate)
  
  // 更新性能统计
  updatePerformanceStats(timestamp)
  
  // 更新光源位置以跟随相机
  if (directionalLight && camera) {
    directionalLight.position.copy(camera.position)
    debugInfo.value.lightPosition = {
      x: directionalLight.position.x,
      y: directionalLight.position.y,
      z: directionalLight.position.z
    }
  }
  
  // 更新相机位置
  if (camera) {
    debugInfo.value.cameraPosition = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z
    }
  }
  
  // 更新控制器
  if (controls) {
    controls.update()
  }
  
  // 更新黑客帝国风格粒子系统
  //updateMatrixParticleSystem(timestamp)
  // 更新粒子系统
  updateParticleSystem(timestamp)
  // 更新国家标签位置
  updateLabelPositions()
  
  // 如果有选中的国家，确保其边界保持高亮和正确的缩放
  if (selectedCountry && bordersGroup && isZoomedIn.value) {
    bordersGroup.traverse(child => {
      if (child.userData?.countryId === selectedCountry) {
        if (child.material) {
          child.visible = true;
          child.material.opacity = 1.0;
        }
        
        // 持续调整边界线的几何体以匹配地球缩放
        if (child.geometry && child.userData.originalPositions && globe) {
          const scaleRatio = globe.scale.x; // 获取当前地球缩放比例
          const positions = child.geometry.attributes.position;
          
          // 根据缩放比例更新位置
          for (let i = 0; i < positions.count; i++) {
            const index = i * 3;
            positions.array[index] = child.userData.originalPositions[index] * scaleRatio;
            positions.array[index + 1] = child.userData.originalPositions[index + 1] * scaleRatio;
            positions.array[index + 2] = child.userData.originalPositions[index + 2] * scaleRatio;
          }
          positions.needsUpdate = true;
        }
      }
    });
  }
  if (renderer) {
    renderer.setClearColor(0x000000, 0)
  }
  // 渲染场景
  if (composer) {
    composer.render()
  } else if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

const updatePerformanceStats = (timestamp) => {
  frameCount++
  
  if (timestamp >= lastFpsUpdate + 1000) {
    debugInfo.value.fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate))
    frameCount = 0
    lastFpsUpdate = timestamp
    
    if (window.performance && window.performance.memory) {
      debugInfo.value.memory = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)
    }
    
    let triangles = 0
    let objects = 0
    
    if (scene) {
      scene.traverse(child => {
        if (child.isMesh) {
          objects++
          if (child.geometry && child.geometry.index) {
            triangles += child.geometry.index.count / 3
          } else if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
            triangles += child.geometry.attributes.position.count / 3
          }
        }
      })
    }
    
    debugInfo.value.triangles = triangles
    debugInfo.value.objects = objects
  }
}

const flyToCountry = (countryId) => {
  if (!props.countries || !Array.isArray(props.countries)) {
    console.error('国家数据未加载或格式不正确')
    return
  }
  
  const country = props.countries.find(c => c.country_id === countryId)
  if (!country) {
    console.error('未找到对应国家:', countryId)
    return
  }

  // 获取国家中心坐标
  const center = countryCenters.value[countryId]
  if (!center) {
    console.error('未找到对应国家或缺少中心坐标:', countryId)
    return
  }

  const { lat, lng } = center
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  // 计算目标点在球面上的3D坐标
  const targetX = -Math.sin(phi) * Math.cos(theta)
  const targetY = Math.cos(phi)
  const targetZ = Math.sin(phi) * Math.sin(theta)
  
  // 计算相机目标位置（更靠近地球表面）
  const targetPosition = new THREE.Vector3(
    targetX * 1.3, // 减小距离，更靠近地球
    targetY * 1.3,
    targetZ * 1.3
  )
  
  // 保存当前位置和缩放
  const startPosition = camera.position.clone()
  const startScale = globe.scale.clone()
  const targetScale = new THREE.Vector3(1.5, 1.5, 1.5) // 目标放大比例
  
  // 设置动画参数
  const duration = 1000
  let startTime = null
  
  // 缓动函数
  const easeOutCubic = (t) => {
    return 1 - Math.pow(1 - t, 3)
  }
  
  // 先高亮国家，确保在动画开始前就有高亮效果
  highlightCountry(countryId)
  
  // 确保边界组可见
  if (bordersGroup) {
    bordersGroup.visible = true;
    bordersGroup.renderOrder = 999; // 确保边界在其他对象之上渲染
  }
  
  // 执行动画
  const animateCamera = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    // 使用缓动函数
    const easeProgress = easeOutCubic(progress)
    
    // 更新相机位置
    camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
    
    // 更新地球缩放
    globe.scale.lerpVectors(startScale, targetScale, easeProgress)
    
    // 更新控制器目标 - 指向国家中心
    controls.target.set(targetX, targetY, targetZ)
    controls.update()
    
    // 在动画过程中保持高亮效果
    if (selectedCountry === countryId && bordersGroup) {
      // 确保边界在动画过程中保持高亮
      bordersGroup.traverse(child => {
        if (child.userData?.countryId === countryId && child.material) {
          child.material.color.set(0xffff00); // 黄色高亮
          child.material.opacity = 1.0;
          
          // 关键修复：创建新的边界线，随着地球缩放
          if (child.geometry) {
            // 获取当前缩放比例
            const currentScale = new THREE.Vector3().lerpVectors(startScale, targetScale, easeProgress);
            const scaleRatio = currentScale.x / startScale.x;
            
            // 调整边界线的位置，使其随地球缩放
            const positions = child.geometry.attributes.position;
            if (positions && !child.userData.originalPositions) {
              // 保存原始位置数据
              child.userData.originalPositions = new Float32Array(positions.array);
            }
            
            if (child.userData.originalPositions) {
              // 根据缩放比例更新位置
              for (let i = 0; i < positions.count; i++) {
                const index = i * 3;
                positions.array[index] = child.userData.originalPositions[index] * scaleRatio;
                positions.array[index + 1] = child.userData.originalPositions[index + 1] * scaleRatio;
                positions.array[index + 2] = child.userData.originalPositions[index + 2] * scaleRatio;
              }
              positions.needsUpdate = true;
            }
          }
          
          child.visible = true;
          child.renderOrder = 999;
        }
      });
    }
    
    // 继续动画
    if (progress < 1) {
      requestAnimationFrame(animateCamera)
    } else {
      // 设置为放大状态
      isZoomedIn.value = true
      
      // 发出状态变化事件
      emit('zoom-changed', { isZoomedIn: true, country: selectedCountryData })

      // 更新标签显示状态 - 放大时隐藏标签
      updateLabelPositions()
      
      // 再次高亮国家，确保在动画结束后仍然有高亮效果
      highlightCountry(countryId)
      
      // 禁用控制器
      controls.enabled = false

      // 禁用自动旋转
      if (controls.autoRotate) {
        autoRotate.value = false
        controls.autoRotate = false
      }
    }
  }
  
  // 开始动画
  requestAnimationFrame(animateCamera)
}

const flyToAsn = (asn) => {
  if (!props.asns || !Array.isArray(props.asns)) {
    console.error('ASN数据未加载或格式不正确')
    return
  }
  
  const asnData = props.asns.find(a => a.asn === asn)
  if (!asnData) {
    console.error('未找到对应ASN:', asn)
    return
  }
  
  if (!asnData.location || asnData.location.length !== 2) {
    console.error('ASN缺少位置信息:', asn)
    return
  }
  
  const [long, lat] = asnData.location
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (long + 180) * (Math.PI / 180)
  
  const targetX = -Math.sin(phi) * Math.cos(theta)
  const targetY = Math.cos(phi)
  const targetZ = Math.sin(phi) * Math.sin(theta)
  
  const targetPosition = new THREE.Vector3(
    targetX * 1.5,
    targetY * 1.5,
    targetZ * 1.5
  )
  
  // 保存当前位置
  const startPosition = camera.position.clone()
  
  // 设置动画参数
  const duration = 1000
  let startTime = null
  
  // 缓动函数
  const easeOutCubic = (t) => {
    return 1 - Math.pow(1 - t, 3)
  }
  
  // 执行动画
  const animateCamera = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    // 使用缓动函数
    const easeProgress = easeOutCubic(progress)
    
    // 更新相机位置
    camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
    
    // 更新控制器目标
    controls.target.set(targetX, targetY, targetZ)
    controls.update()
    
    // 继续动画
    if (progress < 1) {
      requestAnimationFrame(animateCamera)
    } else {
      // 高亮ASN
      highlightAsn(asn)

      // 设置为放大状态，禁用拖拽
      isZoomedIn.value = true
      
      // 禁用控制器
      controls.enabled = false
    }
  }
  
  // 开始动画
  requestAnimationFrame(animateCamera)
}

const highlightCountry = (countryId) => {
  resetHighlights()
  
  if (!bordersGroup) return
  
  let foundBorder = false;
  
  bordersGroup.traverse(child => {
    if (child.userData?.countryId === countryId) {
      foundBorder = true;
      if (child.material) {
        // 保存原始材质属性
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = {
            color: child.material.color.clone(),
            opacity: child.material.opacity,
            linewidth: child.material.linewidth,
            visible: child.visible,
            renderOrder: child.renderOrder
          };
        }
        
        // 保存原始几何体位置数据
        if (child.geometry && child.geometry.attributes.position && !child.userData.originalPositions) {
          child.userData.originalPositions = new Float32Array(child.geometry.attributes.position.array);
        }
        
        // 设置高亮效果
        child.material.color.set(0xffff00); // 黄色高亮
        child.material.opacity = 1.0;
        child.material.linewidth = 3.0; // 注意：在大多数WebGL实现中，这个值实际上被限制为1.0
        
        // 确保边界可见
        child.visible = true;
        child.renderOrder = 999; // 确保在其他对象之上渲染
        
        // 修改材质以确保在缩放时可见
        child.material.depthTest = false; // 禁用深度测试，确保边界总是可见
        child.material.depthWrite = false; // 禁用深度写入
        child.material.transparent = true;
        child.material.needsUpdate = true; // 确保材质更新
        
        // 如果地球已经放大，调整边界线的几何体
        if (isZoomedIn.value && globe && child.userData.originalPositions) {
          const scaleRatio = globe.scale.x; // 获取当前地球缩放比例
          const positions = child.geometry.attributes.position;
          
          // 根据缩放比例更新位置
          for (let i = 0; i < positions.count; i++) {
            const index = i * 3;
            positions.array[index] = child.userData.originalPositions[index] * scaleRatio;
            positions.array[index + 1] = child.userData.originalPositions[index + 1] * scaleRatio;
            positions.array[index + 2] = child.userData.originalPositions[index + 2] * scaleRatio;
          }
          positions.needsUpdate = true;
        }
      }
      
      // 添加到高亮对象列表
      if (outlinePass) {
        outlinePass.selectedObjects = [child];
        outlinePass.edgeStrength = 10.0;
        outlinePass.edgeGlow = 1.5;
        outlinePass.edgeThickness = 3.0;
        outlinePass.pulsePeriod = 2; // 添加脉冲效果
      }
    }
  });
  
  if (!foundBorder) {
    console.warn(`未找到国家边界: ${countryId}`);
  }
  
  // 确保边界组可见
  if (bordersGroup) {
    bordersGroup.visible = true;
    bordersGroup.renderOrder = 999;
  }
  
  // 更新调试信息
  debugInfo.value.lastSelected = countryId;
  selectedCountry = countryId;
}

const highlightAsn = (asn) => {
  resetHighlights()
  
  if (!globe) return
  
  globe.traverse(child => {
    if (child.userData?.asn && child.userData.asn.asn === asn) {
      if (child.material) {
        child.material.color.set(0xffff00) // 改为黄色高亮
        child.material.opacity = 1.0
        child.scale.set(1.5, 1.5, 1.5)
      }
      
      if (outlinePass) {
        outlinePass.selectedObjects = [child]
      }
    }
  })
  
  debugInfo.value.lastSelected = `ASN:${asn}`
  selectedAsn = asn
}

const resetHighlights = () => {
  // 重置国家边界高亮
  if (bordersGroup) {
    bordersGroup.traverse(child => {
      if (child.material) {
        // 如果有保存原始材质属性，恢复它
        if (child.userData.originalMaterial) {
          child.material.color.copy(child.userData.originalMaterial.color);
          child.material.opacity = child.userData.originalMaterial.opacity;
          child.material.linewidth = child.userData.originalMaterial.linewidth;
          child.visible = child.userData.originalMaterial.visible;
          child.renderOrder = child.userData.originalMaterial.renderOrder;
          
          // 恢复深度测试和深度写入
          child.material.depthTest = true;
          child.material.depthWrite = true;
          child.material.needsUpdate = true;
        } else {
          // 否则使用默认值
          child.material.color.set(0x00ffff);
          child.material.opacity = 0.7;
          child.material.linewidth = 1.0;
          child.visible = true;
          child.renderOrder = 0;
          
          // 恢复深度测试和深度写入
          child.material.depthTest = true;
          child.material.depthWrite = true;
          child.material.needsUpdate = true;
        }
        
        // 恢复原始几何体位置
        if (child.geometry && child.userData.originalPositions) {
          const positions = child.geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const index = i * 3;
            positions.array[index] = child.userData.originalPositions[index];
            positions.array[index + 1] = child.userData.originalPositions[index + 1];
            positions.array[index + 2] = child.userData.originalPositions[index + 2];
          }
          positions.needsUpdate = true;
        }
      }
    });
    
    // 确保边界组可见
    bordersGroup.visible = true;
  }
  
  // 重置ASN标记高亮
  if (globe) {
    globe.traverse(child => {
      if (child.userData?.asn) {
        if (child.material) {
          child.material.color.set(0x00ff88);
          child.material.opacity = 0.8;
          child.scale.set(1, 1, 1);
        }
      }
    });
  }
  
  // 清除后期处理高亮
  if (outlinePass) {
    outlinePass.selectedObjects = [];
  }
  
  selectedCountry = null;
  selectedAsn = null;
}

const onDocumentMouseMove = (event) => {
 
 // 如果已经缩放，不处理鼠标移动
 if (isZoomedIn.value) {
   globeContainer.value.style.cursor = 'default'
   hoveredCountryInfo.value = null; // 确保在缩放状态下清除悬停信息

   if (selectedCountry) {
      highlightCountry(selectedCountry);
    }
   return
 }
 
 const rect = globeContainer.value.getBoundingClientRect()

 // 计算鼠标相对于容器的精确位置
 mousePosition.value = {
   x: event.clientX - rect.left,
   y: event.clientY - rect.top
 }
 
 // 检查是否正在拖拽
 if (!isDragging.value && mouseDownPosition.value) {
   const dx = Math.abs(event.clientX - mouseDownPosition.value.x)
   const dy = Math.abs(event.clientY - mouseDownPosition.value.y)
   const movedDistance = Math.sqrt(dx * dx + dy * dy)
   
   // 如果移动距离超过阈值，标记为拖拽状态
   if (movedDistance > dragThreshold) {
     isDragging.value = true
   }
 }
 
 // 计算鼠标位置的归一化设备坐标
 const width = rect.width;
 const height = rect.height;
 
 mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
 mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
 
 // 执行射线检测前确保相机和场景已初始化
 if (!camera || !scene || !globe) return;
 
 // 执行射线检测
 raycaster.setFromCamera(mouse, camera);
 
 // 首先检测与地球本身的交点，确定是否点击在地球正面
 const globeIntersects = raycaster.intersectObject(globe);
 
 // 如果没有与地球相交，说明鼠标不在地球上，直接返回
 if (globeIntersects.length === 0) {
   // 重置鼠标样式和悬停状态
   globeContainer.value.style.cursor = 'default';
   hoveredCountryInfo.value = null;
   
   // 如果之前有高亮的边界，恢复其颜色
   if (hoveredBorder && hoveredBorder.material) {
     hoveredBorder.material.color.set(0x00ffff);
     hoveredBorder.material.opacity = 0.7;
     hoveredBorder = null;
   }
   
   debugInfo.value.lastHovered = null;
   return;
 }
 

 // 获取与地球的交点，用于后续判断国家是否在可见面
 const globeIntersectionPoint = globeIntersects[0].point;
 
 // 收集可点击对象
 const clickableObjects = [];
 
 // 检查国家边界
 if (bordersGroup) {
   bordersGroup.traverse(child => {
     if (child.userData?.isClickable) {
       clickableObjects.push(child);
     }
   });
 }
 
 // 检查ASN标记
 globe.traverse(child => {
   if (child.userData?.isClickable && child.userData?.type === 'asn') {
     clickableObjects.push(child);
   }
 });
 
 // 执行射线检测
 raycaster.params.Line.threshold = 0.02; // 增加线条检测的阈值
 const intersects = raycaster.intersectObjects(clickableObjects, true);
 
 // 重置鼠标样式和悬停状态
 globeContainer.value.style.cursor = 'default';
 hoveredCountryInfo.value = null;
 
 // 如果之前有高亮的边界，恢复其颜色
 if (hoveredBorder && hoveredBorder.material) {
   hoveredBorder.material.color.set(0x00ffff);
   hoveredBorder.material.opacity = 0.7;
   hoveredBorder = null;
 }
 
 // 如果有交点
 if (intersects.length > 0) {
   // 查找第一个有效的交点（在地球正面的）
   let validIntersection = null;
   
   for (const intersect of intersects) {
     // 获取交点的位置
     const intersectionPoint = intersect.point;
     
     // 计算从相机到交点的方向向量
     const cameraToIntersection = new THREE.Vector3().subVectors(intersectionPoint, camera.position).normalize();
     
     // 计算从相机到地球交点的方向向量
     const cameraToGlobe = new THREE.Vector3().subVectors(globeIntersectionPoint, camera.position).normalize();
     
     // 计算两个方向向量的点积，判断它们是否指向相似的方向
     // 点积接近1表示方向相似，说明交点在地球的可见面上
     const dotProduct = cameraToIntersection.dot(cameraToGlobe);
     
     // 如果点积大于阈值（例如0.9），认为这个交点在地球的可见面上
     if (dotProduct > 0.9) {
       validIntersection = intersect;
       break;
     }
   }
   
   // 如果找到有效的交点
   if (validIntersection) {
     const obj = validIntersection.object;
     
     // 处理国家边界
     if (obj.userData?.country || (obj.parent && obj.parent.userData?.country)) {
       const countryObj = obj.userData?.country ? obj : obj.parent;
       const country = countryObj.userData.country;
       debugInfo.value.lastHovered = countryObj.userData.countryId;
       
       // 高亮当前悬停的边界
       if (countryObj.material) {
         countryObj.material.color.set(0xffff00); // 黄色高亮
         countryObj.material.opacity = 0.7;  // 高亮不透明度
         countryObj.material.linewidth = 2.0; // 线条宽度
         hoveredBorder = countryObj;
       }
       
       // 显示国家信息提示
       hoveredCountryInfo.value = country;
       globeContainer.value.style.cursor = 'pointer';
     } 
     // 处理ASN标记
     else if (obj.userData?.asn) {
       debugInfo.value.lastHovered = `ASN:${obj.userData.asn.asn}`;
       globeContainer.value.style.cursor = 'pointer';
     }
   } else {
     debugInfo.value.lastHovered = null;
   }
 } else {
   debugInfo.value.lastHovered = null;
 }
}

// 在onDocumentClick函数中保存选中的国家数据
let selectedCountryData = null;

const onDocumentClick = (event) => {
  // 如果正在拖拽，不处理点击
  if (isDragging.value || isZoomedIn.value) return
  
  // 计算鼠标位置的归一化设备坐标
  const rect = globeContainer.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  
  // 执行射线检测
  raycaster.setFromCamera(mouse, camera)
  
  // 首先检测与地球本身的交点，确定是否点击在地球正面
  const globeIntersects = raycaster.intersectObject(globe);
  
  // 如果没有与地球相交，说明鼠标不在地球上，直接返回
  if (globeIntersects.length === 0) {
    return;
  }
  
  // 获取与地球的交点，用于后续判断国家是否在可见面
  const globeIntersectionPoint = globeIntersects[0].point;
  
  // 收集可点击对象
  const clickableObjects = []
  
  // 检查国家边界
  if (bordersGroup) {
    bordersGroup.traverse(child => {
      if (child.userData?.isClickable) {
        clickableObjects.push(child)
      }
    })
  }
  
  // 检查ASN标记
  if (globe) {
    globe.traverse(child => {
      if (child.userData?.isClickable && child.userData?.type === 'asn') {
        clickableObjects.push(child)
      }
    })
  }
  
  // 执行射线检测
  raycaster.params.Line.threshold = 0.02; // 增加线条检测的阈值
  const intersects = raycaster.intersectObjects(clickableObjects)
  
  // 如果有交点
  if (intersects.length > 0) {
    // 查找第一个有效的交点（在地球正面的）
    let validIntersection = null;
    
    for (const intersect of intersects) {
      // 获取交点的位置
      const intersectionPoint = intersect.point;
      
      // 计算从相机到交点的方向向量
      const cameraToIntersection = new THREE.Vector3().subVectors(intersectionPoint, camera.position).normalize();
      
      // 计算从相机到地球交点的方向向量
      const cameraToGlobe = new THREE.Vector3().subVectors(globeIntersectionPoint, camera.position).normalize();
      
      // 计算两个方向向量的点积，判断它们是否指向相似的方向
      const dotProduct = cameraToIntersection.dot(cameraToGlobe);
      
      // 如果点积大于阈值，认为这个交点在地球的可见面上
      if (dotProduct > 0.9) {
        validIntersection = intersect;
        break;
      }
    }
    
    // 如果找到有效的交点
    if (validIntersection) {
      const intersectedObject = validIntersection.object;
      
      // 处理国家点击
      if (intersectedObject.userData?.country) {
        const country = intersectedObject.userData.country;
        highlightCountry(country.country_id);
        emit('country-selected', country);
      }
      // 处理ASN点击
      else if (intersectedObject.userData?.asn) {
        const asn = intersectedObject.userData.asn;
        highlightAsn(asn.asn);
        emit('asn-selected', asn);
      }
    } else {
      // 没有有效交点，重置高亮
      resetHighlights();
    }
  } else {
    // 点击空白区域，重置高亮
    resetHighlights();
  }
}

const resetCamera = () => {
  if (!camera || !controls) return
  
  // 保存当前位置和缩放
  const startPosition = camera.position.clone()
  const startScale = globe.scale.clone()
  const targetScale = new THREE.Vector3(1, 1, 1) // 恢复原始缩放
  
  // 设置中国的经纬度坐标
  const lat = 35.8617
  const lng = 104.1954
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  // 计算目标位置，使中国朝向观察者
  const targetPosition = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta) * 2.5,
    Math.cos(phi) * 2.5,
    Math.sin(phi) * Math.sin(theta) * 2.5
  )
  
  // 设置动画参数
  const duration = 1000
  let startTime = null
  
  // 缓动函数
  const easeOutCubic = (t) => {
    return 1 - Math.pow(1 - t, 3)
  }
  
  // 执行动画
  const animateCamera = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    // 使用缓动函数
    const easeProgress = easeOutCubic(progress)
    
    // 更新相机位置
    camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
    
    // 更新地球缩放
    globe.scale.lerpVectors(startScale, targetScale, easeProgress)
    
    // 更新控制器目标
    controls.target.set(0, 0, 0)
    controls.update()
    
    // 继续动画
    if (progress < 1) {
      requestAnimationFrame(animateCamera)
    } else {
      isZoomedIn.value = false
      
      // 发出状态变化事件
      emit('zoom-changed', { isZoomedIn: false })

      // 重新启用控制器
      controls.enabled = true
      
      // 重置高亮
      resetHighlights()
      
      // 更新标签显示状态 - 重置视图后显示标签
      updateLabelPositions()
    }
  }
  
  requestAnimationFrame(animateCamera)
}
const reloadData = () => {
  isLoading.value = true
  debugInfo.value.lastError = null
  retryCount.value = 0
  
  // 重新加载国家中心坐标
  loadCountryCenters().then(() => {
    // 重新加载国家边界
    addCountryBorders()
    
    // 重新加载ASN标记
    addAsnMarkers()
  })
}
const resetView = () => {
  if (!camera || !controls || !globe) return
  
  // 保存当前位置和缩放
  const startPosition = camera.position.clone()
  const startScale = globe.scale.clone()
  
  // 设置中国的经纬度坐标
  const lat = 35.8617
  const lng = 104.1954
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  // 计算目标位置，使中国朝向观察者
  const targetPosition = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta) * 2.5,
    Math.cos(phi) * 2.5,
    Math.sin(phi) * Math.sin(theta) * 2.5
  )
  
  const targetScale = new THREE.Vector3(1, 1, 1)
  
  // 设置动画参数
  const duration = 1000
  let startTime = null
  
  // 缓动函数
  const easeOutCubic = (t) => {
    return 1 - Math.pow(1 - t, 3)
  }
  
  // 执行动画
  const animateReset = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    // 使用缓动函数
    const easeProgress = easeOutCubic(progress)
    // 发出状态变化事件
    emit('zoom-changed', { isZoomedIn: false })
    // 更新相机位置
    camera.position.lerpVectors(startPosition, targetPosition, easeProgress)
    
    // 更新地球缩放
    globe.scale.lerpVectors(startScale, targetScale, easeProgress)
    
    // 更新控制器目标
    controls.target.set(0, 0, 0)
    controls.update()
    
    // 继续动画
    if (progress < 1) {
      requestAnimationFrame(animateReset)
    } else {
      // 重置完成
      isZoomedIn.value = false
      selectedCountry = null
      selectedAsn = null
      
      // 重置高亮
      resetHighlights()
      
      // 启用控制器
      controls.enabled = true
      
      // 更新标签显示状态 - 重置视图后显示标签
      updateLabelPositions()
    }
  }
  
  // 开始动画
  requestAnimationFrame(animateReset)
}
// 监听props变化
watch(() => props.countries, () => {
  if (props.countries && props.countries.length > 0) {
    nextTick(() => {
      addCountryBorders()
    })
  }
}, { deep: true })

watch(() => props.asns, () => {
  if (props.asns && props.asns.length > 0) {
    nextTick(() => {
      addAsnMarkers()
    })
  }
}, { deep: true })

// 组件挂载时初始化
onMounted(() => {
  initScene()

  // 添加事件监听器
  window.addEventListener('resize', onWindowResize)
  
  // 等待DOM更新后添加事件监听器
  nextTick(() => {
    if (globeContainer.value) {
      globeContainer.value.addEventListener('mousedown', onMouseDown)
      globeContainer.value.addEventListener('mouseup', onMouseUp)
      globeContainer.value.addEventListener('mousemove', onDocumentMouseMove)
    }
  })
  
  // 加载国家中心坐标后创建标签
  loadCountryCenters().then(() => {
    // 初始化标签
    createCountryLabels()
  })
})

// 组件卸载前清理资源
onBeforeUnmount(() => {
  // 取消动画循环
  if (animationId) {
    cancelAnimationFrame(animationId)
  }

  // 清理标签
  countryLabels.value.forEach(label => {
    if (label.element && label.element.parentNode) {
      label.element.parentNode.removeChild(label.element);
    }
  });
  countryLabels.value = [];
  // 移除事件监听器
  window.removeEventListener('resize', onWindowResize)
  if (globeContainer.value) {
    globeContainer.value.removeEventListener('mousedown', onMouseDown)
    globeContainer.value.removeEventListener('mouseup', onMouseUp)
    globeContainer.value.removeEventListener('mousemove', onDocumentMouseMove)
    
    // 修复：移除触摸事件监听器时需要提供事件名和处理函数两个参数
    // 如果没有添加这些事件监听器，则不需要移除
    // globeContainer.value.removeEventListener('touchstart')
    // globeContainer.value.removeEventListener('touchend')
    // globeContainer.value.removeEventListener('touchmove')
  }
  
  // 释放资源
  if (bordersGroup) {
    scene.remove(bordersGroup)
    bordersGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
    bordersGroup = null
  }
  
  if (globe) {
    scene.remove(globe)
    if (globe.geometry) globe.geometry.dispose()
    if (globe.material) {
      if (Array.isArray(globe.material)) {
        globe.material.forEach(m => m.dispose())
      } else {
        globe.material.dispose()
      }
    }
    globe = null
  }
  
  if (matrixParticleSystem) {
    scene.remove(matrixParticleSystem)
    if (matrixParticleSystem.geometry) matrixParticleSystem.geometry.dispose()
    if (matrixParticleSystem.material) matrixParticleSystem.material.dispose()
    matrixParticleSystem = null
  }
  
  if (scene) {
    scene.traverse(object => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
    scene = null
  }
  
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    renderer = null
  }
  
  if (composer) {
    composer.dispose()
    composer = null
  }
  
  camera = null
  controls = null
})

const forceUpdateLabels = () => {
  console.log('强制更新标签');
  // 重新创建标签
  createCountryLabels();
};

// 添加一个公开的dispose方法，用于在组件卸载前主动清理资源
const dispose = () => {
  // 停止动画循环
  if (animationId) {
    cancelAnimationFrame(animationId)
    animationId = null
  }
  
  // 清理粒子系统
  if (particleSystem) {
    scene.remove(particleSystem)
    if (particleSystem.geometry) particleSystem.geometry.dispose()
    if (particleSystem.material) particleSystem.material.dispose()
    particleSystem = null
  }
  
  if (matrixParticleSystem) {
    scene.remove(matrixParticleSystem)
    if (matrixParticleSystem.geometry) matrixParticleSystem.geometry.dispose()
    if (matrixParticleSystem.material) matrixParticleSystem.material.dispose()
    matrixParticleSystem = null
  }
  
  // 清理线条系统
  if (scene && scene.userData && scene.userData.lineSystem) {
    scene.remove(scene.userData.lineSystem)
    if (scene.userData.lineSystem.geometry) scene.userData.lineSystem.geometry.dispose()
    if (scene.userData.lineSystem.material) scene.userData.lineSystem.material.dispose()
    scene.userData.lineSystem = null
  }
  
  // 清理后期处理效果
  if (composer) {
    composer.passes.forEach(pass => {
      if (pass.dispose) pass.dispose()
    })
    composer = null
  }
  
  // 清理控制器
  if (controls) {
    controls.dispose()
    controls = null
  }
  
  // 清理渲染器
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    renderer = null
  }
  
  // 清理场景中的所有对象
  if (scene) {
    scene.traverse(object => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
    scene = null
  }
  
  // 移除事件监听器
  if (globeContainer.value) {
    globeContainer.value.removeEventListener('mousedown', onMouseDown)
    globeContainer.value.removeEventListener('mouseup', onMouseUp)
    globeContainer.value.removeEventListener('mousemove', onDocumentMouseMove)
    
    // 移除这些未定义的触摸事件监听器引用
    // globeContainer.value.removeEventListener('touchstart', onTouchStart)
    // globeContainer.value.removeEventListener('touchend', onTouchEnd)
    // globeContainer.value.removeEventListener('touchmove', onTouchMove)
  }
  
  window.removeEventListener('resize', onWindowResize)
  
  console.log('GlobeMap资源已完全清理')
}


// 暴露方法给父组件
defineExpose({
  flyToCountry,
  flyToAsn,
  reloadData,
  resetCamera,
  resetHighlights,
  toggleLabels,
  forceUpdateLabels,
  showAllLabels,
  dispose
})
</script>

<style scoped>
.globe-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
  transition: transform 0.5s ease-in-out;
}

.globe-container.shifted {
  transform: translateX(-30%);
}
.globe-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent; /* 完全透明的背景 */
  z-index: 0;
}

.globe-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: auto;
}


.debug-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
  z-index: 100;
  max-width: 300px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.debug-header h3 {
  margin: 0;
  font-size: 14px;
  color: #4fc3f7;
}

.debug-section {
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.debug-section h4 {
  margin: 5px 0;
  font-size: 12px;
  color: #81c784;
}

.debug-content p {
  margin: 3px 0;
  font-size: 11px;
}

.debug-actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 10px;
}

.debug-actions button {
  background: rgba(79, 195, 247, 0.3);
  border: 1px solid rgba(79, 195, 247, 0.5);
  color: white;
  padding: 5px;
  }
  .error {
  color: #ff5252;
}

/* 国家信息提示框样式 */
.country-tooltip {
  position: absolute; /* 确保使用绝对定位 */
  z-index: 100;
  pointer-events: none; /* 防止提示框干扰鼠标事件 */
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  max-width: 200px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: translate(0, 0); /* 确保没有额外的变换 */
}

.tooltip-content h4 {
  margin: 0 0 5px 0;
  color: #ffff00; /* 黄色标题 */
  font-size: 14px;
}

.tooltip-content p {
  margin: 3px 0;
  font-size: 12px;
}

/* 地球控制面板样式 */
.globe-controls {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  z-index: 100;
}

.globe-controls button {
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: 1px solid rgba(255, 255, 0, 0.3); /* 黄色边框 */
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.globe-controls button:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 0, 0.8); /* 更亮的黄色 */
}

.globe-controls button.active {
  background: rgba(255, 255, 0, 0.3); /* 黄色背景 */
  border-color: rgba(255, 255, 0, 0.8);
}

.globe-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 添加返回按钮样式 */
.return-button {
  background: rgba(255, 255, 0, 0.2) !important;
  border-color: rgba(255, 255, 0, 0.6) !important;
}

.return-button:hover {
  background: rgba(255, 255, 0, 0.4) !important;
  border-color: rgba(255, 255, 0, 0.8) !important;
}

.control-icon {
  font-size: 18px;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffff00; /* 黄色加载动画 */
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .globe-controls {
    flex-direction: row;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .globe-controls button {
    width: 36px;
    height: 36px;
  }
  
  .debug-toggle {
    bottom: 60px;
  }
}

.country-label {
  position: absolute;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.9); /* 增加背景不透明度 */
  color: #ffff00; /* 黄色文字 */
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 14px; /* 增大字体 */
  font-weight: bold; /* 加粗字体 */
  pointer-events: auto;
  cursor: pointer;
  white-space: nowrap;
  z-index: 9999; /* 确保最高层级 */
  border: 2px solid #ff0000; /* 红色边框，更醒目 */
  box-shadow: 0 0 10px rgba(255, 255, 0, 0.7); /* 黄色阴影 */
  text-shadow: 1px 1px 2px black; /* 文字阴影增强可读性 */
}

.country-label:hover {
  background-color: rgba(255, 0, 0, 0.9); /* 红色背景 */
  color: white;
  transform: translate(-50%, -50%) scale(1.3);
}

@media (max-width: 768px) {
  .country-label {
    font-size: 8px;
    padding: 1px 4px;
  }
}

.label-debug-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
  z-index: 100;
  max-width: 300px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}
</style>
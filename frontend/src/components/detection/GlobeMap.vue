<template>
  <div ref="globeContainer" class="globe-container">
    <!-- 调试面板容器 -->
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
      </div>
    </div>
    <button class="debug-toggle" @click="toggleDebug">调试</button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import earthTexture from '@/assets/images/earth_texture.jpg'
import earthBump from '@/assets/images/8k_earth_normal_map_1.jpg'
import earthSpecular from '@/assets/images/8k_earth_specular_map.jpg'
import countriesGeoData from '@/assets/data/countries.geo.json'

const props = defineProps({
  countries: Array,
  asns: Array
})

const emit = defineEmits(['country-selected', 'asn-selected', 'retry-fetch'])

const globeContainer = ref(null)
const showDebug = ref(true)

// Three.js 核心变量
let scene, camera, renderer, globe, controls
let composer, outlinePass
let selectedCountry = null
let selectedAsn = null
let animationId = null
let frameCount = 0
let lastFpsUpdate = 0
let directionalLight
let bordersGroup = null

// 调试信息
const debugInfo = ref({
  // 资源加载状态
  textureLoaded: false,
  bumpMapLoaded: false,
  specularMapLoaded: false,
  geoDataLoaded: false,
  bordersCreated: 0,
  
  // 性能指标
  fps: 0,
  triangles: 0,
  objects: 0,
  memory: 0,
  
  // 交互状态
  lastSelected: null,
  lastHovered: null,
  cameraPosition: { x: 0, y: 0, z: 0 },
  lightPosition: { x: 0, y: 0, z: 0 },
  
  // 错误信息
  lastError: null
})

// 切换调试面板
const toggleDebug = () => {
  showDebug.value = !showDebug.value
}

// 初始化场景
const initScene = () => {
  console.log('初始化场景...')
  if (!globeContainer.value || globeContainer.value.clientWidth === 0) {
    console.warn('容器未准备好，延迟初始化')
    setTimeout(initScene, 100)
    return
  }
  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0f1621)
  
  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    globeContainer.value.clientWidth / globeContainer.value.clientHeight,
    0.1,
    1000
  )
  camera.position.z = 2.5
  
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  })
  renderer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  globeContainer.value.appendChild(renderer.domElement)
  
  requestAnimationFrame(() => {
    initPostProcessing()
    createGlobe()
  })
  // 添加控制器
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.25
  controls.minDistance = 1.5
  controls.maxDistance = 5
  
  // 添加光源
  // 添加环境光 - 均匀照亮整个场景
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
  directionalLight.position.copy(camera.position)
  scene.add(directionalLight)
  
  // 初始化后期处理
  initPostProcessing()
  
  // 创建地球
  createGlobe()
  
  // 添加国家边界
  addCountryBorders()
  
  // 添加ASN标记
  addAsnMarkers()
  
  // 添加窗口大小变化监听
  window.addEventListener('resize', onWindowResize)
  
  // 开始动画循环
  animate()
  
  console.log('场景初始化完成')
}

// 初始化后期处理
const initPostProcessing = () => {
  if (!renderer || !globeContainer.value) return
  console.log('初始化后期处理...')
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const pixelRatio = renderer.getPixelRatio()
  outlinePass = new OutlinePass(
    new THREE.Vector2(
      globeContainer.value.clientWidth * pixelRatio,
      globeContainer.value.clientHeight * pixelRatio
    ),
    scene,
    camera
  )
  const params = {
    edgeStrength: 3.0,
    edgeGlow: 1.0,
    edgeThickness: 1.0,
    pulsePeriod: 0,
    visibleEdgeColor: new THREE.Color(0x4fc3f7),
    hiddenEdgeColor: new THREE.Color(0x0a2948)
  }
  
  outlinePass = new OutlinePass(
    new THREE.Vector2(globeContainer.value.clientWidth, globeContainer.value.clientHeight),
    scene,
    camera
  )
  outlinePass.edgeStrength = params.edgeStrength
  outlinePass.edgeGlow = params.edgeGlow
  outlinePass.edgeThickness = params.edgeThickness
  outlinePass.pulsePeriod = params.pulsePeriod
  outlinePass.visibleEdgeColor = params.visibleEdgeColor
  outlinePass.hiddenEdgeColor = params.hiddenEdgeColor
  
  composer.addPass(outlinePass)
  
  const fxaaPass = new ShaderPass(FXAAShader)
  fxaaPass.material.uniforms['resolution'].value.set(
    1 / (globeContainer.value.clientWidth * window.devicePixelRatio),
    1 / (globeContainer.value.clientHeight * window.devicePixelRatio)
  )
  composer.addPass(fxaaPass)
}

// 创建地球
const createGlobe = () => {
  console.log('创建地球...')
  const geometry = new THREE.SphereGeometry(1, 64, 64)
  
  // 创建一个占位材质，防止纹理加载失败时没有材质
  const placeholderMaterial = new THREE.MeshPhongMaterial({
    color: 0x1a3d8f,
    specular: 0x111111,
    shininess: 5
  })

  // 加载所有纹理
  const loadTexture = (path, onLoad) => {
    return new Promise((resolve, reject) => {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        path,
        (texture) => {
          onLoad(true)
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

  // 并行加载所有纹理
  Promise.all([
    loadTexture(earthTexture, (success) => { debugInfo.value.textureLoaded = success }),
    loadTexture(earthBump, (success) => { debugInfo.value.bumpMapLoaded = success }),
    loadTexture(earthSpecular, (success) => { debugInfo.value.specularMapLoaded = success })
  ]).then(([texture, bumpMap, specularMap]) => {
    const material = new THREE.MeshPhongMaterial({
      map: texture || undefined,
      bumpMap: bumpMap || undefined,
      bumpScale: bumpMap ? 0.1 : 0,
      specularMap: specularMap || undefined,
      specular: new THREE.Color(0xffffff),
      shininess: 10,
      side: THREE.DoubleSide
    })
    
    globe = new THREE.Mesh(geometry, material)
    scene.add(globe)
    console.log('地球创建成功')
  }).catch(error => {
    console.error('地球创建失败:', error)
    debugInfo.value.lastError = `地球创建失败: ${error.message}`
    // 使用占位材质
    globe = new THREE.Mesh(geometry, placeholderMaterial)
    scene.add(globe)
  })
}

// 添加国家边界
const addCountryBorders = async () => {
  // 双重检查确保数据可用
  if (!props.countries?.length) {
    console.warn('国家数据为空:', props.countries)
    debugInfo.value.lastError = '国家数据未加载完成'
    return
  }
  
  if (!globe) {
    console.warn('地球对象未创建')
    debugInfo.value.lastError = '地球模型未初始化完成'
    return 
  }

  // 使用requestIdleCallback避免阻塞主线程
  await new Promise(resolve => 
    requestIdleCallback(resolve)
  )
  
  console.log('开始加载国家边界...', { 
    countriesCount: props.countries.length,
    geoDataFeatures: countriesGeoData.features.length 
  })

  try {
    // 清理旧边界
    if (bordersGroup) {
      scene.remove(bordersGroup)
      bordersGroup.dispose()
      bordersGroup = null
    }
    
    const geoData = countriesGeoData
    bordersGroup = new THREE.Group()
    let bordersCreated = 0
    
    // 创建国家ID映射表提高查找效率
    const countryMap = props.countries.reduce((map, country) => {
      map[country.country_id] = country
      if (country.iso3_code) map[country.iso3_code] = country
      return map
    }, {})
    
    geoData.features.forEach(feature => {
      const country = countryMap[feature.id]
      
      if (country) {
        try {
          const coordinates = feature.geometry.coordinates
          const isMultiPolygon = feature.geometry.type === 'MultiPolygon'
          const polygons = isMultiPolygon ? coordinates : [coordinates]
          
          polygons.forEach(polygon => {
            const points = []
            polygon.forEach(ring => {
              ring.forEach(coord => {
                const [long, lat] = coord
                const phi = (90 - lat) * (Math.PI / 180)
                const theta = (long + 180) * (Math.PI / 180)
                points.push(new THREE.Vector3(
                  -Math.sin(phi) * Math.cos(theta) * 1.01,
                  Math.cos(phi) * 1.01,
                  Math.sin(phi) * Math.sin(theta) * 1.01
                ))
              })
            })
            
            if (points.length > 1) {
              const geometry = new THREE.BufferGeometry().setFromPoints(points)
              const material = new THREE.LineBasicMaterial({
                color: 0x4fc3f7,
                transparent: true,
                opacity: 0.8,
                linewidth: 3
              })
              const line = new THREE.Line(geometry, material)
              line.userData = { country, isClickable: true }
              bordersGroup.add(line)
              bordersCreated++
            }
          })
        } catch (e) {
          console.warn(`处理 ${feature.id} 边界失败:`, e)
        }
      }
    })
    
    scene.add(bordersGroup)
    // 调试信息显示国家数据加载状态
    debugInfo.value.geoDataLoaded = true
    debugInfo.value.bordersCreated = bordersCreated
    console.log(`成功创建 ${bordersCreated}/${geoData.features.length} 个国家边界`)
    
  } catch (error) {
    console.error('加载国家边界失败:', error)
    debugInfo.value.lastError = `加载国家边界失败: ${error.message}`
    if (bordersGroup) {
      scene.remove(bordersGroup)
      bordersGroup.dispose()
    }
  }
}

// 添加ASN标记
const addAsnMarkers = () => {
  if (!props.asns || !globe) {
    debugInfo.value.lastError = 'ASN数据或地球对象未准备好'
    return
  }
  
  // 移除旧的标记
  globe.children.forEach(child => {
    if (child.userData?.asn) {
      globe.remove(child)
    }
  })
  
  props.asns.forEach(asn => {
    const [long, lat] = asn.location
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (long + 180) * (Math.PI / 180)
    
    const x = -Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)
    
    const markerGeometry = new THREE.SphereGeometry(0.01, 16, 16)
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8
    })
    
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.position.set(x * 1.02, y * 1.02, z * 1.02)
    marker.userData.asn = asn
    marker.userData.isClickable = true
    globe.add(marker)
  })
}

// 窗口大小变化处理
const onWindowResize = () => {
  camera.aspect = globeContainer.value.clientWidth / globeContainer.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
  
  if (composer) {
    composer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
    outlinePass.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
  }
}

// 动画循环
const animate = (timestamp) => {
  animationId = requestAnimationFrame(animate)
  
  // 更新性能统计
  updatePerformanceStats(timestamp)
  
  // 更新光源位置以跟随相机
  if (directionalLight) {
    directionalLight.position.copy(camera.position)
    debugInfo.value.lightPosition = {
      x: directionalLight.position.x,
      y: directionalLight.position.y,
      z: directionalLight.position.z
    }
  }
  
  // 更新相机位置
  debugInfo.value.cameraPosition = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z
  }
  
  controls.update()
  
  if (composer) {
    composer.render()
  } else {
    renderer.render(scene, camera)
  }
}

// 更新性能统计
const updatePerformanceStats = (timestamp) => {
  frameCount++
  
  // 计算FPS
  if (timestamp >= lastFpsUpdate + 1000) {
    debugInfo.value.fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate))
    frameCount = 0
    lastFpsUpdate = timestamp
    
    // 计算内存使用
    if (window.performance && window.performance.memory) {
      debugInfo.value.memory = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2)
    }
    
    // 计算场景信息
    let triangles = 0
    let objects = 0
    scene.traverse(child => {
      if (child.isMesh) {
        objects++
        if (child.geometry && child.geometry.index) {
          triangles += child.geometry.index.count / 3
        } else if (child.geometry && child.geometry.attributes.position) {
          triangles += child.geometry.attributes.position.count / 3
        }
      }
    })
    debugInfo.value.triangles = triangles
    debugInfo.value.objects = objects
  }
}

// 飞向指定国家
const flyToCountry = (countryId) => {
  const country = props.countries.find(c => c.country_id === countryId)
  if (!country) return
  
  const [long, lat] = country.center
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
  
  const startPosition = camera.position.clone()
  const duration = 1000
  let startTime = null
  
  const animateCamera = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    camera.position.lerpVectors(startPosition, targetPosition, progress)
    controls.target.lerp(
      new THREE.Vector3(0, 0, 0),
      targetPosition.clone().normalize(),
      progress
    )
    
    if (progress < 1) {
      requestAnimationFrame(animateCamera)
    }
  }
  
  requestAnimationFrame(animateCamera)
}

// 飞向指定ASN
const flyToAsn = (asn) => {
  const asnData = props.asns.find(a => a.asn === asn)
  if (!asnData) return
  
  const [long, lat] = asnData.location
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (long + 180) * (Math.PI / 180)
  
  const targetX = -Math.sin(phi) * Math.cos(theta)
  const targetY = Math.cos(phi)
  const targetZ = Math.sin(phi) * Math.sin(theta)
  
  const targetPosition = new THREE.Vector3(
    targetX * 1.8,
    targetY * 1.8,
    targetZ * 1.8
  )
  
  const startPosition = camera.position.clone()
  const duration = 1000
  let startTime = null
  
  const animateCamera = (timestamp) => {
    if (!startTime) startTime = timestamp
    const progress = Math.min((timestamp - startTime) / duration, 1)
    
    camera.position.lerpVectors(startPosition, targetPosition, progress)
    controls.target.lerp(
      new THREE.Vector3(0, 0, 0),
      targetPosition.clone().normalize(),
      progress
    )
    
    if (progress < 1) {
      requestAnimationFrame(animateCamera)
    }
  }
  
  requestAnimationFrame(animateCamera)
}

// 点击事件处理
const onDocumentClick = (event) => {
  if (!globeContainer.value) return
  
  const mouse = new THREE.Vector2()
  mouse.x = (event.clientX / globeContainer.value.clientWidth) * 2 - 1
  mouse.y = -(event.clientY / globeContainer.value.clientHeight) * 2 + 1

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)

  const intersects = raycaster.intersectObjects(scene.children, true)
  
  if (intersects.length > 0) {
    const clickedObject = intersects[0].object
    
    if (clickedObject.userData.isClickable) {
      if (clickedObject.userData.country) {
        selectedCountry = clickedObject.userData.country
        selectedAsn = null
        outlinePass.selectedObjects = [clickedObject]
        emit('country-selected', selectedCountry)
        debugInfo.value.lastSelected = `国家: ${selectedCountry.country_name}`
        flyToCountry(selectedCountry.country_id)
      } else if (clickedObject.userData.asn) {
        selectedAsn = clickedObject.userData.asn
        selectedCountry = null
        outlinePass.selectedObjects = [clickedObject]
        emit('asn-selected', selectedAsn)
        debugInfo.value.lastSelected = `ASN: ${selectedAsn.asn}`
        flyToAsn(selectedAsn.asn)
      }
    } else {
      selectedCountry = null
      selectedAsn = null
      outlinePass.selectedObjects = []
      debugInfo.value.lastSelected = '点击了空白区域'
    }
  } else {
    selectedCountry = null
    selectedAsn = null
    outlinePass.selectedObjects = []
    debugInfo.value.lastSelected = '点击了空白区域'
  }
}

// 鼠标悬停效果
const onDocumentMouseMove = (event) => {
  if (!globeContainer.value) return
  
  const mouse = new THREE.Vector2()
  mouse.x = (event.clientX / globeContainer.value.clientWidth) * 2 - 1
  mouse.y = -(event.clientY / globeContainer.value.clientHeight) * 2 + 1

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(mouse, camera)

  const intersects = raycaster.intersectObjects(scene.children, true)
  
  scene.traverse(child => {
    if (child.userData?.country && child.material) {
      child.material.opacity = 0.5
      child.material.color.setHex(0x4fc3f7)
    }
  })

  if (intersects.length > 0) {
    const hoveredObject = intersects[0].object
    if (hoveredObject.userData?.country && hoveredObject.material) {
      hoveredObject.material.opacity = 1
      hoveredObject.material.color.setHex(0xff0000)
      debugInfo.value.lastHovered = `悬停: ${hoveredObject.userData.country.country_name}`
    }
  }
}

// 组件挂载时初始化
onMounted(() => {
  console.log('GlobeMap 组件挂载')
  initScene()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('mousemove', onDocumentMouseMove)
})

// 组件卸载前清理
onBeforeUnmount(() => {
  console.log('GlobeMap 组件卸载')
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  
  if (renderer) {
    globeContainer.value.removeChild(renderer.domElement)
  }
  
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('mousemove', onDocumentMouseMove)
})

// 监听props变化
watch(() => props.countries, () => {
  console.log('countries prop 变化，重新加载边界')
  addCountryBorders()
})

watch(() => props.asns, () => {
  console.log('asns prop 变化，重新加载标记')
  addAsnMarkers()
})

// 暴露方法给父组件
defineExpose({
  flyToCountry,
  flyToAsn,
  addCountryBorders,
  addAsnMarkers,
  initScene,
  animate,
  onWindowResize,
  onDocumentClick,
  onDocumentMouseMove,
  updatePerformanceStats,
  createGlobe,
  initPostProcessing
})
</script>

<style scoped>
.globe-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.debug-panel {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 300px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  padding: 15px;
  color: white;
  font-family: monospace;
  font-size: 14px;
  z-index: 1000;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.debug-header h3 {
  margin: 0;
  font-size: 16px;
  color: #4fc3f7;
}

.debug-header button {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.debug-content {
  max-height: 300px;
  overflow-y: auto;
}

.debug-section {
  margin-bottom: 15px;
}

.debug-section h4 {
  margin: 0 0 8px 0;
  color: #81c784;
  font-size: 14px;
}

.debug-section p {
  margin: 4px 0;
  display: flex;
  justify-content: space-between;
}

.debug-section .error {
  color: #ff5252;
}

.debug-toggle {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  z-index: 1000;
}

/* 滚动条样式 */
.debug-content::-webkit-scrollbar {
  width: 6px;
}

.debug-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

.debug-content::-webkit-scrollbar-thumb {
  background: rgba(79, 195, 247, 0.5);
  border-radius: 3px;
}
</style>
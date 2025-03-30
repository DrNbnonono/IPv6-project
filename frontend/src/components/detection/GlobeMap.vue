<template>
    <div ref="globeContainer" class="globe-container"></div>
  </template>
  
  <script setup>
  import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
  import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
  import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
  import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
  import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
  
  const props = defineProps({
    countries: Array,
    asns: Array
  })
  
  const emit = defineEmits(['country-selected', 'asn-selected'])
  
  const globeContainer = ref(null)
  
  // Three.js 相关变量
  let scene, camera, renderer, globe, controls
  let composer, outlinePass
  let selectedCountry = null
  let selectedAsn = null
  let animationId = null
  
  // 初始化场景
  const initScene = () => {
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
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(globeContainer.value.clientWidth, globeContainer.value.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    globeContainer.value.appendChild(renderer.domElement)
    
    // 添加控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.25
    controls.minDistance = 1.5
    controls.maxDistance = 5
    
    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040)
    scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 3, 5)
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
  }
  
  // 初始化后期处理
  const initPostProcessing = () => {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    
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
      1 / globeContainer.value.clientWidth,
      1 / globeContainer.value.clientHeight
    )
    composer.addPass(fxaaPass)
  }
  
  // 创建地球
  const createGlobe = () => {
    const geometry = new THREE.SphereGeometry(1, 64, 64)
    
    const textureLoader = new THREE.TextureLoader()
    
    // 设置加载错误回调
    textureLoader.onError = (error) => {
      console.error('纹理加载失败:', error)
      // 使用默认颜色作为后备
      const material = new THREE.MeshPhongMaterial({
        color: 0x1a3d8f,
        specular: 0x111111,
        shininess: 5
      })
      globe = new THREE.Mesh(geometry, material)
      scene.add(globe)
    }
  
    // 尝试加载纹理
    try {
      const texture = textureLoader.load('/images/earth_texture.jpg')
      const bumpMap = textureLoader.load('/images/earth_bump.jpg')
      const specularMap = textureLoader.load('/images/earth_specular.jpg')
      
      const material = new THREE.MeshPhongMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 0.05,
        specularMap: specularMap,
        specular: new THREE.Color('grey'),
        shininess: 5
      })
      
      globe = new THREE.Mesh(geometry, material)
      scene.add(globe)
    } catch (error) {
      console.error('地球创建失败:', error)
      textureLoader.onError(error)
    }
  }
  
  // 添加国家边界
  const addCountryBorders = () => {
    if (!props.countries || !globe) return
    
    props.countries.forEach(country => {
      if (country.geojson) {
        const borderMaterial = new THREE.LineBasicMaterial({
          color: 0x4fc3f7,
          transparent: true,
          opacity: 0.5
        })
        
        const borderGeometry = new THREE.BufferGeometry()
        const vertices = []
        
        country.geojson.coordinates.forEach(polygon => {
          polygon.forEach(ring => {
            ring.forEach((coord) => {
              const [long, lat] = coord
              const phi = (90 - lat) * (Math.PI / 180)
              const theta = (long + 180) * (Math.PI / 180)
              
              const x = -Math.sin(phi) * Math.cos(theta)
              const y = Math.cos(phi)
              const z = Math.sin(phi) * Math.sin(theta)
              
              vertices.push(x * 1.01, y * 1.01, z * 1.01)
            })
          })
        })
        
        borderGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(vertices, 3)
        )
        
        const border = new THREE.Line(borderGeometry, borderMaterial)
        border.userData.country = country
        globe.add(border)
        
        // 添加点击事件
        border.userData.isClickable = true
      }
    })
  }
  
  // 添加ASN标记
  const addAsnMarkers = () => {
    if (!props.asns || !globe) return
    
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
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    controls.update()
    
    if (composer) {
      composer.render()
    } else {
      renderer.render(scene, camera)
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
    
    // 平滑移动相机
    const startPosition = camera.position.clone()
    const duration = 1000 // 动画持续时间(ms)
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
    
    // 平滑移动相机
    const startPosition = camera.position.clone()
    const duration = 1000 // 动画持续时间(ms)
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
          // 点击了国家
          selectedCountry = clickedObject.userData.country
          selectedAsn = null
          outlinePass.selectedObjects = [clickedObject]
          emit('country-selected', selectedCountry)
        } else if (clickedObject.userData.asn) {
          // 点击了ASN
          selectedAsn = clickedObject.userData.asn
          selectedCountry = null
          outlinePass.selectedObjects = [clickedObject]
          emit('asn-selected', selectedAsn)
        }
      } else {
        // 点击了其他区域
        selectedCountry = null
        selectedAsn = null
        outlinePass.selectedObjects = []
      }
    } else {
      // 点击了空白区域
      selectedCountry = null
      selectedAsn = null
      outlinePass.selectedObjects = []
    }
  }
  
  // 组件挂载时初始化
  onMounted(() => {
    initScene()
    document.addEventListener('click', onDocumentClick)
  })
  
  // 组件卸载前清理
  onBeforeUnmount(() => {
    if (animationId) {
      cancelAnimationFrame(animationId)
    }
    
    if (globeContainer.value && renderer) {
      globeContainer.value.removeChild(renderer.domElement)
    }
    
    window.removeEventListener('resize', onWindowResize)
    document.removeEventListener('click', onDocumentClick)
  })
  
  // 监听props变化
  watch(() => props.countries, () => {
    if (globe) {
      // 移除旧的边界
      globe.children.forEach(child => {
        if (child.userData.country) {
          globe.remove(child)
        }
      })
      
      // 添加新的边界
      addCountryBorders()
    }
  })
  
  watch(() => props.asns, () => {
    if (globe) {
      // 移除旧的标记
      globe.children.forEach(child => {
        if (child.userData.asn) {
          globe.remove(child)
        }
      })
      
      // 添加新的标记
      addAsnMarkers()
    }
  })
  
  // 暴露方法给父组件
  defineExpose({
    flyToCountry,
    flyToAsn
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
  </style>
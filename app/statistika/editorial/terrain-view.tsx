"use client"
/* eslint-disable max-lines-per-function -- imperative three.js scene reads best in one place */

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"
import { scoreColor } from "@/lib/score-color"
import { parseDistrictShapes } from "./district-shapes"

/**
 * Interactive 3D score terrain — clean three.js (no dither). Extrudes districts
 * from public/district-map.svg by score, flat blue caps on a pale→navy ramp,
 * darker walls + edge lines for crisp borders, soft ground shadow, ortho iso
 * camera (recipe from /tmp/render3d.js). Hover raycasts a block → highlights it
 * (bright blue) and links to the ranking board both ways. Render-on-demand.
 */

// Caps coloured by the shared score ramp (same as the board) so neighbouring
// districts differ in shade — navy = high, pale = low. Hover lifts a block to a
// clean bright blue (same hue throughout) regardless of its base shade.
const HILITE = new THREE.Color(0x1e63f2)
const HILITE_WALL = HILITE.clone().multiplyScalar(0.85)
const HILITE_EDGE = 0x1746b3

type Block = {
  name: string
  caps: THREE.MeshBasicMaterial[]
  walls: THREE.MeshBasicMaterial[]
  edges: THREE.LineBasicMaterial[]
  baseCap: THREE.Color
  baseWall: THREE.Color
  baseEdge: number
}

export function TerrainView({
  hovered,
  onHover,
}: {
  hovered: string | null
  onHover: (name: string | null) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const onHoverRef = useRef(onHover)
  const apiRef = useRef<{ highlight: (name: string | null) => void } | null>(null)

  useEffect(() => {
    onHoverRef.current = onHover
  })

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    // Supersample above device DPR — small static canvas, big crispness win.
    renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 1.5, 3))
    renderer.setClearColor(0xffffff, 0)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    Object.assign(renderer.domElement.style, {
      width: "100%",
      height: "100%",
      display: "block",
    })

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 9000)
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const blocks = new Map<string, Block>()
    const capMeshes: THREE.Mesh[] = []
    let sizeVec = new THREE.Vector3(1, 1, 1)
    let activeHover: string | null = null

    const render = () => renderer.render(scene, camera)

    const highlight = (name: string | null) => {
      activeHover = name
      blocks.forEach((b) => {
        const lit = b.name === name
        b.caps.forEach((m) => m.color.copy(lit ? HILITE : b.baseCap))
        b.walls.forEach((m) => m.color.copy(lit ? HILITE_WALL : b.baseWall))
        b.edges.forEach((m) => {
          m.color.setHex(lit ? HILITE_EDGE : b.baseEdge)
          m.opacity = lit ? 0.9 : 0.45
        })
      })
      render()
    }
    apiRef.current = { highlight }

    const fit = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      const aspect = w / h
      const fr = Math.max(sizeVec.x, sizeVec.y) * 0.46 // zoom in → crisper
      camera.left = -fr * aspect
      camera.right = fr * aspect
      camera.top = fr
      camera.bottom = -fr
      camera.updateProjectionMatrix()
      render()
    }

    const build = (svgText: string) => {
      if (disposed) return
      const shapes = parseDistrictShapes(svgText)
      const names = shapes.map((s) => s.name)
      const scores = shapes.map((s) => s.score)
      const maxS = Math.max(...scores, 1)

      const data = new SVGLoader().parse(svgText)
      const group = new THREE.Group()
      data.paths.forEach((path, i) => {
        const depth = 10 + ((scores[i] ?? 0) / maxS) * 135
        const cap = new THREE.Color(scoreColor(scores[i] ?? 0))
        const wall = cap.clone().multiplyScalar(0.92) // gentle shading → reads close to the flat board swatch
        const edgeHex = cap.clone().multiplyScalar(0.62).getHex()
        const name = names[i]
        const block: Block =
          blocks.get(name) ??
          {
            name,
            caps: [],
            walls: [],
            edges: [],
            baseCap: cap.clone(),
            baseWall: wall.clone(),
            baseEdge: edgeHex,
          }
        SVGLoader.createShapes(path).forEach((shape) => {
          const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
          const capMat = new THREE.MeshBasicMaterial({ color: cap, side: THREE.DoubleSide })
          const wallMat = new THREE.MeshBasicMaterial({ color: wall, side: THREE.DoubleSide })
          const mesh = new THREE.Mesh(geo, [capMat, wallMat])
          mesh.castShadow = true
          mesh.userData.name = name
          group.add(mesh)
          block.caps.push(capMat)
          block.walls.push(wallMat)
          capMeshes.push(mesh)
          const edgeMat = new THREE.LineBasicMaterial({
            color: edgeHex,
            transparent: true,
            opacity: 0.45,
          })
          group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat))
          block.edges.push(edgeMat)
        })
        if (name) blocks.set(name, block)
      })

      group.scale.y = -1
      const box = new THREE.Box3().setFromObject(group)
      const ctr = box.getCenter(new THREE.Vector3())
      sizeVec = box.getSize(new THREE.Vector3())
      group.position.x = -ctr.x
      group.position.y = -ctr.y
      scene.add(group)

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeVec.x * 3, sizeVec.y * 3),
        new THREE.ShadowMaterial({ opacity: 0.08 })
      )
      ground.position.z = -0.8
      ground.receiveShadow = true
      scene.add(ground)
      const sun = new THREE.DirectionalLight(0xffffff, 1)
      sun.position.set(-sizeVec.x * 0.55, -sizeVec.y * 0.75, sizeVec.y * 1.5)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.radius = 7
      const S = Math.max(sizeVec.x, sizeVec.y) * 0.85
      Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: sizeVec.y * 6 })
      sun.shadow.camera.updateProjectionMatrix()
      scene.add(sun)

      camera.position.set(-sizeVec.x * 0.08, -sizeVec.y * 1.12, sizeVec.y * 0.92)
      camera.up.set(0, 0, 1)
      camera.lookAt(0, 0, 48)
      fit()
      if (hovered) highlight(hovered)
    }

    fetch("/district-map.svg")
      .then((r) => r.text())
      .then(build)
      .catch(() => {})

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(capMeshes, false)[0]
      const name = (hit?.object.userData.name as string) ?? null
      if (name !== activeHover) {
        highlight(name)
        onHoverRef.current(name)
      }
    }
    const onLeave = () => {
      if (activeHover !== null) {
        highlight(null)
        onHoverRef.current(null)
      }
    }
    renderer.domElement.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("pointerleave", onLeave)
    const ro = new ResizeObserver(() => fit())
    ro.observe(mount)

    return () => {
      disposed = true
      apiRef.current = null
      ro.disconnect()
      renderer.domElement.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerleave", onLeave)
      // three.js: renderer.dispose() frees the context but NOT the geometries /
      // materials / shadow map. Dispose them explicitly so repeat client-side
      // navigations to /statistika don't leak GPU memory (and exhaust WebGL
      // contexts).
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose()
          const mat = obj.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat.dispose()
        }
        if (obj instanceof THREE.DirectionalLight) obj.shadow.map?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiRef.current?.highlight(hovered)
  }, [hovered])

  return (
    <div
      ref={mountRef}
      className="w-full cursor-pointer [aspect-ratio:1300/980]"
      role="img"
      aria-label="3D karta zagrebačkih kvartova, visina označava doseg"
    />
  )
}

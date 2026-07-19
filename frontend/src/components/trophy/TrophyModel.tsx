
import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'

type TrophyNodes = {
  mesh_0: {
    geometry: { center: () => void }
    material: unknown
  }
}

export function Model(props: JSX.IntrinsicElements['group']) {
  const { nodes } = useGLTF('/trophy.glb') as unknown as { nodes: TrophyNodes }

  // Center the geometry's bounding box exactly on the origin so it rotates smoothly on its own axis
  useEffect(() => {
    if (nodes?.mesh_0?.geometry?.center) {
      nodes.mesh_0.geometry.center()
    }
  }, [nodes])

  return (
    <group {...props}>
      <mesh geometry={nodes.mesh_0.geometry as never} material={nodes.mesh_0.material as never} />
    </group>
  )
}

useGLTF.preload('/trophy.glb')

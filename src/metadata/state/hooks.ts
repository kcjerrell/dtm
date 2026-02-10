import { useSnapshot } from 'valtio'
import type { ImageItem } from './ImageItem'
import { getMetadataStore } from './store'



export function useCurrentImage(): ReadonlyState<ImageItem> | undefined {
  const snap = useSnapshot(getMetadataStore())
  return snap.currentImage
}
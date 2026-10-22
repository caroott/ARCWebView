// Maps between the places of the provenance explorer and the places of the file viewer. The functions are
// pure. The viewer passes in what it knows about its file tree.

import { START_NAVIGATION, type Navigation } from './navigation'
import type { ProvenanceDataset, ProvenanceIndex } from './types'

// A place in the file viewer. `table` is the name of an annotation table tab of the isa file at `path`.
export interface ViewerTarget {
  path: string
  table?: string
}

// ARCtrl splits a data name at "#" into a path and a selector (file.csv#col=1). Only a name with
// exactly one "#" has a selector, so any other name is the path as a whole.
export function dataPathOf(nodeId: string): string {
  const parts = nodeId.split('#')
  return parts.length === 2 ? parts[0] : nodeId
}

// The file tree drops empty segments, so "a//b" and "a/b/" both mean "a/b".
export function normalizePath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment !== '')
    .join('/')
}

// A dataset id is its folder with a trailing slash ("assays/X/").
export function datasetFolder(datasetId: string): string {
  return datasetId.endsWith('/') ? datasetId.slice(0, -1) : datasetId
}

export function isaFileOf(dataset: ProvenanceDataset): string {
  return `${datasetFolder(dataset.id)}/isa.${dataset.kind}.xlsx`
}

// The place in the file viewer that belongs to the current level of the explorer. `hasPath` tells whether
// the file tree has a path. The root path "" is always present.
export function graphToViewerTarget(
  nav: Navigation,
  index: ProvenanceIndex,
  hasPath: (path: string) => boolean,
): ViewerTarget | undefined {
  const present = (target: ViewerTarget | undefined) =>
    target !== undefined && (target.path === '' || hasPath(target.path)) ? target : undefined
  // The key of a process is not split. The record holds its dataset and its table name.
  const processTarget = (): ViewerTarget | undefined => {
    const process = nav.selectedProcess === undefined ? undefined : index.processByKey.get(nav.selectedProcess)
    const dataset = process === undefined ? undefined : index.datasetById.get(process.datasetId)
    return process && dataset ? present({ path: isaFileOf(dataset), table: process.name }) : undefined
  }
  switch (nav.view) {
    case 'datasets':
      return { path: '' }
    case 'processes': {
      const dataset = nav.selectedDataset === undefined ? undefined : index.datasetById.get(nav.selectedDataset)
      return dataset ? present({ path: datasetFolder(dataset.id) }) : undefined
    }
    case 'groups':
    case 'detail':
      return processTarget()
    case 'lineage': {
      const node = nav.selectedNode === undefined ? undefined : index.nodeById.get(nav.selectedNode)
      if (node?.kind === 'data') {
        const found = present({ path: normalizePath(dataPathOf(node.id)) })
        if (found) return found
      }
      // Only data nodes are paths, and a data path can be missing from the tree. The process that led to the
      // node is the next best place.
      return processTarget()
    }
  }
}

// Normalized data path -> ids of the data nodes with that path, sorted. One file can have several nodes
// when the ids carry selectors (file.csv#col=1 and file.csv#col=2).
export function buildDataNodePaths(index: ProvenanceIndex): Map<string, string[]> {
  const paths = new Map<string, string[]>()
  for (const node of index.nodes) {
    if (node.kind !== 'data') continue
    const path = normalizePath(dataPathOf(node.id))
    const ids = paths.get(path)
    if (ids) ids.push(node.id)
    else paths.set(path, [node.id])
  }
  for (const ids of paths.values()) ids.sort()
  return paths
}

// The explorer level that belongs to a place in the file viewer, or undefined when the graph has nothing
// for it. The rules run in this order: root, isa file of a dataset, data node, dataset folder.
export function viewerToNavigation(
  path: string,
  table: string | undefined,
  index: ProvenanceIndex,
  dataNodePaths: Map<string, string[]>,
): Navigation | undefined {
  const p = normalizePath(path)
  if (p === '') return START_NAVIGATION

  const isaDataset = index.datasets.find((dataset) => isaFileOf(dataset) === p)
  if (isaDataset) {
    const key = table === undefined ? undefined : `${isaDataset.id}::${table}`
    return key !== undefined && index.processByKey.has(key)
      ? { view: 'groups', selectedDataset: isaDataset.id, selectedProcess: key }
      : { view: 'processes', selectedDataset: isaDataset.id }
  }

  // A file inside a data folder has no node of its own, so the search walks up to the folder that has one.
  const segments = p.split('/')
  for (let length = segments.length; length >= 1; length--) {
    const candidate = segments.slice(0, length).join('/')
    const ids = dataNodePaths.get(candidate)
    if (!ids) continue
    // Several selector variants without a plain node leave no single node to pick. The search stops there
    // and the dataset folder rule applies.
    const id = ids.includes(candidate) ? candidate : ids.length === 1 ? ids[0] : undefined
    if (id === undefined) break
    return { view: 'lineage', selectedNode: id }
  }

  const folderDataset = index.datasets.find((dataset) => {
    const folder = datasetFolder(dataset.id)
    return p === folder || p.startsWith(`${folder}/`)
  })
  return folderDataset ? { view: 'processes', selectedDataset: folderDataset.id } : undefined
}

/**
 * 前端寻路（后端 MapService 的同构实现）。
 *
 * 为什么前端也要算一次：地图是前后端共用的同一份 assets/map.json，
 * 前端自己算「剩余路线」才能保证画出来的线和后端规划的是同一条，
 * 也省掉一个"把路线回传给前端"的接口。权重公式必须与后端保持一致。
 */
import type { LngLat, MapData, MapEdge, MapNode } from '@/api/types';
import { distanceM } from './geo';

export interface PathLeg {
  edgeId: string;
  dir: 1 | -1;
  from: string;
  to: string;
  lengthM: number;
  speedKph: number;
}

interface Neighbor {
  edgeId: string;
  to: string;
  dir: 1 | -1;
  lengthM: number;
  speedKph: number;
}

export class RoadGraph {
  readonly nodes: MapNode[];
  readonly edges: MapEdge[];
  private nodeById = new Map<string, MapNode>();
  private edgeById = new Map<string, MapEdge>();
  private adj = new Map<string, Neighbor[]>();

  constructor(data: MapData) {
    this.nodes = data.nodes;
    this.edges = data.edges;
    for (const n of data.nodes) this.nodeById.set(n.id, n);
    for (const e of data.edges) this.edgeById.set(e.id, e);
    for (const n of data.nodes) this.adj.set(n.id, []);
    for (const e of data.edges) {
      this.adj.get(e.a)!.push({ edgeId: e.id, to: e.b, dir: 1, lengthM: e.lengthM, speedKph: e.speedKph });
      if (!e.oneway) {
        this.adj.get(e.b)!.push({ edgeId: e.id, to: e.a, dir: -1, lengthM: e.lengthM, speedKph: e.speedKph });
      }
    }
  }

  node(id: string): MapNode | undefined {
    return this.nodeById.get(id);
  }

  edge(id: string): MapEdge | undefined {
    return this.edgeById.get(id);
  }

  nearestNode(p: LngLat): MapNode {
    let best = this.nodes[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const n of this.nodes) {
      const d = distanceM(p, n);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Dijkstra，权重 = 长度 / 限速（即"耗时最短"而非"距离最短"） */
  findPath(fromId: string, toId: string): PathLeg[] {
    if (fromId === toId) return [];
    const dist = new Map<string, number>([[fromId, 0]]);
    const prev = new Map<string, { edgeId: string; dir: 1 | -1; from: string }>();
    const visited = new Set<string>();

    for (;;) {
      let cur = '';
      let curD = Number.POSITIVE_INFINITY;
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < curD) {
          curD = d;
          cur = id;
        }
      }
      if (!cur) break;
      if (cur === toId) break;
      visited.add(cur);

      for (const nb of this.adj.get(cur) ?? []) {
        const weight = nb.lengthM / Math.max(5, nb.speedKph);
        const nd = curD + weight;
        if (nd < (dist.get(nb.to) ?? Number.POSITIVE_INFINITY)) {
          dist.set(nb.to, nd);
          prev.set(nb.to, { edgeId: nb.edgeId, dir: nb.dir, from: cur });
        }
      }
    }

    if (!prev.has(toId)) return [];

    const legs: PathLeg[] = [];
    let cur = toId;
    let guard = 0;
    while (cur !== fromId && guard++ < 5000) {
      const step = prev.get(cur);
      if (!step) return [];
      const e = this.edge(step.edgeId)!;
      legs.unshift({
        edgeId: step.edgeId,
        dir: step.dir,
        from: step.from,
        to: cur,
        lengthM: e.lengthM,
        speedKph: e.speedKph,
      });
      cur = step.from;
    }
    return legs;
  }

  /** 把路径还原成经纬度折线，用于绘制 */
  toPolyline(legs: PathLeg[]): LngLat[] {
    const pts: LngLat[] = [];
    for (const leg of legs) {
      const a = this.node(leg.from);
      const b = this.node(leg.to);
      if (a && (!pts.length || distanceM(pts[pts.length - 1], a) > 0.5)) pts.push({ lng: a.lng, lat: a.lat });
      if (b) pts.push({ lng: b.lng, lat: b.lat });
    }
    return pts;
  }

  /** 路径总长（米） */
  static lengthOf(legs: PathLeg[]): number {
    return legs.reduce((s, l) => s + l.lengthM, 0);
  }

  /**
   * 从当前点到目的地，并把车辆当前位置"接"到路径起点上，
   * 这样地图上的剩余路线不会在车头处断开。
   */
  remainingPolyline(from: LngLat, to: LngLat, vehicleAt?: LngLat): LngLat[] {
    const legs = this.findPath(this.nearestNode(from).id, this.nearestNode(to).id);
    const poly = this.toPolyline(legs);
    if (vehicleAt && poly.length) return [{ lng: vehicleAt.lng, lat: vehicleAt.lat }, ...poly];
    return poly;
  }
}

/**
 * 路网服务：加载 assets/map.json（前后端共用同一份数据），提供寻路与坐标插值。
 * 这是车辆仿真引擎的基础设施。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bearing, distanceM, lerpLngLat, type LngLat } from '../common/geo';

export interface MapNode {
  id: string;
  lng: number;
  lat: number;
  name: string;
}
export interface MapEdge {
  id: string;
  a: string;
  b: string;
  road: string;
  level: number;
  oneway: boolean;
  speedKph: number;
  lanes: number;
  lengthM: number;
}
export interface MapArea {
  id: string;
  kind: 'park' | 'water';
  name: string;
  polygon: [number, number][];
}
export interface MapPoi {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  nodeId: string;
  lng: number;
  lat: number;
}
export interface MapData {
  meta: { name: string; center: LngLat; bounds: Record<string, number>; note: string };
  nodes: MapNode[];
  edges: MapEdge[];
  areas: MapArea[];
  pois: MapPoi[];
}

/** 一段路径：沿某条边、某个方向走（dir=1 表示 a→b） */
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

@Injectable()
export class MapService implements OnModuleInit {
  private readonly logger = new Logger('Map');
  private data!: MapData;
  private nodeById = new Map<string, MapNode>();
  private edgeById = new Map<string, MapEdge>();
  private adj = new Map<string, Neighbor[]>();
  private poiById = new Map<string, MapPoi>();

  onModuleInit(): void {
    const rel = process.env.MAP_FILE ?? '../assets/map.json';
    const abs = path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
    this.data = JSON.parse(readFileSync(abs, 'utf8')) as MapData;

    for (const n of this.data.nodes) this.nodeById.set(n.id, n);
    for (const e of this.data.edges) this.edgeById.set(e.id, e);
    for (const p of this.data.pois) this.poiById.set(p.id, p);

    for (const n of this.data.nodes) this.adj.set(n.id, []);
    for (const e of this.data.edges) {
      this.adj.get(e.a)!.push({ edgeId: e.id, to: e.b, dir: 1, lengthM: e.lengthM, speedKph: e.speedKph });
      if (!e.oneway) {
        this.adj.get(e.b)!.push({ edgeId: e.id, to: e.a, dir: -1, lengthM: e.lengthM, speedKph: e.speedKph });
      }
    }
    this.logger.log(`路网已加载：${this.data.meta.name} / ${this.data.nodes.length} 节点 / ${this.data.edges.length} 路段`);
  }

  get raw(): MapData {
    return this.data;
  }

  get pois(): MapPoi[] {
    return this.data.pois;
  }

  get nodes(): MapNode[] {
    return this.data.nodes;
  }

  get edges(): MapEdge[] {
    return this.data.edges;
  }

  poi(id: string): MapPoi | undefined {
    return this.poiById.get(id);
  }

  node(id: string): MapNode | undefined {
    return this.nodeById.get(id);
  }

  /** 某节点的所有出边（含方向），供巡航与寻路使用 */
  neighbors(nodeId: string): Neighbor[] {
    return this.adj.get(nodeId) ?? [];
  }

  edge(id: string): MapEdge | undefined {
    return this.edgeById.get(id);
  }

  /** 最近的节点（用于把任意经纬度吸附到路网） */
  nearestNode(p: LngLat): MapNode {
    let best = this.data.nodes[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const n of this.data.nodes) {
      const d = distanceM(p, n);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** 最近的边与其上的投影进度，返回可插值的位置信息 */
  nearestEdge(p: LngLat): { edge: MapEdge; progress: number; at: LngLat; distanceM: number } {
    let best: { edge: MapEdge; progress: number; at: LngLat; distanceM: number } | null = null;
    for (const e of this.data.edges) {
      const a = this.node(e.a)!;
      const b = this.node(e.b)!;
      // 以米为单位做投影，避免经纬度各向异性
      const mLat = 111320;
      const mLng = 111320 * Math.cos((a.lat * Math.PI) / 180);
      const ax = a.lng * mLng;
      const ay = a.lat * mLat;
      const bx = b.lng * mLng;
      const by = b.lat * mLat;
      const px = p.lng * mLng;
      const py = p.lat * mLat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const at = lerpLngLat(a, b, t);
      const d = distanceM(p, at);
      if (!best || d < best.distanceM) best = { edge: e, progress: t, at, distanceM: d };
    }
    return best!;
  }

  /** Dijkstra 最短路；图规模很小（36 节点），无需更复杂的算法 */
  findPath(fromNodeId: string, toNodeId: string): PathLeg[] {
    if (fromNodeId === toNodeId) return [];
    const dist = new Map<string, number>();
    const prev = new Map<string, { edgeId: string; dir: 1 | -1; from: string }>();
    const visited = new Set<string>();
    dist.set(fromNodeId, 0);

    while (true) {
      let cur: string | null = null;
      let curD = Number.POSITIVE_INFINITY;
      for (const [id, d] of dist) {
        if (!visited.has(id) && d < curD) {
          cur = id;
          curD = d;
        }
      }
      if (cur === null || cur === toNodeId) break;
      visited.add(cur);

      for (const nb of this.adj.get(cur) ?? []) {
        // 以通行时间作为权重，更接近真实"最快路线"
        const cost = nb.lengthM / Math.max(5, nb.speedKph);
        const nd = curD + cost;
        if (nd < (dist.get(nb.to) ?? Number.POSITIVE_INFINITY)) {
          dist.set(nb.to, nd);
          prev.set(nb.to, { edgeId: nb.edgeId, dir: nb.dir, from: cur });
        }
      }
    }

    if (!prev.has(toNodeId)) return [];
    const legs: PathLeg[] = [];
    let cursor = toNodeId;
    let guard = 0;
    while (cursor !== fromNodeId && guard++ < 1000) {
      const p = prev.get(cursor);
      if (!p) return [];
      const e = this.edgeById.get(p.edgeId)!;
      legs.unshift({
        edgeId: p.edgeId,
        dir: p.dir,
        from: p.from,
        to: cursor,
        lengthM: e.lengthM,
        speedKph: e.speedKph,
      });
      cursor = p.from;
    }
    return legs;
  }

  /** 在边上按进度取位置与朝向 */
  interpolate(edgeId: string, dir: 1 | -1, progress: number): { at: LngLat; heading: number } {
    const e = this.edgeById.get(edgeId)!;
    const a = this.nodeById.get(e.a)!;
    const b = this.nodeById.get(e.b)!;
    const t = Math.max(0, Math.min(1, progress));
    const at = dir === 1 ? lerpLngLat(a, b, t) : lerpLngLat(b, a, t);
    const heading = dir === 1 ? bearing(a, b) : bearing(b, a);
    return { at, heading };
  }

  /** 随机一条边 + 方向，用于空闲车巡航 */
  randomEdgeDir(): { edgeId: string; dir: 1 | -1 } {
    const e = this.data.edges[Math.floor(Math.random() * this.data.edges.length)];
    return { edgeId: e.id, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  /** 路网总长度（米） */
  get totalLengthM(): number {
    return this.data.edges.reduce((s, e) => s + e.lengthM, 0);
  }
}

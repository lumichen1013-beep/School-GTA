import type { CollidableBox } from '../world/CampusWorld';

// 靜態碰撞盒 2D 均勻網格索引 (XZ 平面)
// - 碰撞盒於執行期只會改變 Y (閘門開啟)，XZ 範圍固定，因此每個世界建置一次即可；陣列長度變動時自動重建
// - 查詢結果維持原陣列的遞增索引順序，讓逐一檢測的結果與掃描整個陣列完全一致
// - 查詢不配置記憶體：以 stamp 去重、結果寫入呼叫端提供的重用陣列
const CELL_SIZE = 8;

export class ColliderGrid {
  private static readonly cache = new WeakMap<CollidableBox[], ColliderGrid>();

  // 取得 (或建立) 對應碰撞盒陣列的網格；陣列長度變動時重建
  public static of(colliders: CollidableBox[]): ColliderGrid {
    let grid = ColliderGrid.cache.get(colliders);
    if (!grid || grid.builtLength !== colliders.length) {
      grid = new ColliderGrid(colliders);
      ColliderGrid.cache.set(colliders, grid);
    }
    return grid;
  }

  public readonly colliders: CollidableBox[];
  private readonly builtLength: number;
  private readonly indexMap = new Map<CollidableBox, number>();
  private originX = 0;
  private originZ = 0;
  private cols = 1;
  private rows = 1;
  private cells: number[][] = [];
  private stamp: Uint32Array;
  private stampId = 0;
  private scratchIdx: Int32Array;

  private constructor(colliders: CollidableBox[]) {
    this.colliders = colliders;
    this.builtLength = colliders.length;
    this.stamp = new Uint32Array(Math.max(1, colliders.length));
    this.scratchIdx = new Int32Array(Math.max(1, colliders.length));
    this.build();
  }

  private build() {
    const boxes = this.colliders;
    if (boxes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      this.indexMap.set(b, i);
      if (b.min.x < minX) minX = b.min.x;
      if (b.max.x > maxX) maxX = b.max.x;
      if (b.min.z < minZ) minZ = b.min.z;
      if (b.max.z > maxZ) maxZ = b.max.z;
    }
    this.originX = minX;
    this.originZ = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / CELL_SIZE) + 1);
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL_SIZE) + 1);
    this.cells = new Array(this.cols * this.rows);
    for (let c = 0; c < this.cells.length; c++) this.cells[c] = [];
    // 依索引遞增插入，每格內保持原始順序
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const c0 = this.colOf(b.min.x), c1 = this.colOf(b.max.x);
      const r0 = this.rowOf(b.min.z), r1 = this.rowOf(b.max.z);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(i);
      }
    }
  }

  private colOf(x: number): number {
    const c = Math.floor((x - this.originX) / CELL_SIZE);
    return c < 0 ? 0 : (c >= this.cols ? this.cols - 1 : c);
  }

  private rowOf(z: number): number {
    const r = Math.floor((z - this.originZ) / CELL_SIZE);
    return r < 0 ? 0 : (r >= this.rows ? this.rows - 1 : r);
  }

  // 原始陣列索引 (用於擠出時位置離開查詢範圍後，接續掃描完整陣列)
  public indexOf(box: CollidableBox): number {
    const i = this.indexMap.get(box);
    return i === undefined ? -1 : i;
  }

  // 取出 XZ 範圍與查詢矩形相交 (含邊界) 的碰撞盒，依原始索引遞增寫入 out
  public query(minX: number, maxX: number, minZ: number, maxZ: number, out: CollidableBox[]): CollidableBox[] {
    out.length = 0;
    const boxes = this.colliders;
    if (boxes.length === 0) return out;
    if (++this.stampId === 0xffffffff) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const id = this.stampId;
    const idx = this.scratchIdx;
    let n = 0;
    const c0 = this.colOf(minX), c1 = this.colOf(maxX);
    const r0 = this.rowOf(minZ), r1 = this.rowOf(maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (this.stamp[i] === id) continue;
          this.stamp[i] = id;
          const b = boxes[i];
          if (b.max.x < minX || b.min.x > maxX || b.max.z < minZ || b.min.z > maxZ) continue;
          // 插入排序維持遞增索引 (候選數量少)
          let j = n++;
          while (j > 0 && idx[j - 1] > i) {
            idx[j] = idx[j - 1];
            j--;
          }
          idx[j] = i;
        }
      }
    }
    for (let k = 0; k < n; k++) out.push(boxes[idx[k]]);
    return out;
  }

  public queryAround(x: number, z: number, r: number, out: CollidableBox[]): CollidableBox[] {
    return this.query(x - r, x + r, z - r, z + r, out);
  }
}

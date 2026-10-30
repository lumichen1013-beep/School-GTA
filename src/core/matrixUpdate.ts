import * as THREE from 'three';

// 動態物件 (NPC、特效池) 的矩陣更新精簡工具：
// three.js 每幀 updateMatrixWorld 會走訪 visible=false 的物件；且父節點本地矩陣自動更新時會強制 (force)
// 重算全部子孫，子節點設 matrixWorldAutoUpdate=false 也無效。因此會移動的根節點底下，
// 隱藏零件只能以「僅走訪可見子樹」略過，靜止零件只能省下本地矩陣重組 (世界矩陣仍需隨父節點更新)。

const protoUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;

// 凍結執行期不再改變 transform 的零件本地矩陣 (位置/旋轉/縮放建構後固定，只切換 visible / 材質)。
// 之後若需移動，必須改回 matrixAutoUpdate = true，否則 position/rotation/scale 的修改不會生效。
export function freezeLocalMatrix(...objs: THREE.Object3D[]) {
  for (const obj of objs) {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  }
}

function updateVisibleSubtree(obj: THREE.Object3D) {
  if (obj.matrixAutoUpdate) obj.updateMatrix();
  const parent = obj.parent;
  if (parent === null) obj.matrixWorld.copy(obj.matrix);
  else obj.matrixWorld.multiplyMatrices(parent.matrixWorld, obj.matrix);
  obj.matrixWorldNeedsUpdate = false;
  const children = obj.children;
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i];
    if (!child.visible) continue;
    // 自訂世界矩陣更新的物件 (攝影機等) 交回其自身實作
    if (child.updateMatrixWorld !== protoUpdateMatrixWorld) child.updateMatrixWorld(true);
    else updateVisibleSubtree(child);
  }
}

function updateMatrixWorldVisibleOnly(this: THREE.Object3D) {
  if (this.visible) updateVisibleSubtree(this);
}

// 讓 root 子樹每幀只更新「可見」物件的矩陣 (root 隱藏時整棵略過)：
// 渲染與陰影只讀取可見物件的世界矩陣，而更新發生在 renderer.render 內 (投影與繪製之前)，
// 隱藏零件重新顯示的那一幀即會補算，不會有一幀錯位。不論 root 掛在場景或其他群組下皆適用。
// 限制：隱藏物件的 matrixWorld 會停在隱藏前；遊戲邏輯若需讀取子樹內物件的世界座標 (隱藏中或渲染前)，
// 必須先呼叫 updateWorldMatrix(true, false) 自行重算 (同 Player.getBatTipWorld)。
export function updateVisibleMatricesOnly(...roots: THREE.Object3D[]) {
  for (const root of roots) root.updateMatrixWorld = updateMatrixWorldVisibleOnly;
}

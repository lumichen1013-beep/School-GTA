import * as THREE from 'three';

export interface IndoorZone {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  roofY: number; // Y 高度低於此值視為室內遮蔽處；大於等於此高度則為露天頂樓天台
  minY?: number; // 最低樓面 Y，預設 -5.0
  world: 'CAMPUS' | 'DETENTION' | 'ALL';
}

/**
 * 室內遮蔽判定與屋頂高度管理系統 (IndoorManager)
 * 負責全地圖室內建築區域的 3D 空間邊界判定：
 * 1. 阻止下雨時雨水粒子落入室內房間、走廊與體育館。
 * 2. 玩家/NPC 處於室內時自動收傘並停止淋雨行為。
 * 3. 進入室內時雨聲音量減弱並套用低通濾波，呈現逼真的隔牆聽雨效果。
 */
export class IndoorManager {
  public static readonly ZONES: IndoorZone[] = [
    // ==========================================
    // 第一世界：天天國中 (Campus World)
    // ==========================================
    // 1. 北樓梯間 (垂直折返梯軸，通達頂樓天台)
    {
      name: '校舍北樓梯間',
      minX: 26.5,
      maxX: 35.5,
      minZ: -10.5,
      maxZ: 2.0,
      roofY: 24.5,
      minY: -0.5,
      world: 'CAMPUS'
    },
    // 2. 南樓梯間 (垂直折返梯軸)
    {
      name: '校舍南樓梯間',
      minX: 26.5,
      maxX: 35.5,
      minZ: 88.0,
      maxZ: 100.5,
      roofY: 24.5,
      minY: -0.5,
      world: 'CAMPUS'
    },
    // 3. 教學大樓本體 (樂群樓、敬業樓、空中天橋貫通、走廊與各年級教室)
    // 1F (Y:0~3.5), 2F (Y:3.5~7.5), 3F (Y:7.5~11.5)，3F 天花板/女兒牆 Y:17.8
    // 頂樓天台在 Y >= 17.5 為戶外露天區域
    {
      name: '教學大樓1F~3F校舍本體',
      minX: 25.0,
      maxX: 49.0,
      minZ: -10.0,
      maxZ: 100.0,
      roofY: 17.6,
      minY: -0.5,
      world: 'CAMPUS'
    },
    // 4. 演藝大樓 (1~3F 演藝廳、走廊、電梯井，以及 4F 室內羽球館 Y:12.0~16.2)
    // 4F 羽球館上方有鋼架實體屋頂與高空採光天窗 (Y = 16.5)，因此整棟大樓內部均為室內！
    {
      name: '演藝大樓與4F羽球館',
      minX: 61.5,
      maxX: 86.5,
      minZ: 21.5,
      maxZ: 54.5,
      roofY: 16.8,
      minY: -0.5,
      world: 'CAMPUS'
    },
    // 5. 單車車棚 (藍色斜頂棚遮雨)
    {
      name: '單車車棚遮雨棚',
      minX: -72.0,
      maxX: -38.0,
      minZ: -71.0,
      maxZ: -59.0,
      roofY: 3.6,
      minY: -0.5,
      world: 'CAMPUS'
    },
    // 6. 校門口警衛室
    {
      name: '校門警衛室',
      minX: -11.0,
      maxX: -7.0,
      minZ: 103.5,
      maxZ: 106.5,
      roofY: 5.2,
      minY: -0.5,
      world: 'CAMPUS'
    },

    // ==========================================
    // 第二世界：少年院 (Detention World)
    // ==========================================
    // 7. 集訓營舍大樓 (兩層金屬鋼架結構建築、宿舍走廊與房間)
    {
      name: '少年院集訓營舍',
      minX: -66.0,
      maxX: -14.0,
      minZ: -76.0,
      maxZ: -44.0,
      roofY: 8.8,
      minY: -0.5,
      world: 'DETENTION'
    },
    // 8. 特訓食堂與福利社
    {
      name: '特訓食堂與福利社',
      minX: 24.0,
      maxX: 76.0,
      minZ: -76.0,
      maxZ: -44.0,
      roofY: 6.5,
      minY: -0.5,
      world: 'DETENTION'
    },
    // 9. 實習工廠大樓 (Workshop)
    {
      name: '少年院實習工廠',
      minX: -76.0,
      maxX: -29.0,
      minZ: 29.0,
      maxZ: 71.0,
      roofY: 7.8,
      minY: -0.5,
      world: 'DETENTION'
    },
    // 10. 教官總部大樓 (Command HQ)
    {
      name: '教官總部大樓',
      minX: 29.0,
      maxX: 76.0,
      minZ: 29.0,
      maxZ: 71.0,
      roofY: 9.5,
      minY: -0.5,
      world: 'DETENTION'
    },
    // 11. 總部前廊避雨雨遮 (Portico)
    {
      name: '總部前廊雨遮',
      minX: 37.0,
      maxX: 53.0,
      minZ: 23.5,
      maxZ: 30.5,
      roofY: 5.6,
      minY: -0.5,
      world: 'DETENTION'
    }
  ];

  // 依世界預先篩選的區域清單 (雨滴粒子每幀數千次查詢，避免逐一略過其他世界的區域)
  private static readonly zonesByWorld: Record<'CAMPUS' | 'DETENTION', IndoorZone[]> = {
    CAMPUS: IndoorManager.ZONES.filter(z => z.world === 'ALL' || z.world === 'CAMPUS'),
    DETENTION: IndoorManager.ZONES.filter(z => z.world === 'ALL' || z.world === 'DETENTION')
  };

  private static zonesFor(currentWorld: 'CAMPUS' | 'DETENTION'): IndoorZone[] {
    return this.zonesByWorld[currentWorld];
  }

  /**
   * 判定指定 3D 向量座標是否處於室內 / 建築物頂蓋遮蔽之下
   */
  public static isIndoors(pos: THREE.Vector3, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS'): boolean {
    return this.isPointIndoors(pos.x, pos.y, pos.z, currentWorld);
  }

  /**
   * 判定任意 (X, Y, Z) 點位是否處於室內
   */
  public static isPointIndoors(x: number, y: number, z: number, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS'): boolean {
    const zones = this.zonesFor(currentWorld);
    for (let i = 0; i < zones.length; i++) {
      const zItem = zones[i];
      if (x >= zItem.minX && x <= zItem.maxX && z >= zItem.minZ && z <= zItem.maxZ) {
        if (y < zItem.roofY && (zItem.minY === undefined || y >= zItem.minY)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 取得指定 (X, Z) 地面投影點上方的遮雨頂蓋高度 (Roof Y)。
   * 若該處為戶外露天區域，則回傳 null。
   */
  public static getRoofHeightAt(x: number, z: number, currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS'): number | null {
    let maxRoof: number | null = null;
    const zones = this.zonesFor(currentWorld);
    for (let i = 0; i < zones.length; i++) {
      const zItem = zones[i];
      if (x >= zItem.minX && x <= zItem.maxX && z >= zItem.minZ && z <= zItem.maxZ) {
        if (maxRoof === null || zItem.roofY > maxRoof) {
          maxRoof = zItem.roofY;
        }
      }
    }
    return maxRoof;
  }
}

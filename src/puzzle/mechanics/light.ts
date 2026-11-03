// N26 光路 (P6；規格 6「第三章共用規則」光路、「3-2 玻璃長廊（細化）」；architecture 4.19、7.4.7)
// - 光路本身是章節層的純函式 (core/chapter lightPaths：天窗 → 逐格玻璃 / 稜鏡)，結果寫進 World.ext.light (這間房此刻照進來的光)；本機制只讀
// - sensor：感光花。from = 光要從哪一側進來、via = 之前至少穿過幾間房 (core/chapter lightState：dark / white / weak / lit)。
//   lit 的那一刻 → used (閂住：之後光移走，花照樣開著；R 會還原)、solvedText、doneFlag → done；
//   狀態變成 white (天窗直射的白光) / weak (穿過的房不夠) 時說一次 whiteText / weakText (進房的第一步只記不說)；3D 按 E = 此刻的樣子
// - revealedBy (ObjBase)：指定的物件 used 之前不在場 (3-2b：花開後窗台上才有殘片 2)
import type { Mechanic } from '../core/registry';
import type { ObjId, ObjState, TextKey, World } from '../core/types';
import type { Side } from '../core/cube';
import { lightState, type LightState } from '../core/chapter';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjBase {
    /** v0.4 這個物件 used 之前不在場 (mechanics/light hidden) */
    revealedBy?: ObjId;
  }
  interface ObjKinds {
    /**
     * 感光物 (感光花)：from / via = 要的光；closedText / whiteText / weakText / openText = 3D 按 E (閉著 / 白光 / 光不夠 / 開了)，
     * whiteText / weakText 也在光變成那樣時說一次；solvedText = 開花的那一刻；
     * beam = 光柱起點 (那扇窗的中心，世界座標；外觀用)；mount = 'stand' 立在窗下的木花架上 (外觀：花架是模型的一部分，2D 不浮空)
     */
    sensor: {
      from: Side; via: number; closedText: TextKey; whiteText: TextKey; weakText: TextKey; solvedText: TextKey; openText: TextKey;
      beam?: readonly [number, number, number]; mount?: 'floor' | 'stand';
    };
  }
}

/** 感光物此刻的光 (沒有光路資訊 = dark) */
export function sensorLight(w: World, o: ObjState): LightState {
  if (o.def.type !== 'sensor') return 'dark';
  return lightState(w.ext.light?.hits ?? [], o.def.from, o.def.via);
}

/** 上一步的光 (只用來決定要不要說話；換房 / R = 新的 World、重新記) */
const last = new WeakMap<ObjState, LightState>();

function update(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'sensor' || o.gone) continue;
    const s = sensorLight(w, o);
    const prev = last.get(o);
    last.set(o, s);
    if (o.used) continue;
    if (s === 'lit') {
      o.used = true;
      say(w, o.def.solvedText);
      if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
    } else if (prev !== undefined && s !== prev && (s === 'white' || s === 'weak')) say(w, s === 'white' ? o.def.whiteText : o.def.weakText);
  }
}

export const light: Mechanic = {
  id: 'light',
  types: {
    sensor: {
      verbKey: 'obj.sensor.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'sensor') return;
        const s = sensorLight(w, o);
        say(w, o.used ? o.def.openText : s === 'white' ? o.def.whiteText : s === 'weak' ? o.def.weakText : o.def.closedText);
      }
    }
  },
  hidden: (w, o) => o.def.revealedBy !== undefined && !w.byId.get(o.def.revealedBy)?.used,
  afterPhysics: update
};

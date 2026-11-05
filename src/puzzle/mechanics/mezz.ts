// H1 夾層 (第二章隱藏房；規格 6「H1 夾層（細化）」)：只在實景的書牆、書牆後面那面書櫃 (名詞標籤 + 方槽；縮放在 mechanics/scale)
// - bookWall：實體 (只在實景，visible '3d')；3D 按 E = readText
// - innerShelf：實體 (兩個視角)；名詞標籤「書櫃」+ 方槽 (label.scale)；3D 按 E = 此刻的樣子 (有效倍率 < 1 → smallText，其餘 readText)；
//   占住洞的到達處時說 blockText (ObjBase；core/chapter doorArrival)
// - 小書桌 = diaryStand (look 'desk'；mechanics/deep)
import type { Mechanic } from '../core/registry';
import type { TextKey } from '../core/types';
import { say } from '../core/world';
import { effectiveFactor } from './scale';

declare module '../core/types' {
  interface ObjKinds {
    /** 只在實景的書牆 (實體)：readText = 3D 按 E */
    bookWall: { readText: TextKey };
    /** 後面那面書櫃 (實體、可量)：readText = 原尺寸 (或大) 時 3D 按 E、smallText = 量小之後 */
    innerShelf: { readText: TextKey; smallText: TextKey };
  }
}

export const mezz: Mechanic = {
  id: 'mezz',
  types: {
    bookWall: { verbKey: 'obj.bookWall.verb', interact: (w, o) => { if (o.def.type === 'bookWall') say(w, o.def.readText); } },
    innerShelf: {
      verbKey: 'obj.innerShelf.verb',
      interact: (w, o) => {
        if (o.def.type !== 'innerShelf') return;
        say(w, effectiveFactor(o.def, w.ext.labels, o.used) < 1 ? o.def.smallText : o.def.readText);
      }
    }
  }
};

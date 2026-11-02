// 以 zh-Hant 解析後的系統訊息字串 (架構 7.3：MSG_* 改由此匯入)
import { createText } from '../../src/puzzle/text/text';
import { zhHant } from '../../src/puzzle/content/text/zh-Hant';

export const TEXT = createText(zhHant);
export const MSG_SQUEEZE = TEXT('msg.squeeze');
export const MSG_FELL = TEXT('msg.fell');
export const MSG_CRATE_RESET = TEXT('msg.crateReset');
export const MSG_UNREACHABLE = TEXT('msg.unreachable');
export const MSG_GATE = TEXT('msg.gate');
export const MSG_PLATE_ON = TEXT('msg.plate.on');
export const MSG_PLATE_LIGHT = TEXT('msg.plate.light');

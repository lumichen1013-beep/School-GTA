import type { HelpRow } from './dom';

/** 操作說明 (S6 起改由 bindings 產生) */
export const HELP_ROWS: readonly HelpRow[] = [
  { keys: ['WASD'], labelKey: 'ui.help.move' },
  { keys: ['Space'], labelKey: 'ui.help.jump' },
  { keys: ['F', 'Q'], labelKey: 'ui.help.flip' },
  { keys: ['E'], labelKey: 'ui.help.interact' },
  { keys: ['T'], labelKey: 'ui.help.reset' },
  { keys: ['R'], labelKey: 'ui.help.restart' }
];

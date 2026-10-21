import type { StyleDef, StyleId } from '../types';
import { STREET } from './street';
import { TAG } from './tag';

export const STYLES: Record<StyleId, StyleDef> = { street: STREET, tag: TAG };
export const STYLE_IDS: StyleId[] = ['street', 'tag'];
export { totalFrames } from './build';

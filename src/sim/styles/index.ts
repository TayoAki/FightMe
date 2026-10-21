import type { StyleDef, StyleId } from '../types';
import { IRON } from './iron';
import { STREET } from './street';

export const STYLES: Record<StyleId, StyleDef> = { street: STREET, iron: IRON };
export const STYLE_IDS: StyleId[] = ['street', 'iron'];
export { totalFrames } from './build';

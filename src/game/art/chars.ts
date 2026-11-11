/**
 * Personagens: o avatar (personalizável) e os vizinhos sem nome que atravessam a praça.
 * Tira de 12 quadros de 16×22: frente (0–3), costas (4–7) e lado (8–11, olhando à direita).
 */
import type { AvatarLook } from '@/domain/types';
import { CLOTHES, HAIR, R, SKIN } from './palette';
import { art, Px, strip, type SpriteArt } from './px';

export const CHAR_W = 16;
export const CHAR_H = 22;

function frame(look: AvatarLook, dir: 'down' | 'up' | 'side', step: number): Px {
  const p = new Px(CHAR_W, CHAR_H);
  const skin = SKIN[look.skin % SKIN.length];
  const hair = HAIR[look.hair % HAIR.length];
  const shirt = CLOTHES[look.shirt % CLOTHES.length];
  const pants = [R.nogueira, R.ardosia, R.cinza, R.musgo, R.ebano][look.pants % 5];
  const bob = step % 2 === 1 ? 1 : 0;
  const hy = 1 + bob;
  const swing = step === 1 ? 1 : step === 3 ? -1 : 0;

  if (dir === 'side') {
    // pernas em tesoura
    p.rect(6 - swing, 16, 3, 4 - Math.abs(swing), pants[2]);
    p.rect(8 + swing, 16, 3, 4, pants[1]);
    p.rect(6 - swing, 20 - Math.abs(swing), 3, 1, R.ebano[1]);
    p.rect(8 + swing, 20, 4, 1, R.ebano[1]);
    p.rect(5, 9 + bob, 6, 7, shirt[2]);
    p.rect(5, 9 + bob, 2, 7, shirt[1]);
    p.rect(7 + swing, 10 + bob, 2, 5, shirt[3]);
    p.rect(7 + swing, 15 + bob, 2, 1, skin[3]);
    p.rect(5, hy + 1, 7, 7, skin[3]);
    p.rect(5, hy + 1, 2, 7, skin[2]);
    p.rect(10, hy + 4, 1, 2, 0x2a1c18);
    p.rect(11, hy + 5, 1, 1, skin[2]);
    p.rect(4, hy, 8, 3, hair[2]);
    p.rect(4, hy, 3, 6, hair[2]);
    p.rect(5, hy, 6, 1, hair[3]);
    if (look.hairStyle === 1) p.rect(4, hy + 5, 3, 5, hair[1]);
    if (look.hairStyle === 2) p.rect(3, hy + 1, 2, 3, hair[2]);
  } else {
    const legL = swing > 0 ? 1 : 0;
    const legR = swing < 0 ? 1 : 0;
    p.rect(5, 16, 3, 4 - legL, pants[2]);
    p.rect(8, 16, 3, 4 - legR, pants[1]);
    p.rect(5, 20 - legL, 3, 1, R.ebano[1]);
    p.rect(8, 20 - legR, 3, 1, R.ebano[1]);
    p.rect(4, 9 + bob, 8, 7, shirt[2]);
    p.rect(4, 9 + bob, 8, 1, shirt[3]);
    p.rect(10, 10 + bob, 2, 6, shirt[1]);
    // braços
    p.rect(3, 10 + bob + swing, 2, 5, shirt[3]);
    p.rect(11, 10 + bob - swing, 2, 5, shirt[1]);
    p.rect(3, 15 + bob + swing, 2, 1, skin[3]);
    p.rect(11, 15 + bob - swing, 2, 1, skin[2]);
    p.rect(4, hy + 1, 8, 7, skin[3]);
    p.rect(10, hy + 1, 2, 7, skin[2]);
    if (dir === 'down') {
      p.rect(6, hy + 4, 1, 2, 0x2a1c18);
      p.rect(9, hy + 4, 1, 2, 0x2a1c18);
      p.rect(7, hy + 7, 2, 1, skin[1]);
      p.rect(4, hy, 8, 3, hair[2]);
      p.rect(5, hy, 6, 1, hair[3]);
      p.rect(4, hy + 2, 1, 3, hair[2]);
      p.rect(11, hy + 2, 1, 3, hair[1]);
      if (look.hairStyle === 1) {
        p.rect(3, hy + 2, 2, 8, hair[2]);
        p.rect(11, hy + 2, 2, 8, hair[1]);
      }
      if (look.hairStyle === 2) p.rect(6, hy - 1, 4, 2, hair[3]);
      p.rect(6, 10 + bob, 4, 1, shirt[4]);
    } else {
      p.rect(4, hy, 8, 6, hair[2]);
      p.rect(5, hy, 6, 1, hair[3]);
      p.rect(10, hy + 1, 2, 5, hair[1]);
      if (look.hairStyle === 1) p.rect(4, hy + 5, 8, 5, hair[2]);
      if (look.hairStyle === 2) p.rect(6, hy - 1, 4, 2, hair[3]);
    }
  }
  p.outline();
  return p;
}

export function paintPerson(look: AvatarLook): SpriteArt {
  const frames: Px[] = [];
  for (const dir of ['down', 'up', 'side'] as const) for (let s = 0; s < 4; s++) frames.push(frame(look, dir, s));
  return art(strip(frames), 0, 0, 12);
}

export function lookKey(look: AvatarLook): string {
  return `p-${look.skin}-${look.hair}-${look.hairStyle}-${look.shirt}-${look.pants}`;
}

export const SKIN_COUNT = SKIN.length;
export const HAIR_COUNT = HAIR.length;
export const CLOTHES_COUNT = CLOTHES.length;
export const HAIR_STYLES = ['Curto', 'Comprido', 'Coque'];

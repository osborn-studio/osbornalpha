import type { HTMLAttributes } from 'react';
import { tagClasses, type TagTone } from './variants';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
}

export function Tag({ tone = 'neutral', className, ...rest }: TagProps) {
  return <span className={tagClasses(tone, className)} {...rest} />;
}

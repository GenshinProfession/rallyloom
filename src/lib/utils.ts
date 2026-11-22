import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const mergeClasses = extendTailwindMerge({
  extend: { theme: { text: ['ui-title', 'ui-section', 'ui-body', 'ui-label', 'ui-meta', 'ui-map'] } },
})

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs))
}

import mark from '@/assets/rallyloom-mark.svg'

interface LogoProps {
  className?: string
}

export function Logo({ className = 'size-8' }: LogoProps) {
  return <img src={mark} className={className} alt="" aria-hidden draggable={false} />
}

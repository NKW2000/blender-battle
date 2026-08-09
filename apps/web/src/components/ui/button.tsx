import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { useSound } from '@/features/sound/use-sound';
import { cn } from '@/lib/utils';

/**
 * The application button, on the arcade language.
 *
 * Every variant is a "sticker": thick ink outline, hard offset shadow with no
 * blur, and a press that moves the surface down onto its own shadow. The shadow
 * offset and the press depth are the same number per size — that equality is
 * what makes the control read as a physical object rather than a rectangle that
 * happens to move.
 *
 * `ghost` is the one exception: no outline, no shadow, no press. It exists for
 * actions that must not compete with the primary object beside them.
 */
const buttonVariants = cva(
  'arcade-press arcade-focus inline-flex items-center justify-center gap-2 font-display font-bold border-edge cursor-pointer disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-linear-to-b from-[#FFE580] to-select text-edge',
        secondary: 'bg-linear-to-b from-mint to-aqua text-edge',
        outline: 'bg-cream text-edge',
        ghost:
          'border-transparent bg-white/8 text-bone hover:bg-white/16 !shadow-none hover:!translate-y-0 active:!translate-y-0',
        danger: 'bg-punch text-edge',
      },
      size: {
        sm: 'h-9 rounded-xl border-2 px-3.5 text-xs [--press-depth:3px]',
        md: 'h-11 rounded-2xl border-[3px] px-5 text-sm [--press-depth:5px]',
        lg: 'h-14 rounded-[18px] border-4 px-7 text-lg [--press-depth:8px]',
        icon: 'h-10 w-10 rounded-xl border-2 [--press-depth:3px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

const SHADOW: Record<string, string> = {
  sm: '0 3px 0 var(--color-edge)',
  md: '0 5px 0 var(--color-edge)',
  lg: '0 8px 0 var(--color-edge)',
  icon: '0 3px 0 var(--color-edge)',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size = 'md', asChild = false, style, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const isGhost = variant === 'ghost';
    const play = useSound();

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        style={isGhost ? style : { boxShadow: SHADOW[size as string], ...style }}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          // Sound first so it fires even if the handler navigates away.
          play('press');
          onClick?.(event);
        }}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

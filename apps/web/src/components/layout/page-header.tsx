import { cn } from '@/lib/utils';

/**
 * The heading every screen opens with.
 *
 * There were two headers in the application and neither was quite right. Most
 * pages used an eyebrow above a `text-2xl` title; rooms and public challenges
 * used a bare `text-3xl` with no eyebrow and no uppercase, so those two read as
 * a different product. Both are replaced by this.
 *
 * The eyebrow structure is kept because it is the majority and because it earns
 * its line — "Administration", "Authoring", "Catalogue" say which part of the
 * app you are in, which the title alone does not.
 *
 * The scale is the part that changed. `text-2xl` is 24px, which the design
 * language assigns to a *card* heading — so a page title was rendering at the
 * same size as the panel headings beneath it, and the page had no top to its
 * hierarchy. This sits between the card heads and the brief screens' hero,
 * topping out just below the 38px those start at, so the three levels read in
 * order.
 *
 * `action` is the right-hand slot several pages already improvised with their
 * own flex wrapper. It wraps underneath on a narrow screen rather than
 * squeezing the title.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[clamp(28px,3.2vw,38px)] font-bold uppercase leading-[1.05] tracking-tight text-cream">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm font-extrabold leading-relaxed text-haze">
            {description}
          </p>
        ) : null}
      </div>

      {/*
        Rendered as a direct flex child rather than wrapped. The pages that have
        an action already bring their own container with the classes it needs —
        one is full width on a phone so its filter and button do not fight over
        a single row — and a wrapper here would silently override that.
      */}
      {action}
    </header>
  );
}

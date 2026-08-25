'use client';

import { ChunkyButton } from '@/components/arcade/chunky';
import { PANEL_ICON, Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel';
import { useMailCheck } from '@/features/analytics/use-analytics';

/**
 * Whether mail actually leaves the building — and a way to find out for certain.
 *
 * Verification and reset failures are silent by design: the send is swallowed so
 * `forgot password` answers identically for a registered and an unknown address.
 * That makes a broken mail setup invisible on every other screen, so this is the
 * one place that says which it is.
 *
 * The button matters because the panel alone cannot answer the question. The
 * metrics report whether credentials are *present*, which a wrong Gmail app
 * password satisfies perfectly — configuration looks complete, and every send is
 * still refused. Only a live handshake distinguishes the two, and it has to be
 * asked for rather than run on render: it authenticates against a third party,
 * so it is a deliberate action, not something a refetch should trigger.
 */
export function MailStatus({ driver, canSend }: { driver: string; canSend: boolean }) {
  const check = useMailCheck();

  // Configured but unproven, versus configured and just proven. Worth
  // distinguishing: the first is what a wrong password looks like.
  const broken = !canSend || check.data?.ok === false;

  return (
    <Panel className={broken ? 'border-punch' : undefined}>
      <PanelHeader tone={broken ? 'punch' : undefined} icon={PANEL_ICON.clock}>
        <PanelTitle>{broken ? 'Email is not being delivered' : 'Email'}</PanelTitle>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-3">
        {!canSend ? (
          <>
            <p className="text-sm font-extrabold text-haze">
              The mail driver is <span className="text-punch-soft">{driver}</span>
              {driver === 'log'
                ? ' — messages are written to the server log and never sent.'
                : ' — its credentials are missing, so every send is refused.'}{' '}
              Verification links and password resets are silently failing.
            </p>
            <p className="text-xs font-extrabold text-haze-5">
              Set MAIL_DRIVER and its credentials in the API environment, then redeploy.
            </p>
          </>
        ) : (
          <p className="text-sm font-extrabold text-haze">
            The mail driver is <span className="text-mint">{driver}</span> and its credentials are
            set. That is not the same as working — test it.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ChunkyButton
            type="button"
            tone="aqua"
            onClick={() => check.mutate()}
            disabled={check.isPending}
          >
            {check.isPending ? 'Testing…' : 'Test the connection'}
          </ChunkyButton>

          {/*
            The result is reported verbatim from the server. It names the missing
            variable or quotes the provider's refusal, and paraphrasing it here
            would cost exactly the detail that makes it actionable.
          */}
          {check.data ? (
            <p
              role="status"
              className={`text-xs font-extrabold ${check.data.ok ? 'text-mint' : 'text-punch-soft'}`}
            >
              {check.data.detail}
            </p>
          ) : null}

          {check.isError ? (
            <p role="status" className="text-xs font-extrabold text-punch-soft">
              The check could not run: {check.error.message}
            </p>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}

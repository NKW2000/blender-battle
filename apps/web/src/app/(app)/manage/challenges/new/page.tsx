'use client';

import { Role } from '@bb/shared';
import { useRouter } from 'next/navigation';

import { ChallengeForm } from '@/components/challenges/challenge-form';
import { EmptyState, Panel } from '@/components/ui/panel';
import { useSession } from '@/features/auth/use-session';
import { useCreateChallenge } from '@/features/challenges/use-challenges';

export default function NewChallengePage() {
  const { user } = useSession();
  const create = useCreateChallenge();
  const router = useRouter();

  // Presentational only — the API enforces the same rule with a guard.
  if (user && user.role === Role.PLAYER) {
    return (
      <Panel>
        <EmptyState
          title="Managers only"
          description="Writing challenges is a manager permission. Ask an admin if you should have it."
        />
      </Panel>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <p className="eyebrow">New challenge</p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
          Write a brief
        </h1>
        <p className="mt-2 text-sm text-bone-muted">
          Saved as a draft. Add reference images and publish when it is ready.
        </p>
      </header>

      <ChallengeForm
        submitLabel="Create draft"
        isSubmitting={create.isPending}
        onSubmit={(payload) =>
          create.mutate(payload, {
            onSuccess: (challenge) => router.push(`/manage/challenges/${challenge.slug}`),
          })
        }
      />
    </div>
  );
}

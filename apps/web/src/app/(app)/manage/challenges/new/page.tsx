'use client';

import { Role } from '@bb/shared';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New challenge"
        title="Write a brief"
        description="Saved as a draft. Add reference images and publish when it is ready."
      />

      {/* The header spans the page like every other screen; the form does not.
          A brief is a column of text inputs, and stretching them to 1150px
          makes them harder to read, not more consistent. */}
      <div className="max-w-3xl">
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
    </div>
  );
}

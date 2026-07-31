'use client';

import { Role, UserStatus } from '@bb/shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, Panel, PanelBody, PanelHeader, PanelTitle, Skeleton } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useSession } from '@/features/auth/use-session';
import {
  useAdminUsers,
  useChangeUserRole,
  useChangeUserStatus,
} from '@/features/users/use-users';
import { formatDate } from '@/lib/utils';

const STATUS_COLOR: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'text-axis-y',
  [UserStatus.SUSPENDED]: 'text-select',
  [UserStatus.BANNED]: 'text-axis-x',
  [UserStatus.DELETED]: 'text-bone-faint',
};

export default function AdminUsersPage() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');

  const query = useAdminUsers({ search: search || undefined, role: role || undefined });
  const changeRole = useChangeUserRole();
  const changeStatus = useChangeUserStatus();

  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-bone">
            Users
          </h1>
        </div>

        <div className="flex gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search username or email"
            aria-label="Search users"
            className="arcade-focus h-11 w-56 rounded-2xl border-[3px] border-edge bg-panel px-4 font-bold text-bone placeholder:text-bone-faint"
          />

          <Select
            className="w-44"
            ariaLabel="Filter by role"
            value={role}
            onChange={(value) => setRole(value as Role | '')}
            placeholder="All roles"
            options={[
              { value: '', label: 'All roles' },
              ...Object.values(Role).map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              })),
            ]}
          />
        </div>
      </header>

      <Panel>
        <PanelHeader>
          <PanelTitle>Accounts</PanelTitle>
          <span className="font-mono text-xs text-bone-faint">{rows.length} loaded</span>
        </PanelHeader>

        {query.isLoading ? (
          <PanelBody className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </PanelBody>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No accounts match"
            description="Adjust the search text or clear the role filter to see more results."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th scope="col" className="eyebrow px-5 py-3">Artist</th>
                  <th scope="col" className="eyebrow px-5 py-3">Role</th>
                  <th scope="col" className="eyebrow px-5 py-3">Status</th>
                  <th scope="col" className="eyebrow px-5 py-3">Joined</th>
                  <th scope="col" className="eyebrow px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const isSelf = row.id === user?.id;

                  return (
                    <tr key={row.id} className="border-b border-edge/60 last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-bone">{row.username}</p>
                        <p className="font-mono text-xs text-bone-faint">{row.email}</p>
                      </td>

                      <td className="px-5 py-3">
                        <Select
                          className="w-36"
                          ariaLabel={`Role for ${row.username}`}
                          value={row.role}
                          // An admin changing their own role could remove the last
                          // admin; the server rejects it too, this just hides the trap.
                          disabled={isSelf || changeRole.isPending}
                          onChange={(value) =>
                            changeRole.mutate({
                              id: row.id,
                              role: value as Role,
                              reason: 'Changed from the admin users table',
                            })
                          }
                          options={Object.values(Role).map((value) => ({
                            value,
                            label: value.charAt(0).toUpperCase() + value.slice(1),
                          }))}
                        />
                      </td>

                      <td className={`px-5 py-3 font-mono text-xs ${STATUS_COLOR[row.status]}`}>
                        {row.status}
                      </td>

                      <td className="px-5 py-3 font-mono text-xs text-bone-faint">
                        {formatDate(row.createdAt)}
                      </td>

                      <td className="px-5 py-3 text-right">
                        {row.status === UserStatus.BANNED ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSelf || changeStatus.isPending}
                            onClick={() =>
                              changeStatus.mutate({
                                id: row.id,
                                status: UserStatus.ACTIVE,
                                reason: 'Reinstated from the admin users table',
                              })
                            }
                          >
                            Reinstate
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isSelf || changeStatus.isPending}
                            onClick={() =>
                              changeStatus.mutate({
                                id: row.id,
                                status: UserStatus.BANNED,
                                reason: 'Banned from the admin users table',
                              })
                            }
                          >
                            Ban
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {query.hasNextPage ? (
          <div className="flex justify-center border-t border-edge px-5 py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

'use client';

import { Role, UserStatus, type AdminUserListItem } from '@bb/shared';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
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

  /*
    Presentation, not security — the API re-checks the role on every one of
    these endpoints and this page cannot grant anything. It is here because
    every sibling admin page has it, and the one that did not showed a
    non-admin a full moderation console whose every control returned 403.
  */
  if (user && user.role !== Role.ADMIN) {
    return (
      <Panel>
        <EmptyState
          title="Admins only"
          description="Managing accounts is restricted to administrators."
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        action={
        /*
          Stacked and full width on a phone, a row from `sm`.

          As a row these are 224px of input plus 176px of select plus the gap —
          412px, in a container that does not wrap, on a 375px screen. The whole
          page scrolled sideways because of two controls in the header.
        */
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search username or email"
            aria-label="Search users"
            className="arcade-focus h-11 w-full rounded-2xl border-[3px] border-edge bg-panel px-4 font-bold text-bone placeholder:text-bone-faint sm:w-56"
          />

          <Select
            className="w-full sm:w-44"
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
        }
      />

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
          <>
            {/*
              Cards on a phone, the table from `md` up.

              The table declares `min-w-[46rem]`, so on a 375px screen it was a
              736px grid inside a sideways scroller: five columns of which one
              was visible, a role dropdown somewhere off to the right, and a Ban
              button you had to go looking for. Panning a table to reach a
              control is not a layout, and this is the same card-over-table
              answer the manage screens already give for the same reason.

              Both layouts drive the same two controls rather than repeating
              them, so a change to what an admin can do cannot land in one and
              miss the other.
            */}
            <ul className="flex flex-col gap-3 p-4 md:hidden">
              {rows.map((row) => {
                const isSelf = row.id === user?.id;

                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 rounded-[16px] border-[2.5px] border-ink bg-white/5 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-bold text-bone">
                        {row.username}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-extrabold text-select">you</span>
                        ) : null}
                      </p>
                      {/* `break-all`: an address has no spaces to wrap at, and one
                          long enough would otherwise widen the card off-screen. */}
                      <p className="break-all font-mono text-xs text-bone-faint">{row.email}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                      <span className={STATUS_COLOR[row.status]}>{row.status}</span>
                      <span className="text-bone-faint">joined {formatDate(row.createdAt)}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <RoleControl
                        row={row}
                        isSelf={isSelf}
                        pending={changeRole.isPending}
                        onChange={(role) =>
                          changeRole.mutate({
                            id: row.id,
                            role,
                            reason: 'Changed from the admin users list',
                          })
                        }
                      />
                      <StatusControl
                        row={row}
                        isSelf={isSelf}
                        pending={changeStatus.isPending}
                        onChange={(status, reason) =>
                          changeStatus.mutate({ id: row.id, status, reason })
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
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
                        <RoleControl
                          row={row}
                          isSelf={isSelf}
                          pending={changeRole.isPending}
                          onChange={(role) =>
                            changeRole.mutate({
                              id: row.id,
                              role,
                              reason: 'Changed from the admin users table',
                            })
                          }
                        />
                      </td>

                      <td className={`px-5 py-3 font-mono text-xs ${STATUS_COLOR[row.status]}`}>
                        {row.status}
                      </td>

                      <td className="px-5 py-3 font-mono text-xs text-bone-faint">
                        {formatDate(row.createdAt)}
                      </td>

                      <td className="px-5 py-3 text-right">
                        <StatusControl
                          row={row}
                          isSelf={isSelf}
                          pending={changeStatus.isPending}
                          onChange={(status, reason) =>
                            changeStatus.mutate({ id: row.id, status, reason })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
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

/**
 * The role picker, used by both layouts.
 *
 * Shared rather than written twice: what an admin is allowed to change is the
 * kind of rule that must not be able to differ between a phone and a desktop.
 */
function RoleControl({
  row,
  isSelf,
  pending,
  onChange,
}: {
  row: AdminUserListItem;
  isSelf: boolean;
  pending: boolean;
  onChange: (role: Role) => void;
}) {
  return (
    <Select
      className="w-36"
      ariaLabel={`Role for ${row.username}`}
      value={row.role}
      // An admin changing their own role could remove the last admin; the server
      // rejects it too, this just hides the trap.
      disabled={isSelf || pending}
      onChange={(value) => onChange(value as Role)}
      options={Object.values(Role).map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      }))}
    />
  );
}

/** Ban or reinstate, with the reason the audit log will record. */
function StatusControl({
  row,
  isSelf,
  pending,
  onChange,
}: {
  row: AdminUserListItem;
  isSelf: boolean;
  pending: boolean;
  onChange: (status: UserStatus, reason: string) => void;
}) {
  const banned = row.status === UserStatus.BANNED;

  return (
    <Button
      variant={banned ? 'outline' : 'danger'}
      size="sm"
      disabled={isSelf || pending}
      onClick={() =>
        onChange(
          banned ? UserStatus.ACTIVE : UserStatus.BANNED,
          banned ? 'Reinstated from the admin users list' : 'Banned from the admin users list',
        )
      }
    >
      {banned ? 'Reinstate' : 'Ban'}
    </Button>
  );
}

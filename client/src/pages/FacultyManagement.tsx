import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { InitialsAvatar } from '../components/InitialsAvatar';
import { staggerStyle } from '../components/Motion';
import {
  ApiClientError,
  createUserAccount,
  listFacultyUsers,
  peekCachedGet,
  resetFacultyPassword,
  updateFacultyUser,
} from '../lib/api';
import { PageHeader, PageShell } from '../components/PageShell';
import type { FacultyUser } from '../types/domain';

const defaultPassword = '12345678';

export function FacultyManagement() {
  const cachedUsers = peekCachedGet<FacultyUser[]>('/api/v1/users');
  const [users, setUsers] = useState<FacultyUser[]>(() => cachedUsers ?? []);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const [role, setRole] = useState<'All' | 'ADMIN' | 'FACULTY'>('All');
  const [showModal, setShowModal] = useState(false);
  const [resetUser, setResetUser] = useState<FacultyUser | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    department: '',
    designation: '',
    phone: '',
    role: 'FACULTY' as 'ADMIN' | 'FACULTY',
  });
  const [isLoading, setIsLoading] = useState(() => !cachedUsers);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const deferredSearch = useDeferredValue(search);

  const loadUsers = async () => {
    if (users.length === 0) {
      setIsLoading(true);
    }
    setError('');

    try {
      const nextUsers = await listFacultyUsers();
      setUsers(nextUsers);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to load users right now.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const departments = useMemo(
    () => ['All', ...Array.from(new Set(users.map((item) => item.department).filter(Boolean) as string[])).sort()],
    [users],
  );

  const filtered = users.filter((item) => (
    (dept === 'All' || item.department === dept)
      && (
        role === 'All'
        || (role === 'ADMIN' ? item.role === 'ADMIN' || item.role === 'SUPER_ADMIN' : item.role === 'FACULTY')
      )
      && (
        item.name.toLowerCase().includes(deferredSearch.toLowerCase())
        || item.email.toLowerCase().includes(deferredSearch.toLowerCase())
      )
  ));

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await createUserAccount({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        department: form.department.trim() || null,
        designation: form.designation.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role,
      });
      setShowModal(false);
      setForm({
        name: '',
        email: '',
        department: '',
        designation: '',
        phone: '',
        role: 'FACULTY',
      });
      await loadUsers();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to create user account.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (user: FacultyUser) => {
    setBusyUserId(user.id);
    setError('');

    try {
      await updateFacultyUser(user.id, { isActive: !user.isActive });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, isActive: !item.isActive } : item
      )));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to update user status.');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmReset = async () => {
    if (!resetUser) {
      return;
    }

    setBusyUserId(resetUser.id);
    setError('');

    try {
      await resetFacultyPassword(resetUser.id, defaultPassword);
      setUsers((current) => current.map((item) => (
        item.id === resetUser.id ? { ...item, mustChangePassword: true } : item
      )));
      setResetUser(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to reset password.');
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="User Management"
        description={(
          <p>
            Default password: <span className="font-mono font-bold text-primary">{defaultPassword}</span>
          </p>
        )}
        actions={(
          <>
            <Link
              to="/admin/upload"
              className="flex items-center gap-2 rounded-lg border border-outline-variant/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              Bulk Upload
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              Add User
            </button>
          </>
        )}
      />

      {error ? (
        <div className="mb-5 rounded-xl border border-error/10 bg-error-container/20 px-4 py-3 text-sm font-semibold text-error">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant/10 bg-white p-4 shadow-sm">
        <div className="relative min-w-40 flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base text-gray-400">search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or email..."
            className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-low py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={dept}
          onChange={(event) => setDept(event.target.value)}
          className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
        >
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as 'All' | 'ADMIN' | 'FACULTY')}
          className="rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="All">All Roles</option>
          <option value="ADMIN">Admins</option>
          <option value="FACULTY">Faculty</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant/10 bg-surface-container-low/50">
              {['User', 'Role', 'Department', 'Designation', 'Phone', 'Status', 'Actions'].map((heading) => (
                <th key={heading} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                  Loading users...
                </td>
              </tr>
            ) : filtered.length > 0 ? (
              filtered.map((item, index) => {
                const isBusy = busyUserId === item.id;

                return (
                  <tr
                    key={item.id}
                    className={`motion-stagger-row transition-colors hover:bg-surface-container-low/30 ${!item.isActive ? 'opacity-60' : ''}`}
                    style={staggerStyle(index, 32, 50)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={item.name} size="sm" />
                        <div>
                          <p className="font-semibold text-on-surface">{item.name}</p>
                          <p className="text-[10px] text-on-surface-variant">{item.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        item.role === 'ADMIN' || item.role === 'SUPER_ADMIN'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.role === 'SUPER_ADMIN' ? 'Super Admin' : item.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs font-bold text-primary">{item.department ?? '-'}</td>
                    <td className="px-5 py-4 text-xs text-on-surface-variant">{item.designation ?? '-'}</td>
                    <td className="px-5 py-4 text-xs text-on-surface-variant">{item.phone ?? '-'}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`w-fit rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          item.isActive ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
                        }`}>
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {item.mustChangePassword ? (
                          <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                            Pwd Reset
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => void toggleActive(item)}
                          disabled={isBusy}
                          className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                        >
                          {item.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setResetUser(item)}
                          disabled={isBusy}
                          className="text-[10px] font-bold text-amber-600 hover:underline disabled:opacity-50"
                        >
                          Reset Pwd
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-on-surface-variant">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resetUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-bold text-on-surface">Reset Password?</h3>
            <p className="mb-5 text-sm text-on-surface-variant">
              Password resets to <span className="font-mono font-bold text-primary">{defaultPassword}</span>. User must change it on next login.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setResetUser(null)}
                className="rounded-lg border border-outline-variant/30 px-4 py-2 text-sm transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmReset()}
                disabled={busyUserId === resetUser.id}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-5 font-bold text-on-surface">Add User</h3>
            <form onSubmit={(event) => void handleCreate(event)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Role
                </label>
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as 'ADMIN' | 'FACULTY' }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="FACULTY">Faculty</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              {([
                ['name', 'Name'],
                ['email', 'Email'],
                ['department', 'Department'],
                ['designation', 'Designation'],
                ['phone', 'Phone'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {label}
                  </label>
                  <input
                    type={key === 'email' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    required={key === 'email' || key === 'name'}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              ))}
              <p className="rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">
                Default password: <span className="font-mono font-bold text-primary">{defaultPassword}</span>. New {form.role === 'ADMIN' ? 'admin' : 'faculty'} users must change it on first login.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-outline-variant/30 px-4 py-2 text-sm transition-colors hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

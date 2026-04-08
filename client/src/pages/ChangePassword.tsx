import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiClientError } from '../lib/api';

export function ChangePassword() {
  const navigate = useNavigate();
  const { user, completePasswordChange, isLoading } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoading && !user) {
    return <Navigate to="/login-selection" replace />;
  }

  if (!isLoading && user && !user.mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (next.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (next !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (next === '12345678') {
      setError('You cannot use the default password. Choose a new one.');
      return;
    }

    setLoading(true);

    try {
      await completePasswordChange(current, next);
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to change password right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  const strength = next.length === 0 ? 0 : next.length < 8 ? 1 : next.length < 12 && !/[!@#$%^&*]/.test(next) ? 2 : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'];
  const strengthColor = ['', 'bg-error', 'bg-amber-400', 'bg-green-500'];

  return (
    <div className="min-h-screen bg-bgGray flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-amber-600 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
          </div>
          <h1 className="text-xl font-bold text-[#3D4761]">Change Your Password</h1>
          <p className="text-sm text-gray-400 mt-1.5 max-w-xs mx-auto">
            You're using a temporary password. Please set a new password to continue.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Current Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-gray-400">lock</span>
                <input
                  type={showAll ? 'text' : 'password'}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  placeholder="Your current password"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">New Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-gray-400">key</span>
                <input
                  type={showAll ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              {next.length > 0 ? (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map((index) => (
                      <div key={index} className={`h-1 flex-1 rounded-full ${strength >= index ? strengthColor[strength] : 'bg-gray-200'}`}></div>
                    ))}
                  </div>
                  <p className={`text-[10px] font-bold ${strength === 1 ? 'text-error' : strength === 2 ? 'text-amber-600' : 'text-green-600'}`}>
                    {strengthLabel[strength]}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-gray-400">key</span>
                <input
                  type={showAll ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className={`w-full pl-9 pr-4 py-2.5 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all ${
                    confirm && confirm !== next ? 'border-error focus:ring-error/20' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'
                  }`}
                />
                {confirm && confirm === next ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-green-500">check_circle</span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input id="showpw" type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300" />
              <label htmlFor="showpw" className="text-xs text-gray-400 cursor-pointer">Show passwords</label>
            </div>

            {error ? (
              <div className="bg-error-container/30 border border-error/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-sm">error</span>
                <p className="text-xs text-error font-semibold">{error}</p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-white text-sm font-bold rounded-lg shadow-md shadow-primary/20 flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {loading ? (
                <span className="material-symbols-outlined text-base animate-spin">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-base">lock</span>
              )}
              {loading ? 'Saving...' : 'Set New Password'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[10px] text-gray-300 uppercase tracking-widest font-bold">OUTR - Academic Atelier - 2024-25</p>
      </div>
    </div>
  );
}

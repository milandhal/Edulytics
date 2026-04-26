import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiClientError } from '../lib/api';
import { BrandText } from '../components/BrandText';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, user, isLoading } = useAuth();
  const userType = searchParams.get('type') === 'faculty' ? 'faculty' : 'admin';

  const isAdmin = userType === 'admin';
  const accent = isAdmin ? '#5376D6' : '#6359C5';
  const accentLight = isAdmin ? 'bg-blue-50' : 'bg-purple-50';
  const accentText = isAdmin ? 'text-brandBlue' : 'text-brandPurple';
  const accentBadgeBg = isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const btnClass = isAdmin
    ? 'bg-brandBlue hover:bg-blue-700 shadow-blue-200'
    : 'bg-brandPurple hover:bg-indigo-700 shadow-purple-200';
  const roleLabel = isAdmin ? 'Administrator' : 'Faculty';
  const roleIcon = isAdmin ? 'admin_panel_settings' : 'person_book';
  const placeholder = isAdmin ? 'admin@spars.edu.in' : 'faculty@spars.edu.in';

  useEffect(() => {
    if (!isLoading && user) {
      navigate(user.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    }
  }, [isLoading, navigate, user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const nextUser = await login(email, password);
      navigate(nextUser.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to sign in right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bgGray">
      <header className="w-full h-11 flex items-center justify-between px-6 bg-white border-b border-gray-100 shadow-sm">
        <Link to="/login-selection" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          <span className="text-xs font-medium">Back</span>
        </Link>
        <div className="flex items-center">
          <BrandText className="text-xl" />
        </div>
        <div className="w-16" />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${accentBadgeBg}`}>
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                {roleIcon}
              </span>
              {roleLabel} Portal
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
            <div className="flex justify-center mb-5">
              <div className={`w-14 h-14 rounded-2xl ${accentLight} flex items-center justify-center`}>
                <span
                  className={`material-symbols-outlined text-2xl ${accentText}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {roleIcon}
                </span>
              </div>
            </div>

            <h1 className="text-xl font-bold text-center text-[#3D4761] mb-1">Welcome back</h1>
            <p className="text-xs text-center text-gray-400 mb-6">Sign in to your {roleLabel} account</p>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5" htmlFor="email">
                  Institutional Email
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-gray-400">mail</span>
                  <input
                    id="email"
                    type="email"
                    placeholder={placeholder}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 transition-all"
                    style={{ '--tw-ring-color': accent } as React.CSSProperties}
                    onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400" htmlFor="password">Password</label>
                  <a href="#" className={`text-[10px] font-semibold ${accentText} hover:underline`}>Forgot?</a>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-base text-gray-400">lock</span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 transition-all"
                    onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined text-base">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input id="remember" type="checkbox" className="w-3.5 h-3.5 rounded border-gray-300" />
                <label htmlFor="remember" className="text-xs text-gray-400 cursor-pointer">Keep me logged in</label>
              </div>

              {error ? (
                <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error-container/30 px-4 py-2.5">
                  <span className="material-symbols-outlined text-sm text-error">error</span>
                  <p className="text-xs font-semibold text-error">{error}</p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2.5 text-white text-sm font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 ${btnClass}`}
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">refresh</span>
                    Signing In
                  </>
                ) : (
                  <>
                    Sign In
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-5 flex justify-center gap-5 text-[10px] font-bold uppercase tracking-widest text-gray-300">
            <a href="#" className="hover:text-gray-500 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-500 transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-500 transition-colors">Support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
